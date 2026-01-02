/**
 * 仇恨链映射引擎
 *
 * 职责：根据仇恨链配置和当前集数，确定本集的expectedAntagonist、
 *        expectedConflictType、protagonistState和allowedResolution
 * 目的：控制反派梯度，确保剧情冲突有层次、有节奏
 */

import { ConflictChain, ConflictStageSpec } from '../../types';
import { ConflictStage } from '../../types';

/**
 * 当前集数的冲突约束
 */
export interface ConflictConstraint {
  expectedAntagonist: string;              // 预期反派名称
  expectedConflictType: string;           // 预期冲突类型
  protagonistState: '被动承受' | '被迫反击' | '主动进攻';  // 主角状态
  allowedResolution: '小胜' | '反转失败' | '阶段性清算';  // 允许的结局类型
  stageDescription?: string;              // 当前阶段描述
  // M6-2: 模板新增字段
  expectedAntagonistType?: string;        // 预期反派类型（如"低阶压迫者"）
  requiredPleasure?: string[];            // 必须产出的爽点类型
}

/**
 * 根据集数从仇恨链中获取对应的冲突阶段
 * @param conflictChain 仇恨链配置
 * @param episodeIndex 当前集数
 * @param totalEpisodes 总集数
 * @returns 冲突约束对象
 */
export function getConflictConstraint(
  conflictChain: ConflictChain | undefined,
  episodeIndex: number,
  totalEpisodes: number
): ConflictConstraint {
  // 如果没有仇恨链配置，返回默认值
  if (!conflictChain || !conflictChain.stages || conflictChain.stages.length === 0) {
    return {
      expectedAntagonist: '未指定',
      expectedConflictType: '推进主线冲突',
      protagonistState: '被动承受',
      allowedResolution: '小胜',
      stageDescription: '未配置仇恨链，请确保Outline中有明确冲突'
    };
  }

  // 找到当前集数对应的阶段
  const stage = findCurrentStage(conflictChain.stages, episodeIndex, totalEpisodes);

  if (!stage) {
    return {
      expectedAntagonist: '未指定',
      expectedConflictType: '推进主线冲突',
      protagonistState: '被动承受',
      allowedResolution: '小胜',
      stageDescription: '当前集数超出仇恨链配置范围'
    };
  }

  return {
    expectedAntagonist: stage.mainAntagonist,
    expectedConflictType: stage.conflictSource,
    protagonistState: stage.protagonistState,
    allowedResolution: stage.resolutionType,
    stageDescription: `第 ${stage.stageIndex} 阶段：${stage.pressureMethod}`,
    // M6-2: 提取模板新增字段
    expectedAntagonistType: stage.mainAntagonistType,
    requiredPleasure: stage.requiredPleasure
  };
}

/**
 * 找到当前集数对应的阶段
 */
function findCurrentStage(
  stages: ConflictStageSpec[],
  episodeIndex: number,
  totalEpisodes: number
): ConflictStageSpec | null {
  // 将总集数划分为阶段区间
  const episodesPerStage = Math.floor(totalEpisodes / stages.length);
  const currentStageIndex = Math.min(
    Math.floor((episodeIndex - 1) / episodesPerStage),
    stages.length - 1
  );

  return stages[currentStageIndex] || stages[stages.length - 1];
}

/**
 * 根据集数获取预期的冲突阶段枚举值
 * 用于 Outline 生成和验证时的结构化冲突阶段校验
 * @param episodeIndex 当前集数
 * @param totalEpisodes 总集数
 * @returns 预期的冲突阶段枚举值
 */
export function getExpectedConflictStage(
  episodeIndex: number,
  totalEpisodes: number
): ConflictStage {
  // EP1: 被动承受（开局）
  if (episodeIndex === 1) {
    return ConflictStage.PASSIVE_ENDURE;
  }

  // EP2-EP3: 推进主线冲突
  if (episodeIndex <= 3) {
    return ConflictStage.MAIN_CONFLICT_PUSH;
  }

  // 中段：主动选择（EP4 到 60%）
  const mid = Math.floor(totalEpisodes * 0.6);
  if (episodeIndex <= mid) {
    return ConflictStage.ACTIVE_CHOICE;
  }

  // 后段：地位/力量变化（61% 到 85%）
  const late = Math.floor(totalEpisodes * 0.85);
  if (episodeIndex <= late) {
    return ConflictStage.POWER_SHIFT;
  }

  // 最后一集：悬念升级
  if (episodeIndex === totalEpisodes) {
    return ConflictStage.CLIFFHANGER;
  }

  // 倒数第二集及之前：反转
  return ConflictStage.REVERSAL;
}

