/**
 * M16.7 Gold Baseline Promotion
 *
 * 职责：
 * - 检查当前 run 是否满足 Promotion Gate 条件
 * - 管理 pending 机制（需要连续 2 次通过）
 * - 自动晋升 Gold Baseline（写入 history 留档）
 * - 只在 main 分支 push 时启用
 *
 * Promotion Gate 条件：
 * 1. health.score >= max(gold.score + 3, 70)
 * 2. health.errors.length === 0
 * 3. retry.p95Retries <= 1
 *
 * 使用方式：
 *   npm run gold:promote -- <path_to_metrics_json>
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Metrics 数据结构（简化版）
 */
interface MetricsData {
  runId: string;
  projectId: string;
  timestamp: string;
  aggregates: {
    health: {
      score: number;
      warnings: string[];
      errors: string[];
    };
    retry: {
      avgRetries: number;
      p95Retries: number;
    };
  };
}

/**
 * Pending 状态
 */
interface PendingState {
  runId: string;
  metricsPath: string;
  timestamp: string;
}

/**
 * Promotion Gate 结果
 */
interface PromotionGateResult {
  passed: boolean;
  scoreCondition: boolean;
  errorsCondition: boolean;
  retriesCondition: boolean;
  reasons: string[];
}

/**
 * 读取 Metrics 文件
 */
function readMetrics(metricsPath: string): MetricsData {
  console.log(`[GoldPromote] Reading metrics from: ${metricsPath}`);

  if (!fs.existsSync(metricsPath)) {
    throw new Error(`Metrics file not found: ${metricsPath}`);
  }

  const content = fs.readFileSync(metricsPath, 'utf-8');
  const metrics = JSON.parse(content) as MetricsData;

  console.log(`[GoldPromote] Loaded metrics: ${metrics.runId}`);
  console.log(`  Score: ${metrics.aggregates.health.score}`);
  console.log(`  Errors: ${metrics.aggregates.health.errors.length}`);
  console.log(`  P95 Retries: ${metrics.aggregates.retry.p95Retries}`);

  return metrics;
}

/**
 * 读取当前 Gold Baseline
 */
function readGoldBaseline(): MetricsData | null {
  const goldPath = path.join(process.cwd(), 'baseline/gold/m16_metrics_gold.json');

  if (!fs.existsSync(goldPath)) {
    console.log('[GoldPromote] Gold baseline not found (cold start)');
    return null;
  }

  console.log(`[GoldPromote] Reading gold baseline from: ${goldPath}`);
  const content = fs.readFileSync(goldPath, 'utf-8');
  const gold = JSON.parse(content) as MetricsData;

  console.log(`[GoldPromote] Gold baseline: ${gold.runId}`);
  console.log(`  Score: ${gold.aggregates.health.score}`);

  return gold;
}

/**
 * 读取 Pending 状态
 */
function readPendingState(): PendingState | null {
  const pendingPath = path.join(process.cwd(), 'baseline/gold/pending.json');

  if (!fs.existsSync(pendingPath)) {
    console.log('[GoldPromote] No pending state');
    return null;
  }

  console.log(`[GoldPromote] Reading pending state from: ${pendingPath}`);
  const content = fs.readFileSync(pendingPath, 'utf-8');
  const pending = JSON.parse(content) as PendingState;

  console.log(`[GoldPromote] Pending state: ${pending.runId} (${pending.timestamp})`);

  return pending;
}

/**
 * 写入 Pending 状态
 */
function writePendingState(pending: PendingState): void {
  const pendingPath = path.join(process.cwd(), 'baseline/gold/pending.json');
  fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2), 'utf-8');
  console.log(`[GoldPromote] Wrote pending state: ${pending.runId}`);
}

/**
 * 清空 Pending 状态
 */
function clearPendingState(): void {
  const pendingPath = path.join(process.cwd(), 'baseline/gold/pending.json');
  if (fs.existsSync(pendingPath)) {
    fs.unlinkSync(pendingPath);
    console.log('[GoldPromote] Cleared pending state');
  }
}

/**
 * 晋升 Gold Baseline
 */
function promoteToGold(current: MetricsData, metricsPath: string): void {
  const goldPath = path.join(process.cwd(), 'baseline/gold/m16_metrics_gold.json');
  const historyDir = path.join(process.cwd(), 'baseline/gold/history');

  // 确保历史目录存在
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }

  // 备份当前 gold 到 history（如果存在）
  if (fs.existsSync(goldPath)) {
    const oldGold = JSON.parse(fs.readFileSync(goldPath, 'utf-8'));
    const oldTimestamp = new Date(oldGold.timestamp).getTime();
    const historyPath = path.join(historyDir, `${oldTimestamp}_${oldGold.runId}.json`);
    fs.writeFileSync(historyPath, JSON.stringify(oldGold, null, 2), 'utf-8');
    console.log(`[GoldPromote] Backed up old gold to history: ${path.basename(historyPath)}`);
  }

  // 写入新的 gold
  fs.writeFileSync(goldPath, JSON.stringify(current, null, 2), 'utf-8');
  console.log(`[GoldPromote] Promoted ${current.runId} to gold baseline`);
}

