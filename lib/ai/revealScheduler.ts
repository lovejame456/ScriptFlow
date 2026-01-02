/**
 * Reveal Scheduler - Reveal 调度器（M16.3）
 *
 * 职责：
 * - 决定每集 Reveal 的类型分布与密度
 * - 实现类型轮换策略，避免连续重复
 * - 生成去重 key，防止同义重复
 *
 * 原则：
 * - EP2+ 必须有 Reveal
 * - 类型按预设策略轮换
 * - 禁止连续两集相同 type
 */

import { createHash } from 'crypto';

/**
 * New Reveal 类型枚举
 */
export type RevealType = 'FACT' | 'INFO' | 'RELATION' | 'IDENTITY';

/**
 * Reveal 调度策略
 */
export interface RevealPolicy {
  episode: number;
  required: boolean;
  type: RevealType;
  scope: 'PROTAGONIST' | 'ANTAGONIST' | 'WORLD';
  avoidTypes?: RevealType[];
  avoidSummaries?: string[];
}

/**
 * Reveal 历史记录
 */
export interface RevealHistory {
  episode: number;
  type: RevealType;
  scope: string;
  summary: string;
  noRepeatKey: string;
}

/**
 * 类型分布建议（默认策略）
 *
 * EP2/3: INFO 或 FACT（推进世界观与局势）
 * EP4/5: RELATION（引爆人际与站队）
 * EP6: IDENTITY（阶段性大爆点）
 */
const DEFAULT_TYPE_DISTRIBUTION: Record<number, RevealType[]> = {
  2: ['INFO', 'FACT', 'RELATION'],
  3: ['FACT', 'INFO', 'RELATION'],
  4: ['RELATION', 'IDENTITY', 'INFO'],
  5: ['IDENTITY', 'RELATION', 'FACT'],
  6: ['IDENTITY', 'FACT', 'INFO']
};

/**
 * 生成去重 key（基于 summary 的 hash）
 *
 * @param summary - Reveal summary
 * @returns string - 去重 key
 */
export function generateNoRepeatKey(summary: string): string {
  // 兼容性处理：使用 String.prototype.normalize 的简化版本
  const normalizedSummary = summary.trim();
  const hash = createHash('sha256')
    .update(normalizedSummary)
    .digest('hex')
    .substring(0, 16);
  return `reveal_${hash}`;
}

/**
 * 调度 Reveal 类型
 *
 * @param episode - 集数
 * @param recentTypes - 最近的类型列表（用于避免重复）
 * @param history - 完整的 Reveal 历史（用于避免同义重复）
 * @returns RevealType - 调度的类型
 */
export function scheduleRevealType(
  episode: number,
  recentTypes: RevealType[],
  history: RevealHistory[] = []
): RevealType {
  console.log(`[RevealScheduler] Scheduling reveal type for EP${episode}`);
  console.log(`[RevealScheduler] Recent types:`, recentTypes);

  // EP1 不需要调度（没有强制要求）
  if (episode === 1) {
    console.log(`[RevealScheduler] EP1: no scheduling needed`);
    return 'FACT';
  }

  // 获取该集的类型候选
  const candidates = DEFAULT_TYPE_DISTRIBUTION[episode] || ['FACT', 'INFO', 'RELATION', 'IDENTITY'];
  console.log(`[RevealScheduler] Candidates for EP${episode}:`, candidates);

  // 过滤掉最近出现的类型（禁止连续重复）
  const avoidTypes = recentTypes.slice(0, 2);
  const filteredCandidates = candidates.filter(type => !avoidTypes.includes(type));
  console.log(`[RevealScheduler] After filtering recent types:`, filteredCandidates);

  // 如果过滤后没有候选类型，使用原始候选
  const finalCandidates = filteredCandidates.length > 0 ? filteredCandidates : candidates;

  // 选择第一个候选（简单策略，可以后续扩展为更智能的选择）
  // 但确保不会与最近类型重复
  let selected = finalCandidates[0];
  if (avoidTypes.length > 0 && selected === avoidTypes[0]) {
    // 如果仍然重复，选择第二个候选或第一个非重复的候选
    selected = finalCandidates.find(t => !avoidTypes.includes(t)) || finalCandidates[1] || finalCandidates[0];
  }

  console.log(`[RevealScheduler] Selected type: ${selected}`);

  return selected;
}

/**
 * 检查 Reveal key 是否已存在
 *
 * @param history - Reveal 历史
 * @param key - 要检查的 key
 * @returns boolean - 是否已存在
 */
export function hasRevealKey(history: RevealHistory[], key: string): boolean {
  return history.some(entry => entry.noRepeatKey === key);
}

/**
 * 获取最近的 Reveal 类型
 *
 * @param history - Reveal 历史
 * @param n - 获取最近 n 个的类型
 * @returns RevealType[] - 最近的类型列表
 */
export function getRecentRevealTypes(history: RevealHistory[], n: number = 2): RevealType[] {
  return history
    .slice(-n)
    .map(entry => entry.type);
}

/**
 * 追加 Reveal 到历史记录
 *
 * @param history - 现有历史
 * @param entry - 新的 Reveal 记录
 * @returns RevealHistory[] - 更新后的历史
 */
export function appendRevealToHistory(
  history: RevealHistory[],
  entry: RevealHistory
): RevealHistory[] {
  const newHistory = [...history, entry];
  console.log(`[RevealScheduler] Appended reveal to history:`, {
    episode: entry.episode,
    type: entry.type,
    totalHistoryLength: newHistory.length
  });
  return newHistory;
}

/**
 * 生成完整的 Reveal Policy
 *
 * @param episode - 集数
 * @param history - Reveal 历史
 * @returns RevealPolicy - 调度策略
 */
export function generateRevealPolicy(
  episode: number,
  history: RevealHistory[] = []
): RevealPolicy {
  console.log(`[RevealScheduler] Generating reveal policy for EP${episode}`);

  const recentTypes = getRecentRevealTypes(history, 2);
  const type = scheduleRevealType(episode, recentTypes, history);

  const policy: RevealPolicy = {
    episode,
    required: episode >= 2,  // EP2+ 必须有 Reveal
    type,
    scope: 'PROTAGONIST',  // 默认 scope，可以后续扩展为智能选择
    avoidTypes: recentTypes
  };

  console.log(`[RevealScheduler] Generated policy:`, policy);
  return policy;
}

/**
 * 验证 Reveal summary 是否符合约束
 *
 * @param policy - 调度策略
 * @param summary - 要验证的 summary
 * @param history - Reveal 历史
 * @returns { valid: boolean, error?: string } - 验证结果
 */
export function validateRevealSummary(
  policy: RevealPolicy,
  summary: string,
  history: RevealHistory[] = []
): { valid: boolean; error?: string } {
  // 1. 检查是否被禁止的 summary（同义重复）
  if (policy.avoidSummaries && policy.avoidSummaries.length > 0) {
    for (const avoidSummary of policy.avoidSummaries) {
      if (summary.includes(avoidSummary)) {
        return {
          valid: false,
          error: `Reveal summary contains prohibited content: "${avoidSummary}"`
        };
      }
    }
  }

  // 2. 检查是否与历史重复（通过 key）
  const key = generateNoRepeatKey(summary);
  if (hasRevealKey(history, key)) {
    return {
      valid: false,
      error: `Reveal summary is duplicate of historical reveal (key: ${key})`
    };
  }

  return { valid: true };
}

