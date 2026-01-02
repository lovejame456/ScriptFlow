/**
 * Quality Signals - 质量信号系统（M13）
 *
 * 功能：为每一集生成 6 个质量信号，标记结构性质量特征
 * 原则：不影响生成、不修改 prompt、不参与生成决策
 * 用途：仅用于后续质量分析与优化
 */

import { NarrativeState, StateDelta, EpisodeFacts, EpisodeFactsRecord, QualitySignals, AlignmentResult } from '../../types';

export interface QualitySignalsInput {
  /** 状态变更提案 */
  stateDelta?: StateDelta;
  /** 当前集的连续性事实 */
  episodeFacts?: EpisodeFacts;
  /** 变更前的叙事状态 */
  narrativeStateBefore?: NarrativeState;
  /** 变更后的叙事状态（StateDelta 合并后） */
  narrativeStateAfter?: NarrativeState;
  /** Aligner 校验结果 */
  alignerResult?: AlignmentResult;
  /** 项目历史 facts 列表（用于检查复用和回应） */
  factsHistory?: EpisodeFactsRecord[];
  /** 当前集索引 */
  episodeIndex?: number;
}

/**
 * Signal 1: Conflict Progressed - 是否推进冲突层级
 *
 * 判定条件：
 * - StateDelta 中有冲突从 active → resolved
 * - 或 locked → active
 */
export function calculateConflictProgressed({
  stateDelta,
  narrativeStateBefore,
  narrativeStateAfter
}: QualitySignalsInput): boolean {
  if (!stateDelta || !narrativeStateBefore || !narrativeStateAfter) {
    return false;
  }

  const deltaConflicts = stateDelta.conflicts;
  if (!deltaConflicts) {
    return false;
  }

  let progressed = false;

  // 检查 immediate 冲突：active → resolved
  if (deltaConflicts.immediate?.status === 'resolved') {
    if (narrativeStateBefore.conflicts.immediate.status === 'active') {
      progressed = true;
    }
  }

  // 检查 mid_term 冲突：locked → active
  if (deltaConflicts.mid_term?.status === 'active') {
    if (narrativeStateBefore.conflicts.mid_term.status === 'locked') {
      progressed = true;
    }
  }

  // 检查 mid_term 冲突：active → resolved
  if (deltaConflicts.mid_term?.status === 'resolved') {
    if (narrativeStateBefore.conflicts.mid_term.status === 'active') {
      progressed = true;
    }
  }

  // 检查 end_game 冲突：locked → active
  if (deltaConflicts.end_game?.status === 'active') {
    if (narrativeStateBefore.conflicts.end_game.status === 'locked') {
      progressed = true;
    }
  }

  // 检查 end_game 冲突：active → resolved
  if (deltaConflicts.end_game?.status === 'resolved') {
    if (narrativeStateBefore.conflicts.end_game.status === 'active') {
      progressed = true;
    }
  }

  return progressed;
}

/**
 * Signal 2: Cost Paid - 角色是否为目标付出代价
 *
 * 判定条件（任一）：
 * - episodeFacts.injuries 非空
 * - character.status 发生负向变化（unresolved → injured/compromised）
 */
export function calculateCostPaid({
  episodeFacts,
  stateDelta,
  narrativeStateBefore,
  narrativeStateAfter
}: QualitySignalsInput): boolean {
  // 检查伤情
  if (episodeFacts && episodeFacts.injuries && episodeFacts.injuries.length > 0) {
    return true;
  }

  // 检查角色状态负向变化
  if (stateDelta && stateDelta.characters && narrativeStateBefore && narrativeStateAfter) {
    for (const [charName, charDelta] of Object.entries(stateDelta.characters)) {
      const before = narrativeStateBefore.characters[charName];
      const after = narrativeStateAfter.characters[charName];

      if (before && after && charDelta.status) {
        // unresolved → injured/compromised 视为代价
        if (before.status === 'unresolved' && (charDelta.status === 'injured' || charDelta.status === 'compromised')) {
          return true;
        }
        // injured → unresolved（恢复）不视为代价，但 compromised → unresolved 可能涉及其他牺牲
      }
    }
  }

  return false;
}

/**
 * Signal 3: Fact Reused - 是否使用了历史 facts
 *
 * 判定条件：
 * - 本集 facts 的 items/reveals 中引用了上 1-2 集的 items/reveals
 * - 通过关键词匹配检测引用
 */
