// M4-3: 生产级导出模块
// 定义导出包的数据结构

export interface ExportPackage {
  overview: string;          // Markdown - 项目投稿说明
  bible: string;             // Markdown - 世界观 & 角色表
  outline: string;           // Markdown - 全集大纲
  episodes: {                // 每集 Markdown
    episodeIndex: number;
    content: string;
  }[];
  editorReport: string;      // Markdown - 编辑审稿报告
}

export interface ExportMetadata {
  projectName: string;
  projectId: string;
  exportTime: string;
  totalEpisodes: number;
  completedEpisodes: number;
  platformId: string; // M5-1: 导出的平台 ID
  platformName: string; // M5-1: 导出的平台名称
}

