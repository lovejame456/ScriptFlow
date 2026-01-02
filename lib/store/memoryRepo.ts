import { StoryMemory } from '../../types';
import { projectRepo } from './projectRepo';
import { storage } from '../utils/storage';

class StoryMemoryRepo {
  async get(projectId: string): Promise<StoryMemory> {
    const project = await projectRepo.get(projectId);
    if (!project) throw new Error('Project not found');
    return project.storyMemory;
  }

  async save(projectId: string, memory: StoryMemory) {
    const project = await projectRepo.get(projectId);
    if (!project) throw new Error('Project not found');

    project.storyMemory = memory;

    // Persist
    const all = await projectRepo.getAll();
    const idx = all.findIndex(p => p.id === projectId);
    all[idx] = project;
    storage.setItem('scriptflow_projects', JSON.stringify(all));
  }
}

export const storyMemoryRepo = new StoryMemoryRepo();
