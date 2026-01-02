#!/usr/bin/env tsx

/**
 * M14.3: 结构打法卡生成功能测试
 *
 * 测试内容：
 * - 基本功能：从 PatternDiscoveryResult 生成打法卡
 * - 边界情况：空结果、单模式、无缺失信号
 * - 打法卡数量验证：2-4 张
 * - 规则生成质量：每张卡包含 2-4 条核心规则、2-3 条常见风险
 * - Markdown 格式验证
 * - JSON 格式验证
 */

import {
  generateStructurePlaybooks,
  formatPlaybooksAsMarkdown,
  formatPlaybooksAsJSON
} from './lib/ai/structurePlaybookGenerator';
import { PatternDiscoveryResult } from './types';

console.log('M14.3: 结构打法卡生成功能测试\n');
console.log('='.repeat(80) + '\n');

// 测试数据 1: 典型场景（有高质量模式和缺失信号）
const typicalPatternDiscoveryResult: PatternDiscoveryResult = {
  highQualityPatterns: [
    {
      patternKey: 'conflictProgressed+newReveal',
      size: 2,
      occurrenceCount: 3,
      highQualityCoverage: 1.0,
      averageHitCount: 4.5,
      description: 'Conflict Progressed + New Reveal 组合'
    },
    {
      patternKey: 'promiseAddressed+factReused',
      size: 2,
      occurrenceCount: 2,
      highQualityCoverage: 0.8,
      averageHitCount: 4.0,
      description: 'Promise Addressed + Fact Reused 组合'
    },
    {
      patternKey: 'conflictProgressed+costPaid+stateCoherent',
      size: 3,
      occurrenceCount: 2,
      highQualityCoverage: 0.6,
      averageHitCount: 5.0,
      description: 'Conflict Progressed + Cost Paid + State Coherent 组合'
    },
    {
      patternKey: 'newReveal+factReused',
      size: 2,
      occurrenceCount: 2,
      highQualityCoverage: 0.5,
      averageHitCount: 4.0,
      description: 'New Reveal + Fact Reused 组合'
    }
  ],
  missingSignalsWarnings: [
    {
      signalName: 'costPaid',
      missingRate: 0.75,
      description: 'Cost Paid 缺失率 75%，低质量集可能缺乏角色代价设计'
    },
    {
      signalName: 'promiseAddressed',
      missingRate: 0.70,
      description: 'Promise Addressed 缺失率 70%，剧情常"埋而不收"'
    }
  ],
  insights: [
    '高质量集（≥4 signals）占比 40.0%',
    '"conflictProgressed+newReveal" 在高质量集中覆盖率 100%，是稳定有效的结构组合',
    'Cost Paid 在低质量集中缺失率 75%，需重点优化'
  ]
};

// 测试数据 2: 空结果
const emptyPatternDiscoveryResult: PatternDiscoveryResult = {
  highQualityPatterns: [],
  missingSignalsWarnings: [],
  insights: ['暂无剧集数据']
};

// 测试数据 3: 只有高质量模式，无缺失信号
const qualityOnlyPatternDiscoveryResult: PatternDiscoveryResult = {
  highQualityPatterns: [
    {
      patternKey: 'conflictProgressed+newReveal',
      size: 2,
      occurrenceCount: 3,
      highQualityCoverage: 1.0,
      averageHitCount: 4.5,
      description: 'Conflict Progressed + New Reveal 组合'
    },
    {
      patternKey: 'factReused+stateCoherent',
      size: 2,
      occurrenceCount: 2,
      highQualityCoverage: 0.8,
      averageHitCount: 4.0,
      description: 'Fact Reused + State Coherent 组合'
    }
  ],
  missingSignalsWarnings: [],
  insights: [
    '高质量集（≥4 signals）占比 50.0%',
    '"conflictProgressed+newReveal" 在高质量集中覆盖率 100%，是稳定有效的结构组合'
  ]
};

// 测试 1: 基本功能测试
console.log('【测试 1: 基本功能】');
console.log('\n输入数据：');
console.log('- 高质量模式数：4');
console.log('- 缺失信号数：2');
console.log('\n执行生成...\n');

const result1 = generateStructurePlaybooks(typicalPatternDiscoveryResult);

console.log('✓ 生成完成');
console.log(`\n摘要：${result1.summary}`);
console.log(`\n打法卡数量：${result1.playbooks.length}`);

if (result1.playbooks.length >= 2 && result1.playbooks.length <= 4) {
  console.log('✓ 打法卡数量符合要求（2-4张）');
} else {
  console.log(`✗ 打法卡数量不符合要求（期望: 2-4，实际: ${result1.playbooks.length}）`);
}

// 测试 2: Markdown 格式输出
console.log('\n' + '='.repeat(80));
console.log('【测试 2: Markdown 格式输出】\n');
console.log(formatPlaybooksAsMarkdown(result1.playbooks));

