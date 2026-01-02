// M5-1: 快看平台校验器
// 实现软校验逻辑（集数警告、题材映射提示）

import { PlatformValidationResult } from '../../types/platform';
import { rules } from './rules';

/**
 * 快看平台校验函数
 */
export function validateForPlatform(project: any): PlatformValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 检查项目名长度
  if (project.name && project.name.length > rules.nameMaxLength) {
    errors.push(`项目名长度 ${project.name.length} 超过快看限制 ${rules.nameMaxLength} 字`);
  }

  // 检查卖点长度
  if (project.logline && project.logline.length > rules.loglineMaxLength) {
    warnings.push(`卖点长度 ${project.logline.length} 偏长，建议不超过 ${rules.loglineMaxLength} 字`);
  }

  // 检查集数范围
  if (rules.minEpisodes && project.totalEpisodes < rules.minEpisodes) {
    warnings.push(`集数 ${project.totalEpisodes} 低于快看建议最小值 ${rules.minEpisodes} 集`);
  }

  if (rules.maxEpisodes && project.totalEpisodes > rules.maxEpisodes) {
    warnings.push(`集数 ${project.totalEpisodes} 超过快看建议最大值 ${rules.maxEpisodes} 集`);
  }

  if (rules.recommendedEpisodeCount) {
    const [min, max] = rules.recommendedEpisodeCount;
    if (project.totalEpisodes < min || project.totalEpisodes > max) {
      warnings.push(`快看推荐集数范围 ${min}-${max} 集，当前 ${project.totalEpisodes} 集`);
    }
  }

  // 检查题材是否在允许列表中
  if (rules.allowedGenres.length > 0 && !rules.allowedGenres.includes(project.genre)) {
    warnings.push(`题材 "${project.genre}" 不在快看推荐列表中，建议使用：${rules.preferredGenres?.join('、')}`);
  }

  // 检查必需的字段
  if (!project.bible && rules.requireBible) {
    errors.push('缺少 Bible（世界观设定），这是快看平台必需的');
  }

  if (!project.episodes || project.episodes.length === 0) {
    errors.push('缺少剧集内容，无法导出');
  }

  // 检查每集大纲长度（如果有）
  if (project.episodes) {
    project.episodes.forEach((ep: any, index: number) => {
      if (ep.outline && ep.outline.summary) {
        if (ep.outline.summary.length > rules.outlinePerEpisodeMax) {
          warnings.push(`第 ${index + 1} 集大纲长度 ${ep.outline.summary.length} 超过建议 ${rules.outlinePerEpisodeMax} 字`);
        }
      }
    });
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings
  };
}




