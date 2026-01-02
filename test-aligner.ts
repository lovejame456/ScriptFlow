/**
 * M4-2 Aligner 最小验收测试
 *
 * 测试场景：
 * 1. 无爽点测试 - 构造平铺直叙内容，期望 FAIL + NO_HIGHLIGHT
 * 2. 轻微问题测试 - 有推进但 Hook 弱，期望 WARN + WEAK_HOOK
 * 3. 正常商业集测试 - 有冲突、有推进、有 Hook，期望 PASS
 */

import { runAligner } from './lib/ai/alignerRunner';

// Mock 测试项目数据
const mockProject = {
  id: 'test-project',
  name: '测试项目',
  genre: '都市脑洞',
  totalEpisodes: 10,
  pacingTemplateId: 'urban_concept',
  bible: {
    canonRules: {
      worldSetting: '现代都市',
      coreRules: ['能力有代价', '每5集制造新变量'],
      powerOrWealthSystem: '时间倒流能力',
      forbiddenChanges: []
    },
    keyEvents: []
  },
  characters: [
    {
      id: 'c1',
      name: '林风',
      roleType: 'PROTAGONIST',
      personality: '冷静理性',
      motivation: '找到真相',
      description: '主角'
    }
  ],
  episodes: [],
  storyMemory: {
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
  }
};

const mockPacingContext = {
  actNumber: 1,
  act: 1,
  goal: '能力出现 + 试探',
  currentEpisode: 1,
  totalEpisodes: 10,
  progress: 0.1
};

/**
 * 测试用例 1: 无爽点测试
 * 构造平铺直叙内容，期望返回 FAIL + NO_HIGHLIGHT
 */
async function test1_NoHighlight() {
  console.log('\n========================================');
  console.log('测试用例 1: 无爽点测试');
  console.log('========================================\n');

  const testEpisode = {
    content: `
林风早上起床，刷牙洗脸，吃早餐。然后去上班，路上看到了一些风景。
到了公司，他开始工作，处理了一些文件。中午吃了个便当。
下午继续工作，下班后回家。晚饭后看电视，然后睡觉。
这就是他普通的一天，没有什么特别的事情发生。
`,
    hook: '林风发现了一个奇怪的现象，但这只是一个普通的观察。'
  };

  try {
    const result = await runAligner({
      project: mockProject,
      episode: testEpisode,
      pacingContext: mockPacingContext
    });

    console.log('Aligner 结果:');
    console.log('  passed:', result.passed);
    console.log('  severity:', result.severity);
    console.log('  issues:', result.issues);
    console.log('  editorNotes:', result.editorNotes);

    // 验证断言
    const hasNoHighlight = result.issues.some(i => i.code === 'NO_HIGHLIGHT');
    const expectedSeverity = result.severity === 'FAIL';

    console.log('\n验证结果:');
    console.log('  包含 NO_HIGHLIGHT:', hasNoHighlight ? '✓' : '✗');
    console.log('  严重性为 FAIL:', expectedSeverity ? '✓' : '✗');

    if (!result.passed && result.severity === 'FAIL' && hasNoHighlight) {
      console.log('\n✓ 测试通过\n');
      return true;
    } else {
      console.log('\n✗ 测试失败\n');
      return false;
    }
  } catch (error) {
    console.error('测试出错:', error);
    return false;
  }
}

/**
 * 测试用例 2: 轻微问题测试
 * 有推进但 Hook 弱，期望返回 WARN + WEAK_HOOK
 */
