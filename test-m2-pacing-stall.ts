import { checkInvariants } from './lib/storyMemory/invariants.ts';
import { getPacingContext } from './lib/pacing/pacingEngine.ts';
import { Project, StoryMemory, Episode, EpisodeStatus } from './types.ts';

function createMockProject(templateId: string): Project {
  return {
    id: 'test-project',
    name: 'Test Project',
    genre: '都市异能',
    logline: 'Test logline',
    audience: 'General',
    totalEpisodes: 120,
    pacingTemplateId: templateId,
    bible: {
      canonRules: {
        worldSetting: 'Test world',
        coreRules: [],
        powerOrWealthSystem: 'Test system',
        forbiddenChanges: []
      },
      keyEvents: []
    },
    characters: [],
    episodes: [],
    storyMemory: createMockMemory(),
    costStats: {
      estimatedTotalCost: 0,
      actualCost: 0
    },
    stability: 100,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function createMockMemory(): StoryMemory {
  return {
    canonLayer: {
      worldRules: [],
      lockedEvents: [],
      deadCharacters: []
    },
    characterLayer: {
      states: {}
    },
    plotLayer: {
      lockedEvents: [],
      ongoingConflicts: [],
      foreshadowedEvents: []
    }
  };
}

function createMockEpisode(episodeIndex: number): Episode {
  return {
    id: episodeIndex,
    status: EpisodeStatus.COMPLETED,
    title: `EP${episodeIndex}`,
    outline: {
      episodeIndex,
      summary: 'Test summary',
      conflict: 'Test conflict',
      highlight: 'Test highlight',
      hook: 'Test hook - 这是一个测试钩子',
      act: 1
    },
    content: 'Test content',
    validation: {
      fastCheck: { passed: true, errors: [] },
      qualityCheck: { passed: true, issues: [] }
    }
  };
}

console.log('M3-2 PACING_STALL 单元测试\n');
console.log('='.repeat(80));

const project = createMockProject('revenge_rebirth');
let currentMemory = createMockMemory();

console.log('\n测试场景：连续 2 集无推进，应该触发 PACING_STALL\n');

// EP1: 有推进
console.log('EP1: 有推进（ongoingConflicts 变化）');
const pacingContext1 = getPacingContext(project, 1);
const memoryAfter1 = {
  ...currentMemory,
  plotLayer: {
    ...currentMemory.plotLayer,
    ongoingConflicts: ['新的冲突出现']
  }
};
const result1 = checkInvariants({
  project,
  memoryBefore: currentMemory,
  memoryAfter: memoryAfter1,
  episode: createMockEpisode(1),
  pacingContext: pacingContext1,
  episodeIndex: 1
});
console.log(`  结果: ${result1.passed ? 'PASS' : 'FAIL'}`);
console.log(`  原因: ${result1.reasons.join(', ') || '无'}`);
console.log(`  stallCounter: ${memoryAfter1.plotLayer.stallCounter}`);
currentMemory = memoryAfter1;

// EP2: 无推进 1 次
console.log('\nEP2: 无推进（plotLayer 不变）');
const pacingContext2 = getPacingContext(project, 2);
const memoryAfter2 = {
  ...currentMemory,
  plotLayer: {
    ...currentMemory.plotLayer,
    ongoingConflicts: ['新的冲突出现']
  }
};
const result2 = checkInvariants({
  project,
  memoryBefore: currentMemory,
  memoryAfter: memoryAfter2,
  episode: createMockEpisode(2),
  pacingContext: pacingContext2,
  episodeIndex: 2
});
console.log(`  结果: ${result2.passed ? 'PASS' : 'FAIL'}`);
console.log(`  原因: ${result2.reasons.join(', ') || '无'}`);
console.log(`  stallCounter: ${memoryAfter2.plotLayer.stallCounter}`);
currentMemory = memoryAfter2;

// EP3: 无推进 2 次（应该触发 PACING_STALL）
console.log('\nEP3: 无推进（plotLayer 不变，连续第 2 次）');
const pacingContext3 = getPacingContext(project, 3);
const memoryAfter3 = {
  ...currentMemory,
  plotLayer: {
    ...currentMemory.plotLayer,
    ongoingConflicts: ['新的冲突出现']
  }
};
const result3 = checkInvariants({
  project,
  memoryBefore: currentMemory,
  memoryAfter: memoryAfter3,
  episode: createMockEpisode(3),
  pacingContext: pacingContext3,
  episodeIndex: 3
});
console.log(`  结果: ${result3.passed ? 'PASS' : 'FAIL'}`);
console.log(`  原因: ${result3.reasons.join(', ') || '无'}`);
console.log(`  stallCounter: ${memoryAfter3.plotLayer.stallCounter}`);
currentMemory = memoryAfter3;

// EP4: 有推进，应该重置 stallCounter
console.log('\nEP4: 有推进（foreshadowedEvents 变化）');
const pacingContext4 = getPacingContext(project, 4);
const memoryAfter4 = {
  ...currentMemory,
  plotLayer: {
    ...currentMemory.plotLayer,
    ongoingConflicts: ['新的冲突出现'],
    foreshadowedEvents: ['新的伏笔']
  }
};
const result4 = checkInvariants({
  project,
  memoryBefore: currentMemory,
  memoryAfter: memoryAfter4,
  episode: createMockEpisode(4),
  pacingContext: pacingContext4,
  episodeIndex: 4
});
console.log(`  结果: ${result4.passed ? 'PASS' : 'FAIL'}`);
console.log(`  原因: ${result4.reasons.join(', ') || '无'}`);
console.log(`  stallCounter: ${memoryAfter4.plotLayer.stallCounter}`);
currentMemory = memoryAfter4;

console.log('\n' + '='.repeat(80));
console.log('预期结果：');
console.log('  EP1: PASS（有推进，stallCounter = 0）');
console.log('  EP2: PASS（无推进 1 次，stallCounter = 1）');
console.log('  EP3: FAIL（连续 2 次无推进，触发 PACING_STALL，stallCounter = 2）');
console.log('  EP4: PASS（有推进，stallCounter 重置为 0）');
console.log('='.repeat(80));

// 验证测试结果
const allTestsPassed =
  result1.passed &&
  result2.passed &&
  !result3.passed &&
  result3.reasons.includes('PACING_STALL') &&
  memoryAfter3.plotLayer?.stallCounter === 2 &&
  result4.passed &&
  memoryAfter4.plotLayer?.stallCounter === 0;

console.log('\n测试结果: ' + (allTestsPassed ? '✅ 所有测试通过' : '❌ 测试失败'));
console.log('');

