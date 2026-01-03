/**
 * P4.3: 主动指令推荐
 *
 * 基于项目失败画像和指令历史效果，智能推荐有效的创作指令。
 * 让系统"会提前帮用户做对选择"。
 */

import { ProjectFailureProfile, SystemInstructionSuggestion, FailureMode } from '../../types';
import { collectFailureData } from '../guidance/failureCluster';
import { PRESET_INSTRUCTIONS } from '../guidance/instructionMapper';
import { findMostEffectiveInstruction, calculateAverageImpact } from './instructionImpactTracker';
import { getInstructionImpactHistory } from './instructionImpactTracker';

/**
 * 指令与失败模式的映射关系
 * 哪些指令对哪些失败模式有效
 */
const INSTRUCTION_TO_FAILURE_MODE: Record<string, FailureMode[]> = {
  'strengthen-antagonist': ['MOTIVATION_WEAK', 'CONFLICT_STALLED'],
  'reveal-early': ['REVEAL_VAGUE'],
  'increase-cost': ['MOTIVATION_WEAK', 'CONFLICT_STALLED']
};

/**
 * 检查同一失败模式是否连续出现多次
 */
function checkConsecutiveFailures(
  failuresByMode: Map<FailureMode, number>,
  threshold: number = 3
): boolean {
  for (const [_, count] of failuresByMode) {
    if (count >= threshold) {
      return true;
    }
  }
  return false;
}

/**
 * 获取主要失败模式
 */
function getPrimaryFailureMode(
  failuresByMode: Map<FailureMode, number>
): FailureMode | null {
  let maxCount = 0;
  let primaryMode: FailureMode | null = null;

  for (const [mode, count] of failuresByMode) {
    if (count > maxCount) {
      maxCount = count;
      primaryMode = mode;
    }
  }

  return primaryMode;
}

/**
 * 查找适合当前失败模式的指令
 */
function findInstructionsForMode(
  mode: FailureMode
): string[] {
  const matching: string[] = [];

  for (const [instructionId, modes] of Object.entries(INSTRUCTION_TO_FAILURE_MODE)) {
    if (modes.includes(mode)) {
      matching.push(instructionId);
    }
  }

  return matching;
}

/**
 * 生成推荐理由
 */
function generateRecommendationReason(
  failureMode: FailureMode,
  instructionId: string,
  confidence: 'high' | 'medium' | 'low',
  failureCount: number,
  averageDelta?: number
): string {
  const modeDescriptions: Record<FailureMode, string> = {
    'REVEAL_VAGUE': '信息揭示不具体',
    'MOTIVATION_WEAK': '人物动机不足',
    'CONFLICT_STALLED': '冲突推进缓慢',
    'UNKNOWN': '剧情质量不稳定'
  };

  const instructionLabels: Record<string, string> = {
    'strengthen-antagonist': '强化反派',
    'reveal-early': '提前揭示真相',
    'increase-cost': '加重代价'
  };

  const modeDesc = modeDescriptions[failureMode];
  const instructionLabel = instructionLabels[instructionId] || instructionId;

  let reason = '';

  if (confidence === 'high' && averageDelta !== undefined) {
    const improvement = Math.abs(averageDelta * 100).toFixed(0);
    reason = `本项目已连续 ${failureCount} 集因【${modeDesc}】降级，且历史中「${instructionLabel}」指令平均能降低失败率 ${improvement}%。`;
  } else if (confidence === 'medium') {
    reason = `本项目已连续 ${failureCount} 集因【${modeDesc}】降级，建议尝试「${instructionLabel}」指令来改善。`;
  } else {
    reason = `本项目【${modeDesc}】问题较多，建议尝试「${instructionLabel}」指令来优化。`;
  }

  return reason;
}

/**
 * 生成系统指令建议
 *
 * 触发条件：
 * 1. 高置信度：同一失败模式连续 ≥ 3 次 AND 历史上该指令有效（delta < -15%）
 * 2. 中置信度：同一失败模式连续 ≥ 3 次
 * 3. 低置信度：降级密度 > 40%
 *
 * @param projectId - 项目 ID
 * @returns SystemInstructionSuggestion | null - 推荐建议（仅在高置信度时返回）
 */
