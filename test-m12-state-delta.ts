/**
 * M12.2 StateDelta 验收测试
 *
 * 测试目标：
 * 1. StateDelta 类型定义正确
 * 2. validateStateDelta 校验逻辑正确
 * 3. mergeStateDelta 合并逻辑正确
 * 4. EP1 / EP2 状态演进符合预期
 */

import { NarrativeState, StateDelta } from './types.ts';
import { validateStateDelta } from './lib/ai/alignerRunner';
import { mergeStateDelta } from './lib/ai/narrativeState';

// ============================================================================
// 测试数据：初始 NarrativeState（来自 M12.1）
// ============================================================================

const INITIAL_NARRATIVE_STATE: NarrativeState = {
  characters: {
    '林风': {
      role: 'PROTAGONIST',
      goal: '找到失踪妹妹',
      flaw: '冲动',
      relationship: '与妹妹相依为命',
      status: 'unresolved'
    },
    '王霸': {
      role: 'ANTAGONIST',
      goal: '掩盖非法交易',
      flaw: '傲慢',
      relationship: '压迫林风',
      status: 'unresolved'
    }
  },
  conflicts: {
    immediate: {
      description: '王霸派人威胁林风交出证据',
      status: 'active'
    },
    mid_term: {
      description: '妹妹失踪背后的黑幕',
      status: 'locked'
    },
    end_game: {
      description: '与王霸的最终对决',
      status: 'locked'
    }
  },
  worldRules: {
    immutable: ['现代都市背景', '无超自然能力', '法律体系真实'],
    violated: []
  },
  phase: 'EP1'
};

// ============================================================================
// 测试用例：EP1 StateDelta
// ============================================================================

const EP1_VALID_STATE_DELTA: StateDelta = {
  conflicts: {
    immediate: { status: 'resolved' }  // EP1 结束时解决 immediate 冲突
  },
  characters: {
    '林风': { status: 'injured' }  // EP1 受伤
  }
};

const EP1_INVALID_STATE_DELTA_1: StateDelta = {
  conflicts: {
    mid_term: { status: 'active' }  // ❌ immediate 未解决就激活 mid_term
  }
};

const EP1_INVALID_STATE_DELTA_2: StateDelta = {
  characters: {
    '林风': { status: 'resolved' }  // ❌ 直接从 unresolved 跳到 resolved
  }
};

// ============================================================================
// 测试用例：EP2 StateDelta
// ============================================================================

const EP2_VALID_STATE_DELTA: StateDelta = {
  conflicts: {
    mid_term: { status: 'active' }  // EP2 开始时解锁 mid_term
  },
  characters: {
    '林风': { status: 'unresolved' }  // EP2 恢复
  }
};

const EP2_INVALID_STATE_DELTA: StateDelta = {
  conflicts: {
    end_game: { status: 'active' }  // ❌ 跳级解锁：mid_term 未解决
  }
};

// ============================================================================
// 测试函数
// ============================================================================

function test_validateStateDelta_ep1_valid() {
  console.log('\n========== 测试：EP1 有效 StateDelta ==========');
  const result = validateStateDelta({
    delta: EP1_VALID_STATE_DELTA,
    currentState: INITIAL_NARRATIVE_STATE,
    episodeIndex: 1
  });

  console.log('验证结果：', result.valid ? 'PASS' : 'FAIL');
  if (!result.valid) {
    console.error('错误信息：', result.errors);
  }

  if (result.valid) {
    console.log('✅ 测试通过：EP1 StateDelta 合法');
  } else {
    console.error('❌ 测试失败：EP1 StateDelta 应该合法');
    process.exit(1);
  }
}

function test_validateStateDelta_ep1_invalid_mid_term_unlock() {
  console.log('\n========== 测试：EP1 非法 StateDelta（mid_term 跳级解锁）==========');
  const result = validateStateDelta({
    delta: EP1_INVALID_STATE_DELTA_1,
    currentState: INITIAL_NARRATIVE_STATE,
    episodeIndex: 1
  });

  console.log('验证结果：', result.valid ? 'PASS' : 'FAIL');
  if (!result.valid) {
    console.log('错误信息（符合预期）：', result.errors);
  }

  if (!result.valid && result.errors.includes('mid_term 冲突不能在 immediate 未解决前激活')) {
    console.log('✅ 测试通过：成功拦截跳级解锁');
  } else {
    console.error('❌ 测试失败：应该拦截 mid_term 跳级解锁');
    process.exit(1);
  }
}

