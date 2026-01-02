/**
 * 简单测试：验证伤情矛盾检测逻辑
 */

interface EpisodeFacts {
  events: string[];
  reveals: string[];
  items: string[];
  injuries: string[];
  promises: string[];
}

interface EpisodeFactsRecord {
  episodeIndex: number;
  facts: EpisodeFacts;
}

function validateEpisodeFacts({
  currentFacts,
  previousFactsList,
  episodeIndex
}: {
  currentFacts: EpisodeFacts | undefined;
  previousFactsList: EpisodeFactsRecord[];
  episodeIndex: number;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!currentFacts) {
    return { valid: true, errors: [] };
  }

  // 与上集 facts 的一致性校验（仅当 episodeIndex > 1）
  if (episodeIndex > 1 && previousFactsList.length > 0) {
    const immediatePrevFacts = previousFactsList
      .filter(r => r.episodeIndex >= episodeIndex - 2)  // 检查最近 2 集
      .map(r => r.facts);

    for (const prevFacts of immediatePrevFacts) {
      // 2.1 角色受伤状态矛盾检测
      if (prevFacts.injuries.length > 0) {
        for (const injury of prevFacts.injuries) {
          // 提取角色名（假设格式为"角色名 伤情描述"）
          const charName = injury.split(' ')[0];
          if (!charName) continue;

          const currentInjuries = currentFacts.injuries.filter(inj => inj.includes(charName));

          // 检查 events 中是否有矛盾的"完好""健康""痊愈"等描述
          const hasHealthyStateInEvents = currentFacts.events.some(e =>
            e.includes('完好') || e.includes('健康') || e.includes('痊愈') || e.includes('无伤')
          );

          // 如果上集有伤情，本集既未提及伤情（injuries 中没有该角色），又在 events 中说状态完好，则矛盾
          if (hasHealthyStateInEvents && currentInjuries.length === 0) {
            errors.push(`角色 ${charName} 伤情矛盾：上集${injury}，本集状态完好`);
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// 测试用例
const testCases = [
  {
    name: '测试 1: 伤情矛盾检测',
    prevFacts: {
      episodeIndex: 1,
      facts: {
        events: ['主角在雨夜与反派发生第一次正面冲突'],
        reveals: [],
        items: [],
        injuries: ['主角右臂被划伤，重伤'],
        promises: []
      }
    },
    currentFacts: {
      events: ['主角身体健康，状态完好'],
      reveals: [],
      items: [],
      injuries: [],
      promises: []
    },
    expectValid: false,
    expectErrorContains: '伤情矛盾'
  },
  {
    name: '测试 2: 伤情一致（正常）',
    prevFacts: {
      episodeIndex: 1,
      facts: {
        events: ['主角在雨夜与反派发生第一次正面冲突'],
        reveals: [],
        items: [],
        injuries: ['主角右臂被划伤，轻伤'],
        promises: []
      }
    },
    currentFacts: {
      events: ['主角使用神秘手机查询父亲信息'],
      reveals: [],
      items: ['使用神秘手机'],
      injuries: ['主角右臂伤势未愈'],
      promises: []
    },
    expectValid: true,
    expectErrorContains: null
  }
];

console.log('========== 伤情矛盾检测测试 ==========\n');

let allPass = true;

for (const testCase of testCases) {
  console.log(`【${testCase.name}】`);
  console.log('  上集 facts:', JSON.stringify(testCase.prevFacts.facts.injuries));
  console.log('  本集 facts:', JSON.stringify({
    events: testCase.currentFacts.events,
    injuries: testCase.currentFacts.injuries
  }));

  const result = validateEpisodeFacts({
    currentFacts: testCase.currentFacts,
    previousFactsList: [testCase.prevFacts],
    episodeIndex: 2
  });

  console.log('  校验结果:', result);

  const pass = result.valid === testCase.expectValid;
  if (!pass) {
    console.error(`  ✗ 失败: 期望 ${testCase.expectValid ? '有效' : '无效'}，实际 ${result.valid ? '有效' : '无效'}`);
    allPass = false;
  } else {
    console.log(`  ✓ 通过: 结果符合预期`);
  }

  if (testCase.expectErrorContains && result.errors.some(e => e.includes(testCase.expectErrorContains))) {
    console.log(`  ✓ 正确检测到错误: "${testCase.expectErrorContains}"`);
  } else if (testCase.expectErrorContains) {
    console.error(`  ✗ 未检测到预期的错误: "${testCase.expectErrorContains}"`);
    allPass = false;
  }

  console.log('');
}

console.log('========== 测试总结 ==========');
console.log(`总体结果: ${allPass ? '所有测试通过 ✓' : '部分测试失败 ✗'}`);

if (allPass) {
  console.log('\n✓ 伤情矛盾检测逻辑验证通过');
} else {
  console.log('\n✗ 伤情矛盾检测逻辑需要修复');
  process.exit(1);
}