/**
 * 检查 Promotion Gate 条件
 */
function checkPromotionGate(current: MetricsData, gold: MetricsData | null): PromotionGateResult {
  const reasons: string[] = [];
  let passed = true;

  // 条件 1: Score >= max(gold.score + 3, 70)
  const minScore = gold ? Math.max(gold.aggregates.health.score + 3, 70) : 70;
  const scoreCondition = current.aggregates.health.score >= minScore;

  if (!scoreCondition) {
    reasons.push(`Score ${current.aggregates.health.score} < ${minScore} (required: max(gold+3, 70))`);
    passed = false;
  } else {
    reasons.push(`Score ${current.aggregates.health.score} >= ${minScore} ✓`);
  }

  // 条件 2: errors.length === 0
  const errorsCondition = current.aggregates.health.errors.length === 0;

  if (!errorsCondition) {
    reasons.push(`Errors ${current.aggregates.health.errors.length} > 0`);
    passed = false;
  } else {
    reasons.push(`Errors 0 ✓`);
  }

  // 条件 3: p95Retries <= 1
  const retriesCondition = current.aggregates.retry.p95Retries <= 1;

  if (!retriesCondition) {
    reasons.push(`P95 retries ${current.aggregates.retry.p95Retries} > 1`);
    passed = false;
  } else {
    reasons.push(`P95 retries ${current.aggregates.retry.p95Retries} <= 1 ✓`);
  }

  return {
    passed,
    scoreCondition,
    errorsCondition,
    retriesCondition,
    reasons
  };
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(80));
  console.log('M16.7 Gold Baseline Promotion');
  console.log('='.repeat(80));

  // 解析命令行参数
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('\n错误: 请提供 metrics 文件路径');
    console.error('用法: npm run gold:promote -- <path_to_metrics_json>\n');
    process.exit(1);
  }

  const metricsPath = args[0];

  try {
    // 读取当前 run metrics
    const current = readMetrics(metricsPath);

    // 读取 gold baseline（可能不存在，cold start）
    const gold = readGoldBaseline();

    // 读取 pending 状态
    const pending = readPendingState();

    // 检查 Promotion Gate
    console.log('\n' + '='.repeat(80));
    console.log('Checking Promotion Gate');
    console.log('='.repeat(80));

    const gateResult = checkPromotionGate(current, gold);

    console.log('\nPromotion Gate Results:');
    gateResult.reasons.forEach(reason => console.log(`  - ${reason}`));

    if (!gateResult.passed) {
      console.log('\n✗ Promotion Gate FAILED');
      console.log('  Actions: 清空 pending，不晋升');

      // 清空 pending（如果存在）
      if (pending) {
        clearPendingState();
      }

      process.exit(0); // 退出码 0 表示正常完成（只是没通过 gate）
    }

    console.log('\n✓ Promotion Gate PASSED');

    // 检查 pending 状态
    if (!pending) {
      // 第一次通过：写入 pending，不晋升
      console.log('\nActions: 第一次通过，写入 pending，不晋升');

      const newPending: PendingState = {
        runId: current.runId,
        metricsPath,
        timestamp: new Date().toISOString()
      };

      writePendingState(newPending);
      console.log(`✓ Pending 已创建：${current.runId}`);
      console.log('  下次连续通过时将自动晋升');
    } else if (pending.runId === current.runId) {
      // 连续通过：晋升 gold
      console.log('\nActions: 连续通过，晋升 Gold Baseline');

      promoteToGold(current, metricsPath);
      clearPendingState();

      console.log('\n✓ Gold Baseline 晋升成功！');
      console.log(`  新 Gold: ${current.runId}`);
    } else {
      // 不连续：替换 pending
      console.log(`\nActions: 不连续通过（pending=${pending.runId}, current=${current.runId}）`);
      console.log('  替换 pending，不晋升');

      const newPending: PendingState = {
        runId: current.runId,
        metricsPath,
        timestamp: new Date().toISOString()
      };

      writePendingState(newPending);
      console.log(`✓ Pending 已替换为：${current.runId}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('Promotion 完成');
    console.log('='.repeat(80));

  } catch (error: any) {
    console.error('\n✗ Gold Promotion 失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// 运行主函数
main();

