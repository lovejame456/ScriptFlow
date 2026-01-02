/**
 * Meta Aggregator - M16.6 跨项目聚合器
 *
 * 职责：
 * - 扫描 metrics_pool/ 中的所有 Metrics 运行
 * - 按 ProjectProfile 分桶聚合统计
 * - 推导 MetaPolicyBias（项目级偏置）
 * - 写入 meta/meta_policy.json
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  MetricsRun,
  ProjectProfile,
  BucketStats,
  MetaPolicyBias,
  MetaPolicy,
  LengthBucket
} from './metaTypes';

/**
 * 扫描 Metrics Pool
 *
 * @param rootDir - metrics_pool/ 根目录
 * @returns MetricsRun[] - 所有运行记录
 */
export function scanMetricsPool(rootDir: string): MetricsRun[] {
  console.log(`[MetaAggregator] Scanning metrics pool from ${rootDir}`);

  if (!fs.existsSync(rootDir)) {
    console.warn(`[MetaAggregator] Metrics pool directory not found: ${rootDir}`);
    return [];
  }

  const runs: MetricsRun[] = [];

  // 遍历所有项目子目录
  const projectDirs = fs.readdirSync(rootDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const projectId of projectDirs) {
    const projectPath = path.join(rootDir, projectId);

    // 读取所有 JSON 文件
    const files = fs.readdirSync(projectPath)
      .filter(f => f.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(projectPath, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const run: MetricsRun = JSON.parse(content);

        // 验证基本结构
        if (run.runId && run.aggregates) {
          runs.push(run);
          console.log(`[MetaAggregator] Loaded: ${projectId}/${file}`);
        } else {
          console.warn(`[MetaAggregator] Invalid metrics format: ${filePath}`);
        }
      } catch (error: any) {
        console.warn(`[MetaAggregator] Failed to load ${filePath}:`, error.message);
      }
    }
  }

  console.log(`[MetaAggregator] Loaded ${runs.length} metrics runs from ${projectDirs.length} projects`);
  return runs;
}

/**
 * 根据 ProjectProfile 生成桶 Key
 *
 * @param profile - 项目画像
 * @returns string - 桶 Key（格式：${genre}__${lenBucket}）
 */
export function bucketByProfile(profile: ProjectProfile): string {
  const lenBucket = getLengthBucket(profile.totalEpisodes);
  return `${profile.genre}__${lenBucket}`;
}

/**
 * 根据总集数返回集数分桶
 *
 * @param totalEpisodes - 总集数
 * @returns LengthBucket - 分桶类型
 */
export function getLengthBucket(totalEpisodes: number): LengthBucket {
  if (totalEpisodes <= 60) {
    return 'SHORT';
  } else if (totalEpisodes <= 120) {
    return 'MID';
  } else {
    return 'LONG';
  }
}

/**
 * 聚合桶内所有运行的统计信息
 *
 * @param bucketRuns - 该桶内的所有运行记录
 * @returns BucketStats - 聚合统计
 */
export function aggregateBucketStats(bucketRuns: MetricsRun[]): BucketStats {
  if (bucketRuns.length === 0) {
    return {
      sampleCount: 0,
      meanScore: 0,
      p95Retries: 0,
      errorRate: 0,
      errorRateSmoothed: 0,
      spikeRatio: 0,
      avgWarnings: 0,
      avgErrors: 0
    };
  }

  const sampleCount = bucketRuns.length;
  const scores: number[] = [];
  const p95RetriesList: number[] = [];
  const spikeRatios: number[] = [];
  const warningsCounts: number[] = [];
  const errorsCounts: number[] = [];
  let runsWithErrors = 0;

  for (const run of bucketRuns) {
    const { aggregates } = run;

    // 健康评分
    scores.push(aggregates.health.score);

    // P95 重试
    p95RetriesList.push(aggregates.retry.p95Retries);

    // SPIKE 占比
    const spikeCount = aggregates.reveal.cadence['SPIKE'] || 0;
    const normalCount = aggregates.reveal.cadence['NORMAL'] || 0;
    const totalReveals = spikeCount + normalCount;
    spikeRatios.push(totalReveals > 0 ? spikeCount / totalReveals : 0);

    // 警告和错误数量
    warningsCounts.push(aggregates.health.warnings.length);
    errorsCounts.push(aggregates.health.errors.length);

    // 错误率统计
    if (aggregates.health.errors.length > 0) {
      runsWithErrors++;
    }
  }

  // 计算统计指标
  const meanScore = scores.reduce((a, b) => a + b, 0) / sampleCount;
  const avgP95Retries = p95RetriesList.reduce((a, b) => a + b, 0) / sampleCount;
  const p95Retries = calculatePercentile(p95RetriesList, 0.95);
  const avgSpikeRatio = spikeRatios.reduce((a, b) => a + b, 0) / sampleCount;
  const avgWarnings = warningsCounts.reduce((a, b) => a + b, 0) / sampleCount;
  const avgErrors = errorsCounts.reduce((a, b) => a + b, 0) / sampleCount;
  const errorRate = runsWithErrors / sampleCount;

  // M16.6.1：使用 Beta 平滑 errorRate
  // 公式：(runsWithErrors + 1) / (sampleCount + 2)
  // 防止样本少时 errorRate 暴涨到 100%
  const errorRateSmoothed = (runsWithErrors + 1) / (sampleCount + 2);

  return {
    sampleCount,
    meanScore,
    p95Retries,
    errorRate,
    errorRateSmoothed,
    spikeRatio: avgSpikeRatio,
    avgWarnings,
    avgErrors
  };
}

/**
 * 计算百分位数
 */
function calculatePercentile(nums: number[], p: number): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const idx = Math.floor((sorted.length - 1) * p);
  return sorted[idx];
}

/**
 * 根据统计信息推导 MetaPolicyBias
 *
 * 工程规则（M16.6 不用 ML）：
 * - meanScore < 60 || errorRate > 0.2 → SPIKE_UP
 * - p95Retries > 1.5 → retryBudgetPrior = 4
 * - avgWarnings >= 3 → pressureMultiplierPrior = 0.9
 * - sampleCount < 5 → confidence < 0.3（不强行覆盖）
 *
 * @param stats - 桶统计信息
 * @returns MetaPolicyBias - 项目级偏置
 */
export function deriveMetaPolicyBias(stats: BucketStats): MetaPolicyBias {
  const rationale: string[] = [];

  // 计算置信度（基于样本数）
  // 样本数越多，置信度越高
  let confidence = Math.min(1.0, stats.sampleCount / 10);
  rationale.push(`样本数: ${stats.sampleCount}，置信度: ${confidence.toFixed(2)}`);

  // 默认偏置
  let revealCadenceBiasPrior: MetaPolicyBias['revealCadenceBiasPrior'] = 'NORMAL';
  let retryBudgetPrior: MetaPolicyBias['retryBudgetPrior'] = 3;
  let pressureMultiplierPrior = 1.0;

  // 规则 1: 低分或高错误率 → SPIKE_UP
  // M16.6.1：使用平滑 errorRate 防止样本少时的暴涨
  if (stats.meanScore < 60 || stats.errorRateSmoothed > 0.2) {
    revealCadenceBiasPrior = 'SPIKE_UP';
    rationale.push(
      `平均健康评分: ${stats.meanScore.toFixed(1)} < 60，或平滑错误率: ${(stats.errorRateSmoothed * 100).toFixed(1)}% > 20%，建议提高 SPIKE 频率以增强 Reveal 质量`
    );
  }

  // 规则 2: 高重试 → 增加重试预算
  if (stats.p95Retries > 1.5) {
    retryBudgetPrior = 4;
    rationale.push(`P95 重试次数: ${stats.p95Retries.toFixed(2)} > 1.5，建议增加重试预算以修复结构问题`);
  }

  // 规则 3: 高警告 → 降低压力
  if (stats.avgWarnings >= 3) {
    pressureMultiplierPrior = 0.9;
    rationale.push(`平均警告数: ${stats.avgWarnings.toFixed(1)} >= 3，建议降低压力以减少警告积累`);
  }

  // 如果样本数太少，降低置信度
  if (stats.sampleCount < 5) {
    confidence = Math.min(confidence, 0.25);
    rationale.push(`样本数较少 (< 5)，置信度降低至 ${confidence.toFixed(2)}，建议谨慎使用此偏置`);
  }

  // 添加统计信息到 rationale（M16.6.1：显示平滑错误率）
  rationale.push(`统计: 平均分 ${stats.meanScore.toFixed(1)}, P95 重试 ${stats.p95Retries.toFixed(2)}, 平滑错误率 ${(stats.errorRateSmoothed * 100).toFixed(1)}%, SPIKE 占比 ${(stats.spikeRatio * 100).toFixed(1)}%`);

  return {
    revealCadenceBiasPrior,
    retryBudgetPrior,
    pressureMultiplierPrior,
    confidence,
    rationale
  };
}

