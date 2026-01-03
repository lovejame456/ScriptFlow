/**
 * S0 Sprint：验证修复效果（单元测试）
 *
 * 目标：验证 validateRevealAgainstBinding 已经移除关键词匹配
 *
 * 测试场景：
 * 1. 不含关键词的 summary 应该通过验证
 * 2. 长度 >= 10 的 summary 应该通过验证
 * 3. 空或过短的 summary 应该失败
 */

import { validateRevealAgainstBinding, AntagonistPressureBinding } from '../lib/ai/antagonistBinder';

interface TestCase {
  name: string;
  summary: string;
  pressure: 'POWER' | 'RESOURCE' | 'RELATION' | 'LIFE_THREAT' | 'STATUS';
  expected: boolean;
  reason: string;
}

/**
 * 运行 S0 验证测试
 */
function runS0ValidationTest() {
  console.log('='.repeat(80));
  console.log('S0 Sprint：验证修复效果（单元测试）');
  console.log('='.repeat(80));

  const testCases: TestCase[] = [
    {
      name: '测试 1: 不含关键词的语义 Reveal（应该通过）',
      summary: '主角发现了一个改变局势的关键信息，让他重新审视自己的处境',
      pressure: 'POWER',
      expected: true,
      reason: 'PM NOTE (S0): 移除关键词匹配，允许自然语义表达'
    },
    {
      name: '测试 2: 含关键词的 Reveal（应该通过）',
      summary: '主角的实力大幅提升，压制了反派的嚣张气焰',
      pressure: 'POWER',
      expected: true,
      reason: '包含关键词，长度充足'
    },
    {
      name: '测试 3: 不含关键词但有语义的 Reveal（应该通过）',
      summary: '资源重新分配，改变了各方势力的平衡',
      pressure: 'RESOURCE',
      expected: true,
      reason: 'PM NOTE (S0): 语义表达即可，不需要包含特定词汇'
    },
    {
      name: '测试 4: 空字符串（应该失败）',
      summary: '',
      pressure: 'POWER',
      expected: false,
      reason: '空 summary 不允许'
    },
    {
      name: '测试 5: 过短的 summary（应该失败）',
      summary: '主角',
      pressure: 'RELATION',
      expected: false,
      reason: '长度 < 10 字符'
    },
    {
      name: '测试 6: 11 字符的最小长度（应该通过）',
      summary: '主角终于发现了真相啊',
      pressure: 'RELATION',
      expected: true,
      reason: '满足最小长度要求（11 字符）'
    },
    {
      name: '测试 7: 不含 "威胁" 关键词的语义 Reveal（应该通过）',
      summary: '反派设下了一个致命陷阱，主角危在旦夕',
      pressure: 'LIFE_THREAT',
      expected: true,
      reason: 'PM NOTE (S0): 语义表达压力，不需要包含特定词汇'
    }
  ];

  let passedCount = 0;
  let failedCount = 0;
  const results: Array<{ testCase: TestCase; actual: boolean; passed: boolean }> = [];

  // 执行所有测试用例
  for (const testCase of testCases) {
    console.log(`\n--- ${testCase.name} ---`);

    const binding: AntagonistPressureBinding = {
      pressure: testCase.pressure,
      hint: '测试提示'
    };

    const result = validateRevealAgainstBinding(testCase.summary, binding);
    const passed = result.valid === testCase.expected;

    console.log(`  Summary: "${testCase.summary}"`);
    console.log(`  Pressure: ${testCase.pressure}`);
    console.log(`  Expected: ${testCase.expected ? 'PASS' : 'FAIL'}`);
    console.log(`  Actual: ${result.valid ? 'PASS' : 'FAIL'}`);
    console.log(`  Reason: ${testCase.reason}`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }

    if (passed) {
      console.log(`  ✓ 测试通过`);
      passedCount++;
    } else {
      console.log(`  [X] 测试失败`);
      failedCount++;
    }

    results.push({ testCase, actual: result.valid, passed });
  }

  // 生成测试报告
  console.log('\n' + '='.repeat(80));
  console.log('测试报告');
  console.log('='.repeat(80));
  console.log(`总测试数: ${testCases.length}`);
  console.log(`通过: ${passedCount} (${(passedCount / testCases.length * 100).toFixed(1)}%)`);
  console.log(`失败: ${failedCount} (${(failedCount / testCases.length * 100).toFixed(1)}%)`);

  console.log('\n详细结果:');
  for (const result of results) {
    const status = result.passed ? '✓' : '[X]';
    console.log(`  ${status} ${result.testCase.name}`);
  }

  // 判定测试结果
  console.log('\n' + '='.repeat(80));
  console.log('测试结果判定');
  console.log('='.repeat(80));

  const allPassed = failedCount === 0;

  if (allPassed) {
    console.log('\n✓ S0 Sprint 修复验证成功！');
    console.log('  - validateRevealAgainstBinding 已移除关键词匹配');
    console.log('  - 改为语义验证（长度 >= 10 字符）');
    console.log('  - 允许 AI 使用自然语义表达压力');
    console.log('\n系统结构一致性已修复，可以进入实际生成测试。');
  } else {
    console.log('\n[X] S0 Sprint 修复验证失败');
    console.log(`  - ${failedCount} 个测试用例未通过`);
    console.log('\n需要检查修改是否正确实施。');
  }

  console.log('='.repeat(80));

  return allPassed ? 0 : 1;
}

// 运行测试
process.exit(runS0ValidationTest());

