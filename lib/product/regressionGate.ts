/**
 * Regression Gate - 回归测试门禁（只读）
 *
 * 职责：
 * - 检查当前 run 是否满足质量标准
 * - 只读检查，不修改任何文件
 * - 不阻断 UI，仅返回检查结果
 *
 * 检查条件：
 * 1. 健康评分 >= 70（最低及格线）
 * 2. 零错误（errors.length === 0）
 * 3. 低重试率（p95Retries <= 2，比 gold gate 宽松）
 *
 * 使用方式：
 *   const result = checkRegressionGate(currentMetrics, goldMetrics);
 *   console.log(`Passed: ${result.passed}`);
 */

import { RunMetrics } from '../metrics/runMetrics';

/**
 * Metrics 数据结构（复用 RunMetrics）
 */
export type MetricsData = RunMetrics;

/**
 * Regression Gate 结果
 */
export interface RegressionGateResult {
  passed: boolean;
  scoreCondition: boolean;
  errorsCondition: boolean;
  retriesCondition: boolean;
  reasons: string[];
  score: number;
  errorsCount: number;
  warningsCount: number;
}

/**
 * 检查 Regression Gate 条件
 *
 * @param current - 当前运行 metrics
 * @param gold - Gold Baseline metrics（可选，用于对比）
 * @returns 检查结果
 */
export function checkRegressionGate(
  current: MetricsData,
  gold?: MetricsData | null
): RegressionGateResult {
  const reasons: string[] = [];
  let passed = true;

  // 提取指标
  const score = current.aggregates.health.score;
  const errorsCount = current.aggregates.health.errors.length;
  const warningsCount = current.aggregates.health.warnings.length;
  const p95Retries = current.aggregates.retry.p95Retries;

  // 条件 1: 健康评分 >= 70（最低及格线）
  const scoreCondition = score >= 70;
  if (!scoreCondition) {
    reasons.push(`Health Score ${score} < 70 (minimum required)`);
    passed = false;
  } else {
    reasons.push(`Health Score ${score} >= 70 ✓`);
  }

  // 条件 2: 零错误
  const errorsCondition = errorsCount === 0;
  if (!errorsCondition) {
    reasons.push(`Errors ${errorsCount} > 0`);
    passed = false;
  } else {
    reasons.push(`Errors 0 ✓`);
  }

  // 条件 3: P95 重试次数 <= 2（比 gold gate 的 <= 1 宽松）
  const retriesCondition = p95Retries <= 2;
  if (!retriesCondition) {
    reasons.push(`P95 retries ${p95Retries} > 2`);
    passed = false;
  } else {
    reasons.push(`P95 retries ${p95Retries} <= 2 ✓`);
  }

  // 额外的对比信息（如果有 gold baseline）
  if (gold) {
    const goldScore = gold.aggregates.health.score;
    const scoreDiff = score - goldScore;
    if (scoreDiff >= 0) {
      reasons.push(`Score ↑ +${scoreDiff} (vs Gold ${goldScore})`);
    } else {
      reasons.push(`Score ↓ ${scoreDiff} (vs Gold ${goldScore})`);
    }
  }

  return {
    passed,
    scoreCondition,
    errorsCondition,
    retriesCondition,
    reasons,
    score,
    errorsCount,
    warningsCount
  };
}

/**
 * 格式化 Regression Gate 结果为可读文本
 *
 * @param result - Regression Gate 结果
 * @returns 格式化文本
 */
export function formatRegressionGateResult(result: RegressionGateResult): string {
  const lines: string[] = [];

  lines.push('Regression Gate Check:');
  lines.push('  Status: ' + (result.passed ? '✓ PASSED' : '✗ FAILED'));
  lines.push('');
  lines.push('  Conditions:');
  lines.push(`    - Health Score: ${result.score} ${result.scoreCondition ? '✓' : '✗'}`);
  lines.push(`    - Errors: ${result.errorsCount} ${result.errorsCondition ? '✓' : '✗'}`);
  lines.push(`    - P95 Retries: ${result.passed ? '≤2' : '>2'} ${result.retriesCondition ? '✓' : '✗'}`);
  lines.push('');
  lines.push('  Details:');
  result.reasons.forEach(reason => {
    lines.push(`    - ${reason}`);
  });

  return lines.join('\n');
}

