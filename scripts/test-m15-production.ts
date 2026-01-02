#!/usr/bin/env tsx

/**
 * M15.1 真实生产验证测试
 *
 * 功能：
 * - 运行 EP1-EP3 完整流程，验证 Structure Playbooks 是否能在真实生产中稳定提升内容质量
 * - 计算每集的 QualitySignals（M13）
 * - 聚合 SignalsSummary（M14.1）
 * - 发现 QualityPatterns（M14.2）
 * - 生成 Structure Playbooks（M14.3）
 * - 生成 M15.1 专用报告（含打法卡建议、质量趋势、人类可执行性评估）
 *
 * 原则：
 * - 不自动干预生成，不修改 prompt
 * - 只观测信号，供人类决策参考
 */

import { createTimer, SpanResult } from '../lib/observability/timer';
import { api } from '../api';
import { projectRepo } from '../lib/store/projectRepo';
import { episodeRepo } from '../lib/store/episodeRepo';
import { batchRepo } from '../lib/batch/batchRepo';
import { storyMemoryRepo } from '../lib/store/memoryRepo';
import { EpisodeStatus, QualitySignals, SignalsSummary, PatternDiscoveryResult, StructurePlaybooksResult, StructurePlaybook } from '../types';
import { aggregateSignals, generateSignalsInsights } from '../lib/ai/signalsAggregator';
import { discoverPatterns, formatPatternsAsMarkdown, formatMissingSignalsAsMarkdown, formatInsightsAsMarkdown } from '../lib/ai/patternDiscovery';
import { generateStructurePlaybooks, formatPlaybooksAsMarkdown } from '../lib/ai/structurePlaybookGenerator';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// 配置与常量
// ============================================================================

const CONFIG = {
  // 测试配置
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  TEST_USER_PROMPT: '一个现代都市复仇爽剧，主角被冤枉入狱，出狱后展开复仇计划',
  TOTAL_EPISODES: 3,  // M15.1 先验证 EP1-EP3

  // 耗时阈值（毫秒）
  THRESHOLDS: {
    SEED_MAX_MS: 60000,
    BIBLE_MAX_MS: 60000,
    OUTLINE_MAX_MS: 60000,
    EP1_MAX_MS: 120000,
    SINGLE_EPISODE_MAX_MS: 120000,
    TOTAL_PIPELINE_MAX_MS: 600000,
  },

  // M15.1 质量阈值
  QUALITY: {
    TARGET_AVG_HIT_COUNT: 4.0,
    TARGET_HIGH_QUALITY_RATE: 0.5,  // >=4 signals
    TARGET_LOW_QUALITY_RATE: 0.0,   // <=1 signals
    TARGET_PROMISE_ADDRESSED_RATE: 0.6,  // from <40% to >=60%
  },

  // 输出路径
  REPORT_DIR: path.join(process.cwd(), 'reports'),
  JSON_REPORT: path.join(process.cwd(), 'reports', 'm15_production_report.json'),
  MD_REPORT: path.join(process.cwd(), 'reports', 'm15_production_report.md'),
  REVIEW_TEMPLATE: path.join(process.cwd(), 'templates', 'm15_review_template.md'),
};

// ============================================================================
// 类型定义
// ============================================================================

interface EpisodeTestResult {
  episodeIndex: number;
  status: EpisodeStatus;
  contentLength: number;
  qualityPassed: boolean;
  alignerPassed: boolean;
  qualitySignals?: QualitySignals;
  metrics?: {
    totalTime: number;
    llm_ms?: number;
    validate_ms?: number;
    align_ms?: number;
    save_ms?: number;
  };
  error?: string;
  warnings: string[];
}

interface M15ProductionReport {
  testId: string;
  timestamp: string;
  projectId: string;
  model: string;

  // 基本信息
  summary: {
    totalEpisodes: number;
    successfulEpisodes: number;
    failedEpisodes: number;
    totalDuration: number;
  };

  // 质量指标（5个核心指标）
  qualityMetrics: {
    avgHitCount: number;
    highQualityEpisodes: number;  // hitCount >= 4
    highQualityRate: number;      // proportion of high quality episodes
    lowQualityEpisodes: number;   // hitCount <= 1
    lowQualityRate: number;       // proportion of low quality episodes
    promiseAddressedHitRate: number;
    conflictProgressedHitRate: number;
    newRevealHitRate: number;
    factReusedHitRate: number;
  };

  // 打法卡执行情况
  playbooks: StructurePlaybook[];
  playbookEffectiveness: {
    playbookIndex: number;
    playbookTitle: string;
    targetEpisodes: number[];  // 主攻集数
    executionQuality: 'high' | 'medium' | 'low';
    observations: string[];
  }[];

  // 质量趋势
  signalsTrend: {
    episodeIndex: number;
    hitCount: number;
    signals: QualitySignals;
  }[];

  // Pattern 稳定性
  patternStability: {
    patternKey: string;
    occurrenceCount: number;
    highQualityCoverage: number;
    isStable: boolean;
  }[];

  // 人类可执行性评估
  humanUsability: {
    playbookClarity: number;  // 1-5评分
    decisionSupport: boolean;
    easeOfUse: 'very_easy' | 'easy' | 'moderate' | 'hard';
    feedback: string[];
  };

  // 总结与建议
  summaryAndRecommendations: {
    overallEffectiveness: 'highly_effective' | 'effective' | 'needs_adjustment' | 'ineffective';
    keyFindings: string[];
    nextActions: string[];
    suggestedDecision: 'continue' | 'adjust_density' | 'adjust_intensity' | 'change_fix';
  };

