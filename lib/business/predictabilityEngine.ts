/**
 * Predictability Engine - 内部稳定性预测（P5-Lite）
 * 
 * 核心功能：
 * - 分析 Project DNA 的失败演化趋势
 * - 基于最近的 DEGRADED 密度预测未来稳定性
 * - 基于指令效果历史评估干预价值
 * 
 * 设计原则：
 * - 所有预测都是内部使用，不影响用户决策
 * - 仅在日志中输出，不展示在 UI 层
 * - 失败时返回保守预测（MEDIUM 风险）
 */

import { StabilityPrediction, ProjectDNA, ProjectFailureProfile } from '../../types';
import { getProjectDNA } from './projectDNA';
import { batchRepo } from '../batch/batchRepo';
import { projectRepo } from '../store/projectRepo';

/**
 * 分析项目稳定性
 * 
 * @param projectId - 项目 ID
 * @param recentMetrics - 最近的指标（可选）
 * @returns StabilityPrediction - 稳定性预测
 */
export async function analyzeStability(
  projectId: string,
  recentMetrics?: any
): Promise<StabilityPrediction> {
  try {
    // 1. 获取 Project DNA
    const dna = await getProjectDNA(projectId);
    if (!dna || dna.failureEvolution.length === 0) {
      // 如果没有 DNA 或没有失败记录，返回保守预测
      return {
        next10EpisodesRisk: 'MEDIUM',
        expectedDegradedRate: 0.2,
        confidence: 0.3,
        notes: ['Insufficient data: No failure evolution available', 'Need at least 1 completed batch with failure tracking']
      };
    }

    // 2. 获取当前 batch 状态
    const batch = batchRepo.get(projectId);
    const currentEpisode = batch?.currentEpisode || 0;

    // 3. 分析失败演化趋势
    const trendAnalysis = analyzeFailureTrend(dna.failureEvolution);

    // 4. 分析最近的 DEGRADED 密度
    const degradedDensity = analyzeRecentDegradedDensity(dna, currentEpisode);

    // 5. 分析指令效果历史
    const instructionEffectiveness = analyzeInstructionEffectiveness(dna.instructionImpactHistory);

    // 6. 综合评估风险等级
    const riskLevel = assessRiskLevel(trendAnalysis, degradedDensity, instructionEffectiveness);

    // 7. 计算预期的降级率
    const expectedDegradedRate = calculateExpectedDegradedRate(trendAnalysis, degradedDensity);

    // 8. 计算置信度
    const confidence = calculateConfidence(dna, batch);

    // 9. 生成说明
    const notes = generateNotes(trendAnalysis, degradedDensity, instructionEffectiveness, riskLevel);

    const prediction: StabilityPrediction = {
      next10EpisodesRisk: riskLevel,
      expectedDegradedRate,
      confidence,
      notes
    };

    console.log(`[PredictabilityEngine] Stability prediction for project ${projectId}:`, prediction);
    return prediction;

  } catch (error) {
    console.error(`[PredictabilityEngine] Failed to analyze stability for project ${projectId}:`, error);
    // 返回保守预测
    return createDefaultPrediction('Analysis failed', ['Check error logs for details']);
  }
}

/**
 * 分析失败演化趋势
 * 
 * @param failureEvolution - 失败演化历史
 * @returns { trend: 'improving' | 'stable' | 'degrading', lastRatio: number }
 */
function analyzeFailureTrend(
  failureEvolution: ProjectDNA['failureEvolution']
): { trend: 'improving' | 'stable' | 'degrading'; lastRatio: number; averageRatio: number } {
  if (failureEvolution.length === 0) {
    return { trend: 'stable', lastRatio: 0, averageRatio: 0 };
  }

  // 取最近的 5 个快照（如果有的话）
  const recentSnapshots = failureEvolution.slice(-5);
  
  // 计算平均降级率
  const averageRatio = recentSnapshots.reduce((sum, s) => sum + s.degradedRatio, 0) / recentSnapshots.length;

  // 判断趋势
  if (recentSnapshots.length >= 3) {
    const first = recentSnapshots[0].degradedRatio;
    const last = recentSnapshots[recentSnapshots.length - 1].degradedRatio;
    const change = last - first;

    if (change < -0.1) {
      return { trend: 'improving', lastRatio: last, averageRatio };  // 降级率下降超过 10%
    } else if (change > 0.1) {
      return { trend: 'degrading', lastRatio: last, averageRatio };  // 降级率上升超过 10%
    }
  }

  return { trend: 'stable', lastRatio: recentSnapshots[recentSnapshots.length - 1].degradedRatio, averageRatio };
}

