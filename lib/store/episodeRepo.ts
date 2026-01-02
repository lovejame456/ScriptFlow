import { Episode, ValidationResult, EpisodeAttemptLog } from '../../types';
import { projectRepo } from './projectRepo';
import { storage } from '../utils/storage';

type MetricsOptions = { collectMetrics?: boolean; timer?: any };

const STORAGE_KEY_LOGS = 'scriptflow_episode_logs';
const STORAGE_KEY_ATTEMPTS = (projectId: string) => `scriptflow_attempts_${projectId}`;

class EpisodeRepo {
  async save(projectId: string, episodeIndex: number, data: Partial<Episode>, metricsOptions?: MetricsOptions) {
    const span = metricsOptions?.timer?.startSpan('save_episode');

    // In our single-file store design, we update project
    // In a real DB, this would update the Episode table
    const project = await projectRepo.get(projectId);
    if (!project) throw new Error('Project not found');

    const epIdx = project.episodes.findIndex(e => e.id === episodeIndex);
    if (epIdx === -1) throw new Error('Episode not found');

    project.episodes[epIdx] = {
        ...project.episodes[epIdx],
        ...data,
        ...(data.status !== undefined && { status: data.status })
    };

    // We hack into projectRepo's private method via re-saving the whole project logic
    // Simplified for this mock:
    const all = await projectRepo.getAll();
    const idx = all.findIndex(p => p.id === projectId);
    all[idx] = project;
    storage.setItem('scriptflow_projects', JSON.stringify(all));

    span?.end();
  }

  async saveAttempt(projectId: string, episodeIndex: number, attemptData: any) {
    const key = STORAGE_KEY_ATTEMPTS(projectId);
    const logs = this._loadAttempts(projectId);

    const log: EpisodeAttemptLog = {
      projectId,
      episodeIndex,
      attempt: attemptData.attempt || 1,
      error: Array.isArray(attemptData.error) ? attemptData.error.join('; ') : (attemptData.error || ''),
      invariantErrors: attemptData.invariantErrors,
      pacingContext: attemptData.pacingContext,
      timestamp: attemptData.timestamp || Date.now(),
      alignerResult: attemptData.alignerResult
    };

    logs.push(log);
    storage.setItem(key, JSON.stringify(logs));
    console.log(`[EpisodeRepo] Saved attempt for ${projectId} EP${episodeIndex}, total attempts: ${logs.length}`);
  }

  listAttempts(projectId: string, episodeIndex?: number): EpisodeAttemptLog[] {
    const logs = this._loadAttempts(projectId);
    if (episodeIndex === undefined) return logs;
    return logs.filter(log => log.episodeIndex === episodeIndex);
  }

  private _loadAttempts(projectId: string): EpisodeAttemptLog[] {
    try {
      const data = storage.getItem(STORAGE_KEY_ATTEMPTS(projectId));
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }
}

export const episodeRepo = new EpisodeRepo();