/**
 * 构建 Meta Policy
 *
 * @param poolDir - metrics_pool/ 根目录
 * @returns MetaPolicy - 全局策略映射
 */
export function buildMetaPolicy(poolDir: string): MetaPolicy {
  console.log('[MetaAggregator] Building meta policy...');

  // 扫描所有运行记录
  const runs = scanMetricsPool(poolDir);

  // 按桶分组（假设所有运行都属于同一个桶，实际情况需要从项目 profile 推断）
  // 这里简化处理：根据 projectId 推断 genre 和 totalEpisodes
  const bucketMap = new Map<string, MetricsRun[]>();

  for (const run of runs) {
    // 尝试从 runId 推断项目特征（实际应该从项目元数据读取）
    // 这里用简化规则：runId 包含 genre 信息
    let genre = 'unknown';
    let totalEpisodes = 100;

    // 尝试从 runId 提取信息（示例：test-m16.4）
    if (run.runId.includes('cultivation') || run.runId.includes('fantasy')) {
      genre = 'cultivation_fantasy';
    } else if (run.runId.includes('romance') || run.runId.includes('ceo')) {
      genre = 'romance_ceo';
    } else if (run.runId.includes('revenge') || run.runId.includes('rebirth')) {
      genre = 'revenge_rebirth';
    }

    // P0 HOTFIX #2：unknown bucket 不参与 meta 学习
    if (genre === 'unknown' || !genre || genre.trim() === '') {
      console.log(`[MetaAggregator] Skipping run with unknown genre: ${run.runId}`);
      continue; // 跳过 unknown 桶
    }

    const profile: ProjectProfile = { genre, totalEpisodes };
    const bucketKey = bucketByProfile(profile);

    if (!bucketMap.has(bucketKey)) {
      bucketMap.set(bucketKey, []);
    }
    bucketMap.get(bucketKey)!.push(run);
  }

  // 为每个桶聚合统计并推导偏置
  const buckets: MetaPolicy['buckets'] = {};

  for (const [bucketKey, bucketRuns] of bucketMap.entries()) {
    console.log(`[MetaAggregator] Processing bucket: ${bucketKey} (${bucketRuns.length} runs)`);

    const stats = aggregateBucketStats(bucketRuns);
    const bias = deriveMetaPolicyBias(stats);

    buckets[bucketKey] = { bias, stats };

    console.log(`[MetaAggregator] Bucket ${bucketKey}:`);
    console.log(`  - Bias: ${JSON.stringify(bias, null, 2)}`);
    console.log(`  - Stats: ${JSON.stringify(stats, null, 2)}`);
  }

  const metaPolicy: MetaPolicy = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    buckets
  };

  console.log('[MetaAggregator] Meta policy built successfully');
  console.log(`[MetaAggregator] Total buckets: ${Object.keys(buckets).length}`);

  return metaPolicy;
}

/**
 * 写入 Meta Policy 到文件
 *
 * @param outputPath - 输出文件路径
 * @param metaPolicy - Meta Policy
 */
export function writeMetaPolicy(outputPath: string, metaPolicy: MetaPolicy): void {
  const dir = path.dirname(outputPath);

  // 确保目录存在
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 写入文件
  fs.writeFileSync(outputPath, JSON.stringify(metaPolicy, null, 2), 'utf-8');

  console.log(`[MetaAggregator] Meta policy written to: ${outputPath}`);
}

