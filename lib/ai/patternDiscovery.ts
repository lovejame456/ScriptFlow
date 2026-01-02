/**
 * Pattern Discovery - 质量结构模式发现系统（M14.2）
 *
 * 功能：
 * - 从多集 QualitySignals 中发现高质量结构模式（pair / triple）
 * - 分析低质量集中缺失的关键信号
 * - 生成人类可读的结构洞察
 *
 * 原则：
 * - 不影响生成、不修改 prompt、不参与生成决策
 * - 仅用于离线统计与展示，供人工决策
 */

import { QualitySignals, SignalsSummary, QualityPattern, PatternDiscoveryResult } from '../../types';

/**
 * 信号名称常量
 */
const SIGNAL_NAMES = [
  'conflictProgressed',
  'costPaid',
  'factReused',
  'newReveal',
  'promiseAddressed',
  'stateCoherent'
] as const;

type SignalName = typeof SIGNAL_NAMES[number];

/**
 * 信号显示名称映射
 */
const SIGNAL_DISPLAY_NAME: Record<SignalName, string> = {
  conflictProgressed: 'Conflict Progressed',
  costPaid: 'Cost Paid',
  factReused: 'Fact Reused',
  newReveal: 'New Reveal',
  promiseAddressed: 'Promise Addressed',
  stateCoherent: 'State Coherent'
};

/**
 * 模式统计项（内部使用）
 */
interface PatternStats {
  patternKey: string;
  signals: SignalName[];
  totalCount: number;
  highQualityCount: number;
  averageHitCount: number;
}

/**
 * 数据分桶结果
 */
interface DataBuckets {
  highQuality: SignalsSummary['perEpisodeSignals'];
  lowQuality: SignalsSummary['perEpisodeSignals'];
  middle: SignalsSummary['perEpisodeSignals'];
}

/**
 * 发现质量模式
 *
 * @param summary - 信号聚合结果（来自 M14.1）
 * @returns PatternDiscoveryResult - 模式发现结果
 */
export function discoverPatterns(summary: SignalsSummary): PatternDiscoveryResult {
  if (summary.totalEpisodes === 0) {
    return {
      highQualityPatterns: [],
      missingSignalsWarnings: [],
      insights: ['暂无剧集数据']
    };
  }

  // 1. 数据分桶
  const buckets = bucketEpisodes(summary);

  // 2. 生成并统计所有 pattern
  const patternStats = analyzePatterns(buckets);

  // 3. 生成高质量模式
  const highQualityPatterns = generateQualityPatterns(patternStats, buckets.highQuality);

  // 4. 分析缺失信号
  const missingSignalsWarnings = analyzeMissingSignals(buckets);

  // 5. 生成人类可读洞察
  const insights = generateInsights(highQualityPatterns, missingSignalsWarnings, buckets);

  return {
    highQualityPatterns,
    missingSignalsWarnings,
    insights
  };
}

/**
 * 将剧集按 hitCount 分桶
 */
function bucketEpisodes(summary: SignalsSummary): DataBuckets {
  const highQuality: SignalsSummary['perEpisodeSignals'] = [];
  const lowQuality: SignalsSummary['perEpisodeSignals'] = [];
  const middle: SignalsSummary['perEpisodeSignals'] = [];

  for (const ep of summary.perEpisodeSignals) {
    if (ep.hitCount >= 4) {
      highQuality.push(ep);
    } else if (ep.hitCount <= 1) {
      lowQuality.push(ep);
    } else {
      middle.push(ep);
    }
  }

  return { highQuality, lowQuality, middle };
}

/**
 * 分析所有 pattern 的统计信息
 */
function analyzePatterns(buckets: DataBuckets): Map<string, PatternStats> {
  const allEpisodes = [...buckets.highQuality, ...buckets.lowQuality, ...buckets.middle];
  const highQualitySet = new Set(buckets.highQuality.map(ep => ep.episodeIndex));
  const stats = new Map<string, PatternStats>();

  for (const ep of allEpisodes) {
    const trueSignals = getTrueSignals(ep.signals);

    // 生成所有 pair 组合
    const pairs = generateCombinations(trueSignals, 2);
    for (const pair of pairs) {
      updatePatternStats(stats, pair, ep.hitCount, highQualitySet.has(ep.episodeIndex));
    }

    // 生成所有 triple 组合
    const triples = generateCombinations(trueSignals, 3);
    for (const triple of triples) {
      updatePatternStats(stats, triple, ep.hitCount, highQualitySet.has(ep.episodeIndex));
    }
  }

  return stats;
}

/**
 * 获取命中的信号名称列表
 */
function getTrueSignals(signals: QualitySignals): SignalName[] {
  return SIGNAL_NAMES.filter(name => signals[name]);
}

/**
 * 生成组合（C(n, k)）
 */
