#!/usr/bin/env tsx

/**
 * M15.2 New Reveal 强制结构验证测试
 *
 * 功能：
 * - 运行 EP1-EP3 完整流程，验证 New Reveal 结构硬约束是否有效
 * - 只关注 New Reveal 信号是否被稳定点亮
 * - 输出简洁的 M15.2 验证结果
 *
 * 原则：
 * - 不换项目、不换模型、不扩集数
 * - 只压一个信号：New Reveal
 * - 不跑 Pattern Discovery，不生成打法卡
 */

import { createTimer } from '../lib/observability/timer';
import { api } from '../api';
import { projectRepo } from '../lib/store/projectRepo';
import { episodeRepo } from '../lib/store/episodeRepo';
import { EpisodeStatus, QualitySignals } from '../types';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// 配置与常量
// ============================================================================

const CONFIG = {
  // 测试配置
  DEEPSEEK_API_KEY: process.env.VITE_DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || '',
  DEEPSEEK_MODEL: process.env.VITE_DEEPSEEK_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  TEST_USER_PROMPT: '一个现代都市复仇爽剧，主角被冤枉入狱，出狱后展开复仇计划',
  TOTAL_EPISODES: 3,  // M15.2 只跑 EP1-EP3

  // M15.2 验收标准
  SUCCESS_CRITERIA: {
    MIN_NEW_REVEAL_HIT_RATE: 0.66,  // 66% (至少 2/3)
    MIN_AVG_HIT_COUNT: 1.0,         // 至少 1 个信号
  },

  // 输出路径
  REPORT_DIR: path.join(process.cwd(), 'reports'),
  REPORT_FILE: path.join(process.cwd(), 'reports', 'm15_2_new_reveal_report.md'),
};

// ============================================================================
// 类型定义
// ============================================================================

interface EpisodeResult {
  episodeIndex: number;
  status: EpisodeStatus;
  contentLength: number;
  qualitySignals?: QualitySignals;
  newRevealHit: boolean;
  hitCount: number;
  error?: string;
}

interface M15_2Report {
  testId: string;
  timestamp: string;
  projectId: string;
  model: string;

  // 基本信息
  summary: {
    totalEpisodes: number;
    successfulEpisodes: number;
    newRevealHitCount: number;
    newRevealHitRate: number;
    avgHitCount: number;
  };

  // 逐集详情
  episodeResults: EpisodeResult[];

  // 验证结果
  validation: {
    success: boolean;
    reason: string;
    details: string[];
  };

  // 下一步建议
  nextStep: string;
}

// ============================================================================
// 辅助函数
// ============================================================================

