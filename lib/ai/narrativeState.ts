/**
 * Narrative State Builder
 *
 * 从 BibleSkeleton 单向映射生成 NarrativeState（叙事状态机）
 *
 * M12.1 核心设计原则:
 * 1. NarrativeState 是程序级对象,不是 prompt 文本
 * 2. 单向映射: Skeleton -> NarrativeState, 不允许反向推导
 * 3. 作为叙事初始态,后续所有 Agent 基于此做受控推进
 * 4. 不参与任何生成流程,仅用于状态追踪和校验
 */

import { BibleSkeleton, NarrativeState, StateDelta } from '../../types';

/**
 * 从 BibleSkeleton 单向映射生成 NarrativeState
 *
 * 映射规则:
 * - characterPoolLite -> characters (每个角色包含 role/goal/flaw/relationship/status)
 * - coreConflicts.IMMEDIATE -> conflicts.immediate (status: 'active')
 * - coreConflicts.MID_TERM -> conflicts.mid_term (status: 'locked')
 * - coreConflicts.END_GAME -> conflicts.end_game (status: 'locked')
 * - worldRules -> worldRules.immutable (violated 初始为空数组)
 * - phase 固定为 'EP1'
 *
 * @param skeleton - BibleSkeleton (来自 buildBibleSkeleton)
 * @returns NarrativeState - 叙事状态机的初始态
 */
export function buildNarrativeStateFromSkeleton(skeleton: BibleSkeleton): NarrativeState {
  // 1. 构建 characters map
  const characters: NarrativeState['characters'] = {};
  for (const char of skeleton.characterPoolLite) {
    characters[char.name] = {
      role: char.role,
      goal: char.goal,
      flaw: char.flaw,
      relationship: char.relationship,
      status: 'unresolved'
    };
  }

  // 2. 构建三层冲突
  const immediateConflict = skeleton.coreConflicts.find(c => c.level === 'IMMEDIATE');
  const midTermConflict = skeleton.coreConflicts.find(c => c.level === 'MID_TERM');
  const endGameConflict = skeleton.coreConflicts.find(c => c.level === 'END_GAME');

  if (!immediateConflict || !midTermConflict || !endGameConflict) {
    throw new Error('[buildNarrativeStateFromSkeleton] Missing required conflict level in coreConflicts');
  }

  const conflicts: NarrativeState['conflicts'] = {
    immediate: {
      description: immediateConflict.description,
      status: 'active'
    },
    mid_term: {
      description: midTermConflict.description,
      status: 'locked'
    },
    end_game: {
      description: endGameConflict.description,
      status: 'locked'
    }
  };

  // 3. 构建世界规则
  const worldRules: NarrativeState['worldRules'] = {
    immutable: skeleton.worldRules,
    violated: []
  };

  // 4. 构建叙事状态
  const narrativeState: NarrativeState = {
    characters,
    conflicts,
    worldRules,
    phase: 'EP1'
  };

  console.log('[buildNarrativeStateFromSkeleton] NarrativeState built successfully:', {
    charactersCount: Object.keys(characters).length,
    conflicts: Object.keys(conflicts),
    worldRulesCount: worldRules.immutable.length,
    phase: narrativeState.phase
  });

  return narrativeState;
}

/**
 * 验证 NarrativeState 结构完整性
 *
 * 用于测试和调试,确保 NarrativeState 符合预期结构
 */