function generateCombinations(signals: SignalName[], k: number): SignalName[][] {
  if (k === 0) return [[]];
  if (signals.length === 0) return [];

  const result: SignalName[][] = [];

  function backtrack(start: number, current: SignalName[]): void {
    if (current.length === k) {
      result.push([...current]);
      return;
    }

    for (let i = start; i < signals.length; i++) {
      current.push(signals[i]);
      backtrack(i + 1, current);
      current.pop();
    }
  }

  backtrack(0, []);
  return result;
}

/**
 * 更新 pattern 统计信息
 */
function updatePatternStats(
  stats: Map<string, PatternStats>,
  signals: SignalName[],
  hitCount: number,
  isHighQuality: boolean
): void {
  const patternKey = signals.join('+');

  if (!stats.has(patternKey)) {
    stats.set(patternKey, {
      patternKey,
      signals,
      totalCount: 0,
      highQualityCount: 0,
      averageHitCount: 0
    });
  }

  const pattern = stats.get(patternKey)!;
  pattern.totalCount++;
  if (isHighQuality) {
    pattern.highQualityCount++;
  }

  // 更新平均命中数
  pattern.averageHitCount = pattern.averageHitCount === 0
    ? hitCount
    : (pattern.averageHitCount * (pattern.totalCount - 1) + hitCount) / pattern.totalCount;
}

/**
 * 生成高质量模式
 */
function generateQualityPatterns(
  patternStats: Map<string, PatternStats>,
  highQualityEpisodes: SignalsSummary['perEpisodeSignals']
): QualityPattern[] {
  const highQualityCount = highQualityEpisodes.length;

  if (highQualityCount === 0) {
    return [];
  }

  // 过滤出至少出现 2 次的 pattern
  const frequentPatterns = Array.from(patternStats.values()).filter(p => p.totalCount >= 2);

  // 生成 QualityPattern 对象
  const patterns: QualityPattern[] = frequentPatterns.map(stats => ({
    patternKey: stats.patternKey,
    size: stats.signals.length as 2 | 3,
    occurrenceCount: stats.totalCount,
    highQualityCoverage: stats.highQualityCount / highQualityCount,
    averageHitCount: stats.averageHitCount,
    description: generatePatternDescription(stats)
  }));

  // 按高质量覆盖率降序排序，然后按出现次数降序
  patterns.sort((a, b) => {
    if (b.highQualityCoverage !== a.highQualityCoverage) {
      return b.highQualityCoverage - a.highQualityCoverage;
    }
    return b.occurrenceCount - a.occurrenceCount;
  });

  // 返回 Top 10
  return patterns.slice(0, 10);
}

/**
 * 生成模式描述
 */
function generatePatternDescription(stats: PatternStats): string {
  const signalNames = stats.signals.map(s => SIGNAL_DISPLAY_NAME[s]);
  if (stats.signals.length === 2) {
    return `${signalNames[0]} + ${signalNames[1]} 组合`;
  } else {
    return `${signalNames[0]} + ${signalNames[1]} + ${signalNames[2]} 组合`;
  }
}

/**
 * 分析缺失信号
 */
function analyzeMissingSignals(buckets: DataBuckets): PatternDiscoveryResult['missingSignalsWarnings'] {
  if (buckets.lowQuality.length === 0) {
    return [];
  }

  const warnings: PatternDiscoveryResult['missingSignalsWarnings'] = [];

  for (const signalName of SIGNAL_NAMES) {
    let missingCount = 0;
    for (const ep of buckets.lowQuality) {
      if (!ep.signals[signalName]) {
        missingCount++;
      }
    }

    const missingRate = missingCount / buckets.lowQuality.length;

    // 缺失率 >= 70% 时才输出警示
    if (missingRate >= 0.7) {
      warnings.push({
        signalName: signalName,
        missingRate,
        description: generateMissingSignalDescription(signalName, missingRate)
      });
    }
  }

  // 按缺失率降序排序
  warnings.sort((a, b) => b.missingRate - a.missingRate);

  return warnings;
}

/**
 * 生成缺失信号描述
 */
function generateMissingSignalDescription(signalName: SignalName, missingRate: number): string {
  const displayName = SIGNAL_DISPLAY_NAME[signalName];
  const ratePercent = (missingRate * 100).toFixed(0);

  switch (signalName) {
    case 'conflictProgressed':
      return `${displayName} 缺失率 ${ratePercent}%，低质量集可能冲突推进缓慢`;
    case 'costPaid':
      return `${displayName} 缺失率 ${ratePercent}%，低质量集可能缺乏角色代价设计`;
    case 'factReused':
      return `${displayName} 缺失率 ${ratePercent}%，低质量集可能缺乏连续性细节复用`;
    case 'newReveal':
      return `${displayName} 缺失率 ${ratePercent}%，低质量集可能缺乏新信息揭示`;
    case 'promiseAddressed':
      return `${displayName} 缺失率 ${ratePercent}%，剧情常"埋而不收"`;
    case 'stateCoherent':
      return `${displayName} 缺失率 ${ratePercent}%，低质量集状态一致性存在问题`;
    default:
      return `${displayName} 缺失率 ${ratePercent}%`;
  }
}

