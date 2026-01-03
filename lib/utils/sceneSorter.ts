/**
 * 场景排序工具函数
 *
 * 用于在前端组件中按场景序号排序显示内容
 * 作为后端 assembler.ts 中场景解析和排序的补充保险
 */

/**
 * 解析内容中的场景标记并按序号重新排序
 *
 * @param content - 原始内容
 * @returns string - 按场景序号排序后的内容
 *
 * 支持的场景标记格式：
 * - 【场景 X】
 * - 【场 X】
 * - 场景 X
 */
export function sortContentBySceneIndex(content: string): string {
  if (!content) return content;

  // 综合正则，匹配任意一种场景标记格式
  const scenePattern = /(?:【场景\s*(\d+)】|【场\s*(\d+)】|场景\s*(\d+))/g;

  // 找到所有场景标记
  const scenes: Array<{ index: number; sceneIndex: number; fullText: string }> = [];

  let match;
  while ((match = scenePattern.exec(content)) !== null) {
    const sceneIndex = parseInt(match[1], 10);
    scenes.push({
      index: match.index,
      sceneIndex,
      fullText: match[0]
    });
  }

  // 如果没有找到场景标记，返回原始内容
  if (scenes.length === 0) {
    return content;
  }

  // 提取每个场景的完整内容
  const sceneContents: Array<{ sceneIndex: number; fullText: string }> = [];

  for (let i = 0; i < scenes.length; i++) {
    const currentScene = scenes[i];
    const nextScene = scenes[i + 1];

    const startIndex = currentScene.index;
    const endIndex = nextScene ? nextScene.index : content.length;

    const fullText = content.substring(startIndex, endIndex).trim();

    sceneContents.push({
      sceneIndex: currentScene.sceneIndex,
      fullText
    });
  }

  // 按场景序号排序
  sceneContents.sort((a, b) => a.sceneIndex - b.sceneIndex);

  // 重新生成格式化后的场景序号（从 1 开始连续）
  const sortedScenes = sceneContents.map((scene, i) => {
    const newSceneIndex = i + 1;
    let newHeader = scene.fullText.split('\n')[0];

    // 替换场景标记为新的序号
    if (newHeader.includes('【场景')) {
      newHeader = newHeader.replace(/【场景\s*\d+】/, `【场景 ${newSceneIndex}】`);
    } else if (newHeader.includes('【场')) {
      newHeader = newHeader.replace(/【场\s*\d+】/, `【场 ${newSceneIndex}】`);
    } else if (newHeader.includes('场景')) {
      newHeader = newHeader.replace(/场景\s*\d+/, `场景 ${newSceneIndex}`);
    }

    const newFullText = scene.fullText.replace(scene.fullText.split('\n')[0], newHeader);
    return newFullText;
  });

  return sortedScenes.join('\n\n');
}

/**
 * 格式化场景标题为固定格式：场{index}｜地点｜时
 *
 * @param sceneHeader - 原始场景标题（如：【场景 1】地点｜时间）
 * @returns string - 格式化后的标题（如：【场1｜地点｜时】）
 */
export function formatSceneHeader(sceneHeader: string): string {
  if (!sceneHeader) return sceneHeader;

  // 提取场景序号
  const match = sceneHeader.match(/【(?:场景|场)\s*(\d+)】/);
  if (!match) return sceneHeader;

  const sceneIndex = match[1];

  // 提取地点和时间
  const parts = sceneHeader.split('｜');
  if (parts.length >= 2) {
    const location = parts[1] || '';
    const time = parts[2] || parts[1] || '';

    // 格式化时间为单个字（昼、夜、黄昏、雨夜等）
    const timeShort = time.replace(/（|）/g, '').substring(0, 2);

    return `【场${sceneIndex}｜${location}｜${timeShort}】`;
  }

  // 如果无法解析，返回原始标题
  return sceneHeader;
}

/**
 * 检查内容是否包含场景标记
 *
 * @param content - 内容文本
 * @returns boolean - 是否包含场景标记
 */
export function hasSceneMarkers(content: string): boolean {
  if (!content) return false;

  return /【场景\s*\d+】|【场\s*\d+】|场景\s*\d+/.test(content);
}

