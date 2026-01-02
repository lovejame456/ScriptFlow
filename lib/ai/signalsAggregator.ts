/**
 * Signals Aggregator - 质量信号聚合工具（M14.1）
 *
 * 功能：
 * - 将每集的 QualitySignals 聚合为可对比的统计信息
 * - 计算 signal 命中次数、命中率
 * - 记录每集的信号命中详情
 *
 * 原则：
 * - 不影响生成、不修改 prompt、不参与生成决策
 * - 仅用于后续质量分析与优化
 */

import { QualitySignals, SignalsSummary } from '../../types';

/**
 * EpisodeTestResult 的简化版本
 * 用于信号聚合，避免循环依赖
 */
export interface EpisodeSignalsResult {
  episodeIndex: number;
  qualitySignals?: QualitySignals;
}

/**
 * 聚合质量信号
 *
 * @param episodeResults - 包含 qualitySignals 的剧集结果列表
 * @returns SignalsSummary - 聚合后的信号统计
 */
export function aggregateSignals(
  episodeResults: EpisodeSignalsResult[]
): SignalsSummary {
  const totalEpisodes = episodeResults.length;

  // 初始化命中次数
  const signalHitCount = {
    conflictProgressed: 0,
    costPaid: 0,
    factReused: 0,
    newReveal: 0,
    promiseAddressed: 0,
    stateCoherent: 0
  };

  // 收集每集的信号详情
  const perEpisodeSignals: SignalsSummary['perEpisodeSignals'] = [];

  for (const result of episodeResults) {
    if (!result.qualitySignals) {
      // 如果没有质量信号，记录为 0 命中
      perEpisodeSignals.push({
        episodeIndex: result.episodeIndex,
        hitCount: 0,
        signals: {
          conflictProgressed: false,
          costPaid: false,
          factReused: false,
          newReveal: false,
          promiseAddressed: false,
          stateCoherent: false
        }
      });
      continue;
    }

    const signals = result.qualitySignals;
    let hitCount = 0;

    // 统计命中次数
    if (signals.conflictProgressed) {
      signalHitCount.conflictProgressed++;
      hitCount++;
    }
    if (signals.costPaid) {
      signalHitCount.costPaid++;
      hitCount++;
    }
    if (signals.factReused) {
      signalHitCount.factReused++;
      hitCount++;
    }
    if (signals.newReveal) {
      signalHitCount.newReveal++;
      hitCount++;
    }
    if (signals.promiseAddressed) {
      signalHitCount.promiseAddressed++;
      hitCount++;
    }
    if (signals.stateCoherent) {
      signalHitCount.stateCoherent++;
      hitCount++;
    }

    // 记录每集详情
    perEpisodeSignals.push({
      episodeIndex: result.episodeIndex,
      hitCount,
      signals: { ...signals }
    });
  }

  // 计算命中率 (0-1)
  const signalHitRate = {
    conflictProgressed: totalEpisodes > 0 ? signalHitCount.conflictProgressed / totalEpisodes : 0,
    costPaid: totalEpisodes > 0 ? signalHitCount.costPaid / totalEpisodes : 0,
    factReused: totalEpisodes > 0 ? signalHitCount.factReused / totalEpisodes : 0,
    newReveal: totalEpisodes > 0 ? signalHitCount.newReveal / totalEpisodes : 0,
    promiseAddressed: totalEpisodes > 0 ? signalHitCount.promiseAddressed / totalEpisodes : 0,
    stateCoherent: totalEpisodes > 0 ? signalHitCount.stateCoherent / totalEpisodes : 0
  };

  return {
    totalEpisodes,
    signalHitCount,
    signalHitRate,
    perEpisodeSignals
  };
}

/**
 * 生成质量信号的趋势说明
 *
 * @param summary - 信号聚合结果
 * @returns 趋势说明字符串数组
 */
export function generateSignalsInsights(summary: SignalsSummary): string[] {
  const insights: string[] = [];
  const { signalHitRate, totalEpisodes } = summary;

  if (totalEpisodes === 0) {
    insights.push('暂无剧集数据');
    return insights;
  }

  // 分析每个 signal 的命中率
  const rateToLevel = (rate: number): string => {
    if (rate >= 0.9) return '优秀';
    if (rate >= 0.7) return '良好';
    if (rate >= 0.5) return '中等';
    return '偏低';
  };

  const rateToSuggestion = (signalName: string, rate: number): string | null => {
    if (rate < 0.5) {
      switch (signalName) {
        case 'costPaid':
          return 'costPaid 命中率偏低，可能缺乏角色代价设计';
        case 'promiseAddressed':
          return 'promiseAddressed 命中率偏低，建议加强承诺呼应';
        case 'factReused':
          return 'factReused 命中率偏低，可能缺乏连续性细节复用';
        case 'newReveal':
          return 'newReveal 命中率偏低，可能缺乏新信息揭示';
        case 'conflictProgressed':
          return 'conflictProgressed 命中率偏低，可能冲突推进缓慢';
        case 'stateCoherent':
          return 'stateCoherent 命中率偏低，状态一致性存在问题';
        default:
          return null;
      }
    }
    return null;
  };

  // 生成每个 signal 的分析
  const signalNames = [
    'conflictProgressed',
    'costPaid',
    'factReused',
    'newReveal',
    'promiseAddressed',
    'stateCoherent'
  ] as const;

  for (const signalName of signalNames) {
    const rate = signalHitRate[signalName];
    const count = summary.signalHitCount[signalName];
    const displayName = signalName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());

    // 记录优秀或偏低的情况
    if (rate >= 0.9) {
      insights.push(`${displayName} 达到 ${(rate * 100).toFixed(1)}%，${rateToLevel(rate)}`);
    } else if (rate < 0.5) {
      const suggestion = rateToSuggestion(signalName, rate);
      insights.push(`${displayName} 命中率仅 ${(rate * 100).toFixed(1)}%，${suggestion}`);
    }
  }

  // 计算平均每集命中数
  const avgHits = summary.perEpisodeSignals.length > 0
    ? summary.perEpisodeSignals.reduce((sum, ep) => sum + ep.hitCount, 0) / totalEpisodes
    : 0;

  if (avgHits >= 5) {
    insights.push(`平均每集命中 ${avgHits.toFixed(1)} 个信号，整体质量良好`);
  } else if (avgHits < 3) {
    insights.push(`平均每集命中 ${avgHits.toFixed(1)} 个信号，建议提升整体结构丰富度`);
  }

  return insights;
}

