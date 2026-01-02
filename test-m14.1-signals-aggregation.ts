#!/usr/bin/env tsx

/**
 * M14.1: 质量信号聚合功能测试
 *
 * 测试内容：
 * - 信号聚合逻辑
 * - 趋势洞察生成
 * - Markdown 报告生成
 */

import { aggregateSignals, generateSignalsInsights, EpisodeSignalsResult } from './lib/ai/signalsAggregator';
import { QualitySignals } from './types';

console.log('M14.1: 质量信号聚合功能测试\n');
console.log('='.repeat(80) + '\n');

// 测试数据：3 集的模拟质量信号
const testEpisodeResults: EpisodeSignalsResult[] = [
  {
    episodeIndex: 1,
    qualitySignals: {
      conflictProgressed: true,
      costPaid: true,
      factReused: false,
      newReveal: true,
      promiseAddressed: false,
      stateCoherent: true
    }
  },
  {
    episodeIndex: 2,
    qualitySignals: {
      conflictProgressed: true,
      costPaid: false,
      factReused: true,
      newReveal: true,
      promiseAddressed: false,
      stateCoherent: true
    }
  },
  {
    episodeIndex: 3,
    qualitySignals: {
      conflictProgressed: false,
      costPaid: true,
      factReused: true,
      newReveal: false,
      promiseAddressed: true,
      stateCoherent: true
    }
  }
];

console.log('【测试数据】');
for (const ep of testEpisodeResults) {
  console.log(`\nEP${ep.episodeIndex}:`);
  if (ep.qualitySignals) {
    console.log(`  - conflictProgressed: ${ep.qualitySignals.conflictProgressed}`);
    console.log(`  - costPaid: ${ep.qualitySignals.costPaid}`);
    console.log(`  - factReused: ${ep.qualitySignals.factReused}`);
    console.log(`  - newReveal: ${ep.qualitySignals.newReveal}`);
    console.log(`  - promiseAddressed: ${ep.qualitySignals.promiseAddressed}`);
    console.log(`  - stateCoherent: ${ep.qualitySignals.stateCoherent}`);
  }
}

// 执行聚合
console.log('\n' + '='.repeat(80));
console.log('【执行聚合】');
const summary = aggregateSignals(testEpisodeResults);

console.log('\n✓ 聚合完成');
console.log(`\n总集数: ${summary.totalEpisodes}`);
console.log('\n命中次数:');
console.log(`  - conflictProgressed: ${summary.signalHitCount.conflictProgressed}`);
console.log(`  - costPaid: ${summary.signalHitCount.costPaid}`);
console.log(`  - factReused: ${summary.signalHitCount.factReused}`);
console.log(`  - newReveal: ${summary.signalHitCount.newReveal}`);
console.log(`  - promiseAddressed: ${summary.signalHitCount.promiseAddressed}`);
console.log(`  - stateCoherent: ${summary.signalHitCount.stateCoherent}`);

console.log('\n命中率:');
console.log(`  - conflictProgressed: ${(summary.signalHitRate.conflictProgressed * 100).toFixed(1)}%`);
console.log(`  - costPaid: ${(summary.signalHitRate.costPaid * 100).toFixed(1)}%`);
console.log(`  - factReused: ${(summary.signalHitRate.factReused * 100).toFixed(1)}%`);
console.log(`  - newReveal: ${(summary.signalHitRate.newReveal * 100).toFixed(1)}%`);
console.log(`  - promiseAddressed: ${(summary.signalHitRate.promiseAddressed * 100).toFixed(1)}%`);
console.log(`  - stateCoherent: ${(summary.signalHitRate.stateCoherent * 100).toFixed(1)}%`);

console.log('\n每集命中数:');
for (const epSignals of summary.perEpisodeSignals) {
  console.log(`  - EP${epSignals.episodeIndex}: ${epSignals.hitCount}/6`);
}

