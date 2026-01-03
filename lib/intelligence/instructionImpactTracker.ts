/**
 * P4.2: 指令效果回溯
 *
 * 追踪指令应用前后的降级率变化，记录每个指令的实际效果。
 * 帮助系统知道"这个指令到底对这个项目有没有用"。
 */

import { Project, EpisodeStatus, InstructionImpact, InstructionImpactHistory } from '../../types';
import { projectRepo } from '../store/projectRepo';

/**
 * 计算当前降级率
 * 统计 DEGRADED 状态的剧集占比
 */
function calculateDegradedRatio(project: Project): number {
  const totalEpisodes = project.episodes.length;
  if (totalEpisodes === 0) {
    return 0;
  }

  const degradedCount = project.episodes.filter(
    ep => ep.status === EpisodeStatus.DEGRADED
  ).length;

  return degradedCount / totalEpisodes;
}

/**
 * 记录指令应用前的状态
 * 在应用指令前调用，记录当前降级率
 */
export async function recordInstructionBefore(
  projectId: string,
  instructionId: string,
  appliedAtEpisode: number
): Promise<number> {
  const project = await projectRepo.get(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const degradedRatio = calculateDegradedRatio(project);

  console.log(
    `[InstructionImpactTracker] Recording BEFORE instruction "${instructionId}" at EP${appliedAtEpisode}: ` +
    `degradedRatio = ${(degradedRatio * 100).toFixed(2)}%`
  );

  // 临时存储"before"状态，用于后续记录完整的影响
  const beforeKey = `scriptflow_instruction_before_${projectId}_${instructionId}_${appliedAtEpisode}`;
  const beforeData = {
    instructionId,
    appliedAtEpisode,
    before: { degradedRatio },
    timestamp: new Date().toISOString()
  };

  // 使用临时存储（稍后会被完整记录替换）
  localStorage.setItem(beforeKey, JSON.stringify(beforeData));

  return degradedRatio;
}

/**
 * 记录指令应用后的完整效果
 * 在指令应用并生成剧集后调用，记录完整的影响
 */
export async function recordInstructionAfter(
  projectId: string,
  instructionId: string,
  appliedAtEpisode: number
): Promise<void> {
  const project = await projectRepo.get(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  // 读取"before"状态
  const beforeKey = `scriptflow_instruction_before_${projectId}_${instructionId}_${appliedAtEpisode}`;
  const beforeDataStr = localStorage.getItem(beforeKey);

  if (!beforeDataStr) {
    console.warn(
      `[InstructionImpactTracker] No BEFORE state found for instruction "${instructionId}" at EP${appliedAtEpisode}. ` +
      `Skipping impact recording.`
    );
    return;
  }

  const beforeData = JSON.parse(beforeDataStr);
  const beforeRatio = beforeData.before.degradedRatio;

  // 计算"after"状态
  const afterRatio = calculateDegradedRatio(project);

  // 计算变化量
  const delta = afterRatio - beforeRatio;

  console.log(
    `[InstructionImpactTracker] Recording AFTER instruction "${instructionId}" at EP${appliedAtEpisode}: ` +
    `before = ${(beforeRatio * 100).toFixed(2)}%, ` +
    `after = ${(afterRatio * 100).toFixed(2)}%, ` +
    `delta = ${(delta * 100).toFixed(2)}%`
  );

  // 构建完整的影响记录
  const impact: InstructionImpact = {
    instructionId,
    appliedAtEpisode,
    before: { degradedRatio: beforeRatio },
    after: { degradedRatio: afterRatio },
    delta,
    timestamp: new Date().toISOString()
  };

  // 获取现有历史
  const history = await getInstructionImpactHistory(projectId);

  // 添加新记录
  history.impacts.push(impact);

  // 按时间排序（最新的在前）
  history.impacts.sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // 只保留最近 50 条记录，避免无限增长
  if (history.impacts.length > 50) {
    history.impacts = history.impacts.slice(0, 50);
  }

  // 保存历史
  await projectRepo.saveInstructionImpact(projectId, history);

  // 清除临时存储
  localStorage.removeItem(beforeKey);

  console.log(`[InstructionImpactTracker] Impact saved. Total impacts: ${history.impacts.length}`);
}

/**
 * 获取指令效果历史
 */
export async function getInstructionImpactHistory(
  projectId: string
): Promise<InstructionImpactHistory> {
  const history = await projectRepo.getInstructionImpact(projectId);

  if (!history) {
    return {
      projectId,
      impacts: []
    };
  }

  return history;
}

/**
 * 计算特定指令的平均效果
 * 返回该指令的历史平均 delta
 */
export function calculateAverageImpact(
  history: InstructionImpactHistory,
  instructionId: string
): number | null {
  const instructionImpacts = history.impacts.filter(
    impact => impact.instructionId === instructionId
  );

  if (instructionImpacts.length === 0) {
    return null;
  }

  const sumDelta = instructionImpacts.reduce((sum, impact) => sum + impact.delta, 0);
  const averageDelta = sumDelta / instructionImpacts.length;

  return averageDelta;
}

/**
 * 查找最有效的指令
 * 返回历史中平均效果最好的指令
 */
export function findMostEffectiveInstruction(
  history: InstructionImpactHistory,
  targetMode?: string
): { instructionId: string; averageDelta: number } | null {
  // 按 instructionId 分组
  const impactsByInstruction = new Map<string, InstructionImpact[]>();

  for (const impact of history.impacts) {
    if (!impactsByInstruction.has(impact.instructionId)) {
      impactsByInstruction.set(impact.instructionId, []);
    }
    impactsByInstruction.get(impact.instructionId)!.push(impact);
  }

  // 计算每个指令的平均效果
  const averageImpacts: Array<{
    instructionId: string;
    averageDelta: number;
    count: number;
  }> = [];

  for (const [instructionId, impacts] of impactsByInstruction) {
    const sumDelta = impacts.reduce((sum, impact) => sum + impact.delta, 0);
    const averageDelta = sumDelta / impacts.length;

    averageImpacts.push({
      instructionId,
      averageDelta,
      count: impacts.length
    });
  }

  if (averageImpacts.length === 0) {
    return null;
  }

  // 按平均效果排序（delta 越小越好，因为负数表示改善）
  averageImpacts.sort((a, b) => a.averageDelta - b.averageDelta);

  // 返回效果最好的指令（至少应用过 2 次）
  const best = averageImpacts.find(ai => ai.count >= 2);

  return best ? { instructionId: best.instructionId, averageDelta: best.averageDelta } : null;
}

/**
 * 生成指令效果摘要
 * 用于前端展示某个指令的历史效果
 */
export function generateInstructionSummary(
  instructionId: string,
  history: InstructionImpactHistory
): string {
  const instructionImpacts = history.impacts.filter(
    impact => impact.instructionId === instructionId
  );

  if (instructionImpacts.length === 0) {
    return '暂无历史数据';
  }

  const averageDelta = calculateAverageImpact(history, instructionId)!;

  const avgPercentage = (averageDelta * 100).toFixed(1);

  if (averageDelta < -0.1) {
    return `历史应用 ${instructionImpacts.length} 次，平均降低失败率 ${Math.abs(parseFloat(avgPercentage))}%`;
  } else if (averageDelta > 0.1) {
    return `历史应用 ${instructionImpacts.length} 次，平均增加失败率 ${avgPercentage}%`;
  } else {
    return `历史应用 ${instructionImpacts.length} 次，效果不明显`;
  }
}

