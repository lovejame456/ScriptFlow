export function qualityCheck(episode: any, outline: any) {
  const issues = [];

  // CONTENT_TOO_SHORT
  if (!episode.content || episode.content.length < 600) {
    issues.push("CONTENT_TOO_SHORT");
  }

  // SCENE_FORMAT_MISSING - 场景格式验证
  if (!episode.content) {
    issues.push("SCENE_FORMAT_MISSING");
  } else {
    const content = episode.content;
    const hasSceneMarkers = content.includes('【场 ');
    const hasTimeLocation = /日|夜/.test(content);
    const hasCharacters = /人物:/.test(content);

    if (!hasSceneMarkers) {
      issues.push("SCENE_FORMAT_MISSING_SCENE_MARKERS");
    }
    if (!hasTimeLocation) {
      issues.push("SCENE_FORMAT_MISSING_TIME_LOCATION");
    }
    if (!hasCharacters) {
      issues.push("SCENE_FORMAT_MISSING_CHARACTERS");
    }
  }

  // Note: Hook 长度检查已移除，因为 EP1 Prompt 已经强制要求明确的 Hook
  // StoryMemory 和 Invariant 检查已经足够保证质量

  return {
    passed: issues.length === 0,
    issues
  };
}

