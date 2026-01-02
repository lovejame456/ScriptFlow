// M5-1: 红果短剧平台校验器
// 实现软校验逻辑（集数警告、题材映射提示）

import { PlatformValidationResult } from '../../types/platform';
import { rules } from './rules';

/**
 * 红果平台校验函数
 */
export function validateForPlatform(project: any): PlatformValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 检查项目名长度
  if (project.name && project.name.length > rules.nameMaxLength) {
    errors.push(`项目名长度 ${project.name.length} 超过红果限制 ${rules.nameMaxLength} 字`);
  }

  // 检查卖点长度
  if (project.logline && project.logline.length > rules.loglineMaxLength) {
    warnings.push(`卖点长度 ${project.logline.length} 偏长，建议不超过 ${rules.loglineMaxLength} 字`);
  }

  // 检查集数范围
  if (rules.minEpisodes && project.totalEpisodes < rules.minEpisodes) {
    warnings.push(`集数 ${project.totalEpisodes} 低于红果建议最小值 ${rules.minEpisodes} 集`);
  }

  if (rules.maxEpisodes && project.totalEpisodes > rules.maxEpisodes) {
    warnings.push(`集数 ${project.totalEpisodes} 超过红果建议最大值 ${rules.maxEpisodes} 集`);
  }

  if (rules.recommendedEpisodeCount) {
    const [min, max] = rules.recommendedEpisodeCount;
    if (project.totalEpisodes < min || project.totalEpisodes > max) {
      warnings.push(`推荐 ${min}-${max} 集，当前 ${project.totalEpisodes} 集`);
    }
  }

  // 检查题材是否在允许列表中
  if (rules.allowedGenres.length > 0 && !rules.allowedGenres.includes(project.genre)) {
    warnings.push(`题材 "${project.genre}" 不在红果推荐列表中，建议使用：${rules.preferredGenres?.join('、')}`);
  }

  // 检查必需的字段
  if (!project.bible && rules.requireBible) {
    errors.push('缺少 Bible（世界观设定），这是红果平台必需的');
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

  // M5-1.2: 红果专属编辑级警告（只警告，不 FAIL）
  // 1. 检测前 3 集冲突
  const first3Episodes = project.episodes?.slice(0, 3) || [];
  const hasEarlyConflict = first3Episodes.some((ep: any) =>
    ep.outline && ep.outline.conflict && ep.outline.conflict.length > 0
  );
  if (!hasEarlyConflict) {
    warnings.push("HONGGUO_HOOK_TOO_SOFT: 前 3 集未建立明确冲突，建议在第 1-3 集加入身份差或对立面");
  }

  // 2. 检测前 5 集爽点
  const first5Episodes = project.episodes?.slice(0, 5) || [];
  const hasEarlyPayoff = first5Episodes.some((ep: any) =>
    ep.outline && ep.outline.highlight && ep.outline.highlight.length > 0
  );
  if (!hasEarlyPayoff) {
    warnings.push("HONGGUO_NO_EARLY_PAYOFF: 前 5 集未出现爽点兑现，建议在第 3-5 集安排首次打脸/收益/反转");
  }

  // 3. 检测前 10 集质变（针对复仇类题材）
  const isRevengeGenre = project.genre?.includes('复仇') || project.genre?.includes('重生') || project.genre?.includes('赘婿');
  if (isRevengeGenre) {
    const first10Episodes = project.episodes?.slice(0, 10) || [];
    const hasAct1Breakthrough = first10Episodes.some((ep: any) => {
      const hasIdentityChange = ep.outline?.conflict?.includes('身份') || ep.outline?.summary?.includes('身份');
      const hasPowerShift = ep.outline?.highlight?.includes('打脸') || ep.outline?.highlight?.includes('反转');
      return hasIdentityChange || hasPowerShift;
    });
    if (!hasAct1Breakthrough) {
      warnings.push("HONGGUO_ACT1_TOO_SLOW: 前 10 集未完成身份/实力质变，红果编辑偏好前 10 集出现明确转折点");
    }
  }

  // 4. 检测打脸密度（仅复仇类）
  if (isRevengeGenre) {
    let faceSlapCount = 0;
    project.episodes?.forEach((ep: any) => {
      if (ep.outline?.highlight?.includes('打脸') || ep.outline?.summary?.includes('打脸')) {
        faceSlapCount++;
      }
    });
    const expectedFaceSlapCount = Math.floor(project.totalEpisodes / 5);
    if (faceSlapCount < expectedFaceSlapCount) {
      warnings.push(`HONGGUO_FACE_SLAP_DENSITY_LOW: 打脸密度偏低（${faceSlapCount}/${project.totalEpisodes}集），建议每 5 集至少一次明确打脸`);
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings
  };
}

