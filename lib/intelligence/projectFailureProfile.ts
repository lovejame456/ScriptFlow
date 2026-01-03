/**
 * P4.1: 项目失败画像
 *
 * 基于项目的失败历史数据，构建项目级别的失败模式画像。
 * 帮助系统理解"这个项目经常在什么地方失败"。
 */

import { ProjectFailureProfile, FailureMode } from '../../types.ts';
import { collectFailureData } from '../guidance/failureCluster';

/**
 * 计算失败模式的趋势
 * 对比最近 N 集和之前的集数分布，判断趋势
 */
function calculateTrend(
  failuresByEpisode: Map<number, FailureMode>,
  recentCount: number = 10
): 'up' | 'down' | 'stable' {
  const episodes = Array.from(failuresByEpisode.keys()).sort((a, b) => a - b);

  if (episodes.length === 0) {
    return 'stable';
  }

  // 分割为最近集数和之前集数
  const recentEpisodes = episodes.slice(-recentCount);
  const olderEpisodes = episodes.slice(0, -recentCount);

  const recentFailureRate = recentEpisodes.length / recentCount;
  const olderFailureRate = olderEpisodes.length / Math.max(olderEpisodes.length, 1);

  // 判断趋势
  if (recentFailureRate > olderFailureRate + 0.1) {
    return 'up';
  } else if (recentFailureRate < olderFailureRate - 0.1) {
    return 'down';
  } else {
    return 'stable';
  }
}

/**
 * 计算失败发生的阶段偏移
 * 统计失败在不同阶段的分布
 */
function calculatePhaseBias(
  failuresByEpisode: Map<number, FailureMode>
): { early: number; mid: number; late: number } {
  const early: number[] = [];
  const mid: number[] = [];
  const late: number[] = [];

  for (const [episodeIndex] of failuresByEpisode) {
    if (episodeIndex <= 5) {
      early.push(episodeIndex);
    } else if (episodeIndex <= 30) {
      mid.push(episodeIndex);
    } else {
      late.push(episodeIndex);
    }
  }

  const total = failuresByEpisode.size || 1;
  return {
    early: early.length / total,
    mid: mid.length / total,
    late: late.length / total
  };
}

/**
 * 分析主导失败模式
 * 返回按占比排序的失败模式列表
 */
function analyzeDominantPatterns(
  failuresByEpisode: Map<number, FailureMode>
): Array<{ type: FailureMode; ratio: number; trend: 'up' | 'down' | 'stable' }> {
  // 统计每种模式的次数
  const modeCounts = new Map<FailureMode, number>();
  const modeEpisodes = new Map<FailureMode, number[]>();

  for (const [episodeIndex, mode] of failuresByEpisode) {
    modeCounts.set(mode, (modeCounts.get(mode) || 0) + 1);
    modeEpisodes.set(mode, [...(modeEpisodes.get(mode) || []), episodeIndex]);
  }

  const total = failuresByEpisode.size || 1;

  // 转换为数组并排序
  const patterns = Array.from(modeCounts.entries())
    .map(([type, count]) => ({
      type,
      ratio: count / total,
      trend: calculateTrend(new Map<number, FailureMode>(
        modeEpisodes.get(type)!.map(ep => [ep, type])
      ))
    }))
    .sort((a, b) => b.ratio - a.ratio);

  return patterns;
}

/**
 * 构建项目失败画像
 *
 * @param projectId - 项目 ID
 * @returns ProjectFailureProfile - 项目失败画像
 */
export async function buildProjectFailureProfile(
  projectId: string
): Promise<ProjectFailureProfile> {
  console.log(`[ProjectFailureProfile] Building profile for project: ${projectId}`);

  // 收集失败数据
  const failureData = await collectFailureData(projectId);

  // 构建剧集编号到失败模式的映射
  const failuresByEpisode = new Map<number, FailureMode>();
  for (const data of failureData) {
    failuresByEpisode.set(data.episodeIndex, data.mode);
  }

  // 如果没有失败数据，返回空画像
  if (failuresByEpisode.size === 0) {
    console.log(`[ProjectFailureProfile] No failure data found for project: ${projectId}`);
    return {
      projectId,
      lastUpdatedAt: new Date().toISOString()
    };
  }

  // 分析主导模式
  const dominantPatterns = analyzeDominantPatterns(failuresByEpisode);

  // 计算阶段偏移
  const episodePhaseBias = calculatePhaseBias(failuresByEpisode);

  const profile: ProjectFailureProfile = {
    projectId,
    dominantPatterns,
    episodePhaseBias,
    lastUpdatedAt: new Date().toISOString()
  };

  console.log(`[ProjectFailureProfile] Profile built:`, JSON.stringify(profile, null, 2));

  return profile;
}

/**
 * 生成用户友好的失败画像描述
 * 用于前端展示
 */
export function generateProfileSummary(profile: ProjectFailureProfile): string {
  if (!profile.dominantPatterns || profile.dominantPatterns.length === 0) {
    return '暂无失败数据，系统正在学习您的项目特征...';
  }

  const primaryPattern = profile.dominantPatterns[0];
  const percentage = Math.round(primaryPattern.ratio * 100);

  const modeDescriptions: Record<FailureMode, string> = {
    'REVEAL_VAGUE': '信息揭示不具体',
    'MOTIVATION_WEAK': '人物动机不足',
    'CONFLICT_STALLED': '冲突推进缓慢',
    'UNKNOWN': '剧情质量不稳定'
  };

  let summary = `本项目 ${percentage}% 的失败集中在【${modeDescriptions[primaryPattern.type]}】`;

  // 添加阶段信息
  if (profile.episodePhaseBias) {
    const phaseInfo = [];
    if (profile.episodePhaseBias.early > 0.4) {
      phaseInfo.push('早期（EP1–EP5）');
    } else if (profile.episodePhaseBias.mid > 0.4) {
      phaseInfo.push('中期（EP6–EP30）');
    } else if (profile.episodePhaseBias.late > 0.4) {
      phaseInfo.push('后期（EP30+）');
    }

    if (phaseInfo.length > 0) {
      summary += `，主要发生在${phaseInfo.join('和')}`;
    }
  }

  // 添加趋势信息
  if (primaryPattern.trend === 'up') {
    summary += '，且有上升趋势，需要及时调整策略。';
  } else if (primaryPattern.trend === 'down') {
    summary += '，且正在改善。';
  } else {
    summary += '，情况稳定。';
  }

  return summary;
}