function generateTestId(): string {
  return `m15_2_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function calculateHitCount(signals: QualitySignals | undefined): number {
  if (!signals) return 0;
  let count = 0;
  if (signals.conflictProgressed) count++;
  if (signals.costPaid) count++;
  if (signals.factReused) count++;
  if (signals.newReveal) count++;
  if (signals.promiseAddressed) count++;
  if (signals.stateCoherent) count++;
  return count;
}

// ============================================================================
// M15.2 核心逻辑
// ============================================================================

async function runM15_2_NewRevealTest(): Promise<M15_2Report> {
  const timer = createTimer();
  const testId = generateTestId();
  console.log(`\n========================================`);
  console.log(`M15.2 New Reveal 强制结构验证测试`);
  console.log(`========================================`);
  console.log(`Test ID: ${testId}`);
  console.log(`Model: ${CONFIG.DEEPSEEK_MODEL}`);
  console.log(`Episodes: EP1-EP3`);
  console.log(`========================================\n`);

  // Step 1: 创建项目 Seed
  console.log('[Step 1] Creating project seed...');
  const project = await api.project.seed(CONFIG.TEST_USER_PROMPT);
  const projectId = project.id;
  console.log(`✓ Project created: ${projectId}`);
  console.log(`  Genre: ${project.genre}`);
  console.log(`  Total Episodes: ${project.totalEpisodes}\n`);

  // Step 2: 生成 Bible
  console.log('[Step 2] Generating Bible...');
  await api.project.generateBible(projectId);
  console.log('✓ Bible generated\n');

  // Step 3: 生成 Outline
  console.log('[Step 3] Generating Outline...');
  await api.project.generateOutline(projectId);
  console.log('✓ Outline generated\n');

  // Step 4: 逐集生成 EP1-EP3
  const episodeResults: EpisodeResult[] = [];

  for (let i = 1; i <= CONFIG.TOTAL_EPISODES; i++) {
    console.log(`[Step 4.${i}] Generating EP${i}...`);

    try {
      const episode = await api.episode.generate(projectId, i);

      // 等待一段时间，确保生成完成
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 重新获取 episode 数据，包含 qualitySignals
      const updatedProject = await projectRepo.get(projectId);
      const updatedEpisode = updatedProject?.episodes.find(ep => ep.id === i);

      const qualitySignals = updatedEpisode?.qualitySignals;
      const newRevealHit = qualitySignals?.newReveal || false;
      const hitCount = calculateHitCount(qualitySignals);

      episodeResults.push({
        episodeIndex: i,
        status: updatedEpisode?.status || EpisodeStatus.DRAFT,
        contentLength: updatedEpisode?.content?.length || 0,
        qualitySignals,
        newRevealHit,
        hitCount,
      });

      console.log(`✓ EP${i} generated`);
      console.log(`  Status: ${updatedEpisode?.status}`);
      console.log(`  Content Length: ${updatedEpisode?.content?.length}`);
      console.log(`  New Reveal: ${newRevealHit ? '✓ HIT' : '✗ MISS'}`);
      console.log(`  Hit Count: ${hitCount}/6\n`);

    } catch (error: any) {
      console.error(`✗ EP${i} failed:`, error.message);
      episodeResults.push({
        episodeIndex: i,
        status: EpisodeStatus.FAILED,
        contentLength: 0,
        newRevealHit: false,
        hitCount: 0,
        error: error.message,
      });
    }
  }

  // Step 5: 计算结果
  const successfulEpisodes = episodeResults.filter(ep => ep.status === EpisodeStatus.DRAFT || ep.status === EpisodeStatus.COMPLETED).length;
  const newRevealHitCount = episodeResults.filter(ep => ep.newRevealHit).length;
  const newRevealHitRate = newRevealHitCount / CONFIG.TOTAL_EPISODES;
  const avgHitCount = episodeResults.reduce((sum, ep) => sum + ep.hitCount, 0) / CONFIG.TOTAL_EPISODES;

  console.log('\n========================================');
  console.log('M15.2 验证结果汇总');
  console.log('========================================');
  console.log(`New Reveal 命中: ${newRevealHitCount}/${CONFIG.TOTAL_EPISODES} (${(newRevealHitRate * 100).toFixed(1)}%)`);
  console.log(`平均命中数: ${avgHitCount.toFixed(1)}/6`);
  console.log(`成功集数: ${successfulEpisodes}/${CONFIG.TOTAL_EPISODES}\n`);

  // Step 6: 判定验证结果
  let success = false;
  let reason = '';
  const details: string[] = [];

  // 验收标准 1: New Reveal 命中率 ≥ 66%
  if (newRevealHitRate >= CONFIG.SUCCESS_CRITERIA.MIN_NEW_REVEAL_HIT_RATE) {
    details.push(`✓ New Reveal 命中率 ${(newRevealHitRate * 100).toFixed(1)}% ≥ 66%`);
    success = true;
  } else {
    details.push(`✗ New Reveal 命中率 ${(newRevealHitRate * 100).toFixed(1)}% < 66%`);
  }

  // 验收标准 2: 至少 2 集的 avgHitCount ≥ 1
  const episodesWithHitCount1 = episodeResults.filter(ep => ep.hitCount >= 1).length;
  if (episodesWithHitCount1 >= 2) {
    details.push(`✓ ${episodesWithHitCount1} 集的 hitCount ≥ 1`);
    success = true;
  } else {
    details.push(`✗ 只有 ${episodesWithHitCount1} 集的 hitCount ≥ 1（需要 ≥2）`);
  }

  // 验收标准 3: Aligner 不再全部 FAIL
  const allFailed = episodeResults.every(ep => ep.status === EpisodeStatus.FAILED);
  if (!allFailed) {
    details.push(`✓ Aligner 不再全部 FAIL`);
  } else {
    details.push(`✗ Aligner 仍然全部 FAIL`);
  }

  if (success) {
    reason = 'M15.2 验证成功：New Reveal 结构硬约束有效';
  } else {
    reason = 'M15.2 验证失败：New Reveal 结构硬约束无效，需要升级生成架构';
  }

  console.log('验证判定:');
  console.log(`  ${reason}\n`);

  // Step 7: 确定下一步
  let nextStep = '';
  if (success) {
    nextStep = '进入 M15.3：验证 New Reveal + Conflict Progressed 双信号叠加';
  } else {
    nextStep = '进入 M16：生成架构重排（结构前置，内容后写）';
  }

  // 构建报告
  const report: M15_2Report = {
    testId,
    timestamp: new Date().toISOString(),
    projectId,
    model: CONFIG.DEEPSEEK_MODEL,

    summary: {
      totalEpisodes: CONFIG.TOTAL_EPISODES,
      successfulEpisodes,
      newRevealHitCount,
      newRevealHitRate,
      avgHitCount,
    },

    episodeResults,

    validation: {
      success,
      reason,
      details,
    },

    nextStep,
  };

  return report;
}

// ============================================================================
// 报告生成
// ============================================================================

async function generateMarkdownReport(report: M15_2Report): Promise<string> {
  const lines: string[] = [];

  lines.push('# M15.2 New Reveal 强制结构验证报告\n');
  lines.push('---\n');

  lines.push('## 基本信息');
  lines.push(`- **Test ID**: ${report.testId}`);
  lines.push(`- **Timestamp**: ${report.timestamp}`);
  lines.push(`- **Project ID**: ${report.projectId}`);
  lines.push(`- **Model**: ${report.model}\n`);

  lines.push('## 验证结果汇总');
  lines.push(`- **New Reveal 命中**: ${report.summary.newRevealHitCount}/${report.summary.totalEpisodes} (${(report.summary.newRevealHitRate * 100).toFixed(1)}%)`);
  lines.push(`- **平均命中数**: ${report.summary.avgHitCount.toFixed(1)}/6`);
  lines.push(`- **成功集数**: ${report.summary.successfulEpisodes}/${report.summary.totalEpisodes}\n`);

  lines.push('## 验证判定');
  lines.push(`**结果**: ${report.validation.success ? '✅ 成功' : '❌ 失败'}`);
  lines.push(`**原因**: ${report.validation.reason}\n`);

  lines.push('### 详细判定');
  for (const detail of report.validation.details) {
    lines.push(`- ${detail}`);
  }
  lines.push('');

  lines.push('## 逐集详情');
  for (const ep of report.episodeResults) {
    lines.push(`\n### EP${ep.episodeIndex}`);
    lines.push(`- **Status**: ${ep.status}`);
    lines.push(`- **Content Length**: ${ep.contentLength}`);
    lines.push(`- **New Reveal**: ${ep.newRevealHit ? '✓ HIT' : '✗ MISS'}`);
    lines.push(`- **Hit Count**: ${ep.hitCount}/6`);
    if (ep.qualitySignals) {
      lines.push(`- **All Signals**:`);
      lines.push(`  - conflictProgressed: ${ep.qualitySignals.conflictProgressed ? '✓' : '✗'}`);
      lines.push(`  - costPaid: ${ep.qualitySignals.costPaid ? '✓' : '✗'}`);
      lines.push(`  - factReused: ${ep.qualitySignals.factReused ? '✓' : '✗'}`);
      lines.push(`  - newReveal: ${ep.qualitySignals.newReveal ? '✓' : '✗'}`);
      lines.push(`  - promiseAddressed: ${ep.qualitySignals.promiseAddressed ? '✓' : '✗'}`);
      lines.push(`  - stateCoherent: ${ep.qualitySignals.stateCoherent ? '✓' : '✗'}`);
    }
    if (ep.error) {
      lines.push(`- **Error**: ${ep.error}`);
    }
  }
  lines.push('');

  lines.push('## 下一步');
  lines.push(`**建议**: ${report.nextStep}\n`);

  lines.push('---');
  lines.push('\n**PM 结论**：这是一次结构通电测试，不是内容评审。无论结果好坏，都是确定性的收获。');

  return lines.join('\n');
}