export function validateNarrativeState(state: NarrativeState): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 1. 验证 characters
  if (!state.characters || typeof state.characters !== 'object') {
    errors.push('characters must be an object');
  } else {
    for (const [name, char] of Object.entries(state.characters)) {
      if (!char.role || !['PROTAGONIST', 'ANTAGONIST', 'SUPPORT', 'PRESSURE'].includes(char.role)) {
        errors.push(`character ${name} has invalid role: ${char.role}`);
      }
      if (!char.goal) errors.push(`character ${name} missing goal`);
      if (!char.flaw) errors.push(`character ${name} missing flaw`);
      if (!char.relationship) errors.push(`character ${name} missing relationship`);
      if (char.status !== 'unresolved') errors.push(`character ${name} has invalid status: ${char.status}`);
    }
  }

  // 2. 验证 conflicts
  if (!state.conflicts) {
    errors.push('conflicts must exist');
  } else {
    const requiredLevels = ['immediate', 'mid_term', 'end_game'];
    for (const level of requiredLevels) {
      if (!state.conflicts[level as keyof NarrativeState['conflicts']]) {
        errors.push(`missing conflict level: ${level}`);
      } else {
        const conflict = state.conflicts[level as keyof NarrativeState['conflicts']]!;
        if (!conflict.description) errors.push(`conflict ${level} missing description`);
        if (!conflict.status || !['active', 'locked'].includes(conflict.status)) {
          errors.push(`conflict ${level} has invalid status: ${conflict.status}`);
        }
      }
    }

    // 验证初始状态: immediate 为 active,其他为 locked
    if (state.conflicts.immediate.status !== 'active') {
      errors.push(`conflict.immediate must be 'active', got: ${state.conflicts.immediate.status}`);
    }
    if (state.conflicts.mid_term.status !== 'locked') {
      errors.push(`conflict.mid_term must be 'locked', got: ${state.conflicts.mid_term.status}`);
    }
    if (state.conflicts.end_game.status !== 'locked') {
      errors.push(`conflict.end_game must be 'locked', got: ${state.conflicts.end_game.status}`);
    }
  }

  // 3. 验证 worldRules
  if (!state.worldRules) {
    errors.push('worldRules must exist');
  } else {
    if (!Array.isArray(state.worldRules.immutable)) {
      errors.push('worldRules.immutable must be an array');
    }
    if (!Array.isArray(state.worldRules.violated)) {
      errors.push('worldRules.violated must be an array');
    }
    // 初始状态 violated 应该为空
    if (state.worldRules.violated.length !== 0) {
      errors.push(`worldRules.violated should be empty, got ${state.worldRules.violated.length} items`);
    }
  }

  // 4. 验证 phase
  if (!state.phase || !['EP1', 'EP2', 'EP3+'].includes(state.phase)) {
    errors.push(`invalid phase: ${state.phase}`);
  }

  // 5. 验证初始 phase 为 EP1
  if (state.phase !== 'EP1') {
    errors.push(`initial phase must be 'EP1', got: ${state.phase}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 合并 StateDelta 到 NarrativeState（M12.2）
 * 仅在 Aligner PASS 后调用
 */
export function mergeStateDelta(
  currentState: NarrativeState,
  delta: StateDelta
): NarrativeState {
  const nextState = JSON.parse(JSON.stringify(currentState)) as NarrativeState;

  // 1. 合并冲突状态
  if (delta.conflicts) {
    if (delta.conflicts.immediate?.status) {
      nextState.conflicts.immediate.status = delta.conflicts.immediate.status;
    }
    if (delta.conflicts.mid_term?.status) {
      nextState.conflicts.mid_term.status = delta.conflicts.mid_term.status;
    }
    if (delta.conflicts.end_game?.status) {
      nextState.conflicts.end_game.status = delta.conflicts.end_game.status;
    }
  }

  // 2. 合并角色状态
  if (delta.characters) {
    for (const [charName, charDelta] of Object.entries(delta.characters)) {
      if (nextState.characters[charName] && charDelta.status) {
        nextState.characters[charName].status = charDelta.status;
      }
    }
  }

  // 3. 记录世界观违规（不修改 immutable）
  if (delta.worldRuleViolations && delta.worldRuleViolations.length > 0) {
    nextState.worldRules.violated = [
      ...nextState.worldRules.violated,
      ...delta.worldRuleViolations
    ];
  }

  return nextState;
}