export function calculateFactReused({
  episodeFacts,
  factsHistory,
  episodeIndex
}: QualitySignalsInput): boolean {
  if (!episodeFacts || !factsHistory || factsHistory.length === 0) {
    return false;
  }

  // EP1 通常没有历史，所以 EP1 默认为 false（除非有特殊场景）
  if (episodeIndex === 1) {
    return false;
  }

  // 获取最近 2 集的 facts
  const recentFacts = factsHistory
    .filter(r => r.episodeIndex >= episodeIndex! - 2 && r.episodeIndex < episodeIndex!)
    .map(r => r.facts);

  if (recentFacts.length === 0) {
    return false;
  }

  // 提取历史 items 和 reveals 的关键词
  const historicalItems = new Set<string>();
  const historicalReveals = new Set<string>();

  for (const facts of recentFacts) {
    // 提取物品关键词（去除"获得""使用"等动词，保留核心名词）
    for (const item of facts.items) {
      const keyword = item.replace(/^(获得|发现|使用|捡到|拾取|找到)/, '').trim();
      if (keyword) {
        historicalItems.add(keyword);
      }
    }

    // 提取揭示关键词（保留核心内容）
    for (const reveal of facts.reveals) {
      const keyword = reveal.replace(/^[^，。]+[，。]/, '').trim();
      if (keyword) {
        historicalReveals.add(keyword);
      }
    }
  }

  // 检查当前集是否引用了历史 items（关键词匹配）
  for (const currentItem of episodeFacts.items) {
    const currentItemKeyword = currentItem.replace(/^(获得|发现|使用|捡到|拾取|找到)/, '').trim();
    if (currentItemKeyword && historicalItems.has(currentItemKeyword)) {
      return true;
    }
  }

  // 检查当前集的 events 中是否提到历史 items/reveals（使用历史原文，不处理）
  const currentEventsText = episodeFacts.events.join(' ');
  const historicalItemsRaw: string[] = [];
  const historicalRevealsRaw: string[] = [];

  // 重新提取历史 items/reveals 的原文（不处理，用于匹配）
  for (const facts of recentFacts) {
    historicalItemsRaw.push(...facts.items);
    historicalRevealsRaw.push(...facts.reveals);
  }

  for (const historicalItem of historicalItemsRaw) {
    if (currentEventsText.includes(historicalItem)) {
      return true;
    }
  }
  for (const historicalReveal of historicalRevealsRaw) {
    if (currentEventsText.includes(historicalReveal)) {
      return true;
    }
  }

  return false;
}

/**
 * Signal 4: New Reveal - 是否引入了新的、不可逆的信息
 *
 * 判定条件：
 * - episodeFacts.reveals 非空
 */
export function calculateNewReveal({
  episodeFacts
}: QualitySignalsInput): boolean {
  if (!episodeFacts || !episodeFacts.reveals) {
    return false;
  }
  return episodeFacts.reveals.length > 0;
}

/**
 * Signal 5: Promise Addressed - 是否回应过往 promise
 *
 * 判定条件：
 * - 本集 events/items/reveals 中与历史 promises 有关联
 * - 通过关键词匹配检测回应
 */
export function calculatePromiseAddressed({
  episodeFacts,
  factsHistory,
  episodeIndex
}: QualitySignalsInput): boolean {
  if (!episodeFacts || !factsHistory || factsHistory.length === 0) {
    return false;
  }

  // EP1 没有历史 promises
  if (episodeIndex === 1) {
    return false;
  }

  // 收集历史的 promises（提取核心关键词）
  const historicalPromises: string[] = [];
  const recentFacts = factsHistory
    .filter(r => r.episodeIndex < episodeIndex!)
    .map(r => r.facts);

  for (const facts of recentFacts) {
    for (const promise of facts.promises) {
      // 提取核心关键词：去除常见前缀，并尝试分割为多个短语
      const keywords = extractKeywords(promise);
      for (const keyword of keywords) {
        if (keyword) {
          historicalPromises.push(keyword);
        }
      }
    }
  }

  if (historicalPromises.length === 0) {
    return false;
  }

  // 检查当前集的 events/items/reveals 中是否回应了这些 promise
  const currentContent = [
    ...episodeFacts.events,
    ...episodeFacts.items,
    ...episodeFacts.reveals
  ].join(' ');

  // 改进：部分匹配即可（只要包含关键词即可）
  for (const keyword of historicalPromises) {
    if (keyword && currentContent.includes(keyword)) {
      return true;
    }
  }

  return false;
}

/**
 * 辅助函数：从句子中提取关键词
 */
function extractKeywords(text: string): string[] {
  // 去除前缀
  let cleaned = text.replace(/^(发誓|承诺|立誓|保证|决心)/, '').trim();
  
  // 按照常见分隔符分割
  const keywords: string[] = [];
  
  // 尝试按标点分割
  const parts = cleaned.split(/[，。、；；]/);
  
  for (const part of parts) {
    const keyword = part.trim();
    if (keyword.length >= 2) {  // 关键词至少 2 个字
      keywords.push(keyword);
    }
  }
  
  // 如果没有分割出关键词，则使用整个字符串
  if (keywords.length === 0 && cleaned.length >= 2) {
    keywords.push(cleaned);
  }
  
  return keywords;
}

/**
 * Signal 6: State Coherent - 是否完全通过所有状态/事实校验
 *
 * 判定条件：
 * - Aligner 无 FAIL / HARD_WARN
 * - severity 为 "PASS" 或 "WARN"
 */
export function calculateStateCoherent({
  alignerResult
}: QualitySignalsInput): boolean {
  if (!alignerResult) {
    // 没有 Aligner 结果，默认为 false（保守策略）
    return false;
  }

  // severity 为 "FAIL" 则不通过
  if (alignerResult.severity === 'FAIL') {
    return false;
  }

  // severity 为 "PASS" 或 "WARN" 则通过
  return true;
}

/**
 * 计算所有质量信号
 *
 * @param input - 质量信号计算所需的输入数据
 * @returns QualitySignals - 6 个质量信号
 */
export function calculateQualitySignals(input: QualitySignalsInput): QualitySignals {
  return {
    conflictProgressed: calculateConflictProgressed(input),
    costPaid: calculateCostPaid(input),
    factReused: calculateFactReused(input),
    newReveal: calculateNewReveal(input),
    promiseAddressed: calculatePromiseAddressed(input),
    stateCoherent: calculateStateCoherent(input)
  };
}

