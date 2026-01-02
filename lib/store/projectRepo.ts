import { Project, ProjectSeed, ProjectBible, EpisodeOutline, Episode, StoryMemory, EpisodeStatus, NarrativeState } from '../../types';
import { storage } from '../utils/storage';

const STORAGE_KEY = 'scriptflow_projects';

// Helper to simulate DB delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class ProjectRepo {
  private loadProjects(): Project[] {
    try {
      const data = storage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to load projects', e);
      return [];
    }
  }

  private saveProjects(projects: Project[]) {
    storage.setItem(STORAGE_KEY, JSON.stringify(projects));
  }

  async getAll(): Promise<Project[]> {
    await delay(100);
    return this.loadProjects();
  }

  async get(id: string): Promise<Project | null> {
    await delay(50);
    const projects = this.loadProjects();
    return projects.find(p => p.id === id) || null;
  }

  async createFromSeed(seed: ProjectSeed): Promise<Project> {
    await delay(200);
    const projects = this.loadProjects();

    const newProject: Project = {
      id: `proj_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: seed.name,
      genre: seed.genre,
      logline: seed.logline,
      synopsis: seed.synopsis || '',
      audience: seed.audience,
      totalEpisodes: seed.totalEpisodes,
      pacingTemplateId: seed.pacingTemplateId,

      // Empty initialization
      bible: {
        canonRules: { worldSetting: '', coreRules: [], powerOrWealthSystem: '', forbiddenChanges: [] },
        keyEvents: []
      },
      characters: [],
      episodes: [], // Outline not generated yet
      storyMemory: {
        canonLayer: { worldRules: [], lockedEvents: [], deadCharacters: [] },
        characterLayer: { states: {} },
        plotLayer: { lockedEvents: [], ongoingConflicts: [], foreshadowedEvents: [] }
      },
      costStats: { estimatedTotalCost: 0, actualCost: 0 },
      stability: 100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.saveProjects([newProject, ...projects]);
    return newProject;
  }

  async saveBible(id: string, data: { bible: ProjectBible, characters: any[] }) {
    await delay(200);
    const projects = this.loadProjects();
    const index = projects.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Project not found');

    projects[index].bible = data.bible;
    projects[index].characters = data.characters;
    projects[index].updatedAt = new Date().toISOString();

    this.saveProjects(projects);
  }

  async saveBibleSkeleton(id: string, skeleton: any) {
    await delay(200);
    const projects = this.loadProjects();
    const index = projects.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Project not found');

    projects[index].bibleSkeleton = skeleton;
    projects[index].updatedAt = new Date().toISOString();

    this.saveProjects(projects);
    console.log(`[projectRepo] Bible Skeleton saved for project ${id}`);
  }

  async saveOutlineSkeleton(id: string, skeleton: any) {
    await delay(200);
    const projects = this.loadProjects();
    const index = projects.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Project not found');

    projects[index].outlineSkeleton = skeleton;
    projects[index].updatedAt = new Date().toISOString();

    this.saveProjects(projects);
    console.log(`[projectRepo] Outline Skeleton saved for project ${id}`);
  }

  async saveSynopsis(id: string, synopsis: string) {
    await delay(200);
    const projects = this.loadProjects();
    const index = projects.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Project not found');

    projects[index].synopsis = synopsis;
    projects[index].updatedAt = new Date().toISOString();

    this.saveProjects(projects);
  }

  async saveOutline(id: string, outline: EpisodeOutline[]) {
    await delay(200);
    const projects = this.loadProjects();
    const index = projects.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Project not found');

    // Initialize episodes based on outline
    projects[index].episodes = outline.map(o => ({
      id: o.episodeIndex,
      episodeIndex: o.episodeIndex,
      status: EpisodeStatus.PENDING,
      title: `第 ${o.episodeIndex} 集`,
      outline: o,
      content: '',
      validation: { fastCheck: { passed: true, errors: [] }, qualityCheck: { passed: true, issues: [] } }
    }));
    projects[index].updatedAt = new Date().toISOString();

    this.saveProjects(projects);
  }

  async markEpisodeGenerated(id: string, episodeIndex: number) {
    const projects = this.loadProjects();
    const pIndex = projects.findIndex(p => p.id === id);
    if (pIndex === -1) return;

    const eIndex = projects[pIndex].episodes.findIndex(e => e.id === episodeIndex);
    if (eIndex !== -1) {
      projects[pIndex].episodes[eIndex].status = EpisodeStatus.COMPLETED;
    }
    this.saveProjects(projects);
  }

  async markEpisodeFailed(id: string, episodeIndex: number) {
    const projects = this.loadProjects();
    const pIndex = projects.findIndex(p => p.id === id);
    if (pIndex === -1) return;

    const eIndex = projects[pIndex].episodes.findIndex(e => e.id === episodeIndex);
    if (eIndex !== -1) {
      projects[pIndex].episodes[eIndex].status = EpisodeStatus.FAILED;
    }
    this.saveProjects(projects);
  }

  // M5-1: 保存平台选择
  async setPlatform(id: string, platformId: string) {
    await delay(100);
    const projects = this.loadProjects();
    const index = projects.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Project not found');

    projects[index].platformId = platformId;
    projects[index].updatedAt = new Date().toISOString();

    this.saveProjects(projects);
  }

  // M12.1: 保存 NarrativeState
  async saveNarrativeState(id: string, state: NarrativeState) {
    await delay(100);
    const projects = this.loadProjects();
    const index = projects.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Project not found');

    projects[index].narrativeState = state;
    projects[index].updatedAt = new Date().toISOString();

    this.saveProjects(projects);
    console.log(`[projectRepo] NarrativeState saved for project ${id}`);
  }

  // 通用保存方法：用于更新项目的任意字段
  async save(id: string, data: Partial<Project>) {
    await delay(100);
    const projects = this.loadProjects();
    const index = projects.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Project not found');

    projects[index] = { ...projects[index], ...data, updatedAt: new Date().toISOString() };
    this.saveProjects(projects);
  }

  async delete(id: string) {
    await delay(100);
    const projects = this.loadProjects();
    const filtered = projects.filter(p => p.id !== id);
    if (filtered.length === projects.length) {
      throw new Error('Project not found');
    }
    this.saveProjects(filtered);
  }
}

export const projectRepo = new ProjectRepo();