// M5-1: 快看平台规则
// 第一阶段使用占位符规则，后续完善具体数值

import { PlatformRules } from '../../types/platform';

export const rules: PlatformRules = {
  // 字段长度限制
  nameMaxLength: 25,
  loglineMaxLength: 70,
  outlinePerEpisodeMax: 100,

  // 必需文件
  requireEditorReport: false,  // 快看可能不需要编辑报告
  requireBible: true,

  // 题材偏好（快看偏向年轻化、二次元风格）
  allowedGenres: ['甜宠恋爱', '豪门复仇', '都市脑洞', '悬疑惊悚'],
  preferredGenres: ['甜宠恋爱', '都市脑洞'],

  // 集数限制（快看建议 40-100 集）
  minEpisodes: 20,
  maxEpisodes: 120,
  recommendedEpisodeCount: [40, 100],

  // 导出配置
  exportStructure: {
    includeOverview: true,
    includeBible: true,
    includeOutline: true,
    includeEditorReport: false
  }
};





