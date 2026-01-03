/**
 * ScriptFlow Product Orchestrator
 *
 * 职责：
 * - 产品级运行中枢，供 UI/CLI/API 统一调用
 * - 协调项目创建、生成、Metrics 收集、Regression Gate
 * - 生成产品可读 Summary
 * - 在 CI 环境下触发 Gold Promotion
 *
 * 不修改 M16 内核，只复用现有逻辑
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

// 加载环境变量（必须在任何其他导入之前）
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env.local') });

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { api } from '../api';
import { projectRepo } from '../lib/store/projectRepo';
import { checkRegressionGate, MetricsData } from '../lib/product/regressionGate';
import { buildSummary, readGoldBaseline, readPendingState, PromotionStatus } from '../lib/product/summaryBuilder';
import { metrics } from '../lib/metrics/runMetrics';

/**
 * 项目运行参数
 */
export interface RunProjectArgs {
  prompt: string;
  genre?: string;
  totalEpisodes?: number;
  source: 'ui' | 'cli' | 'api';
}

/**
 * 项目运行结果
 */
export interface ProjectRunResult {
  projectId: string;
  runId: string;
  metricsPath: string | null;
  summaryText: string;
  promotionStatus: PromotionStatus;
  regressionGateResult: {
    passed: boolean;
    score: number;
    errors: number;
    warnings: number;
  };
}

/**
 * 等待 Batch 完成
 *
 * @param projectId - 项目 ID
 * @param timeout - 超时时间（毫秒），默认 30 分钟
 * @returns batch 状态
 */
