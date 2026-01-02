import { api } from '../../api';
import { GenerationTask, BatchState } from '../../types';

/**
 * 恢复决策对象
 * 用于告诉组件是否需要启动轮询以及当前运行状态
 */
export interface RestoreDecision {
  shouldPoll: boolean;          // 是否需要启动轮询
  isRunning: boolean;            // 是否正在运行中
  task: GenerationTask | null;   // 当前 task 状态
  batch: BatchState | null;      // 当前 batch 状态
}

/**
 * 从后端恢复任务状态
 *
 * 这是一个幂等函数，可以被安全地多次调用。
 * 它不会修改任何状态，只是查询后端并返回恢复决策。
 *
 * 调用路径：
 * 组件 mount → restoreFromTask() → 并行查询 task/batch → 判断是否需要轮询
 *
 * @param projectId 项目 ID
 * @returns 恢复决策对象
 */
export async function restoreFromTask(projectId: string): Promise<RestoreDecision> {
  try {
    // 并行查询 task 和 batch 状态
    const [task, batch] = await Promise.all([
      api.task.get(projectId),
      api.batch.getState(projectId)
    ]);

    // 判断是否需要启动轮询的条件：
    // 1. task 状态为 RUNNING 或 PAUSED
    // 2. 或 batch 状态为 RUNNING
    const shouldPoll =
      (task && (task.status === 'RUNNING' || task.status === 'PAUSED')) ||
      (batch && batch.status === 'RUNNING');

    // 判断是否正在运行
    const isRunning = shouldPoll;

    console.log(`[RestoreHelper] Restore decision for ${projectId}:`, {
      shouldPoll,
      isRunning,
      taskStatus: task?.status,
      batchStatus: batch?.status
    });

    return {
      shouldPoll,
      isRunning,
      task,
      batch
    };
  } catch (error) {
    console.error('[RestoreHelper] Failed to restore task state:', error);
    // 出错时返回保守决策：不启动轮询
    return {
      shouldPoll: false,
      isRunning: false,
      task: null,
      batch: null
    };
  }
}


