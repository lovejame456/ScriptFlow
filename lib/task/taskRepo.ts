import { GenerationTask, EnhanceEpisodeTask, EnrichBibleTask, EnrichOutlineTask } from '../../types';

const STORAGE_KEY = (projectId: string) => `scriptflow_task_${projectId}`;
const STORAGE_KEY_ENHANCE = (taskId: string) => `scriptflow_enhance_${taskId}`;
const STORAGE_KEY_ENHANCE_QUEUE = `scriptflow_enhance_queue`;
const STORAGE_KEY_ENRICH_BIBLE = (taskId: string) => `scriptflow_enrich_bible_${taskId}`;
const STORAGE_KEY_ENRICH_OUTLINE = (taskId: string) => `scriptflow_enrich_outline_${taskId}`;

class TaskRepo {
  get(projectId: string): GenerationTask | null {
    try {
      const data = localStorage.getItem(STORAGE_KEY(projectId));
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  save(task: GenerationTask): void {
    task.updatedAt = Date.now();
    localStorage.setItem(STORAGE_KEY(task.projectId), JSON.stringify(task));
  }

  clear(projectId: string): void {
    localStorage.removeItem(STORAGE_KEY(projectId));
  }

  // === EnhanceEpisodeTask 存储 ===

  getEnhanceTask(taskId: string): EnhanceEpisodeTask | null {
    try {
      const data = localStorage.getItem(STORAGE_KEY_ENHANCE(taskId));
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  saveEnhanceTask(task: EnhanceEpisodeTask): void {
    task.updatedAt = Date.now();
    localStorage.setItem(STORAGE_KEY_ENHANCE(task.taskId), JSON.stringify(task));
  }

  deleteEnhanceTask(taskId: string): void {
    localStorage.removeItem(STORAGE_KEY_ENHANCE(taskId));
  }

  // === EnhanceEpisodeTask 队列管理 ===

  getEnhanceQueue(): string[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY_ENHANCE_QUEUE);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  saveEnhanceQueue(queue: string[]): void {
    localStorage.setItem(STORAGE_KEY_ENHANCE_QUEUE, JSON.stringify(queue));
  }

  addEnhanceTask(taskId: string): void {
    const queue = this.getEnhanceQueue();
    if (!queue.includes(taskId)) {
      queue.push(taskId);
      this.saveEnhanceQueue(queue);
    }
  }

  removeEnhanceTask(taskId: string): void {
    const queue = this.getEnhanceQueue();
    const filtered = queue.filter(id => id !== taskId);
    this.saveEnhanceQueue(filtered);
  }

  // === EnrichBibleTask 存储 (M10) ===

  getEnrichBibleTask(taskId: string): EnrichBibleTask | null {
    try {
      const data = localStorage.getItem(STORAGE_KEY_ENRICH_BIBLE(taskId));
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  saveEnrichBibleTask(task: EnrichBibleTask): void {
    task.updatedAt = Date.now();
    localStorage.setItem(STORAGE_KEY_ENRICH_BIBLE(task.taskId), JSON.stringify(task));
  }

  deleteEnrichBibleTask(taskId: string): void {
    localStorage.removeItem(STORAGE_KEY_ENRICH_BIBLE(taskId));
  }

  // === EnrichOutlineTask 存储 (M10) ===

  getEnrichOutlineTask(taskId: string): EnrichOutlineTask | null {
    try {
      const data = localStorage.getItem(STORAGE_KEY_ENRICH_OUTLINE(taskId));
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  saveEnrichOutlineTask(task: EnrichOutlineTask): void {
    task.updatedAt = Date.now();
    localStorage.setItem(STORAGE_KEY_ENRICH_OUTLINE(task.taskId), JSON.stringify(task));
  }

  deleteEnrichOutlineTask(taskId: string): void {
    localStorage.removeItem(STORAGE_KEY_ENRICH_OUTLINE(taskId));
  }
}

export const taskRepo = new TaskRepo();



