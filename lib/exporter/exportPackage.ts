import JSZip from 'jszip';
import { projectRepo } from '../store/projectRepo';
import { buildEpisodes } from './buildEpisodes';
import { buildEditorReport } from './buildEditorReport';
import { buildOverviewForPlatform, buildOutlineForPlatform, buildBibleForPlatform } from './buildForPlatform';
import { ExportPackage, ExportMetadata } from '../../types/export';
import { PlatformId, PLATFORM_NAMES } from '../../types/platform';
import { getPlatform } from '../../platforms';

/**
 * 导出投稿包（ZIP 格式）
 * @param projectId 项目 ID
 * @param platformId 平台 ID（可选，默认 'generic'）
 * @returns ZIP Blob
 */
export async function exportPackage(projectId: string, platformId?: PlatformId): Promise<Blob> {
  // 1. 获取项目数据
  const project = await projectRepo.get(projectId);
  if (!project) {
    throw new Error(`项目 ${projectId} 不存在`);
  }

  // 2. 确定平台 ID（优先使用传入参数，其次使用项目设置，最后默认 'generic'）
  const finalPlatformId: PlatformId = platformId || project.platformId || 'generic';

  // 3. 获取平台配置
  const platform = getPlatform(finalPlatformId);
  if (!platform) {
    console.warn(`Platform ${finalPlatformId} not found, using generic`);
  }

  const platformName = platform?.metadata.name || PLATFORM_NAMES[finalPlatformId] || '通用';

  // 4. 构建 ExportPackage（使用平台特定的模板）
  const exportData: ExportPackage = {
    overview: buildOverviewForPlatform(project, finalPlatformId),
    bible: buildBibleForPlatform(project, finalPlatformId),
    outline: buildOutlineForPlatform(project, finalPlatformId),
    episodes: buildEpisodes(project),
    editorReport: buildEditorReport(projectId, project)
  };

  // 5. 生成元数据
  const metadata: ExportMetadata = {
    projectName: project.name,
    projectId: project.id,
    exportTime: new Date().toLocaleString('zh-CN'),
    totalEpisodes: project.totalEpisodes,
    completedEpisodes: exportData.episodes.length,
    platformId: finalPlatformId,
    platformName
  };

  // 6. 创建 ZIP 包
  const zip = new JSZip();

  // 6.1 添加主目录文件
  zip.file('00_Overview.md', exportData.overview);
  zip.file('01_Bible.md', exportData.bible);
  zip.file('02_Outline.md', exportData.outline);
  zip.file('04_Editor_Report.md', exportData.editorReport);

  // 6.2 添加角色小传（如果有）
  if (project.charactersProfileMarkdown) {
    zip.file('02_Character_Profiles.md', project.charactersProfileMarkdown);
    console.log('[exportPackage] Added character profiles to export');
  }

  // 6.3 添加剧情总纲（如果有）
  if (project.synopsis) {
    zip.file('01_Story_Overview.md', project.synopsis);
    console.log('[exportPackage] Added story overview to export');
  }

  // 6.4 添加 Episodes 目录
  const episodesFolder = zip.folder('03_Episodes');
  if (!episodesFolder) {
    throw new Error('创建 Episodes 目录失败');
  }

  exportData.episodes.forEach(ep => {
    const fileName = `EP${String(ep.episodeIndex).padStart(2, '0')}.md`;
    episodesFolder.file(fileName, ep.content);
  });

  // 6.5 添加 README.md
  const readmeContent = generateReadme(metadata);
  zip.file('README.md', readmeContent);

  // 7. 生成 ZIP Blob
  const content = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  return content;
}

/**
 * 生成 README.md 内容
 */
function generateReadme(metadata: ExportMetadata): string {
  return `# ${metadata.projectName} - 投稿包

## 包信息

- **项目名称**：${metadata.projectName}
- **项目 ID**：${metadata.projectId}
- **导出时间**：${metadata.exportTime}
- **总集数**：${metadata.totalEpisodes}
- **已完成集数**：${metadata.completedEpisodes}
- **适配平台**：${metadata.platformName}
- **生成工具**：ScriptFlow v3.0

## 包结构

\`\`\`
Submission_Package/
├── 00_Overview.md              # 项目投稿说明
├── 01_Story_Overview.md         # 剧情总纲（投稿用，800-1500字）
├── 01_Bible.md                 # 世界观 & 角色表
├── 02_Character_Profiles.md     # 角色小传（商业级）
├── 02_Outline.md               # 全集大纲
├── 03_Episodes/                # 分集剧本
│   ├── EP01.md
│   ├── EP02.md
│   └── ...
├── 04_Editor_Report.md         # 编辑审稿报告
└── README.md                   # 本文件
\`\`\`

## 使用说明

本投稿包由 AI 辅助生成，已通过编辑审稿流程。

### 投稿建议

1. **检查剧情总纲**：先阅读 \`01_Story_Overview.md\` 了解整体故事结构和核心卖点
2. **审阅角色小传**：\`02_Character_Profiles.md\` 包含商业级角色设定，可直接给导演/演员
3. **检查剧本**：请先浏览 \`02_Outline.md\` 了解整体结构，再查看 \`03_Episodes/\` 中的具体剧本
4. **审阅报告**：\`04_Editor_Report.md\` 包含了 AI 编辑的审稿记录，可以帮助了解剧本质量
5. **世界观校对**：\`01_Bible.md\` 包含世界观和角色设定，请确保与剧本一致

### 版权声明

本投稿包内容由 ScriptFlow 系统生成，用户拥有最终内容的知识产权。

---

**ScriptFlow** - 专业短剧内容生产系统 v3.0
`;
}
