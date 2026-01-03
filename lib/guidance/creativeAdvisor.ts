import { projectRepo } from '../store/projectRepo';
import { Project, EpisodeAdvice, EpisodeStatus } from '../../types';

/**
 * 生成创作方向建议
 * 
 * @param projectId - 项目 ID
 * @param project - 项目对象
 * @returns EpisodeAdvice | null - 创作建议，如果不需要建议则返回 null
 */
export async function generateEpisodeAdvice(
  projectId: string,
  project: Project
): Promise<EpisodeAdvice | null> {
  console.log(`[CreativeAdvisor] Generating episode advice for project: ${projectId}`);

  // 1. 获取失败分析
  const failureAnalysis = await projectRepo.getFailureAnalysis(projectId);
  if (!failureAnalysis || failureAnalysis.degradedEpisodes === 0) {
    console.log(`[CreativeAdvisor] No failures found, no advice needed`);
    return null;
  }

  // 2. 计算降级密度
  const degradedDensity = failureAnalysis.degradedEpisodes / failureAnalysis.totalEpisodes;
  console.log(`[CreativeAdvisor] Degraded density: ${Math.round(degradedDensity * 100)}%`);

  // 3. 阈值判定
  const HIGH_DENSITY_THRESHOLD = 0.4;  // 40% 降级密度
  const MEDIUM_DENSITY_THRESHOLD = 0.25;  // 25% 降级密度

  if (degradedDensity < MEDIUM_DENSITY_THRESHOLD) {
    console.log(`[CreativeAdvisor] Degraded density too low (${Math.round(degradedDensity * 100)}%), no advice needed`);
    return null;  // 不需要建议
  }

  // 4. 根据题材和失败模式生成建议
  let recommendedEpisodes = project.totalEpisodes;
  let reason = '';
  let confidence: 'high' | 'medium' | 'low' = 'medium';

  // 基于题材的分析
  const genre = project.genre.toLowerCase();
  
  if (genre.includes('甜宠') || genre.includes('都市脑洞') || genre.includes('都市')) {
    if (degradedDensity > HIGH_DENSITY_THRESHOLD) {
      recommendedEpisodes = Math.min(project.totalEpisodes, 40);
      reason = `降级密度 ${Math.round(degradedDensity * 100)}% 较高，${project.genre} 题材建议精简至 40 集以保持紧凑节奏`;
      confidence = 'high';
    } else if (degradedDensity >= MEDIUM_DENSITY_THRESHOLD) {
      recommendedEpisodes = Math.min(project.totalEpisodes, 50);
      reason = `降级密度 ${Math.round(degradedDensity * 100)}% 偏高，${project.genre} 题材建议适当精简集数`;
      confidence = 'medium';
    }
  } else if (genre.includes('复仇') || genre.includes('重生') || genre.includes('修仙') || genre.includes('玄幻')) {
    if (degradedDensity > HIGH_DENSITY_THRESHOLD) {
      // 这类题材可以适当延长
      recommendedEpisodes = Math.max(project.totalEpisodes, 60);
      reason = `降级密度 ${Math.round(degradedDensity * 100)}% 较高，${project.genre} 题材建议适当延长至 60 集以充分展开冲突`;
      confidence = 'medium';
    } else if (degradedDensity >= MEDIUM_DENSITY_THRESHOLD) {
      recommendedEpisodes = project.totalEpisodes;  // 保持不变
      reason = `降级密度 ${Math.round(degradedDensity * 100)}% 偏高，但${project.genre} 题材可保持当前集数，建议优化大纲结构`;
      confidence = 'medium';
    }
  } else {
    // 通用建议
    if (degradedDensity > HIGH_DENSITY_THRESHOLD) {
      recommendedEpisodes = Math.min(project.totalEpisodes, 50);
      reason = `降级密度 ${Math.round(degradedDensity * 100)}% 较高，建议精简集数至 ${recommendedEpisodes} 集以提升质量`;
      confidence = 'medium';
    } else if (degradedDensity >= MEDIUM_DENSITY_THRESHOLD) {
      reason = `降级密度 ${Math.round(degradedDensity * 100)}% 偏高，建议检查大纲冲突推进是否合理`;
      confidence = 'low';
    }
  }

  // 如果没有显著建议，返回 null
  if (recommendedEpisodes === project.totalEpisodes && reason === '') {
    console.log(`[CreativeAdvisor] No significant advice generated`);
    return null;
  }

  const advice: EpisodeAdvice = {
    projectId,
    currentTotalEpisodes: project.totalEpisodes,
    recommendedEpisodes,
    reason,
    confidence,
    degradedDensity,
    timestamp: new Date().toISOString()
  };

  console.log(`[CreativeAdvisor] Advice generated:`, advice);

  return advice;
}

/**
 * 检查是否需要生成建议（基于实时降级密度）
 * 
 * @param projectId - 项目 ID
 * @returns Promise<boolean> - 是否需要生成建议
 */
export async function shouldGenerateAdviceRealtime(projectId: string): Promise<boolean> {
  const project = await projectRepo.get(projectId);
  if (!project) return false;

  // 计算最近 10 集的降级密度
  const recentEpisodes = project.episodes.slice(-10);
  if (recentEpisodes.length === 0) return false;

  const degradedCount = recentEpisodes.filter(
    ep => ep.status === 'DEGRADED'
  ).length;
  const recentDensity = degradedCount / recentEpisodes.length;

  // 如果持续偏高（>30%），生成建议
  const REALTIME_THRESHOLD = 0.3;
  const shouldGenerate = recentDensity > REALTIME_THRESHOLD;

  console.log(`[CreativeAdvisor] Realtime check: degraded ${degradedCount}/${recentEpisodes.length} (${Math.round(recentDensity * 100)}%), need advice: ${shouldGenerate}`);

  return shouldGenerate;
}

