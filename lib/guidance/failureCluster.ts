import { projectRepo } from '../store/projectRepo';
import { Project, Episode, EpisodeStatus } from '../../types';

/**
 * 失败数据项
 */
export interface FailureData {
  episodeIndex: number;
  mode: FailureMode;
  alignerIssues: { code: string; message: string }[];
  revealQualitySignals?: {
    revealIsConcrete: boolean;
    revealHasConsequence: boolean;
  };
  stateDeltaValid: boolean;
  invariantErrors: string[];
}

/**
 * 失败模式
 */
export type FailureMode = 'REVEAL_VAGUE' | 'MOTIVATION_WEAK' | 'CONFLICT_STALLED' | 'UNKNOWN';

/**
 * 失败聚类结果
 */
export interface FailureCluster {
  mode: FailureMode;
  count: number;
  episodes: number[];
}

/**
 * 项目失败分析结果
 */
export interface ProjectFailureAnalysis {
  projectId: string;
  totalEpisodes: number;
  degradedEpisodes: number;
  clusters: {
    revealVague: number;      // 信息揭示不具体
    motivationWeak: number;   // 动机不足
    conflictStalled: number;  // 冲突未推进
    unknown: number;          // 其他
  };
  primaryMode: FailureMode;   // 主要失败模式
  humanSummary: string;       // 一句话总结
  recommendations: string[];  // 具体建议
  timestamp: string;
}

/**
 * 加载 localStorage 中的 EpisodeAttemptLog
 */
function loadEpisodeAttemptLogs(projectId: string): Array<{
  episodeIndex: number;
  alignerResult?: { passed: boolean; severity: string; issues: { code: string; message: string }[] };
  invariantErrors?: string[];
  error?: string;
  timestamp: number;
}> {
  const key = `scriptflow_attempts_${projectId}`;
  const data = localStorage.getItem(key);
  if (!data) return [];
  try {
    const logs = JSON.parse(data);
    return logs || [];
  } catch (e) {
    console.error('[FailureCluster] Failed to parse attempt logs:', e);
    return [];
  }
}

/**
 * 分析单个剧集的失败原因
 */
function analyzeEpisodeFailure(
  episode: Episode,
  attemptLog?: {
    alignerResult?: { passed: boolean; severity: string; issues: { code: string; message: string }[] };
    invariantErrors?: string[];
    error?: string;
  }
): FailureMode {
  // 如果剧集不是 DEGRADED 或 DRAFT 状态，不算失败
  if (episode.status !== EpisodeStatus.DEGRADED && episode.status !== EpisodeStatus.DRAFT) {
    return 'UNKNOWN';
  }

  const issues = attemptLog?.alignerResult?.issues || [];
  const invariantErrors = attemptLog?.invariantErrors || [];
  const allIssues = [...issues.map(i => i.code), ...invariantErrors];

  // 获取 reveal 质量信号（从 episode.metadata）
  const revealSignals = episode.metadata?.revealQualitySignals;

  // 优先级 1：检查 REVEAL_VAGUE
  const hasRevealIssues = allIssues.some(code =>
    ['NO_HIGHLIGHT', 'WEAK_HOOK'].includes(code)
  );
  const revealNotConcrete = revealSignals?.revealIsConcrete === false;
  
  // 检查是否有 newReveal 要求但失败
  const hasNewRevealRequired = episode.structureContract?.mustHave?.newReveal?.required;
  const revealFailed = !attemptLog?.alignerResult?.passed && hasNewRevealRequired;

  if (hasRevealIssues || revealNotConcrete || revealFailed) {
    return 'REVEAL_VAGUE';
  }

  // 优先级 2：检查 MOTIVATION_WEAK
  const hasMotivationIssues = allIssues.some(code =>
    ['GENRE_MISMATCH', 'NO_REQUIRED_PLEASURE', 'CHARACTER_INCONSISTENT'].includes(code)
  );
  const hasMotivationError = invariantErrors.some(err =>
    err.includes('motivation') || err.includes('动机')
  );

  if (hasMotivationIssues || hasMotivationError) {
    return 'MOTIVATION_WEAK';
  }

  // 优先级 3：检查 CONFLICT_STALLED
  const hasConflictIssues = allIssues.some(code =>
    ['NO_PLOT_PROGRESS', 'PACING_SLOW', 'NO_CLEAR_PRESSURE_SOURCE'].includes(code)
  );
  const hasPacingError = invariantErrors.some(err =>
    err.includes('PACING') || err.includes('stall')
  );

  if (hasConflictIssues || hasPacingError) {
    return 'CONFLICT_STALLED';
  }

  // 如果剧集状态是 DEGRADED 但无法归类，返回 UNKNOWN
  if (episode.status === EpisodeStatus.DEGRADED) {
    return 'UNKNOWN';
  }

  return 'UNKNOWN';
}

/**
 * 收集项目失败数据
 */
