// M5-1: 番茄短剧平台规则
// 第一阶段使用占位符规则，后续完善具体数值

import { PlatformRules } from '../../types/platform';

export const rules: PlatformRules = {
  // 字段长度限制
  nameMaxLength: 30,
  loglineMaxLength: 80,
  outlinePerEpisodeMax: 150,

  // 必需文件
  requireEditorReport: true,
  requireBible: true,

  // 题材偏好
  allowedGenres: ['甜宠恋爱', '豪门复仇', '都市异能', '古装重生', '战神赘婿', '玄幻修仙'],
  preferredGenres: ['甜宠恋爱', '豪门复仇', '玄幻修仙'],

  // 集数限制（番茄建议 60-180 集）
  minEpisodes: 40,
  maxEpisodes: 200,
  recommendedEpisodeCount: [60, 180],

  // 导出配置
  exportStructure: {
    includeOverview: true,
    includeBible: true,
    includeOutline: true,
    includeEditorReport: true
  }
};




