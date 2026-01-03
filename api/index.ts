import { createProjectSeed, buildBible, generateOutline, generateEpisodeFast, buildSynopsis } from '../lib/ai/episodeFlow.ts';
import { runBatch, startBatch, pauseBatch, resumeBatch } from '../lib/ai/batchRunner.ts';
import { projectRepo } from '../lib/store/projectRepo.ts';
import { storyMemoryRepo } from '../lib/store/memoryRepo.ts';
import { episodeRepo } from '../lib/store/episodeRepo.ts';
import { batchRepo } from '../lib/batch/batchRepo.ts';
import { taskRepo } from '../lib/task/taskRepo.ts';
import { startTask, pauseTask, resumeTask, abortTask, retryEnhanceEpisode, getEnhanceTaskStatus } from '../lib/task/taskRunner.ts';
import { exportPackage } from '../lib/exporter/exportPackage.ts';
import { regenerateDegradedEpisode } from '../lib/ai/regenerateDegraded.ts';
import { ProjectBible, EpisodeStatus } from '../types.ts';
// 注意：runProject 已移除，因为它依赖 Node.js 特定模块（crypto, url, fs, path）
// 如需使用，请通过 CLI 或 Node.js 服务器调用 scripts/run-project.ts
// P3.2: 导入指令映射器和失败聚类
import { getPresetInstructions, applyUserInstruction } from '../lib/guidance/instructionMapper';
import { analyzeProjectFailures } from '../lib/guidance/failureCluster';
// P4: 导入智能模块
import { buildProjectFailureProfile, generateProfileSummary } from '../lib/intelligence/projectFailureProfile';
import { generateInstructionSuggestion, clearDismissedRecommendation } from '../lib/intelligence/instructionRecommender';

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
    },

    // P3.3: 更新总集数
    async updateTotalEpisodes(projectId: string, totalEpisodes: number) {
      const project = await projectRepo.get(projectId);
      if (!project) throw new Error("Project not found");

      await projectRepo.save(projectId, { totalEpisodes });
      return project;
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
    },
    async regenerateDegraded(projectId: string, episodeIndex: number) {
      try {
        const result = await regenerateDegradedEpisode({ projectId, episodeIndex });
        return result;
      } catch (error: any) {
        console.error(`[API] EP${episodeIndex} 重新生成失败：`, error);
        throw error;
      }
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
  },

  // 注意：run.runProject 已移除，因为它依赖 Node.js 特定模块
  // 请使用 CLI 命令：npm run run:project -- --prompt "<your prompt>"

  // --- P3: Guidance & Creative Advisor ---
  guidance: {
    // 获取预设指令列表
    async getPresetInstructions() {
      return getPresetInstructions();
    },

    // 应用微调指令重新生成
    async applyInstruction(projectId: string, episodeIndex: number, instructionId: string) {
      const project = await projectRepo.get(projectId);
      if (!project) throw new Error("Project not found");

      console.log(`[API] P3.2: Applying instruction "${instructionId}" to EP${episodeIndex}`);

      // 使用 generateEpisodeFast 重新生成，应用指令
      const result = await generateEpisodeFast({
        projectId,
        episodeIndex,
        userInstruction: instructionId
      });

      await episodeRepo.save(projectId, episodeIndex, result as any);
      return result;
    },

    // 获取失败分析
    async getFailureAnalysis(projectId: string) {
      return await projectRepo.getFailureAnalysis(projectId);
    },

    // 获取创作建议
    async getEpisodeAdvice(projectId: string) {
      return await projectRepo.getEpisodeAdvice(projectId);
    },

    // 忽略创作建议
    async dismissEpisodeAdvice(projectId: string) {
      await projectRepo.dismissEpisodeAdvice(projectId);
      return true;
    }
  },

  // --- P4: Project Intelligence (项目级创作智能进化层) ---
  intelligence: {
    // 获取项目失败画像
    async getProjectProfile(projectId: string) {
      const profile = await projectRepo.getFailureProfile(projectId);
      if (!profile) {
        // 如果没有缓存画像，重新生成
        console.log(`[API] P4.1: No cached profile, building new one for project ${projectId}`);
        const newProfile = await buildProjectFailureProfile(projectId);
        await projectRepo.saveFailureProfile(projectId, newProfile);
        return {
          ...newProfile,
          summary: generateProfileSummary(newProfile)
        };
      }
      return {
        ...profile,
        summary: generateProfileSummary(profile)
      };
    },

    // 获取系统指令推荐
    async getInstructionSuggestion(projectId: string) {
      // 检查是否有缓存推荐
      const cached = await projectRepo.getInstructionSuggestion(projectId);
      if (cached) {
        console.log(`[API] P4.3: Returning cached suggestion for project ${projectId}`);
        return cached;
      }

      // 生成新推荐
      console.log(`[API] P4.3: Generating new suggestion for project ${projectId}`);
      const suggestion = await generateInstructionSuggestion(projectId);

      if (suggestion) {
        // 缓存推荐
        await projectRepo.saveInstructionSuggestion(projectId, suggestion);
      }

      return suggestion;
    },

    // 忽略系统推荐
    async dismissSuggestion(projectId: string) {
      await projectRepo.dismissInstructionSuggestion(projectId);
      console.log(`[API] P4.3: Dismissed suggestion for project ${projectId}`);
      return true;
    },

    // 应用推荐指令（调用 guidance.applyInstruction 并触发追踪）
    async applyRecommendation(projectId: string, episodeIndex: number, instructionId: string) {
      const project = await projectRepo.get(projectId);
      if (!project) throw new Error("Project not found");

      console.log(`[API] P4.3: Applying recommendation "${instructionId}" to EP${episodeIndex}`);

      // 清除忽略标记（用户接受了推荐）
      clearDismissedRecommendation(projectId);

      // 移除缓存的推荐
      await projectRepo.dismissInstructionSuggestion(projectId);

      // 使用 generateEpisodeFast 重新生成，应用指令
      const result = await generateEpisodeFast({
        projectId,
        episodeIndex,
        userInstruction: instructionId
      });

      await episodeRepo.save(projectId, episodeIndex, result as any);
      return result;
    }
  },

  // --- P5-Lite: Business Intelligence (只读) ---
  business: {
    // 获取 Project DNA（长期记忆）
    async getProjectDNA(projectId: string) {
      const { getProjectDNA } = await import('../lib/business/projectDNA');
      return getProjectDNA(projectId);
    },

    // 获取稳定性预测
    async getPredictability(projectId: string) {
      const { analyzeStability } = await import('../lib/business/predictabilityEngine');
      const project = await projectRepo.get(projectId);
      if (!project) throw new Error("Project not found");
      return analyzeStability(projectId);
    }
  }
};