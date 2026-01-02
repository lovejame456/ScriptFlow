import { projectRepo } from '../store/projectRepo';
import { storyMemoryRepo } from '../store/memoryRepo';
import { batchRepo } from '../batch/batchRepo';
import { taskRepo } from './taskRepo';
import { GenerationTask, GenerationTaskStatus, GenerationStep, PACING_TEMPLATES, EnhanceEpisodeTask, EnhanceEpisodeTaskStatus, EnrichBibleTask, EnrichBibleTaskStatus, EnrichOutlineTask, EnrichOutlineTaskStatus } from '../../types';
import { createProjectSeed, buildBible, generateOutline, rewriteDraftEpisode, buildBibleSkeleton, buildOutlineSkeleton, enrichBible, enrichOutline } from '../ai/episodeFlow';
import { buildNarrativeStateFromSkeleton } from '../ai/narrativeState';
import { startBatch, pauseBatch, resumeBatch } from '../ai/batchRunner';
import { episodeRepo } from '../store/episodeRepo';
import { EpisodeStatus } from '../../types';

export async function startTask(projectId: string): Promise<GenerationTask> {
  const existingTask = taskRepo.get(projectId);
  if (existingTask && existingTask.status === 'RUNNING') {
    throw new Error('Task is already running');
  }

  const project = await projectRepo.get(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  // Create or update task
  const task: GenerationTask = existingTask || {
    taskId: `task_${projectId}_${Date.now()}`,
    projectId,
    status: 'IDLE',
    step: 'SEED',
    totalEpisodes: project.totalEpisodes,
    updatedAt: Date.now()
  };

  // Start the execution in background
  executeTask(task).catch(err => {
    console.error('[TaskRunner] Execution error:', err);
  });

  // Return initial RUNNING state
  task.status = 'RUNNING';
  taskRepo.save(task);
  return task;
}

export async function pauseTask(projectId: string): Promise<GenerationTask> {
  const task = taskRepo.get(projectId);
  if (!task) {
    throw new Error('Task not found');
  }

  if (task.status !== 'RUNNING') {
    throw new Error(`Cannot pause task with status ${task.status}`);
  }

  // If in EPISODE phase, proxy to batch
  if (task.step === 'EPISODE') {
    await pauseBatch(projectId);
  }

  task.status = 'PAUSED';
  taskRepo.save(task);

  console.log(`[TaskRunner] Paused task for ${projectId} at step ${task.step}`);
  return task;
}

export async function resumeTask(projectId: string): Promise<GenerationTask> {
  const task = taskRepo.get(projectId);
  if (!task) {
    throw new Error('Task not found');
  }

  if (task.status === 'DONE' || task.status === 'FAILED') {
    console.log(`[TaskRunner] Task already ${task.status}, cannot resume`);
    return task;
  }

  if (task.status !== 'PAUSED') {
    throw new Error(`Cannot resume task with status ${task.status}`);
  }

  task.status = 'RUNNING';
  taskRepo.save(task);

  // Resume execution from current step
  executeTask(task).catch(err => {
    console.error('[TaskRunner] Resume error:', err);
  });

  console.log(`[TaskRunner] Resumed task for ${projectId} at step ${task.step}`);
  return task;
}

export async function abortTask(projectId: string): Promise<GenerationTask> {
  const task = taskRepo.get(projectId);
  if (!task) {
    throw new Error('Task not found');
  }

  // If in EPISODE phase, pause batch
  if (task.step === 'EPISODE' && task.status === 'RUNNING') {
    try {
      await pauseBatch(projectId);
    } catch (e) {
      // Ignore batch errors during abort
    }
  }

  task.status = 'FAILED';
  task.lastError = 'ABORTED';
  taskRepo.save(task);

  console.log(`[TaskRunner] Aborted task for ${projectId}`);
  return task;
}

// === EnhanceEpisodeTask（后台增强任务） ===

const MAX_CONCURRENT_ENHANCE_TASKS = 3;
const runningEnhanceTasks = new Set<string>();

export async function queueEnhanceEpisodeTask(
  projectId: string,
  episodeIndex: number,
  retryCount: number = 0
): Promise<EnhanceEpisodeTask> {
  const taskId = `enhance_${projectId}_${episodeIndex}_${Date.now()}`;

  const task: EnhanceEpisodeTask = {
    taskId,
    projectId,
    episodeIndex,
    status: 'QUEUED',
    retryCount,
    maxRetryCount: 3,
    updatedAt: Date.now()
  };

  taskRepo.saveEnhanceTask(task);
  taskRepo.addEnhanceTask(taskId);

  console.log(`[TaskRunner] Queued enhance task ${taskId} (retryCount: ${retryCount})`);

  // 尝试立即执行
  tryRunNextEnhanceTask();

  return task;
}

async function tryRunNextEnhanceTask() {
  const queue = taskRepo.getEnhanceQueue();

  if (runningEnhanceTasks.size >= MAX_CONCURRENT_ENHANCE_TASKS) {
    console.log(`[TaskRunner] Max concurrent enhance tasks reached (${MAX_CONCURRENT_ENHANCE_TASKS}), queue length: ${queue.length}`);
    return;
  }

  if (queue.length === 0) {
    return;
  }

  const nextTaskId = queue[0];
  const task = taskRepo.getEnhanceTask(nextTaskId);

  if (!task) {
    taskRepo.removeEnhanceTask(nextTaskId);
    return;
  }

  if (task.status === 'RUNNING') {
    return;
  }

  // 执行任务
  executeEnhanceEpisodeTask(task).catch(err => {
    console.error(`[TaskRunner] Enhance task execution error:`, err);
  });
}

async function executeEnhanceEpisodeTask(task: EnhanceEpisodeTask) {
  // 并发控制
  if (runningEnhanceTasks.size >= MAX_CONCURRENT_ENHANCE_TASKS) {
    console.log(`[TaskRunner] Task ${task.taskId} queued (max concurrent reached)`);
    return;
  }

  runningEnhanceTasks.add(task.taskId);

  // 更新状态为 RUNNING
  task.status = 'RUNNING';
  task.startedAt = Date.now();
  taskRepo.saveEnhanceTask(task);

  console.log(`[TaskRunner] Starting enhance task ${task.taskId} for EP${task.episodeIndex}`);

  try {
    // === 执行前强制状态断言 ===
    const project = await projectRepo.get(task.projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const episode = project.episodes.find(e => e.id === task.episodeIndex);
    if (!episode) {
      throw new Error('Episode not found');
    }

    // 状态断言：必须是 DRAFT
    if (episode.status !== EpisodeStatus.DRAFT) {
      console.warn(`[TaskRunner] EP${task.episodeIndex} 状态断言失败：当前状态 ${episode.status}，期望 DRAFT`);
      task.status = 'FAILED';
      task.error = `Episode status changed to ${episode.status} (not DRAFT)`;
      taskRepo.saveEnhanceTask(task);
      taskRepo.removeEnhanceTask(task.taskId);
      runningEnhanceTasks.delete(task.taskId);

      // 尝试拉起下一个
      tryRunNextEnhanceTask();
      return;
    }

    // 内容断言：内容长度必须 >= 400
    if (!episode.content || episode.content.length < 400) {
      console.warn(`[TaskRunner] EP${task.episodeIndex} 内容断言失败：内容长度 ${episode.content?.length || 0}，期望 >= 400`);
      task.status = 'FAILED';
      task.error = `Content too short (${episode.content?.length || 0} chars, min 400 required)`;
      taskRepo.saveEnhanceTask(task);
      taskRepo.removeEnhanceTask(task.taskId);
      runningEnhanceTasks.delete(task.taskId);

      // 尝试拉起下一个
      tryRunNextEnhanceTask();
      return;
    }

    console.log(`[TaskRunner] EP${task.episodeIndex} 状态断言通过：DRAFT, ${episode.content.length} chars`);

    // === 执行增强 ===
    const result = await rewriteDraftEpisode({
      projectId: task.projectId,
      episodeIndex: task.episodeIndex
    });

    // === 检查结果 ===
    if (result.status === EpisodeStatus.COMPLETED) {
      task.status = 'COMPLETED';
      task.completedAt = Date.now();

      console.log(`[TaskRunner] Enhance task ${task.taskId} completed successfully`);

      // === 状态一致性：仅当增强完成时，更新 Batch 状态 ===
      // rewriteDraftEpisode 已经标记 episode 为 COMPLETED，这里只需更新 batch.completed
      const batch = batchRepo.get(task.projectId);
      if (batch && !batch.completed.includes(task.episodeIndex)) {
        batch.completed.push(task.episodeIndex);
        batch.completed = [...new Set(batch.completed)];
        batchRepo.save(batch);
        console.log(`[TaskRunner] EP${task.episodeIndex} 已加入 batch.completed`);
      }
    } else {
      task.status = 'FAILED';
      task.error = result.humanSummary || 'Enhancement failed';

      console.log(`[TaskRunner] Enhance task ${task.taskId} failed: ${task.error}`);
    }

  } catch (error: any) {
    console.error(`[TaskRunner] Enhance task ${task.taskId} execution error:`, error);

    task.status = 'FAILED';
    task.error = error.message || String(error);
  } finally {
    task.updatedAt = Date.now();
    taskRepo.saveEnhanceTask(task);

    // 从队列中移除
    taskRepo.removeEnhanceTask(task.taskId);
    runningEnhanceTasks.delete(task.taskId);

    // 尝试拉起下一个
    tryRunNextEnhanceTask();
  }
}

export async function retryEnhanceEpisode(projectId: string, episodeIndex: number): Promise<EnhanceEpisodeTask> {
  const project = await projectRepo.get(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  const episode = project.episodes.find(e => e.id === episodeIndex);
  if (!episode) {
    throw new Error('Episode not found');
  }

  const retryCount = (episode.enhanceRetryCount || 0) + 1;

  if (retryCount > (episode.maxRetryCount || 3)) {
    throw new Error('Max retry count exceeded');
  }

  // 更新重试计数
  await episodeRepo.save(projectId, episodeIndex, {
    enhanceRetryCount: retryCount
  });

  // 重新入队
  return queueEnhanceEpisodeTask(projectId, episodeIndex, retryCount);
}

export function getEnhanceTaskStatus(taskId: string): EnhanceEpisodeTask | null {
  return taskRepo.getEnhanceTask(taskId);
}

// === EnrichBibleTask（后台 Enrich Bible 任务） (M10) ===

const MAX_CONCURRENT_ENRICH_TASKS = 2;
const runningEnrichTasks = new Set<string>();
const enrichBibleQueue: string[] = [];
const enrichOutlineQueue: string[] = [];

export async function queueEnrichBibleTask(projectId: string): Promise<EnrichBibleTask> {
  const taskId = `enrich_bible_${projectId}_${Date.now()}`;

  const task: EnrichBibleTask = {
    taskId,
    projectId,
    status: 'QUEUED',
    updatedAt: Date.now()
  };

  taskRepo.saveEnrichBibleTask(task);
  enrichBibleQueue.push(taskId);

  console.log(`[TaskRunner] Queued enrich Bible task ${taskId}`);

  // 尝试立即执行
  tryRunNextEnrichBibleTask();

  return task;
}

async function tryRunNextEnrichBibleTask() {
  if (runningEnrichTasks.size >= MAX_CONCURRENT_ENRICH_TASKS) {
    console.log(`[TaskRunner] Max concurrent enrich tasks reached (${MAX_CONCURRENT_ENRICH_TASKS})`);
    return;
  }

  if (enrichBibleQueue.length === 0) {
    return;
  }

  const nextTaskId = enrichBibleQueue.shift()!;
  const task = taskRepo.getEnrichBibleTask(nextTaskId);

  if (!task) {
    console.log(`[TaskRunner] Enrich Bible task ${nextTaskId} not found, skipping`);
    return;
  }

  if (task.status === 'RUNNING') {
    return;
  }

  // 执行任务
  executeEnrichBibleTask(task).catch(err => {
    console.error(`[TaskRunner] Enrich Bible task execution error:`, err);
  });
}

async function executeEnrichBibleTask(task: EnrichBibleTask) {
  // 并发控制
  if (runningEnrichTasks.size >= MAX_CONCURRENT_ENRICH_TASKS) {
    console.log(`[TaskRunner] Task ${task.taskId} queued (max concurrent reached)`);
    return;
  }

  runningEnrichTasks.add(task.taskId);

  // 更新状态为 RUNNING
  task.status = 'RUNNING';
  task.startedAt = Date.now();
  taskRepo.saveEnrichBibleTask(task);

  console.log(`[TaskRunner] Starting enrich Bible task ${task.taskId}`);

  try {
    // 执行 enrichBible
    await enrichBible(task.projectId);

    task.status = 'COMPLETED';
    task.completedAt = Date.now();

    console.log(`[TaskRunner] Enrich Bible task ${task.taskId} completed successfully`);
  } catch (error: any) {
    console.error(`[TaskRunner] Enrich Bible task ${task.taskId} execution error:`, error);

    task.status = 'FAILED';
    task.error = error.message || String(error);
  } finally {
    task.updatedAt = Date.now();
    taskRepo.saveEnrichBibleTask(task);

    runningEnrichTasks.delete(task.taskId);

    // 尝试拉起下一个
    tryRunNextEnrichBibleTask();
  }
}

// === EnrichOutlineTask（后台 Enrich Outline 任务） (M10) ===

export async function queueEnrichOutlineTask(projectId: string): Promise<EnrichOutlineTask> {
  const taskId = `enrich_outline_${projectId}_${Date.now()}`;

  const task: EnrichOutlineTask = {
    taskId,
    projectId,
    status: 'QUEUED',
    updatedAt: Date.now()
  };

  taskRepo.saveEnrichOutlineTask(task);
  enrichOutlineQueue.push(taskId);

  console.log(`[TaskRunner] Queued enrich Outline task ${taskId}`);

  // 尝试立即执行
  tryRunNextEnrichOutlineTask();

  return task;
}

async function tryRunNextEnrichOutlineTask() {
  if (runningEnrichTasks.size >= MAX_CONCURRENT_ENRICH_TASKS) {
    console.log(`[TaskRunner] Max concurrent enrich tasks reached (${MAX_CONCURRENT_ENRICH_TASKS})`);
    return;
  }

  if (enrichOutlineQueue.length === 0) {
    return;
  }

  const nextTaskId = enrichOutlineQueue.shift()!;
  const task = taskRepo.getEnrichOutlineTask(nextTaskId);

  if (!task) {
    console.log(`[TaskRunner] Enrich Outline task ${nextTaskId} not found, skipping`);
    return;
  }

  if (task.status === 'RUNNING') {
    return;
  }

  // 执行任务
  executeEnrichOutlineTask(task).catch(err => {
    console.error(`[TaskRunner] Enrich Outline task execution error:`, err);
  });
}

async function executeEnrichOutlineTask(task: EnrichOutlineTask) {
  // 并发控制
  if (runningEnrichTasks.size >= MAX_CONCURRENT_ENRICH_TASKS) {
    console.log(`[TaskRunner] Task ${task.taskId} queued (max concurrent reached)`);
    return;
  }

  runningEnrichTasks.add(task.taskId);

  // 更新状态为 RUNNING
  task.status = 'RUNNING';
  task.startedAt = Date.now();
  taskRepo.saveEnrichOutlineTask(task);

  console.log(`[TaskRunner] Starting enrich Outline task ${task.taskId}`);

  try {
    // 执行 enrichOutline
    await enrichOutline(task.projectId);

    task.status = 'COMPLETED';
    task.completedAt = Date.now();

    console.log(`[TaskRunner] Enrich Outline task ${task.taskId} completed successfully`);
  } catch (error: any) {
    console.error(`[TaskRunner] Enrich Outline task ${task.taskId} execution error:`, error);

    task.status = 'FAILED';
    task.error = error.message || String(error);
  } finally {
    task.updatedAt = Date.now();
    taskRepo.saveEnrichOutlineTask(task);

    runningEnrichTasks.delete(task.taskId);

    // 尝试拉起下一个
    tryRunNextEnrichOutlineTask();
  }
}

async function executeTask(task: GenerationTask): Promise<void> {
  const projectId = task.projectId;

  try {
    // Reload project on each step to get latest state
    const project = await projectRepo.get(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Step 1: SEED (Check if project has bible and characters)
    if (!project.bible?.canonRules?.worldSetting || !project.characters || project.characters.length === 0) {
      console.log(`[TaskRunner] Step SEED: Need to create seed and bible`);
      task.step = 'SEED';
      taskRepo.save(task);

      try {
        // M10: 先生成 Bible Skeleton（快速,用于首屏）
        const bibleSkeleton = await buildBibleSkeleton(project);
        await projectRepo.saveBibleSkeleton(projectId, bibleSkeleton);

        // M12.1: 保存 NarrativeState（不参与生成,仅存储）
        const narrativeState = buildNarrativeStateFromSkeleton(bibleSkeleton);
        await projectRepo.saveNarrativeState(projectId, narrativeState);

        // 立即触发 Enrich（不阻塞）
        queueEnrichBibleTask(projectId).catch(err => {
          console.error('[TaskRunner] Enrich Bible task failed:', err);
        });

        // Init memory（使用 skeleton 中的世界规则）
        const memory = {
          canonLayer: {
            worldRules: bibleSkeleton.worldRules,
            lockedEvents: [],
            deadCharacters: []
          },
          characterLayer: { states: {} },
          plotLayer: {
            lockedEvents: [],
            ongoingConflicts: [],
            foreshadowedEvents: []
          }
        };

        await storyMemoryRepo.save(projectId, memory);
        console.log(`[TaskRunner] Step SEED: Bible Skeleton completed, enrich queued`);
      } catch (e: any) {
        // 如果 skeleton 失败,降级到原有逻辑
        console.warn('[TaskRunner] Bible Skeleton failed, falling back to full Bible:', e);
        try {
          const bibleData = await buildBible(project);

          // Init memory
          const memory = {
            canonLayer: {
              worldRules: bibleData.bible.canonRules.coreRules,
              lockedEvents: [],
              deadCharacters: []
            },
            characterLayer: { states: {} },
            plotLayer: {
              lockedEvents: [],
              ongoingConflicts: [],
              foreshadowedEvents: []
            }
          };

          await projectRepo.saveBible(projectId, bibleData);
          await storyMemoryRepo.save(projectId, memory);
          console.log(`[TaskRunner] Step SEED: Fallback Bible completed`);
        } catch (fallbackError: any) {
          throw new Error(`SEED failed: ${fallbackError.message}`);
        }
      }
    }

    // Reload project after bible
    const projectAfterBible = await projectRepo.get(projectId);
    if (!projectAfterBible) throw new Error('Project lost after SEED');

    // Step 2: OUTLINE (Check if project has episodes/outline)
    if (!projectAfterBible.episodes || projectAfterBible.episodes.length === 0) {
      console.log(`[TaskRunner] Step BIBLE: Generating outline`);
      task.step = 'OUTLINE';
      taskRepo.save(task);

      try {
        // M10: 先生成 Outline Skeleton（快速,用于首屏）
        const outlineSkeleton = await buildOutlineSkeleton(projectAfterBible);
        await projectRepo.saveOutlineSkeleton(projectId, outlineSkeleton);

        // 立即触发 Enrich（不阻塞）
        queueEnrichOutlineTask(projectId).catch(err => {
          console.error('[TaskRunner] Enrich Outline task failed:', err);
        });

        console.log(`[TaskRunner] Step OUTLINE: Outline Skeleton completed, enrich queued`);
      } catch (e: any) {
        // 如果 skeleton 失败,降级到原有逻辑
        console.warn('[TaskRunner] Outline Skeleton failed, falling back to full Outline:', e);
        try {
          const outline = await generateOutline(projectAfterBible);
          await projectRepo.saveOutline(projectId, outline);
          console.log(`[TaskRunner] Step OUTLINE: Fallback Outline completed`);
        } catch (fallbackError: any) {
          throw new Error(`OUTLINE failed: ${fallbackError.message}`);
        }
      }
    }

    // Step 3: EPISODE (Batch generation)
    console.log(`[TaskRunner] Step EPISODE: Starting batch generation`);
    task.step = 'EPISODE';
    taskRepo.save(task);

    // Determine target end episode based on phased generation rules
    const projectTotal = projectAfterBible.totalEpisodes;
    const currentBatch = batchRepo.get(projectId);
    const startEpisode = currentBatch ? (Math.max(...currentBatch.completed, 0) + 1) : 1;

    let targetEnd = projectTotal;

    // Phase 1: Cold Start (EP10)
    if (startEpisode <= 10) {
      targetEnd = Math.min(10, projectTotal);
      console.log(`[TaskRunner] Phase 1: Target EP${targetEnd}`);
    }
    // Phase 2: Commercial Validation (EP30)
    else if (startEpisode <= 30) {
      targetEnd = Math.min(30, projectTotal);
      console.log(`[TaskRunner] Phase 2: Target EP${targetEnd}`);
    }
    // Phase 3: Act Level Progression
    else {
      // Find current Act end
      const template = PACING_TEMPLATES[projectAfterBible.pacingTemplateId];
      if (template) {
        const currentAct = template.acts.find(a => startEpisode >= a.range[0] && startEpisode <= a.range[1]);
        if (currentAct) {
          targetEnd = Math.min(currentAct.range[1], projectTotal);
          console.log(`[TaskRunner] Phase 3: Act ${currentAct.act} Target EP${targetEnd}`);
        }
      }
    }

    // Start batch from current start to calculated target
    await startBatch({
      projectId,
      start: startEpisode,
      end: targetEnd
    });

    console.log(`[TaskRunner] Task execution initiated for ${projectId}`);

  } catch (err: any) {
    // Mark task as FAILED
    task.status = 'FAILED';
    task.lastError = err.message || String(err);
    taskRepo.save(task);
    console.error(`[TaskRunner] Task failed for ${projectId}:`, err);
  }
}