async function waitForBatchCompletion(projectId: string, timeout: number = 30 * 60 * 1000): Promise<any> {
  const startTime = Date.now();
  const pollInterval = 2000; // 2 秒轮询一次

  console.log(`[Orchestrator] Waiting for batch completion (timeout: ${timeout / 1000}s)...`);

  while (true) {
    // 检查超时
    if (Date.now() - startTime > timeout) {
      throw new Error(`Batch completion timeout after ${timeout / 1000}s`);
    }

    // 获取 batch 状态
    const batch = await api.batch.getState(projectId);

    if (!batch) {
      throw new Error('Batch not found');
    }

    console.log(`[Orchestrator] Batch status: ${batch.status}, EP${batch.currentEpisode}/${batch.endEpisode}, completed: ${batch.completed.length}`);

    // 检查是否完成
    if (batch.status === 'DONE' || batch.status === 'FAILED' || batch.status === 'PAUSED') {
      console.log(`[Orchestrator] Batch ${batch.status}`);
      return batch;
    }

    // 等待下一次轮询
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
}

/**
 * 读取最新的 Metrics 文件
 *
 * @returns Metrics 路径或 null
 */
function findLatestMetricsFile(): string | null {
  const reportsDir = path.join(process.cwd(), 'reports');

  if (!fs.existsSync(reportsDir)) {
    console.warn('[Orchestrator] Reports directory not found');
    return null;
  }

  // 读取所有 m16_metrics_*.json 文件
  const files = fs.readdirSync(reportsDir)
    .filter(f => f.startsWith('m16_metrics_') && f.endsWith('.json'))
    .filter(f => f !== 'm16_metrics_baseline.json'); // 排除 baseline

  if (files.length === 0) {
    console.warn('[Orchestrator] No metrics files found');
    return null;
  }

  // 按修改时间排序，取最新的
  const filesWithMtime = files.map(f => ({
    file: f,
    mtime: fs.statSync(path.join(reportsDir, f)).mtimeMs
  })).sort((a, b) => b.mtime - a.mtime);

  const latestFile = filesWithMtime[0].file;
  const latestPath = path.join(reportsDir, latestFile);

  console.log(`[Orchestrator] Latest metrics file: ${latestFile}`);
  return latestPath;
}

/**
 * 读取 Metrics 文件
 *
 * @param metricsPath - Metrics 文件路径
 * @returns Metrics 数据
 */
function readMetricsFile(metricsPath: string): MetricsData {
  if (!fs.existsSync(metricsPath)) {
    throw new Error(`Metrics file not found: ${metricsPath}`);
  }

  const content = fs.readFileSync(metricsPath, 'utf-8');
  const metricsData = JSON.parse(content) as MetricsData;

  console.log(`[Orchestrator] Loaded metrics: ${metricsData.runId}`);
  console.log(`  Score: ${metricsData.aggregates.health.score}`);
  console.log(`  Errors: ${metricsData.aggregates.health.errors.length}`);
  console.log(`  P95 Retries: ${metricsData.aggregates.retry.p95Retries}`);

  return metricsData;
}

/**
 * 运行 Gold Promotion（仅在 CI 环境）
 *
 * @param metricsPath - Metrics 文件路径
 * @returns Promotion Status
 */
function runGoldPromotion(metricsPath: string): PromotionStatus {
  try {
    // 检查是否为 CI 环境
    const isCI = process.env.CI === 'true';
    const isMainBranch = process.env.GITHUB_REF?.includes('main');

    if (!isCI || !isMainBranch) {
      console.log('[Orchestrator] Skipping Gold Promotion (not CI or not main branch)');
      return 'skipped';
    }

    console.log('[Orchestrator] Running Gold Promotion...');

    // 执行 gold:promote 命令
    execSync(`npm run gold:promote -- ${metricsPath}`, {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    // 读取 pending 状态判断 promotion 结果
    const pending = readPendingState();
    const gold = readGoldBaseline();

    if (gold && gold.runId === metricsPath.split('/').pop()?.replace('.json', '')) {
      return 'promoted';
    } else if (pending) {
      return 'pending';
    } else {
      return 'failed';
    }
  } catch (error: any) {
    console.error('[Orchestrator] Gold Promotion failed:', error.message);
    return 'failed';
  }
}

/**
 * 主函数：运行项目
 *
 * @param args - 项目运行参数
 * @returns 项目运行结果
 */
export async function runProject(args: RunProjectArgs): Promise<ProjectRunResult> {
  console.log('='.repeat(80));
  console.log('📦 ScriptFlow Product Orchestrator');
  console.log('='.repeat(80));
  console.log(`Source: ${args.source}`);
  console.log(`Prompt: ${args.prompt}`);
  console.log('');

  try {
    // ===== 步骤 1: 创建项目 =====
    console.log('[Step 1/8] Creating project...');
    const project = await api.project.seed(args.prompt, { totalEpisodes: args.totalEpisodes });
    console.log(`  ✓ Project created: ${project.name} (${project.id})`);
    console.log(`  ✓ Genre: ${project.genre}, Episodes: ${project.totalEpisodes}`);
    console.log('');

    // ===== 步骤 2: 生成 Bible =====
    console.log('[Step 2/8] Generating Bible...');
    await api.project.generateBible(project.id);
    console.log('  ✓ Bible generated');
    console.log('');

    // ===== 步骤 3: 生成 Synopsis =====
    console.log('[Step 3/8] Generating Synopsis...');
    await api.project.generateSynopsis(project.id);
    console.log('  ✓ Synopsis generated');
    console.log('');

    // ===== 步骤 4: 生成 Outline =====
    console.log('[Step 4/8] Generating Outline...');
    await api.project.generateOutline(project.id, (current, total) => {
      const percent = Math.round((current / total) * 100);
      process.stdout.write(`\r  Progress: ${current}/${total} (${percent}%)`);
    });
    console.log(''); // 换行
    console.log('  ✓ Outline generated');
    console.log('');

    // ===== 步骤 5: 运行 Batch（Phase 0 验证：只生成 EP1-10）=====
    console.log('[Step 5/8] Starting Batch (Phase 0: EP1-10 only)...');
    await api.batch.start(project.id, 1, 10);
    console.log('  ✓ Batch started');
    console.log('');

    // ===== 步骤 6: 等待 Batch 完成 =====
    console.log('[Step 6/8] Waiting for Batch completion...');
    const batch = await waitForBatchCompletion(project.id);
    console.log(`  ✓ Batch ${batch.status}`);
    console.log(`  ✓ Completed: ${batch.completed.length}/${project.totalEpisodes}`);
    console.log('');

    // ===== 步骤 7: 收集 Metrics =====
    console.log('[Step 7/8] Collecting Metrics...');
    const metricsPath = findLatestMetricsFile();

    let metricsData: MetricsData | null = null;
    let metricsPathResult: string | null = null;

    if (metricsPath) {
      metricsPathResult = metricsPath;
      metricsData = readMetricsFile(metricsPath);
      console.log('  ✓ Metrics collected');
    } else {
      console.log('  ⚠ No metrics found');
    }
    console.log('');

    // ===== 步骤 8: 运行 Regression Gate =====
    let regressionGateResult = {
      passed: false,
      score: 0,
      errors: 0,
      warnings: 0
    };

    if (metricsData) {
      console.log('[Step 8/8] Running Regression Gate...');
      const gold = readGoldBaseline();
      const gateResult = checkRegressionGate(metricsData, gold);
      regressionGateResult = {
        passed: gateResult.passed,
        score: gateResult.score,
        errors: gateResult.errorsCount,
        warnings: gateResult.warningsCount
      };

      console.log(`  Status: ${gateResult.passed ? '✓ PASSED' : '✗ FAILED'}`);
      console.log(`  Score: ${gateResult.score}`);
      console.log(`  Errors: ${gateResult.errorsCount}`);
      console.log(`  Warnings: ${gateResult.warningsCount}`);
      console.log('');
    }

    // ===== 触发 Gold Promotion（仅在 CI 环境）=====
    let promotionStatus: PromotionStatus = 'skipped';
    if (metricsPathResult && args.source === 'api') {
      console.log('[Bonus] Checking Gold Promotion...');
      promotionStatus = runGoldPromotion(metricsPathResult);
      console.log(`  Status: ${promotionStatus}`);
      console.log('');
    }

    // ===== 构建 Summary =====
    console.log('[Summary] Building product summary...');
    if (metricsData) {
      const summaryInput = {
        metrics: metricsData,
        promotionStatus,
        project: {
          id: project.id,
          name: project.name,
          logline: project.logline,
          totalEpisodes: project.totalEpisodes,
          genre: project.genre
        },
        goldMetrics: readGoldBaseline(),
        pendingState: readPendingState()
      };

      const summaryText = buildSummary(summaryInput);

      // 保存 Summary
      await projectRepo.saveSummary(project.id, summaryText);

      console.log('  ✓ Summary built and saved');
      console.log('');
      console.log('================================');
      console.log(summaryText);
      console.log('================================');
      console.log('');

      return {
        projectId: project.id,
        runId: metricsData.runId,
        metricsPath: metricsPathResult,
        summaryText,
        promotionStatus,
        regressionGateResult
      };
    } else {
      // 没有 Metrics，返回默认 Summary
      const summaryText = `
================================
📦 ScriptFlow · Run Summary
================================

Prompt:
  ${args.prompt}

Status:
  ⚠ 项目运行完成，但未生成 Metrics 报告

Project:
  ${project.name} (${project.id})
  Episodes: ${project.totalEpisodes}
  Genre: ${project.genre}

Next Steps:
  请检查日志或重新运行 Batch 以获取完整指标
================================
`;

      await projectRepo.saveSummary(project.id, summaryText);

      console.log('  ✓ Default summary saved');
      console.log('');

      return {
        projectId: project.id,
        runId: 'unknown',
        metricsPath: null,
        summaryText,
        promotionStatus: 'skipped',
        regressionGateResult
      };
    }
  } catch (error: any) {
    console.error('');
    console.error('✗ Orchestrator failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}

/**
 * CLI 入口
 */
async function main() {
  const args = process.argv.slice(2);

  // 解析命令行参数
  const params: RunProjectArgs = {
    prompt: '',
    source: 'cli'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--prompt' && i + 1 < args.length) {
      params.prompt = args[++i];
    } else if (arg === '--genre' && i + 1 < args.length) {
      params.genre = args[++i];
    } else if (arg === '--totalEpisodes' && i + 1 < args.length) {
      params.totalEpisodes = parseInt(args[++i]);
    }
  }

  // 验证必填参数
  if (!params.prompt) {
    console.error('错误: 缺少必填参数 --prompt');
    console.error('');
    console.error('用法: npm run run:project -- --prompt "<用户提示>"');
    console.error('');
    console.error('可选参数:');
    console.error('  --genre <题材>');
    console.error('  --totalEpisodes <集数>');
    process.exit(1);
  }

  try {
    const result = await runProject(params);
    console.log('✓ Orchestrator completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('✗ Orchestrator failed');
    process.exit(1);
  }
}

// 如果直接运行此文件（而非被导入），则执行 CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

