import { Project } from '../../types';

export function buildOutline(project: Project): string {
  const episodes = project.episodes.sort((a, b) => a.id - b.id);

  const episodeList = episodes.map(ep => {
    const epNumber = String(ep.id).padStart(2, '0');
    return `## EP${epNumber}

- **剧情**：${ep.outline.summary}
- **冲突**：${ep.outline.conflict}
- **爽点**：${ep.outline.highlight}
- **Hook**：${ep.outline.hook}`;
  }).join('\n\n');

  const md = `# 全集大纲

本大纲共 ${episodes.length} 集，适用于 ${project.name}。

${episodeList}

---

*本文档由 ScriptFlow 生成，包含每集剧情大纲与关键信息。*
`;

  return md;
}




