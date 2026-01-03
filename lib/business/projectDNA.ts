/**
 * Project DNA - 项目长期记忆（P5-Lite）
 * 
 * 核心功能：
 * - 记录失败快照（Failure Snapshot）
 * - 记录指令效果（Instruction Impact）
 * - 记录创作决策（Creative Decision）
 * - 导出完整 Project DNA
 * 
 * 设计原则：
 * - 所有记录操作都在 try-catch 中，失败不影响主流程
 * - 数据按 projectId 隔离存储
 * - 所有数据都是 optional，向后兼容
 */

import { ProjectDNA, FailureSnapshot, InstructionImpactRecord, CreativeDecision, ProjectFailureProfile } from '../../types';
import { storage } from '../utils/storage';

const STORAGE_KEY = (projectId: string) => `scriptflow_project_dna_${projectId}`;

/**
 * 获取 Project DNA
 * 
 * @param projectId - 项目 ID
 * @returns ProjectDNA | null - 返回完整的 Project DNA，如果不存在则返回 null
 */
export async function getProjectDNA(projectId: string): Promise<ProjectDNA | null> {
  try {
    const data = storage.getItem(STORAGE_KEY(projectId));
    if (!data) {
      console.log(`[ProjectDNA] No DNA found for project ${projectId}`);
      return null;
    }
    const dna: ProjectDNA = JSON.parse(data);
    console.log(`[ProjectDNA] Loaded DNA for project ${projectId}:`, {
      failureEvolutionCount: dna.failureEvolution.length,
      instructionImpactHistoryCount: dna.instructionImpactHistory.length,
      creativeDecisionsCount: dna.creativeDecisions.length,
    });
    return dna;
  } catch (error) {
    console.error(`[ProjectDNA] Failed to load DNA for project ${projectId}:`, error);
    return null;
  }
}

/**
 * 记录失败快照（Failure Snapshot）
 * 
 * 在 batch 完成或暂停时记录当前失败状态
 * 
 * @param projectId - 项目 ID
 * @param failureProfile - 失败画像
 * @param degradedRatio - 降级率
 */
export async function recordFailureSnapshot(
  projectId: string,
  failureProfile: ProjectFailureProfile,
  degradedRatio: number
): Promise<void> {
  try {
    const dna = await getOrInitDNA(projectId);
    const project = await (await import('../store/projectRepo')).projectRepo.get(projectId);

    if (!project) {
      console.warn(`[ProjectDNA] Project not found: ${projectId}`);
      return;
    }

    const snapshot: FailureSnapshot = {
      timestamp: new Date().toISOString(),
      episodeIndex: project.episodes.length,
      failureProfile,
      degradedRatio
    };

    dna.failureEvolution.push(snapshot);
    dna.updatedAt = new Date().toISOString();

    await saveDNA(projectId, dna);
    console.log(`[ProjectDNA] Recorded failure snapshot for project ${projectId}:`, {
      episodeIndex: snapshot.episodeIndex,
      degradedRatio: degradedRatio.toFixed(2),
      primaryMode: failureProfile.dominantPatterns?.[0]?.type || 'UNKNOWN'
    });
  } catch (error) {
    console.error(`[ProjectDNA] Failed to record failure snapshot for project ${projectId}:`, error);
    // 静默失败，不影响主流程
  }
}

/**
 * 记录指令效果（Instruction Impact）
 * 
 * 在 episodeFlow 应用指令前后记录降级率变化
 * 
 * @param projectId - 项目 ID
 * @param instructionId - 指令 ID
 * @param beforeRatio - 应用前的降级率
 * @param afterRatio - 应用后的降级率
 */
export async function recordInstructionImpact(
  projectId: string,
  instructionId: string,
  beforeRatio: number,
  afterRatio: number
): Promise<void> {
  try {
    const dna = await getOrInitDNA(projectId);
    const project = await (await import('../store/projectRepo')).projectRepo.get(projectId);

    if (!project) {
      console.warn(`[ProjectDNA] Project not found: ${projectId}`);
      return;
    }

    const delta = afterRatio - beforeRatio;
    let effectiveness: 'effective' | 'neutral' | 'negative';

    if (delta < -0.05) {
      effectiveness = 'effective';  // 降级率下降超过 5%，判定为有效
    } else if (delta > 0.05) {
      effectiveness = 'negative';  // 降级率上升超过 5%，判定为负面
    } else {
      effectiveness = 'neutral';   // 变化在 ±5% 范围内，判定为中性
    }

    const impact: InstructionImpactRecord = {
      timestamp: new Date().toISOString(),
      instructionId,
      appliedAtEpisode: project.episodes.length,
      beforeRatio,
      afterRatio,
      delta,
      effectiveness
    };

    dna.instructionImpactHistory.push(impact);
    dna.updatedAt = new Date().toISOString();

    await saveDNA(projectId, dna);
    console.log(`[ProjectDNA] Recorded instruction impact for project ${projectId}:`, {
      instructionId,
      effectiveness,
      beforeRatio: beforeRatio.toFixed(2),
      afterRatio: afterRatio.toFixed(2),
      delta: delta.toFixed(2)
    });
  } catch (error) {
    console.error(`[ProjectDNA] Failed to record instruction impact for project ${projectId}:`, error);
    // 静默失败，不影响主流程
  }
}

/**
 * 记录创作决策（Creative Decision）
 * 
 * 记录用户对项目的创作方向调整
 * 
 * @param projectId - 项目 ID
 * @param decision - 创作决策
 */
export async function recordCreativeDecision(
  projectId: string,
  decision: CreativeDecision
): Promise<void> {
  try {
    const dna = await getOrInitDNA(projectId);

    // 确保时间戳
    if (!decision.timestamp) {
      decision.timestamp = new Date().toISOString();
    }

    dna.creativeDecisions.push(decision);
    dna.updatedAt = new Date().toISOString();

    await saveDNA(projectId, dna);
    console.log(`[ProjectDNA] Recorded creative decision for project ${projectId}:`, {
      decisionType: decision.decisionType,
      description: decision.description,
      episodeRange: decision.episodeRange
    });
  } catch (error) {
    console.error(`[ProjectDNA] Failed to record creative decision for project ${projectId}:`, error);
    // 静默失败，不影响主流程
  }
}

/**
 * 导出 Project DNA
 * 
 * @param projectId - 项目 ID
 * @returns ProjectDNA | null - 返回完整的 Project DNA
 */
export async function exportProjectDNA(projectId: string): Promise<ProjectDNA | null> {
  return await getProjectDNA(projectId);
}

/**
 * 获取或初始化 Project DNA
 *
 * @param projectId - 项目 ID
 * @returns ProjectDNA - 返回 Project DNA（已初始化）
 */
export async function getOrInitDNA(projectId: string): Promise<ProjectDNA> {
  const dna = await getProjectDNA(projectId);
  if (dna) {
    return dna;
  }

  // 初始化新的 Project DNA
  const newDNA: ProjectDNA = {
    projectId,
    failureEvolution: [],
    instructionImpactHistory: [],
    creativeDecisions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await saveDNA(projectId, newDNA);
  console.log(`[ProjectDNA] Initialized new DNA for project ${projectId}`);
  return newDNA;
}

/**
 * 保存 Project DNA 到 storage
 * 
 * @param projectId - 项目 ID
 * @param dna - Project DNA
 */
async function saveDNA(projectId: string, dna: ProjectDNA): Promise<void> {
  dna.updatedAt = new Date().toISOString();
  storage.setItem(STORAGE_KEY(projectId), JSON.stringify(dna));
}

