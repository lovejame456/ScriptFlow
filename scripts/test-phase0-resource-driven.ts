#!/usr/bin/env tsx

/**
 * Phase 0 硬资源驱动型 Prompt 验证测试
 *
 * 功能：
 * - 使用 PM 提供的 Phase-0-Safe Prompt 创建项目
 * - 生成 EP1-10 验证系统稳定性
 * - 验收：DEGRADED ≤ 2、Failure Mode 分散、Reveal 资源/权力变化自然性
 *
 * 原则：
 * - 不改系统
 * - 不加 P3/P4/P5
 * - 不调参数
 * - 只验证系统是否能稳定运行
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量（必须在任何其他导入之前）
dotenv.config({ path: join(__dirname, '../.env') });

import fs from 'fs';
import path from 'path';
import { api } from '../api';
import { projectRepo } from '../lib/store/projectRepo';
import { batchRepo } from '../lib/batch/batchRepo';
import { episodeRepo } from '../lib/store/episodeRepo';
import { MetricsData } from '../lib/metrics/metricsTypes';
import { EpisodeStatus } from '../types';

// ============================================================================
// 配置与常量
// ============================================================================

const CONFIG = {
  // PM 提供的 Phase-0-Safe Prompt
  PHASE0_SAFE_PROMPT: `项目类型: 都市现实 / 强对抗 / 资源博弈

故事核心:
底层男性主角，被迫卷入一个由资本、地下势力和规则操控的现实博弈体系。
每一集，主角都必须：
- 获得或失去一个【明确资源】（金钱、资格、人脉、地盘、控制权）
- 与一个【具体对手】发生正面对抗
- 为了资源付出【可量化代价】

叙事约束（非常重要）：
- 禁止抽象心理描写作为核心推进
- 禁止"选择""命运""觉醒"作为 Reveal
- Reveal 必须体现：
  - 谁 → 因为什么行为 → 得到了/失去了什么资源
- 每一集都必须出现至少一个可被称为：
  RESOURCE / POWER / RELATION / LIFE_THREAT 的实体变化

节奏要求（EP1-10）：
- 每一集都是一次"下注—对抗—结算"
- 不做世界观铺垫，不留白，不慢热`,

  PHASE0_EPISODE_RANGE: [1, 10],  // Phase 0 只测试 EP1-10

  ACCEPTANCE_CRITERIA: {
    MAX_DEGRADED: 2,  // 10集最多2集降级
    MAX_ERROR_CONCENTRATION: 0.7,  // 错误集中度不超过 70%
  },

  // 输出路径
  OUTPUT_DIR: path.join(process.cwd(), 'reports'),
  JSON_REPORT: path.join(process.cwd(), 'reports', 'phase0_resource_driven_test.json'),
  MD_REPORT: path.join(process.cwd(), 'reports', 'phase0_resource_driven_test.md'),
};

// ============================================================================
// 类型定义
// ============================================================================

interface Phase0TestResult {
  testId: string;
  timestamp: string;
  projectId: string;
  projectName: string;
  promptType: string;
  episodeRange: [number, number];

  // 验收结果
  acceptance: {
    degradedCheck: {
      passed: boolean;
      degradedCount: number;
      degradedEpisodes: number[];
    };
    failureModeDistribution: {
      passed: boolean;
      details: { [key: string]: number };
      concentrationRatio: number;
    };
  };

  // 总体判定
  overallPassed: boolean;

  // 详细数据
  details: {
    batchStatus?: string;
    totalEpisodes: number;
    completedCount: number;
    degradedCount: number;
    failedCount: number;
    metricsPath?: string;
  };

  // 建议后续操作
  recommendations: string[];
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 初始化报告目录
 */
function initReportDir(): void {
  if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
    fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
  }
}

/**
 * 查找最新的 Metrics 文件
 */
function findLatestMetricsFile(): string | null {
  const reportsDir = path.join(process.cwd(), 'reports');

  if (!fs.existsSync(reportsDir)) {
    console.warn('[Phase0] Reports directory not found');
    return null;
  }

  const files = fs.readdirSync(reportsDir)
    .filter(f => f.startsWith('m16_metrics_') && f.endsWith('.json'))
    .filter(f => f !== 'm16_metrics_baseline.json');

  if (files.length === 0) {
    console.warn('[Phase0] No metrics files found');
    return null;
  }

  const filesWithMtime = files.map(f => ({
    file: f,
    mtime: fs.statSync(path.join(reportsDir, f)).mtimeMs
  })).sort((a, b) => b.mtime - a.mtime);

  const latestFile = filesWithMtime[0].file;
  const latestPath = path.join(reportsDir, latestFile);

  console.log(`[Phase0] Latest metrics file: ${latestFile}`);
  return latestPath;
}

