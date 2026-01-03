/**
 * Assembler - 内容拼装器（M16）
 *
 * 职责：
 * - 仅拼装正文，不生成
 * - 将 Slot 输出拼装为完整的 Episode 内容
 * - 解析并确保场景顺序正确（场景序号从1递增）
 *
 * 原则：
 * - 禁止自动补段落
 * - 禁止自动润色
 * - 禁止自动兜底
 */

import { SlotWriteOutput } from './slotWriter';
import { OutputMode } from '../../types';

/**
 * 解析后的场景结构
 */
interface ParsedScene {
  sceneIndex: number;
  header: string; // 【场景 X】地点｜时间
  content: string; // 场景正文（包括人物、动作、对白等）
  fullText: string; // 完整场景文本（header + content）
}

/**
 * 解析内容中的场景标记
 *
 * @param content - 原始内容
 * @returns ParsedScene[] - 解析后的场景数组
 *
 * 支持的场景标记格式：
 * - 【场景 X】
 * - 【场 X】
 * - 场景 X
 */
export function parseScenes(content: string): ParsedScene[] {
  const scenes: ParsedScene[] = [];

  // 综合正则，匹配任意一种场景标记格式
  const scenePattern = /(?:【场景\s*(\d+)】|【场\s*(\d+)】|场景\s*(\d+))/g;

  // 查找所有场景标记
  const markers: Array<{ index: number; sceneIndex: number; text: string }> = [];

  let match;
  while ((match = scenePattern.exec(content)) !== null) {
    // 捕获组 1 包含场景序号（无论哪种格式）
    const sceneIndex = parseInt(match[1], 10);

    markers.push({
      index: match.index,
      sceneIndex,
      text: match[0]
    });
  }

  // 如果没有找到场景标记，返回单个场景
  if (markers.length === 0) {
    return [{
      sceneIndex: 1,
      header: '【场景 1】',
      content: content.trim(),
      fullText: `【场景 1】\n${content.trim()}`
    }];
  }

  // 提取每个场景的内容
  for (let i = 0; i < markers.length; i++) {
    const currentMarker = markers[i];
    const nextMarker = markers[i + 1];

    const startIndex = currentMarker.index;
    const endIndex = nextMarker ? nextMarker.index : content.length;

    const fullText = content.substring(startIndex, endIndex).trim();
    const headerEnd = fullText.indexOf('\n');
    const header = headerEnd > 0 ? fullText.substring(0, headerEnd) : fullText.split('\n')[0];
    const sceneContent = headerEnd > 0 ? fullText.substring(headerEnd + 1).trim() : '';

    scenes.push({
      sceneIndex: currentMarker.sceneIndex,
      header: header.trim(),
      content: sceneContent,
      fullText
    });
  }

  return scenes;
}

/**
 * 验证并修复场景序号
 *
 * @param scenes - 解析后的场景数组
 * @returns { scenes: ParsedScene[], warnings: string[] } - 修复后的场景数组和警告信息
 */