export async function collectFailureData(projectId: string): Promise<FailureData[]> {
  const project = await projectRepo.get(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const attemptLogs = loadEpisodeAttemptLogs(projectId);
  const logsByEpisode = new Map<number, typeof attemptLogs[number]>();
  attemptLogs.forEach(log => {
    // 只保留最新的日志
    if (!logsByEpisode.has(log.episodeIndex) || log.timestamp > logsByEpisode.get(log.episodeIndex)!.timestamp) {
      logsByEpisode.set(log.episodeIndex, log);
    }
  });

  const failureData: FailureData[] = [];

  for (const episode of project.episodes) {
    const episodeIndex = episode.episodeIndex || episode.id;
    const attemptLog = logsByEpisode.get(Number(episodeIndex));

    // 跳过正常状态的剧集
    if (episode.status === EpisodeStatus.COMPLETED) {
      continue;
    }

    // 分析失败模式
    const mode = analyzeEpisodeFailure(episode, attemptLog);

    // 如果不是 UNKNOWN，则记录为失败数据
    if (mode !== 'UNKNOWN' || episode.status === EpisodeStatus.DEGRADED) {
      failureData.push({
        episodeIndex: Number(episodeIndex),
        mode,
        alignerIssues: attemptLog?.alignerResult?.issues || [],
        revealQualitySignals: episode.metadata?.revealQualitySignals,
        stateDeltaValid: true, // 简化处理
        invariantErrors: attemptLog?.invariantErrors || []
      });
    }
  }

  return failureData;
}

/**
 * 聚类失败原因
 */
function clusterFailureReasons(failureData: FailureData[]): FailureCluster[] {
  const clusters = new Map<FailureMode, FailureCluster>();

  // 初始化所有模式
  const modes: FailureMode[] = ['REVEAL_VAGUE', 'MOTIVATION_WEAK', 'CONFLICT_STALLED', 'UNKNOWN'];
  modes.forEach(mode => {
    clusters.set(mode, { mode, count: 0, episodes: [] });
  });

  // 聚类
  failureData.forEach(data => {
    const cluster = clusters.get(data.mode);
    if (cluster) {
      cluster.count++;
      cluster.episodes.push(data.episodeIndex);
    }
  });

  // 转换为数组并排序
  return Array.from(clusters.values())
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);
}

/**
 * 生成一句话总结
 */
function generateHumanSummary(primaryMode: FailureMode, degradedCount: number, totalEpisodes: number): string {
  const percentage = Math.round((degradedCount / totalEpisodes) * 100);

  const modeDescriptions: Record<FailureMode, string> = {
    'REVEAL_VAGUE': '信息揭示不具体',
    'MOTIVATION_WEAK': '动机或爽点不足',
    'CONFLICT_STALLED': '冲突推进缓慢',
    'UNKNOWN': '剧情质量不稳定'
  };

  return `你的项目有 ${degradedCount} 集（${percentage}%）需要优化，主要卡在：${modeDescriptions[primaryMode]}`;
}

/**
 * 生成具体建议
 */
function generateRecommendations(primaryMode: FailureMode): string[] {
  const recommendations: Record<FailureMode, string[]> = {
    'REVEAL_VAGUE': [
      '使用"提前揭示真相"微调指令，将关键真相提前',
      '增加明确的证据或验证场景',
      '避免模糊暗示，使用"发现""证实"等关键词'
    ],
    'MOTIVATION_WEAK': [
      '使用"强化反派"微调指令，提升压迫感',
      '增加爽点或情绪爆发场景',
      '确保角色行为符合既定人设'
    ],
    'CONFLICT_STALLED': [
      '使用"加重代价"微调指令，增加风险和紧迫感',
      '加快节奏，减少铺垫',
      '引入新的变量或压力源'
    ],
    'UNKNOWN': [
      '检查大纲的 conflictStage 是否合理',
      '参考 M16.4 metrics 报告进行详细分析',
      '考虑调整集数或重新规划大纲'
    ]
  };

  return recommendations[primaryMode] || [];
}

/**
 * 分析项目失败模式（主入口）
 * 
 * @param projectId - 项目 ID
 * @returns ProjectFailureAnalysis - 失败分析结果
 */
export async function analyzeProjectFailures(projectId: string): Promise<ProjectFailureAnalysis> {
  console.log(`[FailureCluster] Analyzing failures for project: ${projectId}`);

  const project = await projectRepo.get(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  // 收集失败数据
  const failureData = await collectFailureData(projectId);

  // 聚类失败原因
  const clusters = clusterFailureReasons(failureData);

  // 确定主要失败模式
  const primaryMode: FailureMode = clusters.length > 0 ? clusters[0].mode : 'UNKNOWN';

  // 统计各类失败数量
  const clusterMap = new Map(clusters.map(c => [c.mode, c.count]));
  const revealVague = clusterMap.get('REVEAL_VAGUE') || 0;
  const motivationWeak = clusterMap.get('MOTIVATION_WEAK') || 0;
  const conflictStalled = clusterMap.get('CONFLICT_STALLED') || 0;
  const unknown = clusterMap.get('UNKNOWN') || 0;

  const degradedEpisodes = revealVague + motivationWeak + conflictStalled + unknown;

  // 生成总结和建议
  const humanSummary = generateHumanSummary(primaryMode, degradedEpisodes, project.totalEpisodes);
  const recommendations = generateRecommendations(primaryMode);

  const analysis: ProjectFailureAnalysis = {
    projectId,
    totalEpisodes: project.totalEpisodes,
    degradedEpisodes,
    clusters: {
      revealVague,
      motivationWeak,
      conflictStalled,
      unknown
    },
    primaryMode,
    humanSummary,
    recommendations,
    timestamp: new Date().toISOString()
  };

  console.log(`[FailureCluster] Analysis complete:`, analysis);

  return analysis;
}

