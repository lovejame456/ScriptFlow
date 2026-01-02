import { Project, PACING_TEMPLATES } from '../../types';

export function buildOverview(project: Project): string {
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

*本文档由 ScriptFlow 生成，用于短剧投稿说明。*
`;

  return md;
}