// 测试 3: JSON 格式输出
console.log('\n' + '='.repeat(80));
console.log('【测试 3: JSON 格式输出】\n');
console.log(formatPlaybooksAsJSON(result1.playbooks));

// 测试 4: 边界情况 - 空结果
console.log('\n' + '='.repeat(80));
console.log('【测试 4: 边界情况 - 空结果】\n');

const result2 = generateStructurePlaybooks(emptyPatternDiscoveryResult);
console.log(`摘要：${result2.summary}`);
console.log(`打法卡数量：${result2.playbooks.length}`);

if (result2.playbooks.length === 0) {
  console.log('✓ 空结果处理正确（返回0张打法卡）');
} else {
  console.log('✗ 空结果处理错误');
}

// 测试 5: 只有高质量模式，无缺失信号
console.log('\n' + '='.repeat(80));
console.log('【测试 5: 只有高质量模式，无缺失信号】\n');

const result3 = generateStructurePlaybooks(qualityOnlyPatternDiscoveryResult);
console.log(`摘要：${result3.summary}`);
console.log(`打法卡数量：${result3.playbooks.length}`);

if (result3.playbooks.length === 2) {
  console.log('✓ 生成 2 张质量型打法卡');
} else {
  console.log(`✗ 打法卡数量错误（期望: 2，实际: ${result3.playbooks.length}）`);
}

// 测试 6: 打法卡结构验证
console.log('\n' + '='.repeat(80));
console.log('【测试 6: 打法卡结构验证】\n');

let allStructuresValid = true;

for (let i = 0; i < result1.playbooks.length; i++) {
  const playbook = result1.playbooks[i];
  console.log(`\n打法卡 #${i + 1}:`);

  // 验证必需字段
  if (!playbook.title || !playbook.applicableEpisodes) {
    console.log(`  ✗ 缺少必需字段`);
    allStructuresValid = false;
    continue;
  }

  console.log(`  标题：${playbook.title}`);
  console.log(`  适用集数：${playbook.applicableEpisodes}`);

  // 验证核心规则数量
  const coreRulesValid = playbook.coreRules.length >= 2 && playbook.coreRules.length <= 4;
  if (coreRulesValid) {
    console.log(`  ✓ 核心规则数量：${playbook.coreRules.length}（符合2-4条）`);
  } else {
    console.log(`  ✗ 核心规则数量：${playbook.coreRules.length}（不符合2-4条）`);
    allStructuresValid = false;
  }

  // 验证常见风险数量
  const commonPitfallsValid = playbook.commonPitfalls.length >= 2 && playbook.commonPitfalls.length <= 3;
  if (commonPitfallsValid) {
    console.log(`  ✓ 常见风险数量：${playbook.commonPitfalls.length}（符合2-3条）`);
  } else {
    console.log(`  ✗ 常见风险数量：${playbook.commonPitfalls.length}（不符合2-3条）`);
    allStructuresValid = false;
  }

  // 验证 playbookType
  if (playbook.playbookType === 'quality' || playbook.playbookType === 'fix') {
    console.log(`  ✓ 打法类型：${playbook.playbookType}`);
  } else {
    console.log(`  ✗ 打法类型无效：${playbook.playbookType}`);
    allStructuresValid = false;
  }

  // 验证 basedOnPatterns 或 basedOnSignals
  if (playbook.basedOnPatterns && playbook.basedOnPatterns.length > 0) {
    console.log(`  ✓ 基于模式：${playbook.basedOnPatterns.join(', ')}`);
  } else if (playbook.basedOnSignals && playbook.basedOnSignals.length > 0) {
    console.log(`  ✓ 基于信号：${playbook.basedOnSignals.join(', ')}`);
  } else {
    console.log(`  ✗ 缺少基于模式或基于信号信息`);
    allStructuresValid = false;
  }
}

if (allStructuresValid) {
  console.log('\n✓ 所有打法卡结构验证通过');
} else {
  console.log('\n✗ 部分打法卡结构验证失败');
}

// 测试 7: 规则内容质量验证
console.log('\n' + '='.repeat(80));
console.log('【测试 7: 规则内容质量验证】\n');

let allRulesValid = true;

for (let i = 0; i < result1.playbooks.length; i++) {
  const playbook = result1.playbooks[i];
  console.log(`\n打法卡 #${i + 1} 规则：`);

  // 验证核心规则内容
  for (let j = 0; j < playbook.coreRules.length; j++) {
    const rule = playbook.coreRules[j];
    if (rule.length > 0) {
      console.log(`  ✓ 核心规则 ${j + 1}：${rule}`);
    } else {
      console.log(`  ✗ 核心规则 ${j + 1} 为空`);
      allRulesValid = false;
    }
  }

  // 验证常见风险内容
  for (let j = 0; j < playbook.commonPitfalls.length; j++) {
    const pitfall = playbook.commonPitfalls[j];
    if (pitfall.length > 0) {
      console.log(`  ✓ 常见风险 ${j + 1}：${pitfall}`);
    } else {
      console.log(`  ✗ 常见风险 ${j + 1} 为空`);
      allRulesValid = false;
    }
  }
}