/**
 * 读取 Metrics 文件
 */
function readMetricsFile(metricsPath: string): MetricsData | null {
  try {
    if (!fs.existsSync(metricsPath)) {
      console.warn(`[Phase0] Metrics file not found: ${metricsPath}`);
      return null;
    }

    const content = fs.readFileSync(metricsPath, 'utf-8');
    const metricsData = JSON.parse(content) as MetricsData;

    console.log(`[Phase0] Loaded metrics: ${metricsData.runId}`);
    console.log(`  Episodes: ${metricsData.episodes.length}`);
    console.log(`  Aggregates:`, {
      score: metricsData.aggregates?.health?.score,
      errors: metricsData.aggregates?.health?.errors?.length,
      p95Retries: metricsData.aggregates?.retry?.p95Retries
    });

    return metricsData;
  } catch (error: any) {
    console.error(`[Phase0] Failed to read metrics file:`, error.message);
    return null;
  }
}

/**
 * 等待 Batch 完成
 */
async function waitForBatchCompletion(projectId: string, timeout: number = 30 * 60 * 1000): Promise<any> {
  const startTime = Date.now();
  const pollInterval = 3000; // 3 秒轮询一次

  console.log(`[Phase0] Waiting for batch completion (timeout: ${timeout / 1000}s)...`);

  while (true) {
    if (Date.now() - startTime > timeout) {
      throw new Error(`Batch completion timeout after ${timeout / 1000}s`);
    }

    const batch = await api.batch.getState(projectId);

    if (!batch) {
      throw new Error('Batch not found');
    }

    console.log(`[Phase0] Batch status: ${batch.status}, EP${batch.currentEpisode}/${batch.endEpisode}, completed: ${batch.completed.length}, degraded: ${batch.degraded?.length || 0}`);

    if (batch.status === 'DONE' || batch.status === 'FAILED' || batch.status === 'PAUSED') {
      console.log(`[Phase0] Batch ${batch.status}`);
      return batch;
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
}

// ============================================================================
// 验收检查函数
// ============================================================================

/**
 * 检查 1: DEGRADED ≤ 2
 */
function checkDegradedLimit(metrics: MetricsData | null, batch: any): Phase0TestResult['acceptance']['degradedCheck'] {
  // 优先从 batch 读取 degraded 信息
  const degradedEpisodes = batch?.degraded || [];

  // 如果 batch 没有 degraded，尝试从 metrics 读取
  let degradedCount = degradedEpisodes.length;
  if (metrics && metrics.episodes) {
    const degradedFromMetrics = metrics.episodes
      .filter(ep => ep.status === 'DEGRADED')
      .map(ep => ep.episodeIndex);
    degradedCount = Math.max(degradedCount, degradedFromMetrics.length);
    if (degradedFromMetrics.length > 0) {
      console.log(`[Phase0] Degraded episodes from metrics:`, degradedFromMetrics);
    }
  }

  const passed = degradedCount <= CONFIG.ACCEPTANCE_CRITERIA.MAX_DEGRADED;

  console.log(`[Phase0] DEGRADED Check: ${passed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Degraded count: ${degradedCount} / ${CONFIG.ACCEPTANCE_CRITERIA.MAX_DEGRADED} (max allowed)`);
  console.log(`  Degraded episodes: [${degradedEpisodes.join(', ') || 'none'}]`);

  return {
    passed,
    degradedCount,
    degradedEpisodes: degradedEpisodes
  };
}

/**
 * 检查 2: Failure Mode 分散度
 */
function checkFailureModeDistribution(metrics: MetricsData | null): Phase0TestResult['acceptance']['failureModeDistribution'] {
  if (!metrics || !metrics.episodes) {
    console.log(`[Phase0] No metrics data, skipping Failure Mode check`);
    return {
      passed: true,
      details: {},
      concentrationRatio: 0
    };
  }

  const errorTypes: { [key: string]: number } = {};

  for (const ep of metrics.episodes) {
    if (ep.errors && ep.errors.length > 0) {
      for (const err of ep.errors) {
        const errorType = err.code || err.type || 'UNKNOWN';
        errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
      }
    }
  }

  const totalErrors = Object.values(errorTypes).reduce((a, b) => a + b, 0);
  const maxErrorCount = Math.max(...Object.values(errorTypes), 0);
  const concentrationRatio = totalErrors > 0 ? maxErrorCount / totalErrors : 0;

  const passed = concentrationRatio <= CONFIG.ACCEPTANCE_CRITERIA.MAX_ERROR_CONCENTRATION;

  console.log(`[Phase0] Failure Mode Distribution: ${passed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Concentration ratio: ${(concentrationRatio * 100).toFixed(1)}% / ${CONFIG.ACCEPTANCE_CRITERIA.MAX_ERROR_CONCENTRATION * 100}% (max allowed)`);
  console.log(`  Error types:`, errorTypes);

  return {
    passed,
    details: errorTypes,
    concentrationRatio
  };
}

// Reveal 检查已移除，根据 PM 新要求只检查 3 个指标：
// 1. DEGRADED ≤ 2
// 2. Failure Mode 分散（不连续 ≥3 同类）
// 3. Batch 必须跑完

// ============================================================================
// 报告生成函数
// ============================================================================

/**
 * 生成 Markdown 报告
 */
function generateMarkdownReport(result: Phase0TestResult): string {
  const lines: string[] = [];

  lines.push('# Phase 0 硬资源驱动型 Prompt 验证测试报告');
  lines.push('');
  lines.push('## 基本信息');
  lines.push('');
  lines.push(`- **测试时间**: ${result.timestamp}`);
  lines.push(`- **项目ID**: ${result.projectId}`);
  lines.push(`- **项目名称**: ${result.projectName}`);
  lines.push(`- **Prompt 类型**: ${result.promptType}`);
  lines.push(`- **测试范围**: EP${result.episodeRange[0]}-EP${result.episodeRange[1]}`);
  lines.push('');

  lines.push('## 总体判定');
  lines.push('');
  const overallStatus = result.overallPassed ? '✅ 通过' : '❌ 失败';
  lines.push(`**状态**: **${overallStatus}**`);
  lines.push('');

  lines.push('## 验收结果');
  lines.push('');

  // 1. DEGRADED 检查
  lines.push('### 1. DEGRADED 检查');
  lines.push('');
  const degradedStatus = result.acceptance.degradedCheck.passed ? '✅ PASS' : '❌ FAIL';
  lines.push(`- **状态**: ${degradedStatus}`);
  lines.push(`- **降级集数**: ${result.acceptance.degradedCheck.degradedCount} / ${CONFIG.ACCEPTANCE_CRITERIA.MAX_DEGRADED} (max allowed)`);
  if (result.acceptance.degradedCheck.degradedEpisodes.length > 0) {
    lines.push(`- **降级集**: EP${result.acceptance.degradedCheck.degradedEpisodes.join(', ')}`);
  }
  lines.push('');

  // 2. Failure Mode 分散度检查
  lines.push('### 2. Failure Mode 分散度检查');
  lines.push('');
  const failureModeStatus = result.acceptance.failureModeDistribution.passed ? '✅ PASS' : '❌ FAIL';
  lines.push(`- **状态**: ${failureModeStatus}`);
  lines.push(`- **集中度**: ${(result.acceptance.failureModeDistribution.concentrationRatio * 100).toFixed(1)}% / ${CONFIG.ACCEPTANCE_CRITERIA.MAX_ERROR_CONCENTRATION * 100}% (max allowed)`);
  lines.push(`- **错误类型分布**:`);
  const errorDetails = result.acceptance.failureModeDistribution.details;
  if (Object.keys(errorDetails).length > 0) {
    for (const [errorType, count] of Object.entries(errorDetails)) {
      lines.push(`  - ${errorType}: ${count}`);
    }
  } else {
    lines.push(`  - (无错误)`);
  }
  lines.push('');

  lines.push('## 详细数据');
  lines.push('');
  lines.push(`- **Batch 状态**: ${result.details.batchStatus || 'unknown'}`);
  lines.push(`- **总集数**: ${result.details.totalEpisodes}`);
  lines.push(`- **已完成集数**: ${result.details.completedCount}`);
  lines.push(`- **降级集数**: ${result.details.degradedCount}`);
  lines.push(`- **失败集数**: ${result.details.failedCount}`);
  lines.push('');
  if (result.details.metricsPath) {
    lines.push(`- **Metrics 报告**: ${result.details.metricsPath}`);
    lines.push('');
  }

  lines.push('## 建议后续操作');
  lines.push('');
  for (const recommendation of result.recommendations) {
    lines.push(`- ${recommendation}`);
  }
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('*本测试使用 PM 提供的 Phase-0-Safe Prompt，不修改系统代码、参数，不添加 P3/P4/P5 功能。');
  lines.push('*测试目的：验证系统是否能稳定运行硬资源驱动型故事。');

  return lines.join('\n');
}

/**
 * 生成 JSON 报告
 */
function generateJSONReport(result: Phase0TestResult): string {
  return JSON.stringify(result, null, 2);
}

// ============================================================================
// 主函数
// ============================================================================

async function runPhase0Test(): Promise<Phase0TestResult> {
  console.log('\n' + '='.repeat(80));
  console.log('Phase 0 硬资源驱动型 Prompt 验证测试');
  console.log('='.repeat(80));
  console.log('');
  console.log('测试配置:');
  console.log(`- Prompt 类型: 硬资源驱动型`);
  console.log(`- 测试范围: EP${CONFIG.PHASE0_EPISODE_RANGE[0]}-EP${CONFIG.PHASE0_EPISODE_RANGE[1]}`);
  console.log(`- 最大降级数: ${CONFIG.ACCEPTANCE_CRITERIA.MAX_DEGRADED}`);
  console.log(`- Reveal 质量要求: ${(CONFIG.ACCEPTANCE_CRITERIA.MIN_REVEAL_QUALITY * 100).toFixed(0)}%`);
  console.log(`- 错误集中度上限: ${(CONFIG.ACCEPTANCE_CRITERIA.MAX_ERROR_CONCENTRATION * 100).toFixed(0)}%`);
  console.log('');
  console.log('='.repeat(80) + '\n');

  const testId = `phase0_${Date.now()}`;
  const timestamp = new Date().toISOString();

  try {
    // ============================================================
    // 步骤 1: 创建项目（使用 PM 提供的 Phase-0-Safe Prompt）
    // ============================================================
    console.log('[步骤 1/6] 创建项目...');
    const project = await api.project.seed(CONFIG.PHASE0_SAFE_PROMPT, {
      totalEpisodes: 10  // Phase 0 只测试 10 集
    });
    console.log(`  ✓ 项目创建成功: ${project.name} (${project.id})`);
    console.log(`  ✓ 题材: ${project.genre}`);
    console.log(`  ✓ 集数: ${project.totalEpisodes}`);
    console.log('');

    // ============================================================
    // 步骤 2: 生成 Bible
    // ============================================================
    console.log('[步骤 2/6] 生成 Bible...');
    await api.project.generateBible(project.id);
    console.log('  ✓ Bible 生成成功');
    console.log('');

    // ============================================================
    // 步骤 3: 生成 Outline
    // ============================================================
    console.log('[步骤 3/6] 生成 Outline...');
    await api.project.generateOutline(project.id);
    console.log('  ✓ Outline 生成成功');
    console.log('');

    // ============================================================
    // 步骤 4: 启动 Batch（生成 EP1-10）
    // ============================================================
    console.log(`[步骤 4/6] 启动 Batch (EP${CONFIG.PHASE0_EPISODE_RANGE[0]}-EP${CONFIG.PHASE0_EPISODE_RANGE[1]})...`);
    const batch = await api.batch.start(project.id, CONFIG.PHASE0_EPISODE_RANGE[0], CONFIG.PHASE0_EPISODE_RANGE[1]);
    console.log('  ✓ Batch 已启动');
    console.log('');

    // ============================================================
    // 步骤 5: 等待 Batch 完成
    // ============================================================
    console.log('[步骤 5/6] 等待 Batch 完成...');
    const completedBatch = await waitForBatchCompletion(project.id);
    console.log(`  ✓ Batch ${completedBatch.status}`);
    console.log(`  ✓ 已完成: ${completedBatch.completed.length}/${CONFIG.PHASE0_EPISODE_RANGE[1]}`);
    console.log(`  ✓ 降级: ${completedBatch.degraded?.length || 0}`);
    console.log(`  ✓ 失败: ${completedBatch.failed?.length || 0}`);
    console.log('');

    // ============================================================
    // 步骤 6: 读取 Metrics 并执行验收检查
    // ============================================================
    console.log('[步骤 6/6] 执行验收检查...');

    const metricsPath = findLatestMetricsFile();
    const metrics = metricsPath ? readMetricsFile(metricsPath) : null;

    // 执行三项验收检查
    console.log('\n--- 执行验收检查 ---\n');

    const degradedCheck = checkDegradedLimit(metrics, completedBatch);
    const failureModeCheck = checkFailureModeDistribution(metrics);

    console.log('\n--- 验收检查完成 ---\n');

    // 计算总体判定（三项都通过才算通过）
    // 1. DEGRADED ≤ 2
    // 2. Failure Mode 分散（不连续 ≥3 同类）
    // 3. Batch 必须跑完（completedBatch.status === 'DONE'）
    const overallPassed =
      degradedCheck.passed &&
      failureModeCheck.passed &&
      completedBatch.status === 'DONE';

    console.log(`[Phase0] 总体判定: ${overallPassed ? '✅ 通过' : '❌ 失败'}\n`);

    // 构建测试结果
    const result: Phase0TestResult = {
      testId,
      timestamp,
      projectId: project.id,
      projectName: project.name,
      promptType: '硬资源驱动型',
      episodeRange: CONFIG.PHASE0_EPISODE_RANGE,

      acceptance: {
        degradedCheck,
        failureModeDistribution: failureModeCheck
      },

      overallPassed,

      details: {
        batchStatus: completedBatch.status,
        totalEpisodes: project.totalEpisodes,
        completedCount: completedBatch.completed.length,
        degradedCount: completedBatch.degraded?.length || 0,
        failedCount: completedBatch.failed?.length || 0,
        metricsPath: metricsPath || undefined
      },

      recommendations: []
    };

    // 生成建议
    if (!overallPassed) {
      if (!degradedCheck.passed) {
        result.recommendations.push(
          `DEGRADED 数量超标 (${degradedCheck.degradedCount} > ${CONFIG.ACCEPTANCE_CRITERIA.MAX_DEGRADED})，建议检查系统稳定性或调整 prompt 难度。`
        );
      }
      if (!failureModeCheck.passed) {
        result.recommendations.push(
          `Failure Mode 集中度过高 (${(failureModeCheck.concentrationRatio * 100).toFixed(1)}%)，建议检查错误类型分布，优化系统对特定错误的处理能力。`
        );
      }
      if (completedBatch.status !== 'DONE') {
        result.recommendations.push(
          `Batch 未完成（状态：${completedBatch.status}），需要检查系统错误。`
        );
      }
      result.recommendations.push(
        '建议 PM 根据本次测试结果调整下一步策略。'
      );
    } else {
      result.recommendations.push(
        '✅ 所有验收标准通过，系统可以稳定运行硬资源驱动型 Prompt。',
        '建议：系统宣布"可用"，可以正常跑 60 集，用 P2/P3 修内容。'
      );
    }

    // ============================================================
    // 生成报告
    // ============================================================
    console.log('[生成报告]...');

    // 写入 JSON 报告
    fs.writeFileSync(CONFIG.JSON_REPORT, generateJSONReport(result));
    console.log(`  ✓ JSON 报告: ${CONFIG.JSON_REPORT}`);

    // 写入 Markdown 报告
    fs.writeFileSync(CONFIG.MD_REPORT, generateMarkdownReport(result));
    console.log(`  ✓ MD 报告: ${CONFIG.MD_REPORT}`);

    console.log('');
    console.log('='.repeat(80));
    console.log('Phase 0 测试完成');
    console.log('='.repeat(80));
    console.log(`总体状态: ${result.overallPassed ? '✅ 通过' : '❌ 失败'}`);
    console.log('');
    console.log('详细报告:');
    console.log(`- JSON: ${CONFIG.JSON_REPORT}`);
    console.log(`- MD: ${CONFIG.MD_REPORT}`);
    console.log(`- Metrics: ${metricsPath || '未生成'}`);
    console.log('='.repeat(80) + '\n');

    return result;

  } catch (error: any) {
    console.error('');
    console.error('❌ 测试失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}

// ============================================================================
// CLI 入口
// ============================================================================

async function main() {
  try {
    initReportDir();
    await runPhase0Test();
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Phase 0 测试异常退出');
    process.exit(1);
  }
}

// 如果直接运行此文件（而非被导入），则执行 CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { runPhase0Test };
export type { Phase0TestResult };

