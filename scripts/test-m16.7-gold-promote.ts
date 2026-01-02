/**
 * M16.7 Gold Baseline Promotion 测试
 *
 * 测试场景：
 * 1. Cold start，第一次通过 gate → 写 pending，不晋升
 * 2. 第二次连续通过 → 晋升 gold + history 生成
 * 3. Score 不够/有 errors/p95>1 → 不晋升且不覆盖 gold
 * 4. 非连续通过 → pending 被替换但不晋升
 *
 * 验收标准：
 * - Promotion Gate 条件正确判断
 * - Pending 机制正确工作
 * - Gold Baseline 正确晋升并留档
 * - 任何情况下不覆盖 baseline/m16_metrics_baseline.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// ========== 测试工具 ==========

/**
 * 创建临时目录
 */
function ensureTempDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 清理临时目录
 */
function cleanupTempDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * 创建 Mock Metrics 文件
 */
function createMockMetrics(
  dir: string,
  filename: string,
  runId: string,
  score: number,
  errors: string[] = [],
  p95Retries: number = 0
): string {
  const metrics = {
    runId,
    projectId: 'test-project',
    timestamp: new Date().toISOString(),
    range: { fromEpisode: 1, toEpisode: 3 },
    episodes: [],
    aggregates: {
      health: {
        score,
        warnings: [],
        errors
      },
      retry: {
        avgRetries: 0.5,
        p95Retries
      }
    }
  };

  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(metrics, null, 2), 'utf-8');
  return filePath;
}

/**
 * 创建 Gold Baseline
 */
function createGoldBaseline(dir: string, runId: string, score: number): string {
  const gold = {
    runId,
    projectId: 'test-project',
    timestamp: new Date().toISOString(),
    range: { fromEpisode: 1, toEpisode: 3 },
    episodes: [],
    aggregates: {
      health: {
        score,
        warnings: [],
        errors: []
      },
      retry: {
        avgRetries: 0.2,
        p95Retries: 0.5
      }
    }
  };

  const filePath = path.join(dir, 'm16_metrics_gold.json');
  fs.writeFileSync(filePath, JSON.stringify(gold, null, 2), 'utf-8');
  return filePath;
}

/**
 * 运行 promote 脚本
 */
function runPromote(metricsPath: string, workingDir: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(
      `npm run gold:promote -- ${metricsPath}`,
      {
        cwd: workingDir,
        stdio: 'pipe',
        encoding: 'utf-8'
      }
    );
    return { stdout, exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout || '',
      exitCode: error.status || 1
    };
  }
}

// ========== 测试套件 ==========

/**
 * 测试 1: Cold start，第一次通过 gate → 写 pending，不晋升
 */
async function test1_coldStartFirstPass() {
  console.log('\n' + '='.repeat(80));
  console.log('Test 1: Cold start，第一次通过 gate → 写 pending，不晋升');
  console.log('='.repeat(80));

  const tempDir = path.join(process.cwd(), 'temp_gold_test1');
  const goldDir = path.join(tempDir, 'baseline/gold');
  const historyDir = path.join(goldDir, 'history');

  try {
    ensureTempDir(goldDir);
    ensureTempDir(historyDir);

    // 创建一个高分的 metrics（score=80, 无 errors, p95=0）
    const metricsPath = createMockMetrics(
      tempDir,
      'metrics-pass.json',
      'run-pass-1',
      80,
      [],
      0
    );

    // 运行 promote（不使用 chdir，直接传递路径）
    // 注意：这里需要修改工作目录到项目根目录
    const promoteScript = path.join(process.cwd(), 'scripts/m16-gold-promote.ts');
    const { stdout } = runPromote(metricsPath, process.cwd());

    console.log('\nPromote 输出:');
    console.log(stdout);

    // 验证：pending 已创建
    const pendingPath = path.join(process.cwd(), 'baseline/gold/pending.json');
    const pendingExists = fs.existsSync(pendingPath);

    if (!pendingExists) {
      throw new Error('Pending 文件未创建');
    }

    const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf-8'));
    console.log(`\n✓ Pending 已创建: ${pending.runId}`);

    // 验证：gold 未更新（仍不存在）
    const goldPath = path.join(process.cwd(), 'baseline/gold/m16_metrics_gold.json');
    const goldExists = fs.existsSync(goldPath);

    if (goldExists) {
      throw new Error('Gold baseline 不应被创建');
    }

    console.log('✓ Gold baseline 未创建（第一次通过不晋升）');

    console.log('\n✓ Test 1 PASSED: Cold start，第一次通过写 pending，不晋升');

  } finally {
    // 清理临时文件
    const pendingPath = path.join(process.cwd(), 'baseline/gold/pending.json');
    if (fs.existsSync(pendingPath)) {
      fs.unlinkSync(pendingPath);
    }
    cleanupTempDir(tempDir);
  }
}

/**
 * 测试 2: 第二次连续通过 → 晋升 gold + history 生成
 */