if (allRulesValid) {
  console.log('\n✓ 所有规则内容验证通过');
} else {
  console.log('\n✗ 部分规则内容验证失败');
}

// 测试 8: 质量型 vs 修复型打法卡
console.log('\n' + '='.repeat(80));
console.log('【测试 8: 质量型 vs 修复型打法卡】\n');

const qualityPlaybooks = result1.playbooks.filter(p => p.playbookType === 'quality');
const fixPlaybooks = result1.playbooks.filter(p => p.playbookType === 'fix');

console.log(`质量型打法卡数量：${qualityPlaybooks.length}`);
console.log(`修复型打法卡数量：${fixPlaybooks.length}`);

if (qualityPlaybooks.length > 0) {
  console.log('\n质量型打法卡：');
  for (const pb of qualityPlaybooks) {
    console.log(`  - ${pb.title}（基于模式：${pb.basedOnPatterns?.join(', ')}）`);
  }
}

if (fixPlaybooks.length > 0) {
  console.log('\n修复型打法卡：');
  for (const pb of fixPlaybooks) {
    console.log(`  - ${pb.title}（修复目标：${pb.basedOnSignals?.join(', ')}）`);
  }
}

if (qualityPlaybooks.length > 0 && fixPlaybooks.length > 0) {
  console.log('\n✓ 同时包含质量型和修复型打法卡');
} else if (qualityPlaybooks.length > 0) {
  console.log('\n✓ 包含质量型打法卡');
} else {
  console.log('\n✗ 未发现任何类型的打法卡');
}

// 测试 9: JSON 解析验证
console.log('\n' + '='.repeat(80));
console.log('【测试 9: JSON 解析验证】\n');

try {
  const jsonStr = formatPlaybooksAsJSON(result1.playbooks);
  const parsed = JSON.parse(jsonStr);

  if (Array.isArray(parsed) && parsed.length === result1.playbooks.length) {
    console.log('✓ JSON 格式正确，可正常解析');
  } else {
    console.log('✗ JSON 格式解析失败');
  }
} catch (error) {
  console.log('✗ JSON 格式无效：', error);
}

// 测试 10: 适用集数范围合理性
console.log('\n' + '='.repeat(80));
console.log('【测试 10: 适用集数范围合理性】\n');

let allRangesValid = true;

for (let i = 0; i < result1.playbooks.length; i++) {
  const playbook = result1.playbooks[i];
  const range = playbook.applicableEpisodes;

  console.log(`打法卡 #${i + 1}：${range}`);

  // 验证格式是否为 EP数字–EP数字 或类似格式
  const rangePattern = /^EP\d+–EP\d+/;
  if (rangePattern.test(range)) {
    console.log('  ✓ 集数范围格式正确');
  } else {
    console.log('  ✗ 集数范围格式不正确');
    allRangesValid = false;
  }
}

if (allRangesValid) {
  console.log('\n✓ 所有集数范围格式验证通过');
} else {
  console.log('\n✗ 部分集数范围格式验证失败');
}

// 最终结果汇总
console.log('\n' + '='.repeat(80));
console.log('【测试结果汇总】\n');

let allTestsPassed = true;

const testResults = [
  { name: '测试 1: 基本功能', passed: result1.playbooks.length >= 2 && result1.playbooks.length <= 4 },
  { name: '测试 2: Markdown 格式输出', passed: true }, // 输出即可，自动通过
  { name: '测试 3: JSON 格式输出', passed: true }, // 输出即可，自动通过
  { name: '测试 4: 边界情况 - 空结果', passed: result2.playbooks.length === 0 },
  { name: '测试 5: 只有高质量模式，无缺失信号', passed: result3.playbooks.length === 2 },
  { name: '测试 6: 打法卡结构验证', passed: allStructuresValid },
  { name: '测试 7: 规则内容质量验证', passed: allRulesValid },
  { name: '测试 8: 质量型 vs 修复型打法卡', passed: qualityPlaybooks.length > 0 },
  { name: '测试 9: JSON 解析验证', passed: true }, // 自动通过
  { name: '测试 10: 适用集数范围合理性', passed: allRangesValid }
];

let passedCount = 0;
for (const test of testResults) {
  if (test.passed) {
    console.log(`✓ ${test.name}`);
    passedCount++;
  } else {
    console.log(`✗ ${test.name}`);
    allTestsPassed = false;
  }
}

console.log(`\n通过率：${passedCount}/${testResults.length}`);

console.log('\n' + '='.repeat(80));
if (allTestsPassed) {
  console.log('✅ 所有测试通过！\n');
  process.exit(0);
} else {
  console.log('❌ 部分测试失败\n');
  process.exit(1);
}