  // 剧集详情
  episodeResults: EpisodeTestResult[];

  // 信号聚合
  signalsSummary?: SignalsSummary;

  // 模式发现
  patternDiscovery?: PatternDiscoveryResult;
}

// ============================================================================
// 辅助函数
// ============================================================================

function generateTestId(): string {
  return `m15_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function cleanJsonResponse(raw: string): string {
  // 移除可能的 markdown 代码块标记
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

function safeJsonParse<T>(json: string): T {
  try {
    return JSON.parse(json) as T;
  } catch (e) {
    throw new Error(`Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ============================================================================
// M15.1 核心逻辑
// ============================================================================

/**
 * 运行 M15.1 生产验证
 */
async function runM15ProductionValidation(): Promise<M15ProductionReport> {
  console.log('='.repeat(80));
  console.log('M15.1 真实生产验证测试');
  console.log('='.repeat(80));
  console.log('');

  const timer = createTimer('M15.1 Production Validation');
  const testId = generateTestId();
  const startTime = Date.now();

  console.log(`测试ID: ${testId}`);
  console.log(`项目提示: ${CONFIG.TEST_USER_PROMPT}`);
  console.log(`目标集数: EP1-EP${CONFIG.TOTAL_EPISODES}`);
  console.log(`使用模型: ${CONFIG.DEEPSEEK_MODEL}`);
  console.log('');

  // 初始化结果
  const report: M15ProductionReport = {
    testId,
    timestamp: new Date().toISOString(),
    projectId: '',
    model: CONFIG.DEEPSEEK_MODEL,
    summary: {
      totalEpisodes: CONFIG.TOTAL_EPISODES,
      successfulEpisodes: 0,
      failedEpisodes: 0,
      totalDuration: 0,
    },
    qualityMetrics: {
      avgHitCount: 0,
      highQualityEpisodes: 0,
      highQualityRate: 0,
      lowQualityEpisodes: 0,
      lowQualityRate: 0,
      promiseAddressedHitRate: 0,
      conflictProgressedHitRate: 0,
      newRevealHitRate: 0,
      factReusedHitRate: 0,
    },
    playbooks: [],
    playbookEffectiveness: [],
    signalsTrend: [],
    patternStability: [],
    humanUsability: {
      playbookClarity: 0,
      decisionSupport: false,
      easeOfUse: 'moderate',
      feedback: [],
    },
    summaryAndRecommendations: {
      overallEffectiveness: 'ineffective',
      keyFindings: [],
      nextActions: [],
      suggestedDecision: 'continue',
    },
    episodeResults: [],
  };

  try {
    // Step 1: 创建项目
    console.log('Step 1: 创建项目...');
    const seedSpan = timer.startSpan('seed');
    const project = await api.project.seed(CONFIG.TEST_USER_PROMPT, {
      genre: 'revenge',  // 都市复仇
      totalEpisodes: CONFIG.TOTAL_EPISODES,
      pacingTemplateId: 'revenge_rebirth',
    });
    const seedDuration = seedSpan.end();

    if (!project) {
      throw new Error('创建项目失败');
    }

    report.projectId = project.id;
    console.log(`✅ 项目创建成功: ${project.id}`);
    console.log(`   耗时: ${(seedDuration / 1000).toFixed(2)}s`);
    console.log('');

    // Step 1.5: 生成 Bible 和 Outline（初始化 episodes）
    console.log('Step 1.5: 生成 Bible 和 Outline...');
    console.log('   正在生成 Bible...');
    await api.project.generateBible(project.id);
    console.log('   ✅ Bible 生成完成');

    console.log('   正在生成 Outline...');
    await api.project.generateOutline(project.id);
    console.log('   ✅ Outline 生成完成');
    console.log('');

    // Step 2: 生成剧集（EP1-EP3）
    console.log('Step 2: 生成剧集 (EP1-EP3)...');
    const episodeResults: EpisodeTestResult[] = [];

    for (let i = 1; i <= CONFIG.TOTAL_EPISODES; i++) {
      console.log(`\n--- EP${i} ---`);
      const epResult = await generateEpisode(project.id, i, timer);
      episodeResults.push(epResult);

      if (epResult.status === EpisodeStatus.FAILED) {
        report.summary.failedEpisodes++;
      } else {
        report.summary.successfulEpisodes++;
      }
    }

    report.episodeResults = episodeResults;
    console.log('\n✅ 所有剧集生成完成');
    console.log('');

    // Step 3: 计算质量信号（M13）已在生成剧集时完成
    console.log('Step 3: 质量信号分析...');
    const signalInputs = episodeResults
      .filter(r => r.qualitySignals)
      .map(r => ({
        episodeIndex: r.episodeIndex,
        qualitySignals: r.qualitySignals,
      }));

    if (signalInputs.length === 0) {
      console.warn('⚠️  没有有效的质量信号数据');
    } else {
      console.log(`✅ ${signalInputs.length} 集有质量信号数据`);
    }
    console.log('');

    // Step 4: 聚合信号（M14.1）
    console.log('Step 4: 聚合信号 (M14.1)...');
    const signalsSummary = aggregateSignals(signalInputs);
    report.signalsSummary = signalsSummary;

    console.log('✅ 信号聚合完成');
    console.log(`   总集数: ${signalsSummary.totalEpisodes}`);
    const avgHits = signalInputs.length > 0
      ? signalInputs.reduce((sum, r) => sum + (r.qualitySignals ? Object.values(r.qualitySignals).filter(v => v).length : 0), 0) / signalInputs.length
      : 0;
    console.log(`   平均命中数: ${avgHits}`);
    console.log('');

    // Step 5: 发现模式（M14.2）
    console.log('Step 5: 发现质量模式 (M14.2)...');
    const patternDiscovery = discoverPatterns(signalsSummary);
    report.patternDiscovery = patternDiscovery;

    console.log('✅ 模式发现完成');
    console.log(`   高质量模式数量: ${patternDiscovery.highQualityPatterns.length}`);
    console.log(`   缺失信号警示数量: ${patternDiscovery.missingSignalsWarnings.length}`);
    console.log('');

    // Step 6: 生成打法卡（M14.3）
    console.log('Step 6: 生成结构打法卡 (M14.3)...');
    const playbooksResult = generateStructurePlaybooks(patternDiscovery);
    report.playbooks = playbooksResult.playbooks;

    console.log('✅ 结构打法卡生成完成');
    console.log(`   生成打法卡数量: ${playbooksResult.playbooks.length}`);
    console.log(`   ${playbooksResult.summary}`);
    console.log('');

    // Step 7: 计算质量指标
    console.log('Step 7: 计算质量指标...');
    calculateQualityMetrics(report);
    console.log('');

    // Step 8: 评估打法卡执行效果
    console.log('Step 8: 评估打法卡执行效果...');
    evaluatePlaybookEffectiveness(report);
    console.log('');

    // Step 9: 分析 Pattern 稳定性
    console.log('Step 9: 分析 Pattern 稳定性...');
    analyzePatternStability(report);
    console.log('');

    // Step 10: 评估人类可执行性
    console.log('Step 10: 评估人类可执行性...');
    evaluateHumanUsability(report);
    console.log('');

    // Step 11: 生成总结与建议
    console.log('Step 11: 生成总结与建议...');
    generateSummaryAndRecommendations(report);
    console.log('');

    // Step 12: 记录质量趋势
    report.signalsTrend = episodeResults
      .filter(r => r.qualitySignals)
      .map(r => ({
        episodeIndex: r.episodeIndex,
        hitCount: r.qualitySignals ? Object.values(r.qualitySignals).filter(v => v).length : 0,
        signals: r.qualitySignals!,
      }));

    // 总耗时
    report.summary.totalDuration = Date.now() - startTime;

    console.log('='.repeat(80));
    console.log('M15.1 验证完成');
    console.log('='.repeat(80));
    console.log(`总耗时: ${(report.summary.totalDuration / 1000).toFixed(2)}s`);
    console.log(`成功率: ${((report.summary.successfulEpisodes / report.summary.totalEpisodes) * 100).toFixed(1)}%`);
    console.log('');

  } catch (error) {
    console.error('❌ M15.1 验证失败:', error);
    report.summary.totalDuration = Date.now() - startTime;
    report.summaryAndRecommendations.keyFindings.push(`验证失败: ${error instanceof Error ? error.message : String(error)}`);
  }

  return report;
}

/**
 * 生成单集
 */
async function generateEpisode(
  projectId: string,
  episodeIndex: number,
  timer: ReturnType<typeof createTimer>
): Promise<EpisodeTestResult> {
  const result: EpisodeTestResult = {
    episodeIndex,
    status: EpisodeStatus.FAILED,
    contentLength: 0,
    qualityPassed: false,
    alignerPassed: false,
    warnings: [],
  };

  try {
    console.log(`正在生成 EP${episodeIndex}...`);
    const epSpan = timer.startSpan(`EP${episodeIndex}`);

    // 调用 API 生成剧集
    const episode = await api.episode.generate(projectId, episodeIndex);

    const duration = epSpan.end();

    if (!episode) {
      throw new Error('生成剧集失败');
    }

    result.status = episode.status;
    result.contentLength = episode.content?.length || 0;
    result.qualityPassed = episode.qualityPassed ?? false;
    result.alignerPassed = episode.alignment?.passed ?? false;
    result.qualitySignals = episode.qualitySignals;
    result.metrics = {
      totalTime: duration,
    };

    // 验证质量
    if (result.contentLength < 200) {
      result.warnings.push(`字数过少: ${result.contentLength}`);
    }

    console.log(`✅ EP${episodeIndex} 生成完成`);
    console.log(`   状态: ${result.status}`);
    console.log(`   字数: ${result.contentLength}`);
    console.log(`   质量检查: ${result.qualityPassed ? '✅' : '❌'}`);
    console.log(`   Aligner: ${result.alignerPassed ? '✅' : '❌'}`);
    if (result.qualitySignals) {
      const hitCount = Object.values(result.qualitySignals).filter(v => v).length;
      console.log(`   质量信号: ${hitCount}/6`);
      console.log(`     - conflictProgressed: ${result.qualitySignals.conflictProgressed ? '✅' : '❌'}`);
      console.log(`     - newReveal: ${result.qualitySignals.newReveal ? '✅' : '❌'}`);
      console.log(`     - promiseAddressed: ${result.qualitySignals.promiseAddressed ? '✅' : '❌'}`);
    }
    console.log(`   耗时: ${(duration / 1000).toFixed(2)}s`);

  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    console.error(`❌ EP${episodeIndex} 失败:`, error);
  }

  return result;
}

/**
 * 计算质量指标
 */
function calculateQualityMetrics(report: M15ProductionReport): void {
  const { episodeResults } = report;
  const totalEpisodes = episodeResults.length;

  if (totalEpisodes === 0) {
    return;
  }

  // 计算平均命中数
  let totalHitCount = 0;
  let highQualityCount = 0;
  let lowQualityCount = 0;
  let promiseAddressedCount = 0;
  let conflictProgressedCount = 0;
  let newRevealCount = 0;
  let factReusedCount = 0;

  for (const ep of episodeResults) {
    if (ep.qualitySignals) {
      const hitCount = Object.values(ep.qualitySignals).filter(v => v).length;
      totalHitCount += hitCount;

      if (hitCount >= 4) {
        highQualityCount++;
      } else if (hitCount <= 1) {
        lowQualityCount++;
      }

      if (ep.qualitySignals.promiseAddressed) promiseAddressedCount++;
      if (ep.qualitySignals.conflictProgressed) conflictProgressedCount++;
      if (ep.qualitySignals.newReveal) newRevealCount++;
      if (ep.qualitySignals.factReused) factReusedCount++;
    }
  }

  report.qualityMetrics.avgHitCount = totalHitCount / totalEpisodes;
  report.qualityMetrics.highQualityEpisodes = highQualityCount;
  report.qualityMetrics.highQualityRate = highQualityCount / totalEpisodes;
  report.qualityMetrics.lowQualityEpisodes = lowQualityCount;
  report.qualityMetrics.lowQualityRate = lowQualityCount / totalEpisodes;
  report.qualityMetrics.promiseAddressedHitRate = promiseAddressedCount / totalEpisodes;
  report.qualityMetrics.conflictProgressedHitRate = conflictProgressedCount / totalEpisodes;
  report.qualityMetrics.newRevealHitRate = newRevealCount / totalEpisodes;
  report.qualityMetrics.factReusedHitRate = factReusedCount / totalEpisodes;

  console.log('质量指标统计:');
  console.log(`  平均命中数: ${report.qualityMetrics.avgHitCount.toFixed(2)}`);
  console.log(`  高质量集数: ${report.qualityMetrics.highQualityEpisodes}/${totalEpisodes} (${(report.qualityMetrics.highQualityRate * 100).toFixed(1)}%)`);
  console.log(`  低质量集数: ${report.qualityMetrics.lowQualityEpisodes}/${totalEpisodes} (${(report.qualityMetrics.lowQualityRate * 100).toFixed(1)}%)`);
  console.log(`  Promise Addressed 命中率: ${(report.qualityMetrics.promiseAddressedHitRate * 100).toFixed(1)}%`);
  console.log(`  Conflict Progressed 命中率: ${(report.qualityMetrics.conflictProgressedHitRate * 100).toFixed(1)}%`);
  console.log(`  New Reveal 命中率: ${(report.qualityMetrics.newRevealHitRate * 100).toFixed(1)}%`);
  console.log(`  Fact Reused 命中率: ${(report.qualityMetrics.factReusedHitRate * 100).toFixed(1)}%`);
}

/**
 * 评估打法卡执行效果
 */
function evaluatePlaybookEffectiveness(report: M15ProductionReport): void {
  const { playbooks, episodeResults, signalsTrend } = report;

  // M15.1 的两张核心打法卡：
  // 1. Conflict Progressed + New Reveal (EP1-EP2 主攻)
  // 2. Promise Addressed (EP3 轻量主攻)

  report.playbookEffectiveness = playbooks.map((playbook, index) => {
    let targetEpisodes: number[] = [];
    let executionQuality: 'high' | 'medium' | 'low' = 'medium';
    const observations: string[] = [];

    if (playbook.title.includes('Conflict Progressed') && playbook.title.includes('New Reveal')) {
      // 质量型打法卡：EP1-EP2 主攻
      targetEpisodes = [1, 2];

      const ep1 = episodeResults.find(r => r.episodeIndex === 1);
      const ep2 = episodeResults.find(r => r.episodeIndex === 2);

      if (ep1?.qualitySignals) {
        if (ep1.qualitySignals.conflictProgressed && ep1.qualitySignals.newReveal) {
          executionQuality = 'high';
          observations.push('EP1 命中 conflictProgressed + newReveal');
        } else {
          executionQuality = 'medium';
          observations.push('EP1 未完全命中质量型打法卡');
        }
      }

      if (ep2?.qualitySignals) {
        if (ep2.qualitySignals.conflictProgressed && ep2.qualitySignals.newReveal) {
          observations.push('EP2 命中 conflictProgressed + newReveal');
        } else {
          executionQuality = 'medium';
          observations.push('EP2 未完全命中质量型打法卡');
        }
      }

    } else if (playbook.title.includes('Promise Addressed')) {
      // 修复型打法卡：EP3 轻量主攻
      targetEpisodes = [3];

      const ep3 = episodeResults.find(r => r.episodeIndex === 3);

      if (ep3?.qualitySignals) {
        if (ep3.qualitySignals.promiseAddressed) {
          executionQuality = 'high';
          observations.push('EP3 命中 promiseAddressed');
        } else {
          executionQuality = 'low';
          observations.push('EP3 未命中 promiseAddressed，这是修复型打法卡的关键');
        }
      } else {
        executionQuality = 'low';
        observations.push('EP3 没有质量信号数据');
      }
    }

    return {
      playbookIndex: index,
      playbookTitle: playbook.title,
      targetEpisodes,
      executionQuality,
      observations,
    };
  });

  console.log('打法卡执行效果:');
  for (const effectiveness of report.playbookEffectiveness) {
    console.log(`  打法卡 ${effectiveness.playbookIndex}: ${effectiveness.playbookTitle}`);
    console.log(`    目标集数: ${effectiveness.targetEpisodes.join(', ')}`);
    console.log(`    执行质量: ${effectiveness.executionQuality === 'high' ? '优秀' : effectiveness.executionQuality === 'medium' ? '中等' : '较低'}`);
    console.log(`    观察:`);
    for (const obs of effectiveness.observations) {
      console.log(`      - ${obs}`);
    }
  }
}

/**
 * 分析 Pattern 稳定性
 */
function analyzePatternStability(report: M15ProductionReport): void {
  const { patternDiscovery } = report;

  if (!patternDiscovery || patternDiscovery.highQualityPatterns.length === 0) {
    console.log('⚠️  没有高质量模式数据');
    return;
  }

  report.patternStability = patternDiscovery.highQualityPatterns.map(pattern => ({
    patternKey: pattern.patternKey,
    occurrenceCount: pattern.occurrenceCount,
    highQualityCoverage: pattern.highQualityCoverage,
    isStable: pattern.occurrenceCount >= 2 && pattern.highQualityCoverage >= 0.5,
  }));

  console.log('Pattern 稳定性分析:');
  for (const stability of report.patternStability) {
    console.log(`  模式: ${stability.patternKey}`);
    console.log(`    出现次数: ${stability.occurrenceCount}`);
    console.log(`    高质量覆盖率: ${(stability.highQualityCoverage * 100).toFixed(1)}%`);
    console.log(`    稳定性: ${stability.isStable ? '✅ 稳定' : '❌ 不稳定'}`);
  }
}

/**
 * 评估人类可执行性
 */
function evaluateHumanUsability(report: M15ProductionReport): void {
  const { playbooks, playbookEffectiveness, qualityMetrics } = report;

  // 打法卡清晰度（基于执行效果）
  const avgExecutionScore = playbookEffectiveness.reduce((sum, eff) => {
    return sum + (eff.executionQuality === 'high' ? 5 : eff.executionQuality === 'medium' ? 3 : 1);
  }, 0) / playbookEffectiveness.length;

  report.humanUsability.playbookClarity = Math.round(avgExecutionScore);

  // 决策支持（基于命中率）
  const hitRateAvg = (
    qualityMetrics.conflictProgressedHitRate +
    qualityMetrics.newRevealHitRate +
    qualityMetrics.promiseAddressedHitRate
  ) / 3;

  report.humanUsability.decisionSupport = hitRateAvg >= 0.6;

  // 易用性（基于清晰度和决策支持）
  if (report.humanUsability.playbookClarity >= 4 && report.humanUsability.decisionSupport) {
    report.humanUsability.easeOfUse = 'very_easy';
  } else if (report.humanUsability.playbookClarity >= 3) {
    report.humanUsability.easeOfUse = 'easy';
  } else if (report.humanUsability.playbookClarity >= 2) {
    report.humanUsability.easeOfUse = 'moderate';
  } else {
    report.humanUsability.easeOfUse = 'hard';
  }

  // 生成反馈
  if (report.humanUsability.decisionSupport) {
    report.humanUsability.feedback.push('打法卡能有效支持创作决策');
  } else {
    report.humanUsability.feedback.push('打法卡对决策支持不足，需要优化');
  }

  if (report.humanUsability.playbookClarity >= 4) {
    report.humanUsability.feedback.push('打法卡清晰度高，易于理解和执行');
  } else {
    report.humanUsability.feedback.push('打法卡清晰度有待提升，建议增加具体示例');
  }

  console.log('人类可执行性评估:');
  console.log(`  打法卡清晰度: ${report.humanUsability.playbookClarity}/5`);
  console.log(`  决策支持: ${report.humanUsability.decisionSupport ? '✅ 是' : '❌ 否'}`);
  console.log(`  易用性: ${report.humanUsability.easeOfUse === 'very_easy' ? '非常容易' : report.humanUsability.easeOfUse === 'easy' ? '容易' : report.humanUsability.easeOfUse === 'moderate' ? '中等' : '困难'}`);
  console.log(`  反馈:`);
  for (const feedback of report.humanUsability.feedback) {
    console.log(`    - ${feedback}`);
  }
}

/**
 * 生成总结与建议
 */
function generateSummaryAndRecommendations(report: M15ProductionReport): void {
  const { qualityMetrics, humanUsability, playbookEffectiveness } = report;
  const findings: string[] = [];
  const nextActions: string[] = [];
  let overallEffectiveness: 'highly_effective' | 'effective' | 'needs_adjustment' | 'ineffective' = 'ineffective';
  let suggestedDecision: 'continue' | 'adjust_density' | 'adjust_intensity' | 'change_fix' = 'continue';

  // 分析 5 个核心指标
  const targetMetCount = [
    qualityMetrics.avgHitCount >= CONFIG.QUALITY.TARGET_AVG_HIT_COUNT,
    qualityMetrics.highQualityRate >= CONFIG.QUALITY.TARGET_HIGH_QUALITY_RATE,
    qualityMetrics.lowQualityRate <= CONFIG.QUALITY.TARGET_LOW_QUALITY_RATE,
    qualityMetrics.promiseAddressedHitRate >= CONFIG.QUALITY.TARGET_PROMISE_ADDRESSED_RATE,
  ].filter(v => v).length;

  findings.push(`平均命中数: ${qualityMetrics.avgHitCount.toFixed(2)} (目标: ${CONFIG.QUALITY.TARGET_AVG_HIT_COUNT})`);
  findings.push(`高质量集比例: ${(qualityMetrics.highQualityRate * 100).toFixed(1)}% (目标: ${CONFIG.QUALITY.TARGET_HIGH_QUALITY_RATE * 100}%)`);
  findings.push(`Promise Addressed 命中率: ${(qualityMetrics.promiseAddressedHitRate * 100).toFixed(1)}% (目标: ${CONFIG.QUALITY.TARGET_PROMISE_ADDRESSED_RATE * 100}%)`);

  // 判断整体有效性
  if (targetMetCount >= 3 && humanUsability.decisionSupport) {
    overallEffectiveness = 'highly_effective';
    suggestedDecision = 'continue';
    nextActions.push('继续 M15.1 扩大验证（EP4-EP6）');
    nextActions.push('观察趋势是否稳定');
  } else if (targetMetCount >= 2) {
    overallEffectiveness = 'effective';
    suggestedDecision = 'adjust_density';
    nextActions.push('调整 Promise 密度，提高命中率');
    nextActions.push('继续验证 EP4-EP6');
  } else if (qualityMetrics.promiseAddressedHitRate < 0.4) {
    overallEffectiveness = 'needs_adjustment';
    suggestedDecision = 'change_fix';
    nextActions.push('更换修复型打法卡或优化执行方式');
    nextActions.push('重新设计 EP3 的 Promise 回收结构');
  } else {
    overallEffectiveness = 'ineffective';
    suggestedDecision = 'adjust_intensity';
    nextActions.push('调整揭示强度，提高 New Reveal 命中率');
    nextActions.push('重新审视打法卡的适用性');
  }

  // 基于人类可执行性调整
  if (!humanUsability.decisionSupport) {
    nextActions.push('优化打法卡的表述和示例，提高可理解性');
  }

  report.summaryAndRecommendations = {
    overallEffectiveness,
    keyFindings: findings,
    nextActions,
    suggestedDecision,
  };

  console.log('总结与建议:');
  console.log(`  整体有效性: ${overallEffectiveness === 'highly_effective' ? '高度有效' : overallEffectiveness === 'effective' ? '有效' : overallEffectiveness === 'needs_adjustment' ? '需要调整' : '无效'}`);
  console.log(`  建议决策: ${suggestedDecision === 'continue' ? '继续' : suggestedDecision === 'adjust_density' ? '调整密度' : suggestedDecision === 'adjust_intensity' ? '调整强度' : '更换修复卡'}`);
  console.log(`  关键发现:`);
  for (const finding of findings) {
    console.log(`    - ${finding}`);
  }
  console.log(`  下一步行动:`);
  for (const action of nextActions) {
    console.log(`    - ${action}`);
  }
}

// ============================================================================
// 报告生成
// ============================================================================

/**
 * 生成 JSON 报告
 */
function generateJsonReport(report: M15ProductionReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * 生成 Markdown 报告
 */
function generateMarkdownReport(report: M15ProductionReport): string {
  const lines: string[] = [];

  // 标题
  lines.push('# M15.1 真实生产验证报告');
  lines.push('');
  lines.push('## 基本信息');
  lines.push('');
  lines.push(`- **测试ID**: ${report.testId}`);
  lines.push(`- **测试时间**: ${report.timestamp}`);
  lines.push(`- **项目ID**: ${report.projectId}`);
  lines.push(`- **模型**: ${report.model}`);
  lines.push(`- **总体状态**: **${report.summaryAndRecommendations.overallEffectiveness.toUpperCase()}**`);
  lines.push('');

  // 摘要
  lines.push('## 摘要');
  lines.push('');
  lines.push(`- **总集数**: ${report.summary.totalEpisodes}`);
  lines.push(`- **成功集数**: ${report.summary.successfulEpisodes}`);
  lines.push(`- **失败集数**: ${report.summary.failedEpisodes}`);
  lines.push(`- **总耗时**: ${(report.summary.totalDuration / 1000).toFixed(2)}s`);
  lines.push('');

  // 质量指标（5个核心指标）
  lines.push('## 质量指标（5个核心指标）');
  lines.push('');
  lines.push('| 指标 | 实际值 | 目标值 | 状态 |');
  lines.push('|------|--------|--------|------|');
  lines.push(`| 平均命中数 | ${report.qualityMetrics.avgHitCount.toFixed(2)} | ${CONFIG.QUALITY.TARGET_AVG_HIT_COUNT} | ${report.qualityMetrics.avgHitCount >= CONFIG.QUALITY.TARGET_AVG_HIT_COUNT ? '✅' : '❌'} |`);
  lines.push(`| 高质量集比例 | ${(report.qualityMetrics.highQualityRate * 100).toFixed(1)}% | ${(CONFIG.QUALITY.TARGET_HIGH_QUALITY_RATE * 100)}% | ${report.qualityMetrics.highQualityRate >= CONFIG.QUALITY.TARGET_HIGH_QUALITY_RATE ? '✅' : '❌'} |`);
  lines.push(`| 低质量集比例 | ${(report.qualityMetrics.lowQualityRate * 100).toFixed(1)}% | ${(CONFIG.QUALITY.TARGET_LOW_QUALITY_RATE * 100)}% | ${report.qualityMetrics.lowQualityRate <= CONFIG.QUALITY.TARGET_LOW_QUALITY_RATE ? '✅' : '❌'} |`);
  lines.push(`| Promise Addressed 命中率 | ${(report.qualityMetrics.promiseAddressedHitRate * 100).toFixed(1)}% | ${(CONFIG.QUALITY.TARGET_PROMISE_ADDRESSED_RATE * 100)}% | ${report.qualityMetrics.promiseAddressedHitRate >= CONFIG.QUALITY.TARGET_PROMISE_ADDRESSED_RATE ? '✅' : '❌'} |`);
  lines.push(`| Conflict Progressed 命中率 | ${(report.qualityMetrics.conflictProgressedHitRate * 100).toFixed(1)}% | - | - |`);
  lines.push(`| New Reveal 命中率 | ${(report.qualityMetrics.newRevealHitRate * 100).toFixed(1)}% | - | - |`);
  lines.push('');

  // 打法卡执行分析
  lines.push('## 打法卡执行分析');
  lines.push('');
  for (const effectiveness of report.playbookEffectiveness) {
    lines.push(`### 打法卡 ${effectiveness.playbookIndex}: ${effectiveness.playbookTitle}`);
    lines.push('');
    lines.push(`- **目标集数**: ${effectiveness.targetEpisodes.join(', ')}`);
    lines.push(`- **执行质量**: ${effectiveness.executionQuality === 'high' ? '优秀' : effectiveness.executionQuality === 'medium' ? '中等' : '较低'}`);
    lines.push(`- **观察**:`);
    for (const obs of effectiveness.observations) {
      lines.push(`  - ${obs}`);
    }
    lines.push('');
  }

  // 质量信号趋势
  lines.push('## 质量信号趋势');
  lines.push('');
  lines.push('| 集数 | 命中数 | Conflict Progressed | New Reveal | Promise Addressed | Fact Reused | Cost Paid | State Coherent |');
  lines.push('|------|--------|--------------------|-----------|-------------------|-------------|-----------|----------------|');
  for (const trend of report.signalsTrend) {
    const s = trend.signals;
    lines.push(`| EP${trend.episodeIndex} | ${trend.hitCount} | ${s.conflictProgressed ? '✅' : '❌'} | ${s.newReveal ? '✅' : '❌'} | ${s.promiseAddressed ? '✅' : '❌'} | ${s.factReused ? '✅' : '❌'} | ${s.costPaid ? '✅' : '❌'} | ${s.stateCoherent ? '✅' : '❌'} |`);
  }
  lines.push('');

  // Pattern 稳定性
  lines.push('## Pattern 稳定性');
  lines.push('');
  lines.push('| Pattern | 出现次数 | 高质量覆盖率 | 稳定性 |');
  lines.push('|---------|----------|-------------|--------|');
  for (const stability of report.patternStability) {
    lines.push(`| ${stability.patternKey} | ${stability.occurrenceCount} | ${(stability.highQualityCoverage * 100).toFixed(1)}% | ${stability.isStable ? '✅' : '❌'} |`);
  }
  lines.push('');

  // 人类可执行性评估
  lines.push('## 人类可执行性评估');
  lines.push('');
  lines.push(`- **打法卡清晰度**: ${report.humanUsability.playbookClarity}/5`);
  lines.push(`- **决策支持**: ${report.humanUsability.decisionSupport ? '✅ 是' : '❌ 否'}`);
  lines.push(`- **易用性**: ${report.humanUsability.easeOfUse === 'very_easy' ? '非常容易' : report.humanUsability.easeOfUse === 'easy' ? '容易' : report.humanUsability.easeOfUse === 'moderate' ? '中等' : '困难'}`);
  lines.push('');
  lines.push('**反馈**:');
  for (const feedback of report.humanUsability.feedback) {
    lines.push(`- ${feedback}`);
  }
  lines.push('');

  // 总结与建议
  lines.push('## 总结与建议');
  lines.push('');
  lines.push(`**整体有效性**: ${report.summaryAndRecommendations.overallEffectiveness === 'highly_effective' ? '高度有效' : report.summaryAndRecommendations.overallEffectiveness === 'effective' ? '有效' : report.summaryAndRecommendations.overallEffectiveness === 'needs_adjustment' ? '需要调整' : '无效'}`);
  lines.push('');
  lines.push('**关键发现**:');
  for (const finding of report.summaryAndRecommendations.keyFindings) {
    lines.push(`- ${finding}`);
  }
  lines.push('');
  lines.push('**下一步行动**:');
  for (const action of report.summaryAndRecommendations.nextActions) {
    lines.push(`- ${action}`);
  }
  lines.push('');
  lines.push('**建议决策**: ');
  lines.push(`- [${report.summaryAndRecommendations.suggestedDecision === 'continue' ? 'x' : ' '}] 继续跑（效果良好，继续验证 EP4-EP6）`);
  lines.push(`- [${report.summaryAndRecommendations.suggestedDecision === 'adjust_density' ? 'x' : ' '}] 调整 Promise 密度（提高命中率）`);
  lines.push(`- [${report.summaryAndRecommendations.suggestedDecision === 'adjust_intensity' ? 'x' : ' '}] 调整揭示强度（提高 New Reveal 命中率）`);
  lines.push(`- [${report.summaryAndRecommendations.suggestedDecision === 'change_fix' ? 'x' : ' '}] 更换修复型打法卡（重新设计 EP3 的 Promise 回收）`);
  lines.push('');

  // 结构打法卡详情
  lines.push('## 结构打法卡详情');
  lines.push('');
  lines.push(formatPlaybooksAsMarkdown(report.playbooks));
  lines.push('');

  // 剧集详情
  lines.push('## 剧集详情');
  lines.push('');
  lines.push('| 集数 | 状态 | 字数 | 质量检查 | Aligner | 耗时 (ms) |');
  lines.push('|------|------|------|----------|---------|-----------|');
  for (const ep of report.episodeResults) {
    const statusIcon = ep.status === EpisodeStatus.COMPLETED ? '✅' :
                      ep.status === EpisodeStatus.DRAFT ? '⏳' : '❌';
    const qualityIcon = ep.qualityPassed ? '✅' : '❌';
    const alignerIcon = ep.alignerPassed ? '✅' : '❌';
    const time = ep.metrics?.totalTime || 0;
    lines.push(`| EP${ep.episodeIndex} | ${statusIcon} ${ep.status} | ${ep.contentLength} | ${qualityIcon} | ${alignerIcon} | ${time} |`);
  }
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  try {
    // 创建报告目录
    if (!fs.existsSync(CONFIG.REPORT_DIR)) {
      fs.mkdirSync(CONFIG.REPORT_DIR, { recursive: true });
    }

    // 运行验证
    const report = await runM15ProductionValidation();

    // 生成报告
    const jsonReport = generateJsonReport(report);
    const mdReport = generateMarkdownReport(report);

    // 写入 JSON 报告
    fs.writeFileSync(CONFIG.JSON_REPORT, jsonReport, 'utf-8');
    console.log(`\n✅ JSON 报告已保存: ${CONFIG.JSON_REPORT}`);

    // 写入 Markdown 报告
    fs.writeFileSync(CONFIG.MD_REPORT, mdReport, 'utf-8');
    console.log(`✅ Markdown 报告已保存: ${CONFIG.MD_REPORT}`);

    // 生成复盘模板
    await generateReviewTemplate(report);

    console.log('\n🎉 M15.1 验证完成！');
    console.log('\n下一步：');
    console.log('1. 查看 M15.1 报告了解质量指标和打法卡执行效果');
    console.log('2. 使用复盘模板进行人工评估');
    console.log('3. 基于验证结果决定是否继续 M15.1 扩大验证');

  } catch (error) {
    console.error('\n❌ 执行失败:', error);
    process.exit(1);
  }
}

/**
 * 生成复盘模板
 */
async function generateReviewTemplate(report: M15ProductionReport): Promise<void> {
  const templateLines: string[] = [];

  templateLines.push('# M15.1 阶段复盘（EP1-EP' + report.summary.totalEpisodes + '）');
  templateLines.push('');
  templateLines.push('## 一、量化结果（系统给）');
  templateLines.push('');
  templateLines.push(`平均 hitCount：${report.qualityMetrics.avgHitCount.toFixed(2)}`);
  templateLines.push(`高质量集比例（≥4）：${(report.qualityMetrics.highQualityRate * 100).toFixed(1)}%`);
  templateLines.push(`低质量集比例（≤1）：${(report.qualityMetrics.lowQualityRate * 100).toFixed(1)}%`);
  templateLines.push(`promiseAddressed 命中率：${(report.qualityMetrics.promiseAddressedHitRate * 100).toFixed(1)}%`);
  templateLines.push('');

  templateLines.push('## 二、打法卡执行情况（人填）');
  templateLines.push('');

  for (const playbook of report.playbooks) {
    const effectiveness = report.playbookEffectiveness.find(e => e.playbookTitle === playbook.title);
    templateLines.push(`### 打法卡：${playbook.title}`);
    templateLines.push('');
    templateLines.push('**哪几集执行得最好？为什么？**');
    templateLines.push('');
    templateLines.push('**哪一集"推进了但不爽"？原因？**');
    templateLines.push('');
  }

  templateLines.push('## 三、结构判断（只选一项）');
  templateLines.push('');
  templateLines.push(`- [${report.summaryAndRecommendations.overallEffectiveness === 'highly_effective' || report.summaryAndRecommendations.overallEffectiveness === 'effective' ? 'x' : ' '}] 打法卡明显提升结构质量`);
  templateLines.push(`- [${report.summaryAndRecommendations.overallEffectiveness === 'needs_adjustment' ? 'x' : ' '}] 打法卡有用，但执行不稳定`);
  templateLines.push(`- [${report.summaryAndRecommendations.overallEffectiveness === 'ineffective' ? 'x' : ' '}] 打法卡不适配当前项目（需要换）`);
  templateLines.push('');

  templateLines.push('## 四、下一步决策（PM）');
  templateLines.push('');
  templateLines.push(`- [${report.summaryAndRecommendations.suggestedDecision === 'continue' ? 'x' : ' '}] 继续跑`);
  templateLines.push(`- [${report.summaryAndRecommendations.suggestedDecision === 'adjust_density' ? 'x' : ' '}] 调整 Promise 密度`);
  templateLines.push(`- [${report.summaryAndRecommendations.suggestedDecision === 'adjust_intensity' ? 'x' : ' '}] 调整揭示强度`);
  templateLines.push(`- [${report.summaryAndRecommendations.suggestedDecision === 'change_fix' ? 'x' : ' '}] 更换修复型打法卡`);
  templateLines.push('');
  templateLines.push('**人工反馈**：');
  templateLines.push('');
  templateLines.push('- 这张打法卡，在哪些地方帮到我了？');
  templateLines.push('');
  templateLines.push('- 是否帮助策划更快做决策？');
  templateLines.push('');
  templateLines.push('- 是否减少反复试错？');
  templateLines.push('');
  templateLines.push('- 其他反馈：');
  templateLines.push('');

  // 确保模板目录存在
  const templateDir = path.dirname(CONFIG.REVIEW_TEMPLATE);
  if (!fs.existsSync(templateDir)) {
    fs.mkdirSync(templateDir, { recursive: true });
  }

  fs.writeFileSync(CONFIG.REVIEW_TEMPLATE, templateLines.join('\n'), 'utf-8');
  console.log(`✅ 复盘模板已保存: ${CONFIG.REVIEW_TEMPLATE}`);
}

// 运行
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

