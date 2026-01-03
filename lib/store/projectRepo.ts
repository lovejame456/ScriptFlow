import { Project, ProjectSeed, ProjectBible, EpisodeOutline, Episode, StoryMemory, EpisodeStatus, NarrativeState, ProjectFailureAnalysis, EpisodeAdvice, ProjectFailureProfile, InstructionImpactHistory, SystemInstructionSuggestion } from '../../types';
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

  // 产品摘要保存方法
  async saveSummary(id: string, summaryText: string): Promise<void> {
    await delay(100);
    const projects = this.loadProjects();
    const index = projects.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Project not found');

    projects[index].summaryText = summaryText;
    projects[index].updatedAt = new Date().toISOString();

    this.saveProjects(projects);
    console.log(`[projectRepo] Summary saved for project ${id}`);
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

  // --- P3.1: 失败分析存储 ---
  
  async saveFailureAnalysis(id: string, analysis: ProjectFailureAnalysis): Promise<void> {
    await delay(100);
    const key = `scriptflow_failure_analysis_${id}`;
    storage.setItem(key, JSON.stringify(analysis));
    console.log(`[projectRepo] Failure analysis saved for project ${id}`);
  }

  async getFailureAnalysis(id: string): Promise<ProjectFailureAnalysis | null> {
    await delay(50);
    const key = `scriptflow_failure_analysis_${id}`;
    const data = storage.getItem(key);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch (e) {
      console.error('[projectRepo] Failed to parse failure analysis:', e);
      return null;
    }
  }

  // --- P3.3: 创作建议存储 ---
  
  async saveEpisodeAdvice(id: string, advice: EpisodeAdvice): Promise<void> {
    await delay(100);
    const key = `scriptflow_episode_advice_${id}`;
    storage.setItem(key, JSON.stringify(advice));
    console.log(`[projectRepo] Episode advice saved for project ${id}`);
  }

  async getEpisodeAdvice(id: string): Promise<EpisodeAdvice | null> {
    await delay(50);
    const key = `scriptflow_episode_advice_${id}`;
    const data = storage.getItem(key);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch (e) {
      console.error('[projectRepo] Failed to parse episode advice:', e);
      return null;
    }
  }

  async dismissEpisodeAdvice(id: string): Promise<void> {
    await delay(50);
    const key = `scriptflow_episode_advice_${id}`;
    storage.removeItem(key);
    console.log(`[projectRepo] Episode advice dismissed for project ${id}`);
  }

  // --- P4.1: Project Failure Profile Storage ---

  async saveFailureProfile(id: string, profile: ProjectFailureProfile): Promise<void> {
    await delay(100);
    const key = `scriptflow_failure_profile_${id}`;
    storage.setItem(key, JSON.stringify(profile));
    console.log(`[projectRepo] Failure profile saved for project ${id}`);
  }

  async getFailureProfile(id: string): Promise<ProjectFailureProfile | null> {
    await delay(50);
    const key = `scriptflow_failure_profile_${id}`;
    const data = storage.getItem(key);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch (e) {
      console.error('[projectRepo] Failed to parse failure profile:', e);
      return null;
    }
  }

  // --- P4.2: Instruction Impact History Storage ---

  async saveInstructionImpact(id: string, history: InstructionImpactHistory): Promise<void> {
    await delay(100);
    const key = `scriptflow_instruction_impact_${id}`;
    storage.setItem(key, JSON.stringify(history));
    console.log(`[projectRepo] Instruction impact history saved for project ${id}`);
  }

  async getInstructionImpact(id: string): Promise<InstructionImpactHistory | null> {
    await delay(50);
    const key = `scriptflow_instruction_impact_${id}`;
    const data = storage.getItem(key);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch (e) {
      console.error('[projectRepo] Failed to parse instruction impact history:', e);
      return null;
    }
  }

  // --- P4.3: System Instruction Suggestion Storage ---

  async saveInstructionSuggestion(id: string, suggestion: SystemInstructionSuggestion): Promise<void> {
    await delay(100);
    const key = `scriptflow_instruction_suggestion_${id}`;
    storage.setItem(key, JSON.stringify(suggestion));
    console.log(`[projectRepo] Instruction suggestion saved for project ${id}`);
  }

  async getInstructionSuggestion(id: string): Promise<SystemInstructionSuggestion | null> {
    await delay(50);
    const key = `scriptflow_instruction_suggestion_${id}`;
    const data = storage.getItem(key);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch (e) {
      console.error('[projectRepo] Failed to parse instruction suggestion:', e);
      return null;
    }
  }

  async dismissInstructionSuggestion(id: string): Promise<void> {
    await delay(50);
    const key = `scriptflow_instruction_suggestion_${id}`;
    storage.removeItem(key);
    console.log(`[projectRepo] Instruction suggestion dismissed for project ${id}`);
  }
}

export const projectRepo = new ProjectRepo();