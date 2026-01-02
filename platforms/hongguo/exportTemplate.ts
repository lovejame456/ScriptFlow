// M5-1: 红果短剧平台导出模板
// 定义红果专属的 Markdown 导出模板

import { ExportTemplateBuilder } from '../../types/platform';
import { Project, PACING_TEMPLATES } from '../../types';

/**
 * 生成红果编辑导语（根据题材动态生成）
 */
function generateEditorIntro(project: Project): string {
  const genre = project.genre;
  let highlightText = '';
  let sellingPoint = '';

  // 根据题材生成不同的编辑导语
  if (genre.includes('复仇') || genre.includes('重生') || genre.includes('赘婿')) {
    highlightText = '本剧主打【快速打脸】和【身份反转】，适合追求即时爽感的读者';
    sellingPoint = '每5集一次明确打脸，前10集完成身份质变';
  } else if (genre.includes('甜宠') || genre.includes('恋爱')) {
    highlightText = '本剧主打【情绪共鸣】和【关系升级】，适合追求情感满足的读者';
    sellingPoint = '前10集2次关系质变，情绪爽点密集';
  } else if (genre.includes('修仙') || genre.includes('玄幻')) {
    highlightText = '本剧主打【境界跃迁】和【实力成长】，适合追求升级感的读者';
    sellingPoint = 'Act2前完成第一次突破，实力阶梯式成长';
  } else {
    // 都市脑洞等
    highlightText = '本剧主打【新变量引入】和【能力代价】，适合追求脑洞的读者';
    sellingPoint = '每5集制造新变量，能力设定有代价';
  }

  return `## 编辑导语（红果适配）

本项目为【${project.genre}】方向，
核心卖点为【${project.logline}】。

${highlightText}

- 前 3 集：快速建立冲突与身份差
- 前 5 集：完成首次爽点兑现
- 前 10 集：完成第一次结构性质变

**红果核心优势**：${sellingPoint}

适合红果用户的快节奏、强反馈阅读习惯。`;
}

/**
 * 红果专用的项目概览模板
 */
export function buildOverviewForPlatform(project: Project): string {
  const template = PACING_TEMPLATES[project.pacingTemplateId] || { name: project.pacingTemplateId, acts: [] };

  // 构建 Act 概览
  const actsOverview = template.acts.map(act => {
    return `- Act ${act.act}（${act.range[0]}–${act.range[1]}）：${act.goal}`;
  }).join('\n');

  // M5-1.2: 添加编辑导语区
  const editorIntro = generateEditorIntro(project);

  const md = `# ${project.name}

${editorIntro}

---

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

*本文档由 ScriptFlow 生成，已适配【红果短剧】平台规范。*
`;

  return md;
}

/**
 * 获取红果重点集标记
 */
function getKeyEpisodeLabel(episodeId: number): string | null {
  const keyEpisodes: Record<number, string> = {
    1: '（入坑）',
    5: '（第一次爽点）',
    10: '（第一次质变）',
    20: '（阶段高潮）',
    30: '（阶段高潮）'
  };

  return keyEpisodes[episodeId] || null;
}

/**
 * 获取红果重点集说明
 */
function getKeyEpisodeNote(episodeId: number): string | null {
  const keyEpisodes: Record<number, string> = {
    1: '> 本集完成主角出场和初始身份/困境设定，是红果入坑关键点。',
    5: '> 本集完成首次明确爽点兑现，是红果留存关键点。',
    10: '> 本集完成主角第一次身份/实力/关系质变，是红果长线留存关键点。',
    20: '> 本集是阶段高潮，爽点密集，巩固用户黏性。',
    30: '> 本集是阶段高潮，爽点密集，巩固用户黏性。'
  };

  return keyEpisodes[episodeId] || null;
}

/**
 * 红果专用的大纲模板
 */
export function buildOutlineForPlatform(project: Project): string {
  const episodes = project.episodes.sort((a, b) => a.id - b.id);

  const episodeList = episodes.map(ep => {
    const epNumber = String(ep.id).padStart(2, '0');
    const keyLabel = getKeyEpisodeLabel(ep.id);
    const keyNote = getKeyEpisodeNote(ep.id);

    let episodeBlock = `## EP${epNumber}${keyLabel || ''}

- **剧情**：${ep.outline.summary}
- **冲突**：${ep.outline.conflict}
- **爽点**：${ep.outline.highlight}
- **Hook**：${ep.outline.hook}`;

    // 如果是重点集，添加红果说明
    if (keyNote) {
      episodeBlock += `

${keyNote}`;
    }

    return episodeBlock;
  }).join('\n\n');

  const md = `# 全集大纲

本大纲共 ${episodes.length} 集，适用于 ${project.name}。

${episodeList}

---

*本文档由 ScriptFlow 生成，已适配【红果短剧】平台规范。*
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

