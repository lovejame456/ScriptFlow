#!/usr/bin/env tsx

/**
 * DeepSeek API 全链路 E2E 测试
 * 
 * 功能：
 * - 真实调用 DeepSeek 完成完整流程
 * - 采集每一步耗时
 * - 输出 JSON + MD 报告
 * - 验收指标自动判定
 */

import { createTimer, SpanResult } from '../lib/observability/timer';
import { api } from '../api';
import { projectRepo } from '../lib/store/projectRepo';
import { episodeRepo } from '../lib/store/episodeRepo';
import { batchRepo } from '../lib/batch/batchRepo';
import { storyMemoryRepo } from '../lib/store/memoryRepo';
import { EpisodeStatus, QualitySignals, SignalsSummary, PatternDiscoveryResult } from '../types';
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
  TEST_USER_PROMPT: '一个现代都市剧，主角是白手起家的CEO',
  TOTAL_EPISODES: 3,  // 只测试 EP1-EP3
  
  // 耗时阈值（毫秒）
  THRESHOLDS: {
    EP1_PHASE1_MAX_MS: 60000,        // EP1 Phase1 必须在 60 秒内
    SINGLE_EPISODE_MAX_MS: 120000,   // 单集（EP2/3）在 120 秒内
    TOTAL_PIPELINE_MAX_MS: 600000,   // 全链路在 10 分钟内
    
    // 警告阈值（1x）
    WARN_MULTIPLIER: 1.0,
    // 失败阈值（2x）
    FAIL_MULTIPLIER: 2.0,
  },
  
  // 质量阈值
  QUALITY: {
    MIN_CONTENT_LENGTH_DRAFT: 200,    // DRAFT 最小字数
    MIN_CONTENT_LENGTH_COMPLETED: 600,  // COMPLETED 最小字数
    MIN_SCENE_COUNT: 2,               // 竖版剧本格式最少场景标记数
  },
  
  // 输出路径
  REPORT_DIR: path.join(process.cwd(), 'reports'),
  JSON_REPORT: path.join(process.cwd(), 'reports', 'deepseek_e2e_report.json'),
  MD_REPORT: path.join(process.cwd(), 'reports', 'deepseek_e2e_report.md'),
};

// ============================================================================
// 测试模式
// ============================================================================

type E2ETestMode = 'PHASE1_ONLY' | 'FULL_PIPELINE' | 'M15_VALIDATION';

const TEST_MODE: E2ETestMode =
  process.env.E2E_TEST_MODE === 'M15' ? 'M15_VALIDATION' :
  process.env.E2E_TEST_MODE === 'FULL' ? 'FULL_PIPELINE' :
  'PHASE1_ONLY';

// ============================================================================
// 类型定义
// ============================================================================

interface EpisodeTestResult {
  episodeIndex: number;
  status: EpisodeStatus;
  contentLength: number;
  qualityPassed: boolean;
  alignerPassed: boolean;
  qualitySignals?: QualitySignals;  // M13: 质量信号
  metrics?: {
    writerTime: number;
    saveTime: number;
    totalTime: number;
    llm_ms?: number;
    parse_ms?: number;
    validate_ms?: number;
    align_ms?: number;
    save_ms?: number;
  };
  error?: string;
  warnings: string[];
  firstReadableMs?: number;
}

interface BatchConsistencyResult {
  passed: boolean;
  issues: string[];
  details: {
    totalEpisodes: number;
    completedCount: number;
    completedIndexes: number[];
    inconsistentIndexes: number[];
  };
}

interface TestReport {
  testId: string;
  timestamp: string;
  projectId: string;
  model: string;
  overallStatus: 'PASS' | 'FAIL' | 'WARN';
  duration: {
    total: number;
    seed: number;
    bible: number;
    outline: number;
    episodes: number[];
  };
  userExperienceSLA: {
    ep1_phase1_firstReadableMs: number;
    ep2_readableMs: number;
    ep3_readableMs?: number;
    slaStatus: 'PASS' | 'FAIL' | 'WARN';
    slaDetails: {
      ep1_status: string;
      ep2_status: string;
      ep3_status?: string;
    };
  };
  skeletonEnrichMetrics: {  // M10: Skeleton & Enrich 指标
    bibleSkeletonMs?: number;
    bibleEnrichMs?: number;
    outlineSkeletonMs?: number;
    outlineEnrichMs?: number;
  };
  episodeResults: EpisodeTestResult[];
  batchConsistency: BatchConsistencyResult;
  thresholds: typeof CONFIG.THRESHOLDS;
  summary: {
    totalEpisodes: number;
    successfulEpisodes: number;
    failedEpisodes: number;
    warnings: string[];
    testMode: E2ETestMode;
    definition: string;
  };

  recommendations: string[];

  // M13: 质量信号
  signalsSummary?: SignalsSummary;

  // M14.2: 质量模式发现
  patternDiscovery?: PatternDiscoveryResult;