async function test2_consecutivePass() {
  console.log('\n' + '='.repeat(80));
  console.log('Test 2: 第二次连续通过 → 晋升 gold + history 生成');
  console.log('='.repeat(80));

  const goldDir = path.join(process.cwd(), 'baseline/gold');
  const historyDir = path.join(goldDir, 'history');

  try {
    ensureTempDir(historyDir);

    // 创建初始 gold baseline（score=70）
    const goldPath = path.join(goldDir, 'm16_metrics_gold.json');
    createGoldBaseline(goldDir, 'gold-1', 70);

    // 第一次通过：写 pending
    const metricsPath1 = createMockMetrics(
      process.cwd(),
      'metrics-pass-2a.json',
      'run-pass-2',
      75,
      [],
      0
    );

    runPromote(metricsPath1, process.cwd());

    // 第二次通过（相同 runId）：应该晋升
    runPromote(metricsPath1, process.cwd());

    // 验证：gold 已更新
    if (!fs.existsSync(goldPath)) {
      throw new Error('Gold baseline 未创建');
    }

    const gold = JSON.parse(fs.readFileSync(goldPath, 'utf-8'));
    console.log(`\n✓ Gold baseline 已创建: ${gold.runId}, Score: ${gold.aggregates.health.score}`);

    if (gold.runId !== 'run-pass-2') {
      throw new Error(`Gold runId 应为 run-pass-2，实际: ${gold.runId}`);
    }

    // 验证：history 有旧 gold 的备份
    const historyFiles = fs.readdirSync(historyDir).filter(f => f.endsWith('.json'));

    if (historyFiles.length === 0) {
      throw new Error('History 目录应包含备份');
    }

    console.log(`✓ History 包含 ${historyFiles.length} 个备份文件`);

    // 验证：pending 已清空
    const pendingPath = path.join(goldDir, 'pending.json');
    if (fs.existsSync(pendingPath)) {
      throw new Error('Pending 应该被清空');
    }

    console.log('✓ Pending 已清空');

    console.log('\n✓ Test 2 PASSED: 第二次连续通过晋升 gold + history 留档');

  } finally {
    // 清理
    const goldPath = path.join(goldDir, 'm16_metrics_gold.json');
    const pendingPath = path.join(goldDir, 'pending.json');
    if (fs.existsSync(goldPath)) fs.unlinkSync(goldPath);
    if (fs.existsSync(pendingPath)) fs.unlinkSync(pendingPath);

    const historyFiles = fs.readdirSync(historyDir);
    historyFiles.forEach(f => fs.unlinkSync(path.join(historyDir, f)));
  }
}

/**
 * 测试 3: Score 不够/有 errors/p95>1 → 不晋升且不覆盖 gold
 */
async function test3_gateFailed() {
  console.log('\n' + '='.repeat(80));
  console.log('Test 3: Score 不够/有 errors/p95>1 → 不晋升且不覆盖 gold');
  console.log('='.repeat(80));

  const goldDir = path.join(process.cwd(), 'baseline/gold');
  const historyDir = path.join(goldDir, 'history');

  try {
    ensureTempDir(historyDir);

    // 创建初始 gold baseline
    const goldPath = path.join(goldDir, 'm16_metrics_gold.json');
    const originalGold = createGoldBaseline(goldDir, 'gold-original', 70);
    const originalContent = fs.readFileSync(goldPath, 'utf-8');

    // 场景 3a: Score 不够（score=68 < 70）
    console.log('\n场景 3a: Score 不够');
    const metricsPath1 = createMockMetrics(
      process.cwd(),
      'metrics-fail-score.json',
      'run-fail-score',
      68,
      [],
      0
    );

    runPromote(metricsPath1, process.cwd());

    // 验证：gold 未被覆盖
    const currentContent = fs.readFileSync(goldPath, 'utf-8');
    if (currentContent !== originalContent) {
      throw new Error('Gold baseline 被意外覆盖');
    }

    console.log('✓ Gold baseline 未被覆盖');

    // 场景 3b: 有 errors
    console.log('\n场景 3b: 有 errors');
    const metricsPath2 = createMockMetrics(
      process.cwd(),
      'metrics-fail-errors.json',
      'run-fail-errors',
      75,
      ['EP1: error'],
      0
    );

    runPromote(metricsPath2, process.cwd());

    if (fs.readFileSync(goldPath, 'utf-8') !== originalContent) {
      throw new Error('Gold baseline 被意外覆盖');
    }

    console.log('✓ Gold baseline 未被覆盖');

    // 场景 3c: p95 > 1
    console.log('\n场景 3c: p95 > 1');
    const metricsPath3 = createMockMetrics(
      process.cwd(),
      'metrics-fail-retries.json',
      'run-fail-retries',
      75,
      [],
      2.5
    );

    runPromote(metricsPath3, process.cwd());

    if (fs.readFileSync(goldPath, 'utf-8') !== originalContent) {
      throw new Error('Gold baseline 被意外覆盖');
    }

    console.log('✓ Gold baseline 未被覆盖');

    console.log('\n✓ Test 3 PASSED: Gate 失败时不覆盖 gold');

  } finally {
    // 清理
    const goldPath = path.join(goldDir, 'm16_metrics_gold.json');
    const pendingPath = path.join(goldDir, 'pending.json');
    if (fs.existsSync(goldPath)) fs.unlinkSync(goldPath);
    if (fs.existsSync(pendingPath)) fs.unlinkSync(pendingPath);
  }
}

