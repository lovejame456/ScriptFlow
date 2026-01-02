// M5-1: 番茄短剧平台导出模板
// 定义番茄专属的 Markdown 导出模板

import { ExportTemplateBuilder } from '../../types/platform';
import { Project, PACING_TEMPLATES } from '../../types';

/**
 * 番茄专用的项目概览模板
 */
export function buildOverviewForPlatform(project: Project): string {
  const template = PACING_TEMPLATES[project.pacingTemplateId] || { name: project.pacingTemplateId, acts: [] };

  // 构建 Act 概览
  const actsOverview = template.acts.map(act => {
    return `- Act ${act.act}（${act.range[0]}–${act.range[1]}）：${act.goal}`;
  }).join('\n');

  const md = `# ${project.name}

## 基本信息

- **题材**：${project.genre}
- **目标受众**：${project.audience}
- **总集数**：${project.totalEpisodes} 集
- **节奏模板**：${template.name}

## 一句话卖点

${project.logline}

## 故事核心

本剧基于 ${project.genre} 题材，面向 ${project.audience} 受众，讲述 ${project.logline} 的故事。

## 节奏结构

${actsOverview}

---

*本文档由 ScriptFlow 生成，已适配【番茄短剧】平台规范。*
`;

  return md;
}

/**
 * 番茄专用的大纲模板
 */
export function buildOutlineForPlatform(project: Project): string {
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

*本文档由 ScriptFlow 生成，已适配【番茄短剧】平台规范。*
`;

  return md;
}

/**
 * 导出构建器
 */
export const exportTemplateBuilder: ExportTemplateBuilder = {
  buildOverview: buildOverviewForPlatform,
  buildOutline: buildOutlineForPlatform
};




