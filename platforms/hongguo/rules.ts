// M5-1: 红果短剧平台规则
// 第一阶段使用占位符规则，后续完善具体数值

import { PlatformRules } from '../../types/platform';

export const rules: PlatformRules = {
  // 字段长度限制
  nameMaxLength: 20,
  loglineMaxLength: 60,
  outlinePerEpisodeMax: 120,

  // 必需文件
  requireEditorReport: true,
  requireBible: true,

  // 题材偏好
  allowedGenres: ['甜宠恋爱', '豪门复仇', '都市异能', '古装重生'],
  preferredGenres: ['甜宠恋爱', '豪门复仇'],

  // 集数限制（红果建议 80-120 集）
  minEpisodes: 40,
  maxEpisodes: 150,
  recommendedEpisodeCount: [80, 120],

  // 导出配置
  exportStructure: {
    includeOverview: true,
    includeBible: true,
    includeOutline: true,
    includeEditorReport: true
  }
};





