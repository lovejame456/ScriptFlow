/**
 * 降级密度计算逻辑
 *
 * 计算项目中已生成剧集的 DEGRADED 状态密度，用于 UI 警告提示。
 */

import { EpisodeStatus } from '../../types';

/**
 * 降级密度结果
 */
export interface DegradedDensity {
  /** 已生成的总集数 */
  totalGenerated: number;
  /** 降级集数量 */
  degradedCount: number;
  /** 降级占比 (0-1) */
  degradedRatio: number;
  /** 警告阈值 */
  threshold: {
    count: number;  // 数量阈值
    ratio: number;  // 比例阈值
  };
  /** 是否触发警告 */
  shouldWarn: boolean;
  /** 警告级别 */
  warningLevel: 'low' | 'medium' | 'high' | null;
}

/**
 * 计算降级密度
 *
 * @param episodes - 剧集列表
 * @param options - 可选配置
 * @param options.countThreshold - 数量阈值（默认 3）
 * @param options.ratioThreshold - 比例阈值（默认 0.3，即 30%）
 * @returns 降级密度信息
 */
export function calculateDegradedDensity(
  episodes: any[],
  options?: {
    countThreshold?: number;
    ratioThreshold?: number;
  }
): DegradedDensity {
  const {
    countThreshold = 3,
    ratioThreshold = 0.3
  } = options || {};

  // 1. 计算已生成的总集数（排除 PENDING 状态）
  const totalGenerated = episodes.filter(ep =>
    ep.status !== EpisodeStatus.PENDING
  ).length;

  // 2. 计算降级集数量
  const degradedCount = episodes.filter(ep =>
    ep.status === EpisodeStatus.DEGRADED
  ).length;

  // 3. 计算降级占比
  const degradedRatio = totalGenerated > 0
    ? degradedCount / totalGenerated
    : 0;

  // 4. 判断是否触发警告
  const shouldWarn =
    degradedCount >= countThreshold ||
    degradedRatio >= ratioThreshold;

  // 5. 计算警告级别
  let warningLevel: 'low' | 'medium' | 'high' | null = null;
  if (shouldWarn) {
    if (degradedRatio >= 0.5) {
      warningLevel = 'high';  // 50%+ 高危
    } else if (degradedRatio >= 0.3) {
      warningLevel = 'medium';  // 30%+ 中危
    } else {
      warningLevel = 'low';  // 仅数量达标
    }
  }

  console.log(`[calculateDegradedDensity] Result:`, {
    totalGenerated,
    degradedCount,
    degradedRatio: (degradedRatio * 100).toFixed(1) + '%',
    shouldWarn,
    warningLevel
  });

  return {
    totalGenerated,
    degradedCount,
    degradedRatio,
    threshold: {
      count: countThreshold,
      ratio: ratioThreshold
    },
    shouldWarn,
    warningLevel
  };
}

/**
 * 生成警告文案
 *
 * @param density - 降级密度信息
 * @returns 警告文案
 */
export function generateWarningText(density: DegradedDensity): string | null {
  if (!density.shouldWarn) {
    return null;
  }

  const ratioText = (density.degradedRatio * 100).toFixed(0) + '%';

  // 根据警告级别生成不同文案
  if (density.warningLevel === 'high') {
    return `⚠️ 严重警告：检测到 ${density.degradedCount} 集降级（${ratioText}），建议立即调整题材或强化世界观后重新开始`;
  } else if (density.warningLevel === 'medium') {
    return `⚠️ 检测到 ${density.degradedCount} 集降级（${ratioText}），建议调整题材或强化世界观后继续`;
  } else {
    return `⚠️ 检测到 ${density.degradedCount} 集降级（${ratioText}），建议调整题材或强化世界观后继续`;
  }
}