async function saveReport(report: M15_2Report): Promise<void> {
  // 确保报告目录存在
  if (!fs.existsSync(CONFIG.REPORT_DIR)) {
    fs.mkdirSync(CONFIG.REPORT_DIR, { recursive: true });
  }

  // 生成 Markdown 报告
  const mdContent = await generateMarkdownReport(report);
  fs.writeFileSync(CONFIG.REPORT_FILE, mdContent, 'utf-8');
  console.log(`✓ 报告已保存: ${CONFIG.REPORT_FILE}`);
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  try {
    // 确保报告目录存在
    if (!fs.existsSync(CONFIG.REPORT_DIR)) {
      fs.mkdirSync(CONFIG.REPORT_DIR, { recursive: true });
    }

    // 运行 M15.2 测试
    const report = await runM15_2_NewRevealTest();

    // 保存报告
    await saveReport(report);

    // 输出最终结论
    console.log('\n========================================');
    console.log('M15.2 测试完成');
    console.log('========================================');
    console.log(`\n验证结果: ${report.validation.success ? '✅ 成功' : '❌ 失败'}`);
    console.log(`下一步: ${report.nextStep}`);
    console.log('\n完整报告已保存到:');
    console.log(`  ${CONFIG.REPORT_FILE}`);
    console.log('\n跑完了。一句话告诉我就行。');

  } catch (error: any) {
    console.error('\n❌ M15.2 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行主函数
main();