/**
 * 生成人类可读洞察
 */
function generateInsights(
  highQualityPatterns: QualityPattern[],
  missingSignalsWarnings: PatternDiscoveryResult['missingSignalsWarnings'],
  buckets: DataBuckets
): string[] {
  const insights: string[] = [];

  // 洞察 1: 高质量集的数量
  if (buckets.highQuality.length > 0) {
    insights.push(
      `高质量集（≥4 signals）占比 ${((buckets.highQuality.length / (buckets.highQuality.length + buckets.lowQuality.length + buckets.middle.length)) * 100).toFixed(1)}%`
    );
  }

  // 洞察 2: Top 1 高质量模式
  if (highQualityPatterns.length > 0) {
    const topPattern = highQualityPatterns[0];
    const coveragePercent = (topPattern.highQualityCoverage * 100).toFixed(0);
    insights.push(
      `"${topPattern.patternKey}" 在高质量集中覆盖率 ${coveragePercent}%，是稳定有效的结构组合`
    );
  }

  // 洞察 3: 缺失信号警示
  if (missingSignalsWarnings.length > 0) {
    const topMissing = missingSignalsWarnings[0];
    const missingPercent = (topMissing.missingRate * 100).toFixed(0);
    insights.push(
      `${SIGNAL_DISPLAY_NAME[topMissing.signalName as SignalName]} 在低质量集中缺失率 ${missingPercent}%，需重点优化`
    );
  }

  // 洞察 4: stateCoherent 命中情况
  const stateCoherentInHigh = buckets.highQuality.filter(ep => ep.signals.stateCoherent).length;
  if (buckets.highQuality.length > 0) {
    const stateCoherentRate = (stateCoherentInHigh / buckets.highQuality.length * 100).toFixed(0);
    insights.push(
      `State Coherent 在高质量集中命中率 ${stateCoherentRate}%，是基础质量保障`
    );
  }

  // 洞察 5: 平均命中数
  const avgHitsInHigh = buckets.highQuality.length > 0
    ? buckets.highQuality.reduce((sum, ep) => sum + ep.hitCount, 0) / buckets.highQuality.length
    : 0;
  const avgHitsInLow = buckets.lowQuality.length > 0
    ? buckets.lowQuality.reduce((sum, ep) => sum + ep.hitCount, 0) / buckets.lowQuality.length
    : 0;

  if (avgHitsInHigh > 0 && avgHitsInLow >= 0) {
    insights.push(
      `高质量集平均命中 ${avgHitsInHigh.toFixed(1)} 个信号，低质量集平均命中 ${avgHitsInLow.toFixed(1)} 个`
    );
  }

  // 限制为最多 5 条
  return insights.slice(0, 5);
}

/**
 * 格式化模式结果为 Markdown 表格（用于报告生成）
 */
export function formatPatternsAsMarkdown(patterns: QualityPattern[]): string {
  if (patterns.length === 0) {
    return '暂无高质量模式数据';
  }

  const lines: string[] = [
    '| Pattern | 大小 | 出现次数 | 高质量覆盖率 | 平均命中数 | 解读 |',
    '|---------|------|---------|-------------|-----------|------|'
  ];

  for (const pattern of patterns) {
    const coveragePercent = (pattern.highQualityCoverage * 100).toFixed(1);
    lines.push(
      `| ${pattern.patternKey} | ${pattern.size} | ${pattern.occurrenceCount} | ${coveragePercent}% | ${pattern.averageHitCount.toFixed(1)} | ${pattern.description} |`
    );
  }

  return lines.join('\n');
}

/**
 * 格式化缺失信号警示为 Markdown 列表（用于报告生成）
 */
export function formatMissingSignalsAsMarkdown(warnings: PatternDiscoveryResult['missingSignalsWarnings']): string {
  if (warnings.length === 0) {
    return '暂无缺失信号警示';
  }

  const lines: string[] = [];
  for (const warning of warnings) {
    const missingPercent = (warning.missingRate * 100).toFixed(0);
    lines.push(`- ${SIGNAL_DISPLAY_NAME[warning.signalName as SignalName]} 缺失率 ${missingPercent}% → ${warning.description}`);
  }

  return lines.join('\n');
}

/**
 * 格式化洞察为 Markdown 列表（用于报告生成）
 */
export function formatInsightsAsMarkdown(insights: string[]): string {
  if (insights.length === 0) {
    return '暂无洞察数据';
  }

  return insights.map(insight => `- ${insight}`).join('\n');
}


