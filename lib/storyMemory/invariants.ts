import { Project, StoryMemory, Episode } from '../../types';
import { PacingContext } from '../pacing/pacingContext';

export type FailReason =
  | "NEW_CHARACTER"
  | "CANON_CHANGED"
  | "NO_PLOT_PROGRESS"
  | "MISSING_HOOK"
  | "CHARACTER_JUMP"
  | "PACING_STALL";

export function checkInvariants(args: {
  project: Project;
  memoryBefore: StoryMemory;
  memoryAfter: StoryMemory;
  episode: Episode;
  pacingContext?: PacingContext;
  episodeIndex?: number;
}): { passed: boolean; reasons: FailReason[] } {
  const { project, memoryBefore, memoryAfter, episode, pacingContext, episodeIndex } = args;
  const reasons: FailReason[] = [];

  // 1. Check Hook Existence (Hard Rule)
  if (!episode.outline.hook || episode.outline.hook.length < 5) {
      // If content analysis misses hook, fail
      // Here we assume episode.outline.hook comes from the generation result
      reasons.push("MISSING_HOOK");
  }

  // 2. New Character Check
  // Compare keys in memoryAfter.characterLayer vs project.characters
  const validCharIds = new Set(project.characters.map(c => c.id));
  const characterStates = memoryAfter.characterLayer?.states || {};
  const newCharIds = Object.keys(characterStates).filter(id => !validCharIds.has(id));

  if (newCharIds.length > 0) {
      reasons.push("NEW_CHARACTER");
  }

  // 3. Canon Change Check (Simplistic)
  if (memoryAfter.canonLayer.lockedEvents.length < memoryBefore.canonLayer.lockedEvents.length) {
      reasons.push("CANON_CHANGED"); // Deletion of canon events is forbidden
  }

  // 4. Pacing Stall Check
  if (pacingContext && episodeIndex !== undefined && pacingContext.kpi.requireProgress) {
    const plotBefore = memoryBefore.plotLayer || { ongoingConflicts: [], foreshadowedEvents: [] };
    const plotAfter = memoryAfter.plotLayer || { ongoingConflicts: [], foreshadowedEvents: [] };

    // Check if there's progress in plotLayer
    const hasConflictProgress =
      JSON.stringify(plotBefore.ongoingConflicts) !== JSON.stringify(plotAfter.ongoingConflicts);

    const hasForeshadowProgress =
      JSON.stringify(plotBefore.foreshadowedEvents) !== JSON.stringify(plotAfter.foreshadowedEvents);

    const hasProgress = hasConflictProgress || hasForeshadowProgress;

    // Update stallCounter in memoryAfter
    if (hasProgress) {
      plotAfter.stallCounter = 0;
      plotAfter.lastProgressEpisodeIndex = episodeIndex;
    } else {
      const currentStallCount = (plotAfter.stallCounter || 0);
      plotAfter.stallCounter = currentStallCount + 1;

      // Stall threshold is 2
      if (plotAfter.stallCounter >= 2) {
        reasons.push("PACING_STALL");
      }
    }
  }

  return { passed: reasons.length === 0, reasons };
}