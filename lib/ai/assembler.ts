/**
 * Assembler - 内容拼装器（M16）
 *
 * 职责：
 * - 仅拼装正文，不生成
 * - 将 Slot 输出拼装为完整的 Episode 内容
 *
 * 原则：
 * - 禁止自动补段落
 * - 禁止自动润色
 * - 禁止自动兜底
 */

import { SlotWriteOutput } from './slotWriter';

/**
 * 拼装内容
 * 
 * @param slots - Slot 写入输出
 * @returns string - 拼装后的完整内容
 * 
 * 行为规则：
 * content = [
 *   slots.NEW_REVEAL,
 *   slots.CONFLICT_PROGRESS,
 *   slots.COST_PAID
 * ].join('\n\n');
 * 
 * 禁止：
 * - 自动补段落
 * - 自动润色
 * - 自动兜底
 */
export function assembleContent(slots: SlotWriteOutput): string {
  console.log(`[Assembler] Assembling content from ${Object.keys(slots).length} slots`);

  // 收集所有有效的 slot 内容
  const contentParts: string[] = [];

  // 按优先级顺序添加 slot 内容
  // NEW_REVEAL 优先，然后是 CONFLICT_PROGRESS，最后是 COST_PAID
  if (slots.NEW_REVEAL) {
    contentParts.push(slots.NEW_REVEAL);
    console.log(`[Assembler] Added NEW_REVEAL slot (${slots.NEW_REVEAL.length} chars)`);
  }

  if (slots.CONFLICT_PROGRESS) {
    contentParts.push(slots.CONFLICT_PROGRESS);
    console.log(`[Assembler] Added CONFLICT_PROGRESS slot (${slots.CONFLICT_PROGRESS.length} chars)`);
  }

  if (slots.COST_PAID) {
    contentParts.push(slots.COST_PAID);
    console.log(`[Assembler] Added COST_PAID slot (${slots.COST_PAID.length} chars)`);
  }

  // 如果没有内容，抛出异常
  if (contentParts.length === 0) {
    console.error(`[Assembler] No slots to assemble`);
    throw new Error('[Assembler] No slots provided for assembly');
  }

  // 拼装内容
  const content = contentParts.join('\n\n');
  console.log(`[Assembler] Assembled content (${content.length} chars total)`);

  return content;
}

/**
 * 格式化为短剧标准格式
 * 
 * @param content - 原始内容
 * @param episodeIndex - 剧集编号
 * @returns string - 格式化后的内容
 * 
 * 可选：添加集数标题
 */
export function formatAsEpisode(
  content: string,
  episodeIndex: number
): string {
  const header = `EP${String(episodeIndex).padStart(2, '0')}`;
  return `${header}\n\n${content}`;
}


