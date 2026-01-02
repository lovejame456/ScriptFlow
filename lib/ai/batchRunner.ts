import { generateEpisodeFast } from './episodeFlow';
import { batchRepo } from '../batch/batchRepo';
import { BatchState, BatchStatus, EpisodeStatus } from '../../types';
import { episodeRepo } from '../store/episodeRepo';
import { projectRepo } from '../store/projectRepo';
import { getPacingContext } from '../pacing/pacingEngine';
import { isStructureFailError } from './slotValidator';

export async function startBatch(args: {
  projectId: string;
  start: number;
  end: number;
}): Promise<BatchState> {
  const { projectId, start, end } = args;

  const batchState: BatchState = {
    projectId,
    status: 'RUNNING',
    startEpisode: start,
    endEpisode: end,
    currentEpisode: start,
    completed: [],
    failed: [],
    hardFailCount: 0,
    updatedAt: Date.now()
  };

  batchRepo.save(batchState);
  console.log(`[BatchRunner] Started batch for ${projectId}: EP${start}-${end}`);

  // Start the loop in background (don't await)
  runLoop(projectId).catch(err => {
    console.error('[BatchRunner] Loop error:', err);
  });

  return batchState;
}

export async function pauseBatch(projectId: string): Promise<BatchState> {
  const batch = batchRepo.get(projectId);
  if (!batch) {
    throw new Error('Batch not found');
  }

  if (batch.status !== 'RUNNING') {
    throw new Error(`Cannot pause batch with status ${batch.status}`);
  }

  batch.status = 'PAUSED';
  batchRepo.save(batch);
  console.log(`[BatchRunner] Paused batch for ${projectId}`);

  return batch;
}

export async function resumeBatch(projectId: string): Promise<BatchState> {
  const batch = batchRepo.get(projectId);
  if (!batch) {
    throw new Error('Batch not found');
  }

  if (batch.status === 'DONE' || batch.status === 'FAILED') {
    console.log(`[BatchRunner] Batch already ${batch.status}, cannot resume`);
    return batch;
  }

  if (batch.status !== 'PAUSED' && batch.status !== 'RUNNING') {
    throw new Error(`Cannot resume batch with status ${batch.status}`);
  }

  // Calculate resume point: from the last completed episode + 1
  const lastCompleted = batch.completed.length > 0 ? Math.max(...batch.completed) : batch.startEpisode - 1;
  const resumeFrom = Math.max(lastCompleted + 1, batch.currentEpisode);

  batch.currentEpisode = resumeFrom;
  batch.status = 'RUNNING';
  batchRepo.save(batch);

  console.log(`[BatchRunner] Resumed batch for ${projectId} from EP${resumeFrom}`);

  // Start the loop in background (don't await)
  runLoop(projectId).catch(err => {
    console.error('[BatchRunner] Loop error:', err);
  });

  return batch;
}