/**
 * 生成默认的复仇类剧本仇恨链
 * @param characters 角色数组（需要包含反派）
 * @param totalEpisodes 总集数
 * @returns 默认仇恨链
 */
export function generateDefaultConflictChain(
  characters: any[],
  totalEpisodes: number
): ConflictChain {
  const antagonists = characters
    .filter((c: any) => c.roleType === 'ANTAGONIST')
    .sort((a: any, b: any) => {
      const tierOrder = { 'HIGH': 0, 'MID': 1, 'LOW': 2 };
      return (tierOrder[a.tier] || 99) - (tierOrder[b.tier] || 99);
    });

  // 如果没有反派，返回空仇恨链
  if (antagonists.length === 0) {
    return { stages: [] };
  }

  // 根据反派数量生成分阶段仇恨链
  const stages: ConflictStageSpec[] = [];
  const episodesPerStage = Math.floor(totalEpisodes / (antagonists.length + 1));

  // 第一阶段：低阶反派
  if (antagonists.length >= 3 && antagonists[2]) {
    stages.push({
      stageIndex: 1,
      mainAntagonist: antagonists[2].name,
      conflictSource: '职场霸凌与日常羞辱',
      pressureMethod: '通过日常琐事和职场规则施压',
      protagonistState: '被动承受',
      resolutionType: '小胜'
    });
  }

  // 第二阶段：中阶反派
  if (antagonists.length >= 2 && antagonists[1]) {
    stages.push({
      stageIndex: 2,
      mainAntagonist: antagonists[1].name,
      conflictSource: '资源压制与规则碾压',
      pressureMethod: '通过资源和制度优势全面压制',
      protagonistState: '被迫反击',
      resolutionType: '反转失败'
    });
  }

  // 第三阶段：高阶反派
  if (antagonists.length >= 1 && antagonists[0]) {
    stages.push({
      stageIndex: 3,
      mainAntagonist: antagonists[0].name,
      conflictSource: '资本博弈与阶层对立',
      pressureMethod: '通过资本和社会地位进行终极压迫',
      protagonistState: '主动进攻',
      resolutionType: '阶段性清算'
    });
  }

  return { stages };
}

/**
 * 将冲突约束转换为Prompt注入文本
 * @param constraint 冲突约束
 * @returns Prompt注入文本
 */
export function buildConflictConstraintPromptInjection(constraint: ConflictConstraint): string {
  let text = `\n【本集冲突约束 - 不可违反】\n`;
  text += `════════════════════════════════════════════════════════════════\n`;
  text += `预期反派：${constraint.expectedAntagonist}\n`;
  text += `冲突类型：${constraint.expectedConflictType}\n`;
  text += `主角状态：${constraint.protagonistState}\n`;
  text += `允许结局：${constraint.allowedResolution}\n`;

  if (constraint.stageDescription) {
    text += `\n阶段说明：${constraint.stageDescription}\n`;
  }

  // M6-2: 新增字段注入
  if (constraint.expectedAntagonistType) {
    text += `预期反派类型：${constraint.expectedAntagonistType}\n`;
  }

  if (constraint.requiredPleasure && constraint.requiredPleasure.length > 0) {
    text += `\n【必须产出的爽点】\n`;
    text += `本集必须产出以下至少 1 种爽点：${constraint.requiredPleasure.join('、')}\n`;
    text += `未产出 → 视为失败\n`;
  }

  text += `\n【禁止事项】\n`;
  text += `❌ 禁止让预期反派以外的角色承担主要压迫者角色\n`;
  text += `❌ 禁止改变主角的当前状态\n`;
  text += `❌ 禁止超出允许的结局类型\n`;
  text += `❌ 禁止缺少必须产出的爽点\n`;
  text += `════════════════════════════════════════════════════════════════\n\n`;

  return text;
}

