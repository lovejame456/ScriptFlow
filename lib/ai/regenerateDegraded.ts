/**
 * 降级集重新生成逻辑
 *
 * 针对状态为 DEGRADED 的剧集，提供"事后修复"能力。
 * 用户可以手动触发重新生成，系统会尝试以增强的 Reveal 约束重新生成该集。
 *
 * 与 retryEnhance 的区别：
 * - retryEnhance: 针对 DRAFT 状态，执行后台增强任务（Aligner/Rewrite）
 * - regenerateDegraded: 针对 DEGRADED 状态，直接重新生成（重跑 generateEpisodeFast）
 */

import { projectRepo } from '../store/projectRepo';
import { episodeRepo } from '../store/episodeRepo';
import { generateEpisodeFast } from './episodeFlow';
import { EpisodeStatus } from '../../types';

/**
 * 重新生成降级集
 *
 * @param projectId - 项目 ID
 * @param episodeIndex - 剧集编号
 * @returns 重新生成的剧集数据
 * @throws Error 如果剧集状态不是 DEGRADED
 */
export async function regenerateDegradedEpisode({
  projectId,
  episodeIndex
}: {
  projectId: string;
  episodeIndex: number;
}) {
  // 1. 验证剧集状态
  const project = await projectRepo.get(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  const episode = project.episodes.find(e => e.id === episodeIndex);
  if (!episode) {
    throw new Error(`Episode ${episodeIndex} not found`);
  }

  // 验证状态必须是 DEGRADED
  if (episode.status !== EpisodeStatus.DEGRADED) {
    throw new Error(
      `Cannot regenerate episode with status ${episode.status}. Only DEGRADED episodes can be regenerated.`
    );
  }

  console.log(`[RegenerateDegraded] Starting regeneration for EP${episodeIndex}`);
  console.log(`[RegenerateDegraded] Current status: ${episode.status}`);
  console.log(`[RegenerateDegraded] Original humanSummary: ${episode.humanSummary}`);

  // 2. 更新状态为 GENERATING
  await episodeRepo.save(projectId, episodeIndex, {
    status: EpisodeStatus.GENERATING,
    humanSummary: '正在重新生成（增强 Reveal 约束）…'
  });

  // 3. 调用 generateEpisodeFast 重新生成
  // 注意：这里会重新运行完整的 Structure-First 流程
  // 不修改 Batch 状态，不影响正在进行的批量生成
  let result;
  try {
    result = await generateEpisodeFast({
      projectId,
      episodeIndex
    });

    console.log(`[RegenerateDegraded] EP${episodeIndex} regenerated with status: ${result.status}`);
  } catch (error: any) {
    console.error(`[RegenerateDegraded] EP${episodeIndex} regeneration failed:`, error);

    // 重新生成失败，更新状态为 FAILED
    const errorSummary = `重新生成失败：${error.message || String(error)}`;
    await episodeRepo.save(projectId, episodeIndex, {
      status: EpisodeStatus.FAILED,
      humanSummary: errorSummary
    });

    throw new Error(errorSummary);
  }

  // 4. 返回结果
  console.log(`[RegenerateDegraded] EP${episodeIndex} regeneration completed`);
  return result;
}

