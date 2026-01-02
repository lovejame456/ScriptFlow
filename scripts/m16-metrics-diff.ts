/**
 * M16.4.2 Metrics Diff Engine
 *
 * 对比 baseline（历史）与 current（当前），输出 Δ 与回归结论
 */

import fs from 'node:fs';

interface MetricsData {
  aggregates: {
    health: {
      score: number;
      errors: string[];
      warnings: string[];
    };
    retry: {
      avgRetries: number;
      p95Retries: number;
    };
  };
}

function load(file: string): MetricsData {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (error) {
    console.error(`Error loading file ${file}:`, error);
    process.exit(1);
  }
}

const [baselineFile, currentFile] = process.argv.slice(2);
if (!baselineFile || !currentFile) {
  console.error('Usage: tsx scripts/m16-metrics-diff.ts <baseline.json> <current.json>');
  process.exit(1);
}

const base = load(baselineFile);
const cur = load(currentFile);

const diff = {
  scoreDelta: cur.aggregates.health.score - base.aggregates.health.score,
  retryDelta: {
    avg: cur.aggregates.retry.avgRetries - base.aggregates.retry.avgRetries,
    p95: cur.aggregates.retry.p95Retries - base.aggregates.retry.p95Retries
  },
  newErrors: cur.aggregates.health.errors.filter(
    (e: string) => !base.aggregates.health.errors.includes(e)
  ),
  newWarnings: cur.aggregates.health.warnings.filter(
    (w: string) => !base.aggregates.health.warnings.includes(w)
  )
};

console.log('\n=== M16.4.2 Metrics Diff ===\n');
console.log(`Baseline: ${baselineFile}`);
console.log(`Current: ${currentFile}\n`);
console.log(`Score Δ: ${diff.scoreDelta >= 0 ? '+' : ''}${diff.scoreDelta}`);
console.log('Retry Δ:', diff.retryDelta);
if (diff.newErrors.length > 0) {
  console.log('New Errors:', diff.newErrors);
}
if (diff.newWarnings.length > 0) {
  console.log('New Warnings:', diff.newWarnings);
}
console.log('');

// 回归判定（PM Gate）
let fail = false;
let hasBlockingRegression = false;
let hasWarnings = false;

if (diff.scoreDelta <= -10) {
  console.error('❌ Regression: score dropped >= 10');
  fail = true;
  hasBlockingRegression = true;
}

if (diff.retryDelta.p95 >= 1) {
  console.error('⚠️  Warning: p95 retries increased');
  hasWarnings = true;
}

if (diff.newErrors.length > 0) {
  console.error(`❌ Regression: ${diff.newErrors.length} new structure error(s) detected`);
  fail = true;
  hasBlockingRegression = true;
}

if (diff.newWarnings.length > 0 && diff.newWarnings.length <= 3) {
  console.warn(`⚠️  Warning: ${diff.newWarnings.length} new warning(s) detected`);
  hasWarnings = true;
}

console.log('');

if (fail) {
  console.error('❌ BLOCKING REGRESSION DETECTED - CI FAILED');
  console.error('');
  console.error('Regression Details:');
  if (diff.scoreDelta <= -10) {
    console.error(`  - Health score dropped: ${base.aggregates.health.score} → ${cur.aggregates.health.score}`);
  }
  if (diff.newErrors.length > 0) {
    console.error(`  - New errors: ${diff.newErrors.join(', ')}`);
  }
  console.error('');
  console.error('Please review the changes and fix the regression before merging.');
  process.exit(1);
} else {
  console.log('✅ No blocking regression detected');
  if (hasWarnings) {
    console.log('⚠️  Non-blocking warnings detected - review recommended');
  } else {
    console.log('✅ All quality gates passed');
  }
  process.exit(0);
}