function test_validateStateDelta_ep1_invalid_character_jump() {
  console.log('\n========== 测试：EP1 非法 StateDelta（角色状态跳变）==========');
  const result = validateStateDelta({
    delta: EP1_INVALID_STATE_DELTA_2,
    currentState: INITIAL_NARRATIVE_STATE,
    episodeIndex: 1
  });

  console.log('验证结果：', result.valid ? 'PASS' : 'FAIL');
  if (!result.valid) {
    console.log('错误信息（符合预期）：', result.errors);
  }

  if (!result.valid && result.errors.some(e => e.includes('林风') && e.includes('unresolved') && e.includes('resolved'))) {
    console.log('✅ 测试通过：成功拦截角色状态跳变');
  } else {
    console.error('❌ 测试失败：应该拦截角色状态跳变');
    process.exit(1);
  }
}

function test_mergeStateDelta_ep1() {
  console.log('\n========== 测试：EP1 StateDelta 合并 ==========');
  const nextState = mergeStateDelta(INITIAL_NARRATIVE_STATE, EP1_VALID_STATE_DELTA);

  console.log('合并后状态：');
  console.log('  conflicts.immediate.status:', nextState.conflicts.immediate.status);
  console.log('  conflicts.mid_term.status:', nextState.conflicts.mid_term.status);
  console.log('  conflicts.end_game.status:', nextState.conflicts.end_game.status);
  console.log('  characters.林风.status:', nextState.characters['林风'].status);

  // 验证合并结果
  const checks = [
    nextState.conflicts.immediate.status === 'resolved',
    nextState.conflicts.mid_term.status === 'locked',  // 仍 locked
    nextState.conflicts.end_game.status === 'locked',  // 仍 locked
    nextState.characters['林风'].status === 'injured'
  ];

  if (checks.every(c => c)) {
    console.log('✅ 测试通过：EP1 StateDelta 合并正确');
  } else {
    console.error('❌ 测试失败：EP1 StateDelta 合并结果不正确');
    process.exit(1);
  }
}

function test_validateStateDelta_ep2_valid() {
  console.log('\n========== 测试：EP2 有效 StateDelta（基于 EP1 合并后）==========');
  // EP2 需要基于 EP1 合并后的状态
  const ep1State = mergeStateDelta(INITIAL_NARRATIVE_STATE, EP1_VALID_STATE_DELTA);

  const result = validateStateDelta({
    delta: EP2_VALID_STATE_DELTA,
    currentState: ep1State,
    episodeIndex: 2
  });

  console.log('验证结果：', result.valid ? 'PASS' : 'FAIL');
  if (!result.valid) {
    console.error('错误信息：', result.errors);
  }

  if (result.valid) {
    console.log('✅ 测试通过：EP2 StateDelta 合法');
  } else {
    console.error('❌ 测试失败：EP2 StateDelta 应该合法');
    process.exit(1);
  }
}

function test_validateStateDelta_ep2_invalid_end_game_unlock() {
  console.log('\n========== 测试：EP2 非法 StateDelta（end_game 跳级解锁）==========');
  // EP2 需要基于 EP1 合并后的状态
  const ep1State = mergeStateDelta(INITIAL_NARRATIVE_STATE, EP1_VALID_STATE_DELTA);

  const result = validateStateDelta({
    delta: EP2_INVALID_STATE_DELTA,
    currentState: ep1State,
    episodeIndex: 2
  });

  console.log('验证结果：', result.valid ? 'PASS' : 'FAIL');
  if (!result.valid) {
    console.log('错误信息（符合预期）：', result.errors);
  }

  if (!result.valid && result.errors.includes('end_game 冲突不能在 mid_term 未解决前激活')) {
    console.log('✅ 测试通过：成功拦截 end_game 跳级解锁');
  } else {
    console.error('❌ 测试失败：应该拦截 end_game 跳级解锁');
    process.exit(1);
  }
}