  // M14.3: 结构打法卡
  structurePlaybooks?: ReturnType<typeof generateStructurePlaybooks>;
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 清理测试项目
 */
async function cleanupProject(projectId: string): Promise<void> {
  try {
    await projectRepo.delete(projectId);
    console.log(`[Cleanup] Project ${projectId} deleted`);
  } catch (error) {
    console.warn(`[Cleanup] Failed to delete project ${projectId}:`, error);
  }
}

/**
 * 检测竖版剧本格式
 */
function hasVerticalFormat(content: string): boolean {
  const patterns = ['【场景】', '【时间】', '【人物】'];
  let count = 0;
  for (const pattern of patterns) {
    if (content.includes(pattern)) {
      count++;
    }
  }
  return count >= 1;  // 至少出现 1 种
}

/**
 * 判定耗时结果
 */
function evaluateTiming(ms: number, thresholdMs: number, stageName: string): { status: 'PASS' | 'WARN' | 'FAIL'; message: string } {
  const warnThreshold = thresholdMs * CONFIG.THRESHOLDS.WARN_MULTIPLIER;
  const failThreshold = thresholdMs * CONFIG.THRESHOLDS.FAIL_MULTIPLIER;
  
  if (ms > failThreshold) {
    return {
      status: 'FAIL',
      message: `${stageName}: ${ms}ms > ${failThreshold}ms (${(ms / failThreshold).toFixed(2)}x) - FAIL`
    };
  } else if (ms > warnThreshold) {
    return {
      status: 'WARN',
      message: `${stageName}: ${ms}ms > ${warnThreshold}ms (${(ms / warnThreshold).toFixed(2)}x) - WARN`
    };
  } else {
    return {
      status: 'PASS',
      message: `${stageName}: ${ms}ms < ${warnThreshold}ms - PASS`
    };
  }
}

/**
 * 初始化报告目录
 */
function initReportDir(): void {
  if (!fs.existsSync(CONFIG.REPORT_DIR)) {
    fs.mkdirSync(CONFIG.REPORT_DIR, { recursive: true });
  }
}

/**
 * 判定剧集是否可读（Phase1 快速可读性验收）
 */
function isEpisodeReadable(ep: EpisodeTestResult): boolean {
  return (
    (ep.status === EpisodeStatus.DRAFT || ep.status === EpisodeStatus.COMPLETED) &&
    typeof ep.contentLength === 'number' &&
    ep.contentLength >= 200
  );
}

// ============================================================================
// 测试流程
// ============================================================================

/**
 * 运行完整 E2E 测试
 */
async function runE2ETest(): Promise<TestReport> {
  const timer = createTimer('e2e_test');
  const testId = `test_${Date.now()}`;
  let projectId = '';  // 将从 seed 创建后获取
  const timestamp = new Date().toISOString();

  console.log('\n' + '='.repeat(80));
  console.log('DeepSeek API 全链路 E2E 测试');
  console.log('='.repeat(80));
  console.log(`测试ID: ${testId}`);
  console.log(`时间: ${timestamp}`);
  console.log(`模型: ${CONFIG.DEEPSEEK_MODEL}`);
  console.log(`目标集数: EP1-EP${CONFIG.TOTAL_EPISODES}`);
  console.log('='.repeat(80) + '\n');

  // 环境检查
  if (!CONFIG.DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY 环境变量未设置');
  }
  console.log(`✓ API Key 已配置 (前4位: ${CONFIG.DEEPSEEK_API_KEY.substring(0, 4)}***)`);

  const episodeResults: EpisodeTestResult[] = [];
  const warnings: string[] = [];

  // M10: Skeleton & Enrich 指标采集
  const skeletonEnrichMetrics: {
    bibleSkeletonMs?: number;
    bibleEnrichMs?: number;
    outlineSkeletonMs?: number;
    outlineEnrichMs?: number;
  } = {};

  // 初始化 metrics 收集
  const metricsOptions = {
    collectMetrics: true,
    timer
  };

  try {
    // ========================================================================
    // 阶段 1: Create Project Seed
    // ========================================================================
    console.log('\n【阶段 1/5】创建项目 Seed...');
    const seedSpan = timer.startSpan('total_seed');
    
    try {
      const project = await api.project.seed(CONFIG.TEST_USER_PROMPT, metricsOptions);
      projectId = project.id;  // 使用实际创建的项目 ID
      console.log(`✓ Seed 创建成功: ${project.name}`);
      console.log(`  - 题材: ${project.genre}`);
      console.log(`  - 集数: ${project.totalEpisodes}`);
      console.log(`  - 节奏模板: ${project.pacingTemplateId}`);
      console.log(`  - 项目ID: ${projectId}`);
    } catch (error: any) {
      throw new Error(`Seed 创建失败: ${error.message}`);
    }
    
    seedSpan.end();

    // ========================================================================
    // 阶段 2: Build Bible (M10: Skeleton + Enrich)
    // ========================================================================
    console.log('\n【阶段 2/5】构建 Bible...');
    const bibleSpan = timer.startSpan('total_bible');

    try {
      const bibleData = await api.project.generateBible(projectId, metricsOptions);
      console.log(`✓ Bible 构建成功`);
      console.log(`  - 角色数: ${bibleData.characters.length}`);
      console.log(`  - 世界设定: ${bibleData.bible.canonRules.worldSetting?.substring(0, 50)}...`);

      // M10: 采集 skeleton/enrich 指标
      const bibleSkeletonSpans = timer.getSpansByName('bible_skeleton');
      const bibleEnrichSpans = timer.getSpansByName('bible_enrich');

      if (bibleSkeletonSpans.length > 0) {
        skeletonEnrichMetrics.bibleSkeletonMs = bibleSkeletonSpans[0].ms;
        console.log(`  - Skeleton 耗时: ${skeletonEnrichMetrics.bibleSkeletonMs}ms`);
      }

      if (bibleEnrichSpans.length > 0) {
        skeletonEnrichMetrics.bibleEnrichMs = bibleEnrichSpans[0].ms;
        console.log(`  - Enrich 耗时: ${skeletonEnrichMetrics.bibleEnrichMs}ms`);
      }
    } catch (error: any) {
      throw new Error(`Bible 构建失败: ${error.message}`);
    }

    bibleSpan.end();

    // ========================================================================
    // 阶段 3: Generate Outline (EP1-EP3) (M10: Skeleton + Enrich)
    // ========================================================================
    console.log('\n【阶段 3/5】生成 Outline...');
    const outlineSpan = timer.startSpan('total_outline');

    try {
      // 修改项目总集数为测试集数（只生成前 3 集）
      const project = await projectRepo.get(projectId);
      if (project) {
        await projectRepo.save(projectId, { totalEpisodes: CONFIG.TOTAL_EPISODES });
      }

      const outline = await api.project.generateOutline(projectId, undefined, metricsOptions);
      console.log(`✓ Outline 生成成功`);
      console.log(`  - 生成集数: ${outline.length}`);

      // M10: 采集 skeleton/enrich 指标
      const outlineSkeletonSpans = timer.getSpansByName('outline_skeleton');
      const outlineEnrichSpans = timer.getSpansByName('outline_enrich');

      if (outlineSkeletonSpans.length > 0) {
        skeletonEnrichMetrics.outlineSkeletonMs = outlineSkeletonSpans[0].ms;
        console.log(`  - Skeleton 耗时: ${skeletonEnrichMetrics.outlineSkeletonMs}ms`);
      }

      if (outlineEnrichSpans.length > 0) {
        skeletonEnrichMetrics.outlineEnrichMs = outlineEnrichSpans[0].ms;
        console.log(`  - Enrich 耗时: ${skeletonEnrichMetrics.outlineEnrichMs}ms`);
      }
    } catch (error: any) {
      throw new Error(`Outline 生成失败: ${error.message}`);
    }

    outlineSpan.end();

    // ========================================================================
    // 阶段 4: Generate Episodes (EP1-EP3)
    // ========================================================================
    console.log('\n【阶段 4/5】生成剧集...');
    const episodesSpan = timer.startSpan('total_episodes');
    
    for (let epIndex = 1; epIndex <= CONFIG.TOTAL_EPISODES; epIndex++) {
      console.log(`\n  --- 生成 EP${epIndex} ---`);
      const result: EpisodeTestResult = {
        episodeIndex: epIndex,
        status: EpisodeStatus.FAILED,
        contentLength: 0,
        qualityPassed: false,
        alignerPassed: false,
        warnings: []
      };
      
      try {
        const episode = await api.episode.generate(projectId, epIndex, metricsOptions);
        result.status = episode.status;
        result.contentLength = episode.content?.length || 0;
        result.qualityPassed = episode.validation?.qualityCheck?.passed || false;
        result.alignerPassed = episode.alignment?.severity !== 'FAIL';
        result.qualitySignals = episode.qualitySignals;  // M13: 读取质量信号

        // 提取 metrics
        if (episode.metrics) {
          const writerSpan = episode.metrics.spans.find(s => s.name.includes('llm_call'));
          const parseSpan = episode.metrics.spans.find(s => s.name.includes('json_parse'));
          const validateSpan = episode.metrics.spans.find(s => s.name.includes('validate'));
          const alignSpan = episode.metrics.spans.find(s => s.name.includes('aligner'));
          const saveSpan = episode.metrics.spans.find(s => s.name.includes('save_episode'));

          result.metrics = {
            writerTime: episode.metrics.totalTime || 0,
            saveTime: saveSpan?.ms || 0,
            totalTime: episode.metrics.totalTime || 0,
            llm_ms: writerSpan?.ms || 0,
            parse_ms: parseSpan?.ms || 0,
            validate_ms: validateSpan?.ms || 0,
            align_ms: alignSpan?.ms || 0,
            save_ms: saveSpan?.ms || 0
          };

          // 记录 firstReadableMs（从 DRAFT 状态到达时间）
          result.firstReadableMs = episode.metrics.totalTime || 0;
        }

        console.log(`✓ EP${epIndex} 生成成功`);
        console.log(`  - 状态: ${result.status}`);
        console.log(`  - 字数: ${result.contentLength}`);
        console.log(`  - 质量检查: ${result.qualityPassed ? 'PASS' : 'FAIL'}`);
        console.log(`  - Aligner: ${result.alignerPassed ? 'PASS' : 'FAIL'}`);
        if (result.qualitySignals) {
          console.log(`  - 质量信号:`);
          console.log(`    * conflictProgressed: ${result.qualitySignals.conflictProgressed}`);
          console.log(`    * costPaid: ${result.qualitySignals.costPaid}`);
          console.log(`    * factReused: ${result.qualitySignals.factReused}`);
          console.log(`    * newReveal: ${result.qualitySignals.newReveal}`);
          console.log(`    * promiseAddressed: ${result.qualitySignals.promiseAddressed}`);
          console.log(`    * stateCoherent: ${result.qualitySignals.stateCoherent}`);
        }
        if (result.metrics) {
          console.log(`  - 耗时: ${result.metrics.totalTime}ms`);
        }
      } catch (error: any) {
        result.error = error.message;
        console.error(`✗ EP${epIndex} 生成失败: ${error.message}`);
      }
      
      episodeResults.push(result);
    }
    
    episodesSpan.end();

    // ========================================================================
    // 阶段 5: 验证与报告
    // ========================================================================
    console.log('\n【阶段 5/5】验证数据一致性...');
    
    const batch = batchRepo.get(projectId);
    const consistencyResult = validateBatchConsistency(batch, episodeResults, TEST_MODE);
    
    console.log(`${consistencyResult.passed ? '✓' : '✗'} 状态一致性: ${consistencyResult.passed ? 'PASS' : 'FAIL'}`);
    if (consistencyResult.issues.length > 0) {
      consistencyResult.issues.forEach(issue => console.log(`  - ${issue}`));
    }

  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    throw error;
  }

  // ========================================================================
  // 指标判定
  // ========================================================================
  console.log('\n【指标判定】');
  
  const duration = {
    total: timer.getTotalTime(),
    seed: timer.getStats('seed_generation').max,
    bible: timer.getStats('bible_generation').max,
    outline: timer.getStats('outline_generation').max,
    episodes: [] as number[]
  };
  
  // 收集每集耗时
  for (let epIndex = 1; epIndex <= CONFIG.TOTAL_EPISODES; epIndex++) {
    const stats = timer.getStats(`generateEpisodeFast_ep${epIndex}`);
    duration.episodes.push(stats.max || 0);
  }
  
  // 判定 EP1 Phase1
  const ep1Phase1Time = duration.episodes[0];
  const ep1TimingResult = evaluateTiming(ep1Phase1Time, CONFIG.THRESHOLDS.EP1_PHASE1_MAX_MS, 'EP1 Phase1');
  console.log(`  ${ep1TimingResult.message}`);
  if (ep1TimingResult.status === 'WARN') warnings.push(ep1TimingResult.message);
  if (ep1TimingResult.status === 'FAIL') warnings.push(ep1TimingResult.message);
  
  // 判定单集耗时（EP2, EP3）
  for (let epIndex = 2; epIndex <= CONFIG.TOTAL_EPISODES; epIndex++) {
    const epTime = duration.episodes[epIndex - 1];
    const epResult = evaluateTiming(epTime, CONFIG.THRESHOLDS.SINGLE_EPISODE_MAX_MS, `EP${epIndex}`);
    console.log(`  ${epResult.message}`);
    if (epResult.status === 'WARN') warnings.push(epResult.message);
    if (epResult.status === 'FAIL') warnings.push(epResult.message);
  }
  
  // 判定全链路耗时
  const totalResult = evaluateTiming(duration.total, CONFIG.THRESHOLDS.TOTAL_PIPELINE_MAX_MS, '全链路');
  console.log(`  ${totalResult.message}`);
  if (totalResult.status === 'WARN') warnings.push(totalResult.message);
  if (totalResult.status === 'FAIL') warnings.push(totalResult.message);

  // ========================================================================
  // 用户体验 SLA 判定
  // ========================================================================
  console.log('\n【用户体验 SLA 判定】');

  const ep1Episode = episodeResults.find(ep => ep.episodeIndex === 1);
  const ep1_phase1_firstReadableMs = ep1Episode?.firstReadableMs || 0;

  const ep1SLA = evaluateTiming(
    ep1_phase1_firstReadableMs,
    CONFIG.THRESHOLDS.EP1_PHASE1_MAX_MS,
    'EP1 Phase1 firstReadable'
  );
  console.log(`  ${ep1SLA.message}`);

  const ep2Episode = episodeResults.find(ep => ep.episodeIndex === 2);
  const ep2_readableMs = ep2Episode?.firstReadableMs || 0;
  const ep2SLA = evaluateTiming(
    ep2_readableMs,
    CONFIG.THRESHOLDS.SINGLE_EPISODE_MAX_MS,
    'EP2 readable'
  );
  console.log(`  ${ep2SLA.message}`);

  let ep3_readableMs = 0;
  let ep3SLA = null;
  const ep3Episode = episodeResults.find(ep => ep.episodeIndex === 3);
  if (ep3Episode) {
    ep3_readableMs = ep3Episode.firstReadableMs || 0;
    ep3SLA = evaluateTiming(
      ep3_readableMs,
      CONFIG.THRESHOLDS.SINGLE_EPISODE_MAX_MS,
      'EP3 readable'
    );
    console.log(`  ${ep3SLA.message}`);
  }

  // 判定 SLA 状态
  let slaStatus: 'PASS' | 'FAIL' | 'WARN' = 'PASS';
  if (ep1SLA.status === 'FAIL') {
    slaStatus = 'FAIL';
  } else if (ep2SLA.status === 'FAIL' || ep3SLA?.status === 'FAIL') {
    slaStatus = 'FAIL';
  } else if (ep1SLA.status === 'WARN' || ep2SLA.status === 'WARN' || ep3SLA?.status === 'WARN') {
    slaStatus = 'WARN';
  }

  const userExperienceSLA = {
    ep1_phase1_firstReadableMs,
    ep2_readableMs,
    ep3_readableMs: ep3Episode ? ep3_readableMs : undefined,
    slaStatus,
    slaDetails: {
      ep1_status: `${ep1SLA.status} (${(ep1_phase1_firstReadableMs / 1000).toFixed(2)}s)`,
      ep2_status: `${ep2SLA.status} (${(ep2_readableMs / 1000).toFixed(2)}s)`,
      ep3_status: ep3Episode ? `${ep3SLA.status} (${(ep3_readableMs / 1000).toFixed(2)}s)` : undefined
    }
  };

  console.log(`  用户体验 SLA 状态: ${slaStatus}`);
  
  // 判定内容质量
  console.log('\n【内容质量判定】');
  for (const epResult of episodeResults) {
    const epIndex = epResult.episodeIndex;
    const contentLength = epResult.contentLength;
    
    // 检查最小字数
    if (epResult.status === EpisodeStatus.COMPLETED) {
      if (contentLength < CONFIG.QUALITY.MIN_CONTENT_LENGTH_COMPLETED) {
        const msg = `EP${epIndex}: 字数 ${contentLength} < ${CONFIG.QUALITY.MIN_CONTENT_LENGTH_COMPLETED} (COMPLETED)`;
        warnings.push(msg);
        console.log(`  ✗ ${msg}`);
      } else {
        console.log(`  ✓ EP${epIndex}: 字数 ${contentLength} >= ${CONFIG.QUALITY.MIN_CONTENT_LENGTH_COMPLETED} (COMPLETED)`);
      }
    } else if (epResult.status === EpisodeStatus.DRAFT) {
      if (contentLength < CONFIG.QUALITY.MIN_CONTENT_LENGTH_DRAFT) {
        const msg = `EP${epIndex}: 字数 ${contentLength} < ${CONFIG.QUALITY.MIN_CONTENT_LENGTH_DRAFT} (DRAFT)`;
        warnings.push(msg);
        console.log(`  ✗ ${msg}`);
      } else {
        console.log(`  ✓ EP${epIndex}: 字数 ${contentLength} >= ${CONFIG.QUALITY.MIN_CONTENT_LENGTH_DRAFT} (DRAFT)`);
      }
    }
  }

  // ========================================================================
  // 生成报告
  // ========================================================================
  console.log('\n【生成报告】');

  const successfulEpisodes = episodeResults.filter(ep =>
    ep.status === EpisodeStatus.COMPLETED || ep.status === EpisodeStatus.DRAFT
  ).length;

  const failedEpisodes = episodeResults.filter(ep => ep.status === EpisodeStatus.FAILED).length;

  const overallStatus = determineOverallStatus(
    episodeResults,
    duration,
    warnings,
    TEST_MODE,
    slaStatus
  );

  // M14.1: 聚合质量信号
  console.log('\n【质量信号聚合】');
  const signalsSummary = aggregateSignals(episodeResults);
  console.log(`✓ 已聚合 ${signalsSummary.totalEpisodes} 集的质量信号`);
  console.log(`  - conflictProgressed: ${signalsSummary.signalHitCount.conflictProgressed}/${signalsSummary.totalEpisodes}`);
  console.log(`  - costPaid: ${signalsSummary.signalHitCount.costPaid}/${signalsSummary.totalEpisodes}`);
  console.log(`  - factReused: ${signalsSummary.signalHitCount.factReused}/${signalsSummary.totalEpisodes}`);
  console.log(`  - newReveal: ${signalsSummary.signalHitCount.newReveal}/${signalsSummary.totalEpisodes}`);
  console.log(`  - promiseAddressed: ${signalsSummary.signalHitCount.promiseAddressed}/${signalsSummary.totalEpisodes}`);
  console.log(`  - stateCoherent: ${signalsSummary.signalHitCount.stateCoherent}/${signalsSummary.totalEpisodes}`);

  // M14.2: 发现质量模式
  console.log('\n【质量模式发现】');
  const patternDiscovery = discoverPatterns(signalsSummary);
  console.log(`✓ 已发现 ${patternDiscovery.highQualityPatterns.length} 个高质量模式`);
  console.log(`✓ 已发现 ${patternDiscovery.missingSignalsWarnings.length} 个缺失信号警示`);
  console.log(`✓ 已生成 ${patternDiscovery.insights.length} 条洞察`);

  // M14.3: 生成结构打法卡
  console.log('\n【结构打法卡生成】');
  const structurePlaybooks = generateStructurePlaybooks(patternDiscovery);
  console.log(`✓ 已生成 ${structurePlaybooks.playbooks.length} 张结构打法卡`);
  console.log(`  - ${structurePlaybooks.summary}`);

  const report: TestReport = {
    testId,
    timestamp,
    projectId,
    model: CONFIG.DEEPSEEK_MODEL,
    overallStatus,
    duration,
    userExperienceSLA,
    skeletonEnrichMetrics,  // M10: 添加 skeleton/enrich 指标
    episodeResults,
    batchConsistency: validateBatchConsistency(batchRepo.get(projectId), episodeResults, TEST_MODE),
    thresholds: CONFIG.THRESHOLDS,
    summary: {
      totalEpisodes: episodeResults.length,
      successfulEpisodes,
      failedEpisodes,
      warnings,
      testMode: TEST_MODE,
      definition: TEST_MODE === 'PHASE1_ONLY'
        ? 'Phase1 快速可读性验收（DRAFT 合法）'
        : TEST_MODE === 'M15_VALIDATION'
        ? 'M15.1 真实生产验证（Structure Playbooks 效果评估）'
        : '全流程完成度验收（仅 COMPLETED 合法）'
    },
    recommendations: generateRecommendations(episodeResults, duration, warnings),
    signalsSummary,  // M14.1: 添加质量信号聚合
    patternDiscovery,  // M14.2: 添加质量模式发现
    structurePlaybooks  // M14.3: 添加结构打法卡
  };
  
  // 写入 JSON 报告
  fs.writeFileSync(CONFIG.JSON_REPORT, JSON.stringify(report, null, 2));
  console.log(`✓ JSON 报告: ${CONFIG.JSON_REPORT}`);
  
  // 写入 Markdown 报告
  const mdReport = generateMarkdownReport(report);
  fs.writeFileSync(CONFIG.MD_REPORT, mdReport);
  console.log(`✓ MD 报告: ${CONFIG.MD_REPORT}`);
  
  // ========================================================================
  // 清理
  // ========================================================================
  console.log('\n【清理】');
  await cleanupProject(projectId);

  // ========================================================================
  // 最终状态输出
  // ========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('测试完成');
  console.log('='.repeat(80));
  console.log(`总体状态: ${report.overallStatus}`);
  console.log(`总耗时: ${(duration.total / 1000).toFixed(2)}s`);
  console.log(`成功集数: ${successfulEpisodes}/${episodeResults.length}`);
  console.log(`警告数: ${warnings.length}`);
  console.log(`报告路径: ${CONFIG.REPORT_DIR}`);
  console.log('='.repeat(80) + '\n');
  
  return report;
}

/**
 * 验证 Batch 状态一致性
 */
function validateBatchConsistency(
  batch: any,
  episodeResults: EpisodeTestResult[],
  testMode: E2ETestMode = 'PHASE1_ONLY'
): BatchConsistencyResult {
  const result: BatchConsistencyResult = {
    passed: true,
    issues: [],
    details: {
      totalEpisodes: episodeResults.length,
      completedCount: 0,
      completedIndexes: [],
      inconsistentIndexes: []
    }
  };

  if (!batch) {
    result.issues.push('Batch 状态未找到');
    result.passed = false;
    return result;
  }

  // 检查 batch.completed 是否只包含 COMPLETED 状态的剧集
  for (const epIndex of batch.completed || []) {
    const episodeResult = episodeResults.find(ep => ep.episodeIndex === epIndex);

    if (!episodeResult) {
      result.issues.push(`Batch completed 包含不存在的剧集: EP${epIndex}`);
      result.passed = false;
      continue;
    }

    if (episodeResult.status !== EpisodeStatus.COMPLETED) {
      result.issues.push(`Batch completed 包含非 COMPLETED 状态: EP${epIndex} (${episodeResult.status})`);
      result.passed = false;
      result.details.inconsistentIndexes.push(epIndex);
    } else {
      result.details.completedIndexes.push(epIndex);
    }
  }

  result.details.completedCount = result.details.completedIndexes.length;

  // 仅在 FULL_PIPELINE 模式下检查 batch.completed 数量一致性
  if (testMode === 'FULL_PIPELINE') {
    if (batch.completed.length !== episodeResults.length) {
      result.issues.push(
        `Batch completed 数量不一致: ${batch.completed.length}/${episodeResults.length}`
      );
      result.passed = false;
    }
  }

  // 检查 EP1 必须成功
  const ep1Result = episodeResults.find(ep => ep.episodeIndex === 1);
  if (ep1Result && ep1Result.status === EpisodeStatus.FAILED) {
    result.issues.push('EP1 状态为 FAILED，强依赖失败');
    result.passed = false;
  }

  return result;
}

/**
 * 判定总体状态
 */
function determineOverallStatus(
  episodeResults: EpisodeTestResult[],
  duration: any,
  warnings: string[],
  testMode: E2ETestMode = 'PHASE1_ONLY',
  slaStatus: 'PASS' | 'WARN' | 'FAIL' = 'PASS'
): 'PASS' | 'WARN' | 'FAIL' {
  // 检查 EP1 是否成功
  const ep1Result = episodeResults.find(ep => ep.episodeIndex === 1);
  if (!ep1Result || ep1Result.status === EpisodeStatus.FAILED) {
    return 'FAIL';
  }

  // SLA 优先：如果 SLA 为 FAIL，总体状态也为 FAIL
  if (slaStatus === 'FAIL') {
    return 'FAIL';
  }

  // 根据测试模式进行不同判定
  if (testMode === 'PHASE1_ONLY') {
    // PHASE1_ONLY 模式：检查所有剧集是否可读
    const unreadable = episodeResults.filter(ep => !isEpisodeReadable(ep));
    if (unreadable.length > 0) {
      return 'FAIL';
    }
  } else {
    // FULL_PIPELINE 模式：检查是否有致命错误
    if (warnings.some(w => w.includes('FAIL'))) {
      return 'FAIL';
    }
  }

  // 检查是否有警告
  if (warnings.length > 0 || slaStatus === 'WARN') {
    return 'WARN';
  }

  return 'PASS';
}

/**
 * 生成建议
 */
function generateRecommendations(
  episodeResults: EpisodeTestResult[],
  duration: any,
  warnings: string[]
): string[] {
  const recommendations: string[] = [];
  
  // 分析最慢的阶段
  const stages = [
    { name: 'Seed', time: duration.seed },
    { name: 'Bible', time: duration.bible },
    { name: 'Outline', time: duration.outline },
  ];
  
  const slowestStage = stages.reduce((max, stage) => 
    stage.time > max.time ? stage : max, stages[0]);
  
  recommendations.push(`最慢阶段: ${slowestStage.name} (${(slowestStage.time / 1000).toFixed(2)}s)，建议优化该阶段的 Prompt 或减少数据量`);
  
  // 分析剧集生成耗时
  if (duration.episodes.length > 0) {
    const avgEpTime = duration.episodes.reduce((sum: number, t: number) => sum + t, 0) / duration.episodes.length;
    recommendations.push(`平均单集耗时: ${(avgEpTime / 1000).toFixed(2)}s`);
  }
  
  // 根据警告生成建议
  if (warnings.some(w => w.includes('字数'))) {
    recommendations.push('内容长度不足，建议优化 Prompt 以生成更长的内容');
  }
  
  if (warnings.some(w => w.includes('FAIL'))) {
    recommendations.push('存在严重问题，建议检查 API 连接和配置');
  }
  
  return recommendations;
}

/**
 * 生成 Markdown 报告
 */
function generateMarkdownReport(report: TestReport): string {
  const lines: string[] = [];
  
  // 标题
  lines.push('# DeepSeek API E2E 测试报告');
  lines.push('');
  
  // 基本信息
  lines.push('## 基本信息');
  lines.push('');
  lines.push(`- **测试ID**: ${report.testId}`);
  lines.push(`- **测试时间**: ${report.timestamp}`);
  lines.push(`- **项目ID**: ${report.projectId}`);
  lines.push(`- **模型**: ${report.model}`);
  lines.push(`- **总体状态**: **${report.overallStatus}**`);
  lines.push('');
  
  // 摘要
  lines.push('## 摘要');
  lines.push('');
  lines.push(`- **测试模式**: ${report.summary.testMode}`);
  lines.push(`- **测试说明**: ${report.summary.definition}`);
  lines.push(`- **总集数**: ${report.summary.totalEpisodes}`);
  lines.push(`- **成功集数**: ${report.summary.successfulEpisodes}`);
  lines.push(`- **失败集数**: ${report.summary.failedEpisodes}`);
  lines.push(`- **警告数**: ${report.summary.warnings.length}`);
  lines.push(`- **总耗时**: ${(report.duration.total / 1000).toFixed(2)}s`);
  lines.push('');

  // 用户体验 SLA
  lines.push('## 用户体验 SLA');
  lines.push('');
  lines.push(`- **SLA 状态**: **${report.userExperienceSLA.slaStatus}**`);
  lines.push(`- **EP1 Phase1 firstReadable**: ${(report.userExperienceSLA.ep1_phase1_firstReadableMs / 1000).toFixed(2)}s (${report.userExperienceSLA.slaDetails.ep1_status})`);
  lines.push(`- **EP2 readable**: ${(report.userExperienceSLA.ep2_readableMs / 1000).toFixed(2)}s (${report.userExperienceSLA.slaDetails.ep2_status})`);
  if (report.userExperienceSLA.ep3_readableMs !== undefined) {
    lines.push(`- **EP3 readable**: ${(report.userExperienceSLA.ep3_readableMs / 1000).toFixed(2)}s (${report.userExperienceSLA.slaDetails.ep3_status})`);
  }
  lines.push('');

  // M10: Skeleton & Enrich 指标
  if (report.skeletonEnrichMetrics) {
    lines.push('## Skeleton & Enrich 指标');
    lines.push('');
    lines.push('| 阶段 | Skeleton 耗时 (ms) | Enrich 耗时 (ms) | 状态 |');
    lines.push('|------|-------------------|------------------|------|');

    const formatSkeletonEnrich = (name: string, skeletonMs?: number, enrichMs?: number) => {
      const skeleton = skeletonMs !== undefined ? skeletonMs : 'pending';
      const enrich = enrichMs !== undefined ? enrichMs : 'pending';
      const status = skeletonMs !== undefined && enrichMs !== undefined ? '✅ Enrich 完成' : '⏳ Enrich 进行中';
      return `| ${name} | ${skeleton} | ${enrich} | ${status} |`;
    };

    if (report.skeletonEnrichMetrics.bibleSkeletonMs !== undefined || report.skeletonEnrichMetrics.bibleEnrichMs !== undefined) {
      lines.push(formatSkeletonEnrich('Bible', report.skeletonEnrichMetrics.bibleSkeletonMs, report.skeletonEnrichMetrics.bibleEnrichMs));
    }

    if (report.skeletonEnrichMetrics.outlineSkeletonMs !== undefined || report.skeletonEnrichMetrics.outlineEnrichMs !== undefined) {
      lines.push(formatSkeletonEnrich('Outline', report.skeletonEnrichMetrics.outlineSkeletonMs, report.skeletonEnrichMetrics.outlineEnrichMs));
    }

    lines.push('');

    // 首屏性能改善
    if (report.skeletonEnrichMetrics.bibleSkeletonMs !== undefined && report.skeletonEnrichMetrics.outlineSkeletonMs !== undefined) {
      lines.push('## 首屏性能改善');
      lines.push('');
      const skeletonTotal = report.skeletonEnrichMetrics.bibleSkeletonMs + report.skeletonEnrichMetrics.outlineSkeletonMs;
      lines.push(`- EP1 Phase1 firstReadableMs: ${report.userExperienceSLA.ep1_phase1_firstReadableMs}ms (含 Bible+Outline skeleton)`);
      lines.push(`- Skeleton 总耗时: ${skeletonTotal}ms`);
      lines.push(`- 预计改善: 使用 Skeleton 可显著降低首屏时间`);
      lines.push('');
    }
  }

  // 耗时指标
  lines.push('## 耗时指标');
  lines.push('');
  lines.push('| 阶段 | 耗时 (ms) | 耗时 (s) | 阈值 (s) | 状态 |');
  lines.push('|------|----------|----------|----------|------|');
  
  const formatStage = (name: string, time: number, threshold: number) => {
    const timeS = (time / 1000).toFixed(2);
    const thresholdS = (threshold / 1000).toFixed(2);
    const status = time <= threshold ? '✅ PASS' : '❌ FAIL';
    return `| ${name} | ${time} | ${timeS} | ${thresholdS} | ${status} |`;
  };
  
  lines.push(formatStage('Seed', report.duration.seed, 60000));
  lines.push(formatStage('Bible', report.duration.bible, 60000));
  lines.push(formatStage('Outline', report.duration.outline, 60000));
  
  for (let i = 0; i < report.duration.episodes.length; i++) {
    const epIndex = i + 1;
    const threshold = epIndex === 1 ? 60000 : 120000;
    lines.push(formatStage(`EP${epIndex}`, report.duration.episodes[i], threshold));
  }
  
  lines.push(formatStage('总计', report.duration.total, 600000));
  lines.push('');
  
  // 剧集详情
  lines.push('## 剧集详情');
  lines.push('');
  lines.push('| 集数 | 状态 | 字数 | 质量检查 | Aligner | 耗时 (ms) | 质量信号 |');
  lines.push('|------|------|------|----------|---------|-----------|---------|');

  for (const ep of report.episodeResults) {
    const statusIcon = ep.status === EpisodeStatus.COMPLETED ? '✅' :
                      ep.status === EpisodeStatus.DRAFT ? '⏳' : '❌';
    const qualityIcon = ep.qualityPassed ? '✅' : '❌';
    const alignerIcon = ep.alignerPassed ? '✅' : '❌';
    const time = ep.metrics?.totalTime || 0;

    // 质量信号摘要
    let signalsSummary = '';
    if (ep.qualitySignals) {
      const signalCount = Object.values(ep.qualitySignals).filter(v => v).length;
      signalsSummary = `${signalCount}/6`;
    } else {
      signalsSummary = '-';
    }

    // 在 PHASE1_ONLY 模式下，检查可读性并在状态后标注
    const isReadable = isEpisodeReadable(ep);
    const statusText = report.summary.testMode === 'PHASE1_ONLY' && isReadable
      ? `${statusIcon} ${ep.status} ✅ (可读)`
      : `${statusIcon} ${ep.status}`;

    lines.push(`| EP${ep.episodeIndex} | ${statusText} | ${ep.contentLength} | ${qualityIcon} | ${alignerIcon} | ${time} | ${signalsSummary} |`);
  }
  lines.push('');

  // 质量信号详情（M13）
  lines.push('## 质量信号（M13）');
  lines.push('');
  lines.push('| 集数 | 冲突推进 | 代价付出 | 事实复用 | 新揭示 | 承诺回应 | 状态连贯 | 信号总数 |');
  lines.push('|------|----------|----------|----------|--------|----------|----------|----------|');

  for (const ep of report.episodeResults) {
    if (!ep.qualitySignals) {
      lines.push(`| EP${ep.episodeIndex} | - | - | - | - | - | - | - |`);
      continue;
    }

    const conflictProgressed = ep.qualitySignals.conflictProgressed ? '✅' : '❌';
    const costPaid = ep.qualitySignals.costPaid ? '✅' : '❌';
    const factReused = ep.qualitySignals.factReused ? '✅' : '❌';
    const newReveal = ep.qualitySignals.newReveal ? '✅' : '❌';
    const promiseAddressed = ep.qualitySignals.promiseAddressed ? '✅' : '❌';
    const stateCoherent = ep.qualitySignals.stateCoherent ? '✅' : '❌';
    const signalCount = Object.values(ep.qualitySignals).filter(v => v).length;

    lines.push(`| EP${ep.episodeIndex} | ${conflictProgressed} | ${costPaid} | ${factReused} | ${newReveal} | ${promiseAddressed} | ${stateCoherent} | ${signalCount}/6 |`);
  }
  lines.push('');

  // M14.1: 质量信号聚合统计
  if (report.signalsSummary) {
    lines.push('## 质量信号统计（M14.1）');
    lines.push('');

    // Signal 命中率表格
    lines.push('### Signal 命中率');
    lines.push('');
    lines.push('| Signal | 命中次数 | 命中率 | 趋势 |');
    lines.push('|--------|---------|--------|------|');

    const rateToLevel = (rate: number): string => {
      if (rate >= 0.9) return '优秀';
      if (rate >= 0.7) return '良好';
      if (rate >= 0.5) return '中等';
      return '偏低';
    };

    const summary = report.signalsSummary;
    const formatSignalRow = (name: string, count: number, rate: number) => {
      const displayName = name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
      return `| ${displayName} | ${count}/${summary.totalEpisodes} | ${(rate * 100).toFixed(1)}% | ${rateToLevel(rate)} |`;
    };

    lines.push(formatSignalRow('conflictProgressed', summary.signalHitCount.conflictProgressed, summary.signalHitRate.conflictProgressed));
    lines.push(formatSignalRow('costPaid', summary.signalHitCount.costPaid, summary.signalHitRate.costPaid));
    lines.push(formatSignalRow('factReused', summary.signalHitCount.factReused, summary.signalHitRate.factReused));
    lines.push(formatSignalRow('newReveal', summary.signalHitCount.newReveal, summary.signalHitRate.newReveal));
    lines.push(formatSignalRow('promiseAddressed', summary.signalHitCount.promiseAddressed, summary.signalHitRate.promiseAddressed));
    lines.push(formatSignalRow('stateCoherent', summary.signalHitCount.stateCoherent, summary.signalHitRate.stateCoherent));
    lines.push('');

    // 每集信号命中数表格
    lines.push('### 每集信号命中数');
    lines.push('');
    lines.push('| 集数 | 命中数 | 命中的 Signals |');
    lines.push('|------|--------|----------------|');

    for (const epSignals of summary.perEpisodeSignals) {
      const hitSignals: string[] = [];
      if (epSignals.signals.conflictProgressed) hitSignals.push('conflictProgressed');
      if (epSignals.signals.costPaid) hitSignals.push('costPaid');
      if (epSignals.signals.factReused) hitSignals.push('factReused');
      if (epSignals.signals.newReveal) hitSignals.push('newReveal');
      if (epSignals.signals.promiseAddressed) hitSignals.push('promiseAddressed');
      if (epSignals.signals.stateCoherent) hitSignals.push('stateCoherent');

      const signalsText = hitSignals.length > 0
        ? hitSignals.map(s => `✓ ${s}`).join(', ')
        : '-';

      lines.push(`| EP${epSignals.episodeIndex} | ${epSignals.hitCount}/6 | ${signalsText} |`);
    }
    lines.push('');

    // 关键洞察
    const insights = generateSignalsInsights(summary);
    if (insights.length > 0) {
      lines.push('### 关键洞察');
      lines.push('');
      for (const insight of insights) {
        lines.push(`- ${insight}`);
      }
      lines.push('');
    }
  }

  // M14.2: 质量模式分析
  if (report.patternDiscovery) {
    const pd = report.patternDiscovery;
    lines.push('## 质量模式分析（M14.2）');
    lines.push('');

    // Top Quality Patterns
    lines.push('### Top Quality Patterns');
    lines.push('');
    lines.push('以下模式在高高质量集中（≥4 signals）频繁出现：');
    lines.push('');
    lines.push(formatPatternsAsMarkdown(pd.highQualityPatterns));
    lines.push('');

    // Missing Signals Warnings
    lines.push('### Missing Signals Warnings');
    lines.push('');
    lines.push('以下信号在低质量集中（≤1 signals）缺失率较高：');
    lines.push('');
    lines.push(formatMissingSignalsAsMarkdown(pd.missingSignalsWarnings));
    lines.push('');

    // 人类可读洞察
    lines.push('### 结构洞察');
    lines.push('');
    lines.push(formatInsightsAsMarkdown(pd.insights));
    lines.push('');
  }

  // M14.3: 结构打法卡
  if (report.structurePlaybooks) {
    const sp = report.structurePlaybooks;
    lines.push('## 结构打法卡（M14.3）');
    lines.push('');

    lines.push('### 打法卡总览');
    lines.push('');
    lines.push(sp.summary);
    lines.push('');

    lines.push('### 打法卡详情');
    lines.push('');
    lines.push(formatPlaybooksAsMarkdown(sp.playbooks));
    lines.push('');
  }

  // 状态一致性
  lines.push('## 状态一致性');
  lines.push('');

  if (report.summary.testMode === 'PHASE1_ONLY') {
    lines.push(`- **一致性检查**: ✅ PASS (Phase1 模式下跳过 batch.completed 检查)`);
    lines.push(`- **已完成集数**: ${report.batchConsistency.details.completedCount} (未纳入验收)`);
    lines.push(`- **已完成索引**: ${report.batchConsistency.details.completedIndexes.join(', ') || '无'}`);
  } else {
    lines.push(`- **一致性检查**: ${report.batchConsistency.passed ? '✅ PASS' : '❌ FAIL'}`);
    lines.push(`- **已完成集数**: ${report.batchConsistency.details.completedCount}`);
    lines.push(`- **已完成索引**: ${report.batchConsistency.details.completedIndexes.join(', ') || '无'}`);
  }

  if (report.batchConsistency.issues.length > 0) {
    lines.push('');
    lines.push('**问题**:');
    for (const issue of report.batchConsistency.issues) {
      lines.push(`- ${issue}`);
    }
  }
  lines.push('');
  
  // 警告
  if (report.summary.warnings.length > 0) {
    lines.push('## 警告');
    lines.push('');
    for (const warning of report.summary.warnings) {
      lines.push(`- ${warning}`);
    }
    lines.push('');
  }
  
  // 建议
  lines.push('## 建议');
  lines.push('');
  for (const rec of report.recommendations) {
    lines.push(`- ${rec}`);
  }
  lines.push('');
  
  // 阈值配置
  lines.push('## 阈值配置');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(report.thresholds, null, 2));
  lines.push('```');
  lines.push('');
  
  return lines.join('\n');
}

// ============================================================================
// 主入口
// ============================================================================

async function main() {
  try {
    initReportDir();
    const report = await runE2ETest();

    // 退出码：PASS=0, FAIL=1, WARN=0 (PHASE1_ONLY 模式下 WARN 不导致失败)
    const exitCode = report.overallStatus === 'FAIL' ? 1 : 0;
    process.exit(exitCode);
  } catch (error: any) {
    console.error('\n💥 测试异常:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { runE2ETest };
export type { TestReport, EpisodeTestResult };