/**
 * 测试 4: 非连续通过 → pending 被替换但不晋升
 */
async function test4_nonConsecutive() {
  console.log('\n' + '='.repeat(80));
  console.log('Test 4: 非连续通过 → pending 被替换但不晋升');
  console.log('='.repeat(80));

  const goldDir = path.join(process.cwd(), 'baseline/gold');

  try {
    // 创建初始 gold
    const goldPath = path.join(goldDir, 'm16_metrics_gold.json');
    createGoldBaseline(goldDir, 'gold-initial', 70);

    // 第一次通过：run-pass-a
    const metricsPath1 = createMockMetrics(
      process.cwd(),
      'metrics-pass-a.json',
      'run-pass-a',
      75,
      [],
      0
    );

    runPromote(metricsPath1, process.cwd());

    let pendingPath = path.join(goldDir, 'pending.json');
    let pending = JSON.parse(fs.readFileSync(pendingPath, 'utf-8'));
    console.log(`\n第一次通过 pending: ${pending.runId}`);

    if (pending.runId !== 'run-pass-a') {
      throw new Error(`Pending runId 应为 run-pass-a，实际: ${pending.runId}`);
    }

    // 第二次通过（不同 runId）：run-pass-b
    const metricsPath2 = createMockMetrics(
      process.cwd(),
      'metrics-pass-b.json',
      'run-pass-b',
      76,
      [],
      0
    );

    runPromote(metricsPath2, process.cwd());

    // 验证：pending 被替换
    pending = JSON.parse(fs.readFileSync(pendingPath, 'utf-8'));
    console.log(`第二次通过 pending: ${pending.runId}`);

    if (pending.runId !== 'run-pass-b') {
      throw new Error(`Pending runId 应被替换为 run-pass-b，实际: ${pending.runId}`);
    }

    console.log('✓ Pending 已替换为新的 runId');

    // 验证：gold 未被晋升（仍然是 gold-initial）
    const gold = JSON.parse(fs.readFileSync(goldPath, 'utf-8'));

    if (gold.runId !== 'gold-initial') {
      throw new Error(`Gold runId 应仍为 gold-initial，实际: ${gold.runId}`);
    }

    console.log('✓ Gold baseline 未晋升');

    console.log('\n✓ Test 4 PASSED: 非连续通过替换 pending，不晋升');

  } finally {
    // 清理
    const goldPath = path.join(goldDir, 'm16_metrics_gold.json');
    const pendingPath = path.join(goldDir, 'pending.json');
    if (fs.existsSync(goldPath)) fs.unlinkSync(goldPath);
    if (fs.existsSync(pendingPath)) fs.unlinkSync(pendingPath);
  }
}

// ========== 主函数 ==========

/**
 * 运行所有测试
 */
async function runAllTests() {
  console.log('='.repeat(80));
  console.log('M16.7 Gold Baseline Promotion Test Suite');
  console.log('='.repeat(80));

  const tests = [
    { name: 'Test 1: Cold start 第一次通过', fn: test1_coldStartFirstPass },
    { name: 'Test 2: 第二次连续通过', fn: test2_consecutivePass },
    { name: 'Test 3: Gate 失败不覆盖', fn: test3_gateFailed },
    { name: 'Test 4: 非连续通过', fn: test4_nonConsecutive }
  ];

  const results: { name: string; passed: boolean; error?: string }[] = [];

  for (const test of tests) {
    try {
      await test.fn();
      results.push({ name: test.name, passed: true });
    } catch (error: any) {
      console.error(`\n✗ ${test.name} FAILED:`, error.message);
      results.push({ name: test.name, passed: false, error: error.message });
    }
  }

  // 输出测试摘要
  console.log('\n' + '='.repeat(80));
  console.log('Test Summary');
  console.log('='.repeat(80));

  for (const result of results) {
    const status = result.passed ? '✓ PASSED' : '✗ FAILED';
    console.log(`${status}: ${result.name}`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
  }

  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;

  console.log(`\nTotal: ${passedCount}/${totalCount} tests passed`);

  if (passedCount === totalCount) {
    console.log('\n✓ All tests PASSED! M16.7 Gold Baseline 实施成功！');
    console.log('='.repeat(80));
    process.exit(0);
  } else {
    console.log('\n✗ Some tests FAILED. Please review and fix.');
    console.log('='.repeat(80));
    process.exit(1);
  }
}

// 运行测试
runAllTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