async function test2_WeakHook() {
  console.log('\n========================================');
  console.log('测试用例 2: 轻微问题测试');
  console.log('========================================\n');

  const testEpisode = {
    content: `
林风在咖啡厅遇到了老同学王强，两人聊起了过去的事情。
王强提到自己最近在做一个小生意，生意不错。
林风也分享了自己的近况，两人约定下次再聚。
这次重逢让林风想起了大学时光，感慨万千。
回到家后，林风翻看旧照片，回忆涌上心头。
`,
    hook: '两人约定下次再聚。'
  };

  try {
    const result = await runAligner({
      project: mockProject,
      episode: testEpisode,
      pacingContext: mockPacingContext
    });

    console.log('Aligner 结果:');
    console.log('  passed:', result.passed);
    console.log('  severity:', result.severity);
    console.log('  issues:', result.issues);
    console.log('  editorNotes:', result.editorNotes);

    // 验证断言
    const hasWeakHook = result.issues.some(i => i.code === 'WEAK_HOOK');
    const expectedSeverity = result.severity === 'WARN';

    console.log('\n验证结果:');
    console.log('  包含 WEAK_HOOK:', hasWeakHook ? '✓' : '✗');
    console.log('  严重性为 WARN:', expectedSeverity ? '✓' : '✗');

    if (result.severity === 'WARN' && hasWeakHook) {
      console.log('\n✓ 测试通过\n');
      return true;
    } else {
      console.log('\n✗ 测试失败\n');
      return false;
    }
  } catch (error) {
    console.error('测试出错:', error);
    return false;
  }
}

/**
 * 测试用例 3: 正常商业集测试
 * 有冲突、有推进、有 Hook，期望返回 PASS
 */
async function test3_NormalCommercial() {
  console.log('\n========================================');
  console.log('测试用例 3: 正常商业集测试');
  console.log('========================================\n');

  const testEpisode = {
    content: `
林风在咖啡厅偶遇了大学时的死对头张明。当年张明曾暗中陷害林风，导致他失去奖学金。
如今张明已经是一家大公司的高管，看到林风还在普通职位工作，露出了嘲讽的笑容。
"林风，这么多年了，你还是这个样子？"张明的话充满了轻蔑。

林风握紧了拳头，但他没有发作。他知道现在还不是时候。
突然，林风的手机响了，是一个神秘的来电。"林先生，我们查到了当年那件事的真相。"

林风深吸一口气，看着张明的眼睛，淡淡地说："张明，有些事情，永远不是表面看起来那样。"
说完，林风转身离开，留下张明一脸愕然。
`,
    hook: '神秘来电揭示了当年的真相，林风即将开启复仇之路。'
  };

  try {
    const result = await runAligner({
      project: mockProject,
      episode: testEpisode,
      pacingContext: mockPacingContext
    });

    console.log('Aligner 结果:');
    console.log('  passed:', result.passed);
    console.log('  severity:', result.severity);
    console.log('  issues:', result.issues);
    console.log('  editorNotes:', result.editorNotes);

    // 验证断言
    console.log('\n验证结果:');
    console.log('  严重性为 PASS:', result.severity === 'PASS' ? '✓' : '✗');

    if (result.passed && result.severity === 'PASS') {
      console.log('\n✓ 测试通过\n');
      return true;
    } else {
      console.log('\n✗ 测试失败\n');
      return false;
    }
  } catch (error) {
    console.error('测试出错:', error);
    return false;
  }
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  console.log('\n\n========================================');
  console.log('M4-2 Aligner 验收测试');
  console.log('========================================\n');

  const results = {
    test1: await test1_NoHighlight(),
    test2: await test2_WeakHook(),
    test3: await test3_NormalCommercial()
  };

  console.log('\n========================================');
  console.log('测试总结');
  console.log('========================================\n');
  console.log(`测试用例 1 (无爽点): ${results.test1 ? '✓ 通过' : '✗ 失败'}`);
  console.log(`测试用例 2 (轻微问题): ${results.test2 ? '✓ 通过' : '✗ 失败'}`);
  console.log(`测试用例 3 (正常商业集): ${results.test3 ? '✓ 通过' : '✗ 失败'}`);
  console.log('\n');

  const allPassed = results.test1 && results.test2 && results.test3;

  if (allPassed) {
    console.log('✓ 所有测试通过！\n');
  } else {
    console.log('✗ 部分测试失败，请检查\n');
  }

  return allPassed;
}

// 如果直接运行此文件
if (require.main === module) {
  runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('测试执行出错:', error);
      process.exit(1);
    });
}

export { runAllTests };