/**
 * 分析最近的 DEGRADED 密度
 * 
 * @param dna - Project DNA
 * @param currentEpisode - 当前集数
 * @returns { recentRatio: number, last10Ratio: number }
 */
function analyzeRecentDegradedDensity(
  dna: ProjectDNA,
  currentEpisode: number
): { recentRatio: number; last10Ratio: number } {
  // 从最近的失败快照中提取降级率
  const recentSnapshots = dna.failureEvolution.slice(-3);

  if (recentSnapshots.length === 0) {
    return { recentRatio: 0, last10Ratio: 0 };
  }

  // 计算最近的降级率
  const recentRatio = recentSnapshots.reduce((sum, s) => sum + s.degradedRatio, 0) / recentSnapshots.length;

  // 计算最近 10 集的降级率（如果 batch 包含最近 10 集）
  const last10Ratio = recentSnapshots[recentSnapshots.length - 1]?.degradedRatio || recentRatio;

  return { recentRatio, last10Ratio };
}

/**
 * 分析指令效果历史
 * 
 * @param instructionImpactHistory - 指令效果历史
 * @returns { effectiveCount: number, negativeCount: number, averageEffectiveness: number }
 */
function analyzeInstructionEffectiveness(
  instructionImpactHistory: ProjectDNA['instructionImpactHistory']
): { effectiveCount: number; negativeCount: number; averageEffectiveness: number } {
  if (instructionImpactHistory.length === 0) {
    return { effectiveCount: 0, negativeCount: 0, averageEffectiveness: 0 };
  }

  const effectiveCount = instructionImpactHistory.filter(i => i.effectiveness === 'effective').length;
  const negativeCount = instructionImpactHistory.filter(i => i.effectiveness === 'negative').length;

  // 计算平均效果（effective=1, neutral=0.5, negative=0）
  const totalEffect = instructionImpactHistory.reduce((sum, i) => {
    if (i.effectiveness === 'effective') return sum + 1;
    if (i.effectiveness === 'neutral') return sum + 0.5;
    return sum;
  }, 0);

  const averageEffectiveness = totalEffect / instructionImpactHistory.length;

  return { effectiveCount, negativeCount, averageEffectiveness };
}

/**
 * 评估风险等级
 * 
 * @param trendAnalysis - 失败趋势分析
 * @param degradedDensity - 降级密度
 * @param instructionEffectiveness - 指令效果
 * @returns 'LOW' | 'MEDIUM' | 'HIGH'
 */
function assessRiskLevel(
  trendAnalysis: ReturnType<typeof analyzeFailureTrend>,
  degradedDensity: ReturnType<typeof analyzeRecentDegradedDensity>,
  instructionEffectiveness: ReturnType<typeof analyzeInstructionEffectiveness>
): 'LOW' | 'MEDIUM' | 'HIGH' {
  const { trend, lastRatio } = trendAnalysis;
  const { recentRatio } = degradedDensity;
  const { averageEffectiveness } = instructionEffectiveness;

  // 规则 1：如果降级率 > 30%，判定为 HIGH 风险
  if (lastRatio > 0.3 || recentRatio > 0.3) {
    return 'HIGH';
  }

  // 规则 2：如果趋势是 degrading 且降级率 > 20%，判定为 HIGH 风险
  if (trend === 'degrading' && lastRatio > 0.2) {
    return 'HIGH';
  }

  // 规则 3：如果趋势是 improving 且降级率 < 15%，判定为 LOW 风险
  if (trend === 'improving' && lastRatio < 0.15) {
    return 'LOW';
  }

  // 规则 4：如果指令效果很好（>0.7），且降级率 < 20%，判定为 LOW 风险
  if (averageEffectiveness > 0.7 && lastRatio < 0.2) {
    return 'LOW';
  }

  // 规则 5：其他情况判定为 MEDIUM 风险
  return 'MEDIUM';
}

/**
 * 计算预期的降级率
 * 
 * @param trendAnalysis - 失败趋势分析
 * @param degradedDensity - 降级密度
 * @returns 预期的降级率（0-1）
 */