async function runLoop(projectId: string): Promise<void> {
  let batch = batchRepo.get(projectId);
  if (!batch) {
    console.error(`[BatchRunner] Batch not found for ${projectId}`);
    return;
  }

  console.log(`[BatchRunner] Starting loop for ${projectId}, current: EP${batch.currentEpisode}, end: EP${batch.endEpisode}`);

  while (true) {
    // Reload batch state on each iteration to check for PAUSED
    batch = batchRepo.get(projectId);
    if (!batch) {
      console.error(`[BatchRunner] Batch lost for ${projectId}`);
      return;
    }

    // Check if paused
    if (batch.status === 'PAUSED') {
      console.log(`[BatchRunner] Batch paused for ${projectId}`);
      return;
    }

    // Check if done
    if (batch.currentEpisode > batch.endEpisode) {
      // Check if this was just a phase end or true completion
      const project = await projectRepo.get(projectId);
      if (project && batch.endEpisode < project.totalEpisodes) {
        batch.status = 'PAUSED';
        console.log(`[BatchRunner] Batch paused at phase end (EP${batch.endEpisode}) for ${projectId}`);
      } else {
        batch.status = 'DONE';
        console.log(`[BatchRunner] Batch completed for ${projectId}`);
      }

      batchRepo.save(batch);
      return;
    }

    // Check if still running
    if (batch.status !== 'RUNNING') {
      console.log(`[BatchRunner] Batch status changed to ${batch.status}, stopping loop`);
      return;
    }

    const episodeIndex = batch.currentEpisode;
    const project = await projectRepo.get(projectId);
    const episode = project.episodes[episodeIndex - 1];

    // 跳过人工接管集
    if (episode.status === EpisodeStatus.MANUAL_OVERRIDE) {
      console.log(`[BatchRunner] Skipping EP${episodeIndex} (MANUAL_OVERRIDE)`);
      batch.currentEpisode += 1;
      batchRepo.save(batch);
      continue;
    }

    console.log(`[BatchRunner] Processing ${projectId} EP${episodeIndex}`);

    try {
      // 使用 generateEpisodeFast，立即返回 DRAFT（包含后台增强任务）
      const result = await generateEpisodeFast({ projectId, episodeIndex });

      // === P0 新规则：DRAFT 状态不阻塞 Batch ===
      //
      // generateEpisodeFast 返回的是 DRAFT 状态，但这是正常的：
      // 1. DRAFT: 剧本已生成，用户可以立即阅读（可见性优先）
      // 2. 后台增强任务会异步执行 Aligner，完成后自动升级为 COMPLETED
      // 3. Batch 不等待 COMPLETED，继续推进下一集
      //
      // 这确保了用户不需要等待 Aligner（30-80s），大大缩短等待时间。
      if (result.status !== EpisodeStatus.COMPLETED) {
        console.log(`[BatchRunner] EP${episodeIndex} 进入 DRAFT，Batch 继续推进`);

        // P0 断言：确保 DRAFT 状态有 humanSummary
        const episode = project.episodes[episodeIndex - 1];
        if (!episode.humanSummary) {
          console.warn(`[BatchRunner] WARNING: EP${episodeIndex} is DRAFT but missing humanSummary`);
          await episodeRepo.save(projectId, episodeIndex, {
            humanSummary: '剧本已生成，可立即阅读'
          });
        }

        // ✅ 新规则：DRAFT 不再视为失败，Batch 直接继续
        batch.currentEpisode += 1;
        batchRepo.save(batch);
        continue;
      }

      // P0 断言：只有真正通过校验的剧集才能计入进度
      const episode = project.episodes[episodeIndex - 1];
      if (episode.status !== EpisodeStatus.COMPLETED) {
        throw new Error(`[BatchRunner] CRITICAL: Attempted to mark EP${episodeIndex} as completed, but status is ${episode.status}`);
      }

      // Success: mark completed, reset hardFailCount, move to next
      batch.completed.push(episodeIndex);
      // Remove duplicates
      batch.completed = [...new Set(batch.completed)];
      batch.hardFailCount = 0;
      batch.currentEpisode += 1;
      batch.lastError = undefined;

      // 计算并保存 KEY 集标记
      await episodeRepo.save(projectId, episodeIndex, await calculateImportance(projectId, episodeIndex));

      // 计算健康状态
      batch.health = calculateHealth(batch);

      batchRepo.save(batch);
      console.log(`[BatchRunner] EP${episodeIndex} completed successfully`);

    } catch (err: any) {
      // === M16: 结构失败处理（零容忍） ===
      const isStructureFail = isStructureFailError(err);
      
      if (isStructureFail) {
        console.error(`[BatchRunner] EP${episodeIndex} structure failed (M16):`, err);
        
        // 标记为 FAILED
        batch.failed.push(episodeIndex);
        batch.failed = [...new Set(batch.failed)];
        batch.hardFailCount += 1;
        batch.lastError = err.message || String(err);
        
        // 将失败集的状态标记为 FAILED
        await episodeRepo.save(projectId, episodeIndex, {
          status: EpisodeStatus.FAILED,
          humanSummary: `结构校验失败（M16）：${err.message || String(err)}。这是硬约束，必须修复后重试。`
        });
        
        // 计算健康状态
        batch.health = calculateHealth(batch);
        
        // M16 铁律：结构失败直接终止 Batch（不跳过继续）
        batch.status = 'PAUSED';
        batchRepo.save(batch);
        
        console.log(`[BatchRunner] Batch paused due to structure failure (M16) for EP${episodeIndex}`);
        return;
      }
      
      // === 状态驱动：系统级错误标记为 FAILED ===
      //
      // FAILED 仅用于系统级错误（网络故障、API 超时、未知异常等），
      // 内容质量问题应该在 generateOneEpisode 内部处理为 DRAFT。
      //
      // 注意：FAILED 不会被计入 batch.completed，因此不会错误推进进度。
      batch.failed.push(episodeIndex);
      // Remove duplicates
      batch.failed = [...new Set(batch.failed)];
      batch.hardFailCount += 1;
      batch.lastError = err.message || String(err);

      // 将失败集的状态标记为 FAILED（系统级错误）
      await episodeRepo.save(projectId, episodeIndex, {
        status: EpisodeStatus.FAILED,
        humanSummary: `系统级错误：${err.message || String(err)}，需要检查日志后重试`
      });
      console.error(`[BatchRunner] Marked EP${episodeIndex} as FAILED (system error)`);

      // 计算健康状态
      batch.health = calculateHealth(batch);

      batchRepo.save(batch);

      console.error(`[BatchRunner] EP${episodeIndex} hard failed: ${batch.lastError}`);

      // === EP1 强阻塞逻辑（仅限系统级错误） ===
      if (episodeIndex === 1) {
        // 检查是否为真正的系统级错误（网络故障、API 超时、未知异常等）
        // 内容质量问题已经在 generateOneEpisode 内部处理为 DRAFT，不会到达这里
        const failReason = err.message || String(err);
        const isSystemError =
          failReason.includes('network') ||
          failReason.includes('timeout') ||
          failReason.includes('API') ||
          failReason.includes('connection') ||
          failReason.includes('undefined') ||
          failReason.includes('null');

        if (isSystemError) {
          // 只有真正的系统级错误才触发 PAUSED
          batch.status = 'PAUSED';
          batchRepo.save(batch);

          const summary = `第 1 集生成失败（系统级错误）：${failReason}。第 1 集为强依赖节点，请检查网络或重试后再继续。`;

          await episodeRepo.save(projectId, episodeIndex, {
            humanSummary: summary
          });

          console.log(`[BatchRunner] EP1 system error detected, batch paused: ${summary}`);
          return;
        } else {
          // 内容质量问题不阻塞，继续推进
          console.log(`[BatchRunner] EP1 content quality issue (not blocking): ${failReason}`);
          batch.currentEpisode += 1;
          batchRepo.save(batch);
          console.log(`[BatchRunner] Skipping EP1 quality issue, continuing to EP${batch.currentEpisode}`);
        }
      }

      // Check hardFailCount threshold（仅适用于 EP2+）
      if (batch.hardFailCount >= 2) {
        batch.status = 'PAUSED';
        batchRepo.save(batch);
        console.log(`[BatchRunner] Batch paused due to ${batch.hardFailCount} consecutive failures`);
        return;
      } else {
        // Allow skipping failed episode and continue
        batch.currentEpisode += 1;
        batchRepo.save(batch);
        console.log(`[BatchRunner] Skipping failed EP${episodeIndex}, continuing to EP${batch.currentEpisode}`);
      }
    }

    // Small delay to allow UI updates
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

export async function runBatch(args: {
  projectId: string;
  start: number;
  end: number;
  concurrency?: number;
}) {
  // Legacy API compatibility: redirect to startBatch
  console.warn('[BatchRunner] runBatch is deprecated, use startBatch instead');
  return startBatch(args);
}

async function calculateImportance(projectId: string, episodeIndex: number) {
  const project = await projectRepo.get(projectId);
  const pacingContext = getPacingContext(project, episodeIndex);

  let importance: "KEY" | "NORMAL" = "NORMAL";
  let importanceReason: string | undefined;

  // 固定关键节点
  if ([1, 5, 10].includes(episodeIndex)) {
    importance = "KEY";
    importanceReason = "红果留存关键节点";
  }

  // 关系质变节点
  if (pacingContext.kpi.progressType === "RELATION_SHIFT") {
    importance = "KEY";
    importanceReason = "关系质变节点";
  }

  return { importance, importanceReason };
}

function calculateHealth(batch: BatchState): "HEALTHY" | "WARNING" | "RISKY" {
  if (batch.hardFailCount >= 1) {
    return "RISKY";
  }

  // 有失败记录就是 WARNING
  if (batch.failed.length >= 3) {
    return "WARNING";
  }

  return "HEALTHY";
}