export function validateAndFixSceneOrder(scenes: ParsedScene[]): { scenes: ParsedScene[]; warnings: string[] } {
  const warnings: string[] = [];
  const sceneIndices = scenes.map(s => s.sceneIndex);

  // 检查是否缺少场景序号
  const uniqueIndices = Array.from(new Set(sceneIndices)).sort((a, b) => a - b);
  const expectedIndices = Array.from({ length: uniqueIndices.length }, (_, i) => i + 1);

  const missingIndices = expectedIndices.filter(i => !uniqueIndices.includes(i));
  const duplicateIndices = sceneIndices.filter((index, i, arr) => arr.indexOf(index) !== i);

  // 检查序号是否不连续
  let isNotContinuous = false;
  for (let i = 0; i < uniqueIndices.length - 1; i++) {
    if (uniqueIndices[i + 1] - uniqueIndices[i] !== 1) {
      isNotContinuous = true;
      break;
    }
  }

  // 检查序号是否混乱（不按顺序）
  const isOutOfOrder = sceneIndices.some((index, i) => i > 0 && index < sceneIndices[i - 1]);

  // 记录警告
  if (missingIndices.length > 0) {
    warnings.push(`缺失场景序号: ${missingIndices.join(', ')}`);
  }
  if (duplicateIndices.length > 0) {
    warnings.push(`重复场景序号: ${Array.from(new Set(duplicateIndices)).join(', ')}`);
  }
  if (isNotContinuous) {
    warnings.push(`场景序号不连续: ${uniqueIndices.join(', ')}`);
  }
  if (isOutOfOrder) {
    warnings.push(`场景顺序混乱: ${sceneIndices.join(', ')}`);
  }

  // 如果有问题，自动重排为 1..N
  if (missingIndices.length > 0 || duplicateIndices.length > 0 || isNotContinuous || isOutOfOrder) {
    console.warn(`[Assembler] Scene order issues detected, auto-reordering:`, warnings.join('; '));

    // 创建重排后的场景
    const reorderedScenes = scenes.map((scene, i) => ({
      ...scene,
      sceneIndex: i + 1,
      header: scene.header.replace(/【场景\s*\d+】/, `【场景 ${i + 1}】`).replace(/【场\s*\d+】/, `【场 ${i + 1}】`),
      fullText: scene.fullText.replace(/【场景\s*\d+】/, `【场景 ${i + 1}】`).replace(/【场\s*\d+】/, `【场 ${i + 1}】`)
    }));

    return {
      scenes: reorderedScenes,
      warnings
    };
  }

  return {
    scenes,
    warnings: []
  };
}

/**
 * 拼装场景为最终内容
 *
 * @param scenes - 解析后的场景数组
 * @param outputMode - 输出模式
 * @param warnings - 警告信息
 * @returns string - 拼装后的内容
 */
function assembleScenes(
  scenes: ParsedScene[],
  outputMode: OutputMode,
  warnings: string[]
): string {
  // 按场景序号排序
  const sortedScenes = [...scenes].sort((a, b) => a.sceneIndex - b.sceneIndex);

  // 拼装场景
  const content = sortedScenes.map(scene => scene.fullText).join('\n\n');

  // 如果有警告，添加到内容开头
  if (warnings.length > 0) {
    const warningText = warnings.map(w => `[WARNING] ${w}`).join('\n');
    console.warn(`[Assembler] Scene order warnings:\n${warningText}`);
  }

  return content;
}

/**
 * 拼装内容
 *
 * @param slots - Slot 写入输出
 * @param outputMode - 输出模式（S2：NARRATIVE 或 COMMERCIAL_SCRIPT）
 * @param episodeIndex - 剧集编号
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
 *
 * S2: 支持 outputMode 切换输出格式
 * S2: COMMERCIAL_SCRIPT 模式下，确保场景顺序正确（从 1 递增）
 */
export function assembleContent(
  slots: SlotWriteOutput,
  outputMode: OutputMode = 'NARRATIVE',
  episodeIndex?: number
): string {
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

  // S2: COMMERCIAL_SCRIPT 模式下，解析并确保场景顺序正确
  let finalContent = content;
  if (outputMode === 'COMMERCIAL_SCRIPT') {
    // 解析场景
    const scenes = parseScenes(content);
    console.log(`[Assembler] Parsed ${scenes.length} scenes from COMMERCIAL_SCRIPT content`);

    // 验证并修复场景序号
    const { scenes: fixedScenes, warnings } = validateAndFixSceneOrder(scenes);

    // 拼装场景
    finalContent = assembleScenes(fixedScenes, outputMode, warnings);

    // 添加 EP 头部
    if (episodeIndex !== undefined) {
      const header = `【EP${episodeIndex}】`;
      finalContent = `${header}\n\n${finalContent}`;
      console.log(`[Assembler] Added header for COMMERCIAL_SCRIPT mode: ${header}`);
    }
  }

  return finalContent;
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


