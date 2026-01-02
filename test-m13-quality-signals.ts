#!/usr/bin/env tsx

/**
 * M13：Quality Signals 测试脚本
 *
 * 目标：
 * - 验证 6 个质量信号的计算逻辑
 * - 测试 EP1 和 EP2 的信号差异
 * - 验证信号计算的正确性
 */

import { calculateQualitySignals } from './lib/ai/qualitySignals';
import {
  NarrativeState,
  StateDelta,
  EpisodeFacts,
  EpisodeFactsRecord,
  AlignmentResult
} from './types';

console.log('\n' + '='.repeat(80));
console.log('M13：Quality Signals 测试');
console.log('='.repeat(80) + '\n');

// ============================================================================
// 测试 1：基础信号计算（EP1 场景）
// ============================================================================

console.log('【测试 1】EP1 场景 - 基础信号计算\n');

const narrativeStateBefore: NarrativeState = {
  characters: {
    '主角': { role: 'PROTAGONIST', goal: '复仇', flaw: '冲动', relationship: '与反派仇恨', status: 'unresolved' },
    '反派': { role: 'ANTAGONIST', goal: '压制主角', flaw: '傲慢', relationship: '与主角仇恨', status: 'unresolved' }
  },
  conflicts: {
    immediate: { description: '反派当众羞辱主角', status: 'active' },
    mid_term: { description: '主角发现反派与家族恩怨', status: 'locked' },
    end_game: { description: '家族世仇的真相', status: 'locked' }
  },
  worldRules: {
    immutable: ['世界规则不可改变'],
    violated: []
  },
  phase: 'EP1'
};

const stateDeltaEP1: StateDelta = {
  conflicts: {
    immediate: { status: 'resolved' }  // EP1 解决了 immediate 冲突
  },
  characters: {
    '主角': { status: 'injured' }  // 主角受伤
  }
};

const episodeFactsEP1: EpisodeFacts = {
  events: ['主角在雨夜与反派发生正面冲突'],
  reveals: ['主角发现自己有特殊能力'],  // 新揭示
  items: ['神秘手机'],  // 改进：使用核心名词
  injuries: ['主角右臂被划伤，轻伤'],  // 伤情
  promises: ['查清真相']  // 改进：使用核心名词
};

const alignerResultEP1: AlignmentResult = {
  passed: true,
  severity: 'PASS',
  issues: [],
  editorNotes: []
};

const signalsEP1 = calculateQualitySignals({
  stateDelta: stateDeltaEP1,
  episodeFacts: episodeFactsEP1,
  narrativeStateBefore,
  narrativeStateAfter: narrativeStateBefore,  // EP1 没有合并后状态（简化）
  alignerResult: alignerResultEP1,
  factsHistory: [],
  episodeIndex: 1
});

console.log('EP1 质量信号：');
console.log(`  - conflictProgressed: ${signalsEP1.conflictProgressed} (期望: true)`);
console.log(`  - costPaid: ${signalsEP1.costPaid} (期望: true)`);
console.log(`  - factReused: ${signalsEP1.factReused} (期望: false, EP1 无历史)`);
console.log(`  - newReveal: ${signalsEP1.newReveal} (期望: true)`);
console.log(`  - promiseAddressed: ${signalsEP1.promiseAddressed} (期望: false, EP1 无历史)`);
console.log(`  - stateCoherent: ${signalsEP1.stateCoherent} (期望: true)\n`);

// 验证结果
const ep1Tests = [
  { name: 'conflictProgressed', actual: signalsEP1.conflictProgressed, expected: true },
  { name: 'costPaid', actual: signalsEP1.costPaid, expected: true },
  { name: 'factReused', actual: signalsEP1.factReused, expected: false },
  { name: 'newReveal', actual: signalsEP1.newReveal, expected: true },
  { name: 'promiseAddressed', actual: signalsEP1.promiseAddressed, expected: false },
  { name: 'stateCoherent', actual: signalsEP1.stateCoherent, expected: true }
];

let ep1Passed = true;
for (const test of ep1Tests) {
  if (test.actual !== test.expected) {
    console.log(`  ❌ ${test.name}: 期望 ${test.expected}, 实际 ${test.actual}`);
    ep1Passed = false;
  } else {
    console.log(`  ✅ ${test.name}: 正确`);
  }
}

console.log(`\nEP1 测试结果: ${ep1Passed ? 'PASS' : 'FAIL'}\n`);

// ============================================================================
// 测试 2：EP2 场景 - 复用历史 facts
// ============================================================================

console.log('【测试 2】EP2 场景 - 复用历史 facts\n');

const narrativeStateBeforeEP2: NarrativeState = {
  ...narrativeStateBefore,
  conflicts: {
    immediate: { description: '反派当众羞辱主角', status: 'resolved' },  // EP1 已解决
    mid_term: { description: '主角发现反派与家族恩怨', status: 'locked' },
    end_game: { description: '家族世仇的真相', status: 'locked' }
  }
};

const factsHistoryEP2: EpisodeFactsRecord[] = [
  {
    episodeIndex: 1,
    facts: episodeFactsEP1
  }
];

const stateDeltaEP2: StateDelta = {
  conflicts: {
    mid_term: { status: 'active' }  // EP2 解锁 mid_term 冲突
  }
};

const episodeFactsEP2: EpisodeFacts = {
  events: ['主角调查神秘手机，发现反派家族线索'],  // 复用 EP1 的手机
  reveals: [],
  items: ['神秘手机'],  // 改进：使用核心名词，直接匹配 EP1
  injuries: [],
  promises: []
};

const alignerResultEP2: AlignmentResult = {
  passed: true,
  severity: 'WARN',  // EP2 有 WARN，但不是 FAIL
  issues: [{ code: 'WARN', message: '节奏稍慢' }],
  editorNotes: []
};

const signalsEP2 = calculateQualitySignals({
  stateDelta: stateDeltaEP2,
  episodeFacts: episodeFactsEP2,
  narrativeStateBefore: narrativeStateBeforeEP2,
  narrativeStateAfter: narrativeStateBeforeEP2,
  alignerResult: alignerResultEP2,
  factsHistory: factsHistoryEP2,
  episodeIndex: 2
});

console.log('EP2 质量信号：');
console.log(`  - conflictProgressed: ${signalsEP2.conflictProgressed} (期望: true, 解锁 mid_term)`);
console.log(`  - costPaid: ${signalsEP2.costPaid} (期望: false, 无伤情)`);
console.log(`  - factReused: ${signalsEP2.factReused} (期望: true, 复用手机)`);
console.log(`  - newReveal: ${signalsEP2.newReveal} (期望: false, 无新揭示)`);
console.log(`  - promiseAddressed: ${signalsEP2.promiseAddressed} (期望: false, 未回应承诺)`);
console.log(`  - stateCoherent: ${signalsEP2.stateCoherent} (期望: true, WARN 也算通过)\n`);

// 验证结果
const ep2Tests = [
  { name: 'conflictProgressed', actual: signalsEP2.conflictProgressed, expected: true },
  { name: 'costPaid', actual: signalsEP2.costPaid, expected: false },
  { name: 'factReused', actual: signalsEP2.factReused, expected: true },
  { name: 'newReveal', actual: signalsEP2.newReveal, expected: false },
  { name: 'promiseAddressed', actual: signalsEP2.promiseAddressed, expected: false },
  { name: 'stateCoherent', actual: signalsEP2.stateCoherent, expected: true }
];

let ep2Passed = true;
for (const test of ep2Tests) {
  if (test.actual !== test.expected) {
    console.log(`  ❌ ${test.name}: 期望 ${test.expected}, 实际 ${test.actual}`);
    ep2Passed = false;
  } else {
    console.log(`  ✅ ${test.name}: 正确`);
  }
}

console.log(`\nEP2 测试结果: ${ep2Passed ? 'PASS' : 'FAIL'}\n`);

// ============================================================================
// 测试 3：EP3 场景 - 回应历史 promise
// ============================================================================

console.log('【测试 3】EP3 场景 - 回应历史 promise\n');