export async function generateInstructionSuggestion(
  projectId: string
): Promise<SystemInstructionSuggestion | null> {
  console.log(`[InstructionRecommender] Generating suggestion for project: ${projectId}`);

  // 收集失败数据
  const failureData = await collectFailureData(projectId);

  if (failureData.length === 0) {
    console.log(`[InstructionRecommender] No failure data found`);
    return null;
  }

  // 统计失败模式
  const failuresByMode = new Map<FailureMode, number>();
  for (const data of failureData) {
    failuresByMode.set(
      data.mode,
      (failuresByMode.get(data.mode) || 0) + 1
    );
  }

  const failureCount = failureData.length;
  const degradedDensity = failureCount / (failureData[0]?.episodeIndex || 1);

  console.log(
    `[InstructionRecommender] Failure analysis: ` +
    `count = ${failureCount}, ` +
    `density = ${(degradedDensity * 100).toFixed(1)}%, ` +
    `modes = ${JSON.stringify(Array.from(failuresByMode.entries()))}`
  );

  // 获取指令历史
  const history = await getInstructionImpactHistory(projectId);

  // === 高置信度：失败模式连续 ≥ 3 次 AND 历史上该指令有效 ===
  if (checkConsecutiveFailures(failuresByMode, 3)) {
    const primaryMode = getPrimaryFailureMode(failuresByMode);

    if (primaryMode) {
      const matchingInstructions = findInstructionsForMode(primaryMode);

      // 查找历史中最有效的指令
      for (const instructionId of matchingInstructions) {
        const averageDelta = calculateAverageImpact(history, instructionId);

        if (averageDelta !== null && averageDelta < -0.15) {
          const suggestion: SystemInstructionSuggestion = {
            instructionId,
            confidence: 'high',
            reason: generateRecommendationReason(
              primaryMode,
              instructionId,
              'high',
              failuresByMode.get(primaryMode)!,
              averageDelta
            ),
            timestamp: new Date().toISOString()
          };

          console.log(`[InstructionRecommender] High confidence suggestion generated:`, suggestion);
          return suggestion;
        }
      }
    }
  }

  // === 中置信度：失败模式连续 ≥ 3 次 ===
  if (checkConsecutiveFailures(failuresByMode, 3)) {
    const primaryMode = getPrimaryFailureMode(failuresByMode);

    if (primaryMode) {
      const matchingInstructions = findInstructionsForMode(primaryMode);

      // 选择第一个匹配的指令
      if (matchingInstructions.length > 0) {
        const instructionId = matchingInstructions[0];
        const suggestion: SystemInstructionSuggestion = {
          instructionId,
          confidence: 'medium',
          reason: generateRecommendationReason(
            primaryMode,
            instructionId,
            'medium',
            failuresByMode.get(primaryMode)!
          ),
          timestamp: new Date().toISOString()
        };

        console.log(`[InstructionRecommender] Medium confidence suggestion generated:`, suggestion);
        return suggestion;
      }
    }
  }

  // === 低置信度：降级密度 > 40% ===
  if (degradedDensity > 0.4) {
    const primaryMode = getPrimaryFailureMode(failuresByMode);

    if (primaryMode) {
      const matchingInstructions = findInstructionsForMode(primaryMode);

      if (matchingInstructions.length > 0) {
        const instructionId = matchingInstructions[0];
        const suggestion: SystemInstructionSuggestion = {
          instructionId,
          confidence: 'low',
          reason: generateRecommendationReason(
            primaryMode,
            instructionId,
            'low',
            failuresByMode.get(primaryMode)!
          ),
          timestamp: new Date().toISOString()
        };

        console.log(`[InstructionRecommender] Low confidence suggestion generated:`, suggestion);
        return suggestion;
      }
    }
  }

  console.log(`[InstructionRecommender] No suggestion generated (confidence too low)`);
  return null;
}

/**
 * 判断是否应该触发推荐
 * 这是一个内部辅助函数，用于控制推荐频率
 */
export function shouldTriggerRecommendation(
  projectId: string
): boolean {
  // 检查是否有被忽略的推荐
  const dismissedKey = `scriptflow_suggestion_dismissed_${projectId}`;
  const dismissedData = localStorage.getItem(dismissedKey);

  if (dismissedData) {
    const { timestamp } = JSON.parse(dismissedData);
    const dismissedTime = new Date(timestamp).getTime();
    const now = Date.now();

    // 如果在 1 小时内被忽略，则不触发推荐
    if (now - dismissedTime < 60 * 60 * 1000) {
      console.log(`[InstructionRecommender] Recommendation skipped (recently dismissed)`);
      return false;
    }
  }

  return true;
}

/**
 * 标记推荐为已忽略
 */
export function dismissRecommendation(projectId: string): void {
  const dismissedKey = `scriptflow_suggestion_dismissed_${projectId}`;
  const data = {
    timestamp: new Date().toISOString()
  };

  localStorage.setItem(dismissedKey, JSON.stringify(data));
  console.log(`[InstructionRecommender] Recommendation dismissed for project: ${projectId}`);
}

/**
 * 清除忽略标记
 * 在用户应用指令后调用
 */
export function clearDismissedRecommendation(projectId: string): void {
  const dismissedKey = `scriptflow_suggestion_dismissed_${projectId}`;
  localStorage.removeItem(dismissedKey);
  console.log(`[InstructionRecommender] Dismissal cleared for project: ${projectId}`);
}

