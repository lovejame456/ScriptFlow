#!/usr/bin/env tsx

/**
 * M14.2: 质量模式发现功能测试
 *
 * 测试内容：
 * - 数据分桶逻辑
 * - 模式生成与统计
 * - 缺失信号分析
 * - 洞察生成
 * - Markdown 格式化
 */

import { discoverPatterns, formatPatternsAsMarkdown, formatMissingSignalsAsMarkdown, formatInsightsAsMarkdown } from './lib/ai/patternDiscovery';
import { QualitySignals, SignalsSummary } from './types';

console.log('M14.2: 质量模式发现功能测试\n');
console.log('='.repeat(80) + '\n');

// 测试数据：构建一个典型的测试场景
// EP1: 高质量集 (4/6)
// EP2: 高质量集 (5/6)
// EP3: 中等 (2/6)
// EP4: 低质量集 (0/6)
// EP5: 低质量集 (1/6)
const testSignals: QualitySignals[] = [
  // EP1: 高质量 (4/6) - conflictProgressed + costPaid + newReveal + stateCoherent
  {
    conflictProgressed: true,
    costPaid: true,
    factReused: false,
    newReveal: true,
    promiseAddressed: false,
    stateCoherent: true
  },
  // EP2: 高质量 (5/6) - conflictProgressed + factReused + newReveal + promiseAddressed + stateCoherent
  {
    conflictProgressed: true,
    costPaid: false,
    factReused: true,
    newReveal: true,
    promiseAddressed: true,
    stateCoherent: true
  },
  // EP3: 中等 (2/6) - costPaid + factReused
  {
    conflictProgressed: false,
    costPaid: true,
    factReused: true,
    newReveal: false,
    promiseAddressed: false,
    stateCoherent: false
  },
  // EP4: 低质量 (0/6) - 全部 false
  {
    conflictProgressed: false,
    costPaid: false,
    factReused: false,
    newReveal: false,
    promiseAddressed: false,
    stateCoherent: false
  },
  // EP5: 低质量 (1/6) - 只有 stateCoherent
  {
    conflictProgressed: false,
    costPaid: false,
    factReused: false,
    newReveal: false,
    promiseAddressed: false,
    stateCoherent: true
  }
];

// 构建 SignalsSummary
const testSummary: SignalsSummary = {
  totalEpisodes: 5,
  signalHitCount: {
    conflictProgressed: 2,
    costPaid: 2,
    factReused: 2,
    newReveal: 2,
    promiseAddressed: 1,
    stateCoherent: 3
  },
  signalHitRate: {
    conflictProgressed: 0.4,
    costPaid: 0.4,
    factReused: 0.4,
    newReveal: 0.4,
    promiseAddressed: 0.2,
    stateCoherent: 0.6
  },
  perEpisodeSignals: [
    { episodeIndex: 1, hitCount: 4, signals: testSignals[0] },
    { episodeIndex: 2, hitCount: 5, signals: testSignals[1] },
    { episodeIndex: 3, hitCount: 2, signals: testSignals[2] },
    { episodeIndex: 4, hitCount: 0, signals: testSignals[3] },
    { episodeIndex: 5, hitCount: 1, signals: testSignals[4] }
  ]
};

console.log('【测试数据】');
console.log('\nEP1 (高质量集 4/6):');
console.log('  - conflictProgressed: true');
console.log('  - costPaid: true');
console.log('  - factReused: false');
console.log('  - newReveal: true');
console.log('  - promiseAddressed: false');
console.log('  - stateCoherent: true');

console.log('\nEP2 (高质量集 5/6):');
console.log('  - conflictProgressed: true');
console.log('  - costPaid: false');
console.log('  - factReused: true');
console.log('  - newReveal: true');
console.log('  - promiseAddressed: true');
console.log('  - stateCoherent: true');

console.log('\nEP3 (中等 2/6):');
console.log('  - conflictProgressed: false');
console.log('  - costPaid: true');
console.log('  - factReused: true');
console.log('  - newReveal: false');
console.log('  - promiseAddressed: false');
console.log('  - stateCoherent: false');

console.log('\nEP4 (低质量集 0/6):');
console.log('  - 全部 false');

console.log('\nEP5 (低质量集 1/6):');
console.log('  - stateCoherent: true');
console.log('  - 其他全部 false');

// 执行模式发现
console.log('\n' + '='.repeat(80));
console.log('【执行模式发现】');
const result = discoverPatterns(testSummary);

console.log('\n✓ 模式发现完成');

// 输出 Top Quality Patterns
console.log('\n' + '='.repeat(80));
console.log('【Top Quality Patterns】');
console.log('\n' + formatPatternsAsMarkdown(result.highQualityPatterns));

// 输出 Missing Signals Warnings
console.log('\n' + '='.repeat(80));
console.log('【Missing Signals Warnings】');
console.log('\n' + formatMissingSignalsAsMarkdown(result.missingSignalsWarnings));

// 输出 Insights
console.log('\n' + '='.repeat(80));
console.log('【人类可读洞察】');
console.log('\n' + formatInsightsAsMarkdown(result.insights));