const narrativeStateBeforeEP3: NarrativeState = {
  ...narrativeStateBeforeEP2,
  conflicts: {
    immediate: { description: '反派当众羞辱主角', status: 'resolved' },
    mid_term: { description: '主角发现反派与家族恩怨', status: 'active' },
    end_game: { description: '家族世仇的真相', status: 'locked' }
  }
};

const factsHistoryEP3: EpisodeFactsRecord[] = [
  {
    episodeIndex: 1,
    facts: episodeFactsEP1
  },
  {
    episodeIndex: 2,
    facts: episodeFactsEP2
  }
];

const stateDeltaEP3: StateDelta = {};

const episodeFactsEP3: EpisodeFacts = {
  events: ['主角查清真相，为家族报仇，使用神秘手机'],  // 引用 EP1 的手机和 EP1 的真相
  reveals: [],
  items: ['神秘手机'],  // 复用 EP1 的手机
  injuries: [],
  promises: []
};

const alignerResultEP3: AlignmentResult = {
  passed: false,
  severity: 'FAIL',
  issues: [{ code: 'FAIL', message: '严重质量问题' }],
  editorNotes: []
};

const signalsEP3 = calculateQualitySignals({
  stateDelta: stateDeltaEP3,
  episodeFacts: episodeFactsEP3,
  narrativeStateBefore: narrativeStateBeforeEP3,
  narrativeStateAfter: narrativeStateBeforeEP3,
  alignerResult: alignerResultEP3,
  factsHistory: factsHistoryEP3,
  episodeIndex: 3
});

console.log('EP3 质量信号：');
console.log(`  - conflictProgressed: ${signalsEP3.conflictProgressed} (期望: false, 无冲突推进)`);
console.log(`  - costPaid: ${signalsEP3.costPaid} (期望: false, 无伤情)`);
console.log(`  - factReused: ${signalsEP3.factReused} (期望: true, 复用手机)`);
console.log(`  - newReveal: ${signalsEP3.newReveal} (期望: false, 无新揭示)`);
console.log(`  - promiseAddressed: ${signalsEP3.promiseAddressed} (期望: true, 回应真相)`);
console.log(`  - stateCoherent: ${signalsEP3.stateCoherent} (期望: false, Aligner FAIL)\n`);

// 验证结果
const ep3Tests = [
  { name: 'conflictProgressed', actual: signalsEP3.conflictProgressed, expected: false },
  { name: 'costPaid', actual: signalsEP3.costPaid, expected: false },
  { name: 'factReused', actual: signalsEP3.factReused, expected: true },
  { name: 'newReveal', actual: signalsEP3.newReveal, expected: false },
  { name: 'promiseAddressed', actual: signalsEP3.promiseAddressed, expected: true },
  { name: 'stateCoherent', actual: signalsEP3.stateCoherent, expected: false }
];

let ep3Passed = true;
for (const test of ep3Tests) {
  if (test.actual !== test.expected) {
    console.log(`  ❌ ${test.name}: 期望 ${test.expected}, 实际 ${test.actual}`);
    ep3Passed = false;
  } else {
    console.log(`  ✅ ${test.name}: 正确`);
  }
}

console.log(`\nEP3 测试结果: ${ep3Passed ? 'PASS' : 'FAIL'}\n`);

// ============================================================================
// 测试总结
// ============================================================================

console.log('='.repeat(80));
console.log('测试总结');
console.log('='.repeat(80));
console.log(`EP1: ${ep1Passed ? '✅ PASS' : '❌ FAIL'}`);
console.log(`EP2: ${ep2Passed ? '✅ PASS' : '❌ FAIL'}`);
console.log(`EP3: ${ep3Passed ? '✅ PASS' : '❌ FAIL'}`);
console.log('='.repeat(80));

const allPassed = ep1Passed && ep2Passed && ep3Passed;
if (allPassed) {
  console.log('\n✅ 所有测试通过！M13 质量信号系统实施成功。\n');
  process.exit(0);
} else {
  console.log('\n❌ 部分测试失败，请检查信号计算逻辑。\n');
  process.exit(1);
}