// 生成洞察
console.log('\n' + '='.repeat(80));
console.log('【趋势洞察】');
const insights = generateSignalsInsights(summary);
console.log('');
for (const insight of insights) {
  console.log(`- ${insight}`);
}

// 验证结果
console.log('\n' + '='.repeat(80));
console.log('【验证结果】');

let allTestsPassed = true;

// 测试 1: 总集数正确
if (summary.totalEpisodes === 3) {
  console.log('✓ 测试 1: 总集数正确 (3)');
} else {
  console.log(`✗ 测试 1: 总集数错误 (期望: 3, 实际: ${summary.totalEpisodes})`);
  allTestsPassed = false;
}

// 测试 2: 命中次数正确
if (summary.signalHitCount.conflictProgressed === 2 &&
    summary.signalHitCount.costPaid === 2 &&
    summary.signalHitCount.factReused === 2 &&
    summary.signalHitCount.newReveal === 2 &&
    summary.signalHitCount.promiseAddressed === 1 &&
    summary.signalHitCount.stateCoherent === 3) {
  console.log('✓ 测试 2: 命中次数正确');
} else {
  console.log('✗ 测试 2: 命中次数错误');
  allTestsPassed = false;
}

// 测试 3: 命中率正确
if (Math.abs(summary.signalHitRate.conflictProgressed - 2/3) < 0.001 &&
    Math.abs(summary.signalHitRate.costPaid - 2/3) < 0.001 &&
    Math.abs(summary.signalHitRate.factReused - 2/3) < 0.001 &&
    Math.abs(summary.signalHitRate.newReveal - 2/3) < 0.001 &&
    Math.abs(summary.signalHitRate.promiseAddressed - 1/3) < 0.001 &&
    Math.abs(summary.signalHitRate.stateCoherent - 1) < 0.001) {
  console.log('✓ 测试 3: 命中率正确');
} else {
  console.log('✗ 测试 3: 命中率错误');
  allTestsPassed = false;
}

// 测试 4: 每集命中数正确
const expectedHitCounts = [4, 4, 4];
let hitCountsCorrect = true;
for (let i = 0; i < summary.perEpisodeSignals.length; i++) {
  if (summary.perEpisodeSignals[i].hitCount !== expectedHitCounts[i]) {
    hitCountsCorrect = false;
    break;
  }
}
if (hitCountsCorrect) {
  console.log('✓ 测试 4: 每集命中数正确');
} else {
  console.log('✗ 测试 4: 每集命中数错误');
  allTestsPassed = false;
}

// 测试 5: 趋势洞察生成正确
if (insights.length > 0) {
  console.log('✓ 测试 5: 趋势洞察生成正确');
} else {
  console.log('✗ 测试 5: 趋势洞察未生成');
  allTestsPassed = false;
}

// 测试 6: 边界情况 - 空数组
const emptySummary = aggregateSignals([]);
if (emptySummary.totalEpisodes === 0 && emptySummary.signalHitCount.conflictProgressed === 0) {
  console.log('✓ 测试 6: 空数组边界情况处理正确');
} else {
  console.log('✗ 测试 6: 空数组边界情况处理错误');
  allTestsPassed = false;
}

// 测试 7: 边界情况 - 缺失 qualitySignals
const missingSignalsResults: EpisodeSignalsResult[] = [
  { episodeIndex: 1 }, // 没有 qualitySignals
  { episodeIndex: 2, qualitySignals: { conflictProgressed: true, costPaid: false, factReused: false, newReveal: false, promiseAddressed: false, stateCoherent: true } }
];
const missingSignalsSummary = aggregateSignals(missingSignalsResults);
if (missingSignalsSummary.totalEpisodes === 2 &&
    missingSignalsSummary.perEpisodeSignals[0].hitCount === 0 &&
    missingSignalsSummary.perEpisodeSignals[1].hitCount === 2) {
  console.log('✓ 测试 7: 缺失 qualitySignals 边界情况处理正确');
} else {
  console.log('✗ 测试 7: 缺失 qualitySignals 边界情况处理错误');
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