function test_mergeStateDelta_ep2() {
  console.log('\n========== 测试：EP2 StateDelta 合并（完整演进）==========');
  const ep1State = mergeStateDelta(INITIAL_NARRATIVE_STATE, EP1_VALID_STATE_DELTA);
  const ep2State = mergeStateDelta(ep1State, EP2_VALID_STATE_DELTA);

  console.log('EP1 合并后状态：');
  console.log('  conflicts.immediate.status:', ep1State.conflicts.immediate.status);
  console.log('  conflicts.mid_term.status:', ep1State.conflicts.mid_term.status);
  console.log('  conflicts.end_game.status:', ep1State.conflicts.end_game.status);
  console.log('  characters.林风.status:', ep1State.characters['林风'].status);

  console.log('\nEP2 合并后状态：');
  console.log('  conflicts.immediate.status:', ep2State.conflicts.immediate.status);
  console.log('  conflicts.mid_term.status:', ep2State.conflicts.mid_term.status);
  console.log('  conflicts.end_game.status:', ep2State.conflicts.end_game.status);
  console.log('  characters.林风.status:', ep2State.characters['林风'].status);

  // 验证完整演进结果
  const checks = [
    ep1State.conflicts.immediate.status === 'resolved',
    ep1State.conflicts.mid_term.status === 'locked',
    ep1State.characters['林风'].status === 'injured',

    ep2State.conflicts.immediate.status === 'resolved',
    ep2State.conflicts.mid_term.status === 'active',  // 解锁成功
    ep2State.conflicts.end_game.status === 'locked',
    ep2State.characters['林风'].status === 'unresolved'  // 恢复
  ];

  if (checks.every(c => c)) {
    console.log('✅ 测试通过：完整 EP1 -> EP2 演进正确');
  } else {
    console.error('❌ 测试失败：完整演进结果不正确');
    process.exit(1);
  }
}

function test_mergeStateDelta_worldRuleViolations() {
  console.log('\n========== 测试：世界观违规记录 ==========');

  const delta: StateDelta = {
    worldRuleViolations: ['出现超自然元素', '违背现代法律体系']
  };

  const nextState = mergeStateDelta(INITIAL_NARRATIVE_STATE, delta);

  console.log('违反记录：', nextState.worldRules.violated);

  const checks = [
    nextState.worldRules.violated.length === 2,
    nextState.worldRules.violated.includes('出现超自然元素'),
    nextState.worldRules.violated.includes('违背现代法律体系'),
    nextState.worldRules.immutable.length === 3  // immutable 不变
  ];

  if (checks.every(c => c)) {
    console.log('✅ 测试通过：世界观违规记录正确，immutable 未被修改');
  } else {
    console.error('❌ 测试失败：世界观违规记录不正确');
    process.exit(1);
  }
}

function test_validateStateDelta_no_delta() {
  console.log('\n========== 测试：无 StateDelta（默认通过）==========');
  const result = validateStateDelta({
    delta: undefined,
    currentState: INITIAL_NARRATIVE_STATE,
    episodeIndex: 1
  });

  console.log('验证结果：', result.valid ? 'PASS' : 'FAIL');

  if (result.valid && result.errors.length === 0) {
    console.log('✅ 测试通过：无 StateDelta 默认通过');
  } else {
    console.error('❌ 测试失败：无 StateDelta 应该默认通过');
    process.exit(1);
  }
}

// ============================================================================
// 执行所有测试
// ============================================================================

function runAllTests() {
  console.log('=================================================');
  console.log('  M12.2 StateDelta 验收测试');
  console.log('=================================================');

  try {
    // 测试校验逻辑
    test_validateStateDelta_ep1_valid();
    test_validateStateDelta_ep1_invalid_mid_term_unlock();
    test_validateStateDelta_ep1_invalid_character_jump();
    test_validateStateDelta_ep2_valid();
    test_validateStateDelta_ep2_invalid_end_game_unlock();
    test_validateStateDelta_no_delta();

    // 测试合并逻辑
    test_mergeStateDelta_ep1();
    test_mergeStateDelta_ep2();
    test_mergeStateDelta_worldRuleViolations();

    console.log('\n=================================================');
    console.log('  🎉 所有测试通过！');
    console.log('=================================================');
    console.log('\n验收总结：');
    console.log('✅ StateDelta 类型定义正确');
    console.log('✅ validateStateDelta 校验逻辑正确');
    console.log('✅ mergeStateDelta 合并逻辑正确');
    console.log('✅ EP1 / EP2 状态演进符合预期');
    console.log('\nM12.2 受控推进（Controlled Progression）验收通过！');
  } catch (error) {
    console.error('\n❌ 测试执行失败：', error);
    process.exit(1);
  }
}

// 运行测试
runAllTests();