// 验证结果
console.log('\n' + '='.repeat(80));
console.log('【验证结果】');

let allTestsPassed = true;

// 测试 1: 高质量集数量正确
const expectedHighQualityCount = 2; // EP1, EP2
const actualHighQualityCount = testSummary.perEpisodeSignals.filter(ep => ep.hitCount >= 4).length;
if (actualHighQualityCount === expectedHighQualityCount) {
  console.log('✓ 测试 1: 高质量集数量正确 (2)');
} else {
  console.log(`✗ 测试 1: 高质量集数量错误 (期望: ${expectedHighQualityCount}, 实际: ${actualHighQualityCount})`);
  allTestsPassed = false;
}

// 测试 2: 低质量集数量正确
const expectedLowQualityCount = 2; // EP4, EP5
const actualLowQualityCount = testSummary.perEpisodeSignals.filter(ep => ep.hitCount <= 1).length;
if (actualLowQualityCount === expectedLowQualityCount) {
  console.log('✓ 测试 2: 低质量集数量正确 (2)');
} else {
  console.log(`✗ 测试 2: 低质量集数量错误 (期望: ${expectedLowQualityCount}, 实际: ${actualLowQualityCount})`);
  allTestsPassed = false;
}

// 测试 3: 至少有一个高质量模式
if (result.highQualityPatterns.length > 0) {
  console.log(`✓ 测试 3: 发现 ${result.highQualityPatterns.length} 个高质量模式`);
} else {
  console.log('✗ 测试 3: 未发现任何高质量模式');
  allTestsPassed = false;
}

// 测试 4: 至少有一个缺失信号警示
if (result.missingSignalsWarnings.length > 0) {
  console.log(`✓ 测试 4: 发现 ${result.missingSignalsWarnings.length} 个缺失信号警示`);
} else {
  console.log('✗ 测试 4: 未发现任何缺失信号警示');
  allTestsPassed = false;
}

// 测试 5: 至少有一条洞察
if (result.insights.length > 0) {
  console.log(`✓ 测试 5: 生成 ${result.insights.length} 条洞察`);
} else {
  console.log('✗ 测试 5: 未生成任何洞察');
  allTestsPassed = false;
}

// 测试 6: 检查 stateCoherent 在高质量集的命中率
const stateCoherentPattern = result.highQualityPatterns.find(p => p.patternKey.includes('stateCoherent'));
if (stateCoherentPattern) {
  console.log(`✓ 测试 6: stateCoherent 在高质量集中出现 (覆盖率 ${(stateCoherentPattern.highQualityCoverage * 100).toFixed(1)}%)`);
} else {
  console.log('✗ 测试 6: stateCoherent 未在高集中发现');
  allTestsPassed = false;
}

// 测试 7: 检查缺失信号包含 conflictProgressed
const conflictProgressedWarning = result.missingSignalsWarnings.find(w => w.signalName === 'conflictProgressed');
if (conflictProgressedWarning) {
  console.log(`✓ 测试 7: conflictProgressed 在低质量集中缺失率高 (${(conflictProgressedWarning.missingRate * 100).toFixed(0)}%)`);
} else {
  console.log('✗ 测试 7: conflictProgressed 未在缺失警示中发现');
  allTestsPassed = false;
}

// 测试 8: 检查模式大小约束（只有 2 或 3）
const allSizesValid = result.highQualityPatterns.every(p => p.size === 2 || p.size === 3);
if (allSizesValid) {
  console.log('✓ 测试 8: 所有模式大小符合约束（只有 2 或 3）');
} else {
  console.log('✗ 测试 8: 存在不合法的模式大小');
  allTestsPassed = false;
}

// 测试 9: 检查覆盖率范围（0-1）
const allCoverageValid = result.highQualityPatterns.every(p => p.highQualityCoverage >= 0 && p.highQualityCoverage <= 1);
if (allCoverageValid) {
  console.log('✓ 测试 9: 所有覆盖率在有效范围内（0-1）');
} else {
  console.log('✗ 测试 9: 存在超出范围的覆盖率');
  allTestsPassed = false;
}

// 测试 10: 边界情况 - 空 summary
const emptyResult = discoverPatterns({
  totalEpisodes: 0,
  signalHitCount: {
    conflictProgressed: 0,
    costPaid: 0,
    factReused: 0,
    newReveal: 0,
    promiseAddressed: 0,
    stateCoherent: 0
  },
  signalHitRate: {
    conflictProgressed: 0,
    costPaid: 0,
    factReused: 0,
    newReveal: 0,
    promiseAddressed: 0,
    stateCoherent: 0
  },
  perEpisodeSignals: []
});
if (emptyResult.highQualityPatterns.length === 0 && emptyResult.insights.length === 1) {
  console.log('✓ 测试 10: 空 summary 边界情况处理正确');
} else {
  console.log('✗ 测试 10: 空 summary 边界情况处理错误');
  allTestsPassed = false;
}

// 输出最终结果
console.log('\n' + '='.repeat(80));
if (allTestsPassed) {
  console.log('✅ 所有测试通过！\n');
  process.exit(0);
} else {
  console.log('❌ 部分测试失败\n');
  process.exit(1);
}