function calculateExpectedDegradedRate(
  trendAnalysis: ReturnType<typeof analyzeFailureTrend>,
  degradedDensity: ReturnType<typeof analyzeRecentDegradedDensity>
): number {
  const { trend, lastRatio, averageRatio } = trendAnalysis;
  const { recentRatio, last10Ratio } = degradedDensity;

  // 基础预测：使用最近的降级率
  let expected = (lastRatio + recentRatio + last10Ratio) / 3;

  // 根据趋势调整
  if (trend === 'improving') {
    // 改善趋势：预测降级率会降低
    expected *= 0.9;
  } else if (trend === 'degrading') {
    // 恶化趋势：预测降级率会升高
    expected *= 1.1;
  }

  // 限制在 0-1 范围内
  return Math.max(0, Math.min(1, expected));
}

/**
 * 计算置信度
 * 
 * @param dna - Project DNA
 * @param batch - Batch 状态
 * @returns 置信度（0-1）
 */
function calculateConfidence(dna: ProjectDNA, batch: any): number {
  const factors = [];

  // 因素 1：失败演化历史长度
  if (dna.failureEvolution.length >= 5) {
    factors.push(0.8);
  } else if (dna.failureEvolution.length >= 3) {
    factors.push(0.6);
  } else if (dna.failureEvolution.length >= 1) {
    factors.push(0.4);
  } else {
    factors.push(0.2);
  }

  // 因素 2：指令效果历史长度
  if (dna.instructionImpactHistory.length >= 5) {
    factors.push(0.8);
  } else if (dna.instructionImpactHistory.length >= 3) {
    factors.push(0.6);
  } else if (dna.instructionImpactHistory.length >= 1) {
    factors.push(0.4);
  } else {
    factors.push(0.2);
  }

  // 因素 3：已完成集数
  if (batch && batch.completed && batch.completed.length >= 30) {
    factors.push(0.9);
  } else if (batch && batch.completed && batch.completed.length >= 10) {
    factors.push(0.7);
  } else if (batch && batch.completed && batch.completed.length >= 5) {
    factors.push(0.5);
  } else {
    factors.push(0.3);
  }

  // 计算平均置信度
  return factors.reduce((sum, f) => sum + f, 0) / factors.length;
}

/**
 * 生成说明
 * 
 * @param trendAnalysis - 失败趋势分析
 * @param degradedDensity - 降级密度
 * @param instructionEffectiveness - 指令效果
 * @param riskLevel - 风险等级
 * @returns 说明列表
 */
function generateNotes(
  trendAnalysis: ReturnType<typeof analyzeFailureTrend>,
  degradedDensity: ReturnType<typeof analyzeRecentDegradedDensity>,
  instructionEffectiveness: ReturnType<typeof analyzeInstructionEffectiveness>,
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
): string[] {
  const notes: string[] = [];

  // 添加趋势说明
  notes.push(`Failure trend: ${trendAnalysis.trend} (last ratio: ${(trendAnalysis.lastRatio * 100).toFixed(1)}%)`);

  // 添加降级密度说明
  notes.push(`Recent degraded density: ${(degradedDensity.recentRatio * 100).toFixed(1)}%`);

  // 添加指令效果说明
  if (instructionEffectiveness.effectiveCount > 0) {
    notes.push(`${instructionEffectiveness.effectiveCount} effective instructions applied`);
  }
  if (instructionEffectiveness.negativeCount > 0) {
    notes.push(`${instructionEffectiveness.negativeCount} negative instructions applied`);
  }

  // 添加建议（根据风险等级）
  if (riskLevel === 'HIGH') {
    notes.push('Recommendation: Consider intervention or manual review');
  } else if (riskLevel === 'MEDIUM') {
    notes.push('Recommendation: Monitor closely, consider applying effective instructions');
  } else {
    notes.push('Recommendation: Continue current approach');
  }

  return notes;
}

/**
 * 创建默认预测（保守）
 * 
 * @param reason - 原因
 * @param notes - 说明
 * @returns StabilityPrediction
 */
function createDefaultPrediction(reason: string, notes: string[]): StabilityPrediction {
  return {
    next10EpisodesRisk: 'MEDIUM',
    expectedDegradedRate: 0.2,
    confidence: 0.3,
    notes: [`Default prediction: ${reason}`, ...notes]
  };
}

