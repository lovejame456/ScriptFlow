import { BatchState } from '../../types';
import { storage } from '../utils/storage';

type MetricsOptions = { collectMetrics?: boolean; timer?: any };

const STORAGE_KEY = (projectId: string) => `scriptflow_batch_${projectId}`;

class BatchRepo {
  get(projectId: string): BatchState | null {
    try {
      const data = storage.getItem(STORAGE_KEY(projectId));
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  save(state: BatchState, metricsOptions?: MetricsOptions): void {
    const span = metricsOptions?.timer?.startSpan('save_batch');
    state.updatedAt = Date.now();
    storage.setItem(STORAGE_KEY(state.projectId), JSON.stringify(state));
    span?.end();
  }

  clear(projectId: string): void {
    storage.removeItem(STORAGE_KEY(projectId));
  }
}

export const batchRepo = new BatchRepo();
