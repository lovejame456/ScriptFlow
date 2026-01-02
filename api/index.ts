import { createProjectSeed, buildBible, generateOutline, generateEpisodeFast, buildSynopsis } from '../lib/ai/episodeFlow';
import { runBatch, startBatch, pauseBatch, resumeBatch } from '../lib/ai/batchRunner';
import { projectRepo } from '../lib/store/projectRepo';
import { storyMemoryRepo } from '../lib/store/memoryRepo';
import { episodeRepo } from '../lib/store/episodeRepo';
import { batchRepo } from '../lib/batch/batchRepo';
import { taskRepo } from '../lib/task/taskRepo';
import { startTask, pauseTask, resumeTask, abortTask, retryEnhanceEpisode, getEnhanceTaskStatus } from '../lib/task/taskRunner';
import { exportPackage } from '../lib/exporter/exportPackage';
import { ProjectBible } from '../types';

// This file acts as the "Server Action" layer or API Routes
// In a real Next.js app, these would be in src/app/api/...

export const api = {
  project: {
    async seed(prompt: string, options?: any) {
      const seed = await createProjectSeed(prompt, options);
      const project = await projectRepo.createFromSeed(seed);
      return project;
    },

    async generateBible(projectId: string, options?: any) {
      const project = await projectRepo.get(projectId);
      if (!project) throw new Error("404");

      const bibleData = await buildBible(project, options);

      // Init memory
      const memory = {
        canonLayer: { worldRules: bibleData.bible.canonRules.coreRules, lockedEvents: [], deadCharacters: [] },
        characterLayer: { states: {} },
        plotLayer: { lockedEvents: [], ongoingConflicts: [], foreshadowedEvents: [] }
      };

      await projectRepo.saveBible(projectId, bibleData);
      await storyMemoryRepo.save(projectId, memory);
      return bibleData;
    },

    async generateSynopsis(projectId: string) {
      const project = await projectRepo.get(projectId);
      if (!project) throw new Error("404");

      const synopsis = await buildSynopsis(project);
      await projectRepo.saveSynopsis(projectId, synopsis);
      return synopsis;
    },

    async generateOutline(projectId: string, onProgress?: (current: number, total: number) => void, options?: any) {
      const project = await projectRepo.get(projectId);
      if (!project) throw new Error("404");

      const outline = await generateOutline(project, onProgress, options);
      await projectRepo.saveOutline(projectId, outline);
      return outline;
    },

    async get(projectId: string) {
      return projectRepo.get(projectId);
    },

    async getAll() {
      return projectRepo.getAll();
    },

    async delete(id: string) {
      await projectRepo.delete(id);
      return true;
    }
  },

  episode: {
    async generate(projectId: string, episodeIndex: number, options?: any) {
      // 统一使用 generateEpisodeFast，立即返回 DRAFT
      return generateEpisodeFast({ projectId, episodeIndex, ...options });
    },
    async runBatch(projectId: string, start: number, end: number) {
      return runBatch({ projectId, start, end });
    },
    async update(projectId: string, episodeIndex: number, content: string) {
      // 1. 保存内容
      await episodeRepo.save(projectId, episodeIndex, { content });

      // 2. 获取项目并检查剧集状态
      const project = await projectRepo.get(projectId);
      if (!project) return true;

      const episode = project.episodes[episodeIndex - 1];
      if (!episode) return true;

      // 3. 如果是 DRAFT 状态，自动升级为 COMPLETED（人工已确认）
      if (episode.status === EpisodeStatus.DRAFT) {
        await episodeRepo.save(projectId, episodeIndex, {
          status: EpisodeStatus.COMPLETED,
          humanSummary: '人工编辑完成，确认内容',
          metadata: {
            enhanced: false,
            needsEnhance: false
          }
        });

        // 4. 同步更新 Batch 状态
        const batch = batchRepo.get(projectId);
        if (batch && !batch.completed.includes(episodeIndex)) {
          batch.completed.push(episodeIndex);
          batch.completed = [...new Set(batch.completed)]; // 去重
          batchRepo.save(batch);
          console.log(`[API] EP${episodeIndex} 人工编辑完成，已标记为 COMPLETED 并加入 batch.completed`);
        }

        // 5. 取消队列中的增强任务（如果存在）
        const enhanceQueue = taskRepo.getEnhanceQueue();
        const projectEnhanceTasks = enhanceQueue.filter(taskId => taskId.includes(`${projectId}_${episodeIndex}`));

        for (const taskId of projectEnhanceTasks) {
          taskRepo.removeEnhanceTask(taskId);
          taskRepo.deleteEnhanceTask(taskId);
          console.log(`[API] 取消增强任务：${taskId}`);
        }

        console.log(`[API] EP${episodeIndex} 人工接管，已取消 ${projectEnhanceTasks.length} 个增强任务`);
      }

      return true;
    },
    async retryEnhance(projectId: string, episodeIndex: number) {
      try {
        const task = await retryEnhanceEpisode(projectId, episodeIndex);

        // 更新剧集状态
        await episodeRepo.save(projectId, episodeIndex, {
          humanSummary: '后台正在优化爽点与冲突（重试中）'
        });

        return task;
      } catch (error: any) {
        console.error(`[API] EP${episodeIndex} 重试增强失败：`, error);
        throw error;
      }
    },
    async getEnhanceTaskStatus(taskId: string) {
      return getEnhanceTaskStatus(taskId);
    }
  },

  storyMemory: {
    async get(projectId: string) {
      return storyMemoryRepo.get(projectId);
    }
  },

  batch: {
    async start(projectId: string, start: number, end: number) {
      return startBatch({ projectId, start, end });
    },
    async pause(projectId: string) {
      return pauseBatch(projectId);
    },
    async resume(projectId: string) {
      return resumeBatch(projectId);
    },
    async getState(projectId: string) {
      return batchRepo.get(projectId);
    }
  },

  task: {
    async start(projectId: string) {
      return startTask(projectId);
    },
    async pause(projectId: string) {
      return pauseTask(projectId);
    },
    async resume(projectId: string) {
      return resumeTask(projectId);
    },
    async abort(projectId: string) {
      return abortTask(projectId);
    },
    async get(projectId: string) {
      return taskRepo.get(projectId);
    }
  },

  export: {
    async exportSubmission(projectId: string, platformId?: string) {
      return exportPackage(projectId, platformId as any);
    }
  },

  platform: {
    async setPlatform(projectId: string, platformId: string) {
      return projectRepo.setPlatform(projectId, platformId);
    }
  }
};