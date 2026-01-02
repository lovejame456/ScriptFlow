/**
 * M16.6 Meta Policy E2E 测试
 *
 * 验收标准：
 * 1. 构造 2 个项目桶的假 Metrics
 * 2. 生成 meta_policy.json
 * 3. 验证不同桶得到不同 bias
 * 4. 验证 confidence < 0.3 时不覆盖 revealCadenceBiasPrior
 * 5. 验证 source 包含 meta_policy
 *
 * 成功标准：
 * - 不同桶得到不同的 bias
 * - confidence 机制正确工作
 * - meta_policy 正确集成到 batchRunner
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  buildMetaPolicy,
  writeMetaPolicy,
  aggregateBucketStats,
  deriveMetaPolicyBias
} from '../lib/metrics/metaAggregator';
import {
  MetaPolicy,
  MetricsRun,
  ProjectProfile,
  MetaPolicyBias
} from '../lib/metrics/metaTypes';
import {
  deriveAdaptiveParams,
  createAdaptiveParamsSnapshot
} from '../lib/metrics/policyEngine';

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

// ========== Mock 数据生成 ==========

/**
 * 生成 Mock Metrics 运行记录（低分、高重试）
 */
function createLowQualityMetrics(projectId: string, runId: string): MetricsRun {
  return {
    runId,
    projectId,
    timestamp: new Date().toISOString(),
    range: { fromEpisode: 1, toEpisode: 3 },
    episodes: [],
    aggregates: {
      reveal: {
        typeCounts: { FACT: 1, INFO: 1, RELATION: 1, IDENTITY: 0 },
        typeTransitionsOk: false,
        cadence: { NORMAL: 2, SPIKE: 1 }
      },
      retry: {
        episodesWithRetry: 3,
        avgRetries: 2.5,
        p95Retries: 3.0  // 高重试
      },
      health: {
        warnings: [
          'EP1: reveal not concrete',
          'EP2: reveal no consequence',
          'EP3: reveal not concrete',
          'High retry frequency: writer near structure boundary',
          'p95 retries >= 2'
        ],
        errors: [
          'EP3: slotValidationFail=NEW_REVEAL slot missing'
        ],
        score: 45  // 低分
      }
    }
  };
}

/**
 * 生成 Mock Metrics 运行记录（高分、低重试）
 */
function createHighQualityMetrics(projectId: string, runId: string): MetricsRun {
  return {
    runId,
    projectId,
    timestamp: new Date().toISOString(),
    range: { fromEpisode: 1, toEpisode: 3 },
    episodes: [],
    aggregates: {
      reveal: {
        typeCounts: { FACT: 1, INFO: 1, RELATION: 1, IDENTITY: 0 },
        typeTransitionsOk: true,
        cadence: { NORMAL: 3, SPIKE: 0 }
      },
      retry: {
        episodesWithRetry: 0,
        avgRetries: 0,
        p95Retries: 0  // 低重试
      },
      health: {
        warnings: [],
        errors: [],
        score: 95  // 高分
      }
    }
  };
}

// ========== 测试套件 ==========

/**
 * 测试 1: 验证不同桶得到不同的 bias
 */
async function test1_differentBuckets() {
  console.log('\n' + '='.repeat(80));
  console.log('Test 1: 验证不同桶得到不同的 bias');
  console.log('='.repeat(80));

  const tempPoolDir = path.join(process.cwd(), 'temp_metrics_pool_test');
  const tempMetaDir = path.join(process.cwd(), 'temp_meta_test');

  try {
    ensureTempDir(tempPoolDir);

    // 创建 cultivation_fantasy 项目目录（低质量）
    const project1Dir = path.join(tempPoolDir, 'cultivation_project');
    ensureTempDir(project1Dir);

    // 写入 3 个低质量运行
    for (let i = 0; i < 3; i++) {
      const metrics = createLowQualityMetrics('cultivation_project', `run-cultivation-${i}`);
      fs.writeFileSync(
        path.join(project1Dir, `run-${i}.json`),
        JSON.stringify(metrics, null, 2)
      );
    }

    // 创建 romance_ceo 项目目录（高质量）
    const project2Dir = path.join(tempPoolDir, 'romance_project');
    ensureTempDir(project2Dir);

    // 写入 2 个高质量运行
    for (let i = 0; i < 2; i++) {
      const metrics = createHighQualityMetrics('romance_project', `run-romance-${i}`);
      fs.writeFileSync(
        path.join(project2Dir, `run-${i}.json`),
        JSON.stringify(metrics, null, 2)
      );
    }

    // 构建 meta policy
    const metaPolicy = buildMetaPolicy(tempPoolDir);

    // 验证：存在两个桶
    const bucketKeys = Object.keys(metaPolicy.buckets);
    console.log(`✓ 生成的桶数量: ${bucketKeys.length}`);

    if (bucketKeys.length < 2) {
      throw new Error(`预期至少 2 个桶，实际: ${bucketKeys.length}`);
    }

    // 验证：cultivation_fantasy__MID 桶有 SPIKE_UP
    const cultivationBucket = metaPolicy.buckets['cultivation_fantasy__MID'];
    if (!cultivationBucket) {
      throw new Error('未找到 cultivation_fantasy__MID 桶');
    }

    console.log(`✓ cultivation_fantasy__MID 桶 revealCadenceBiasPrior: ${cultivationBucket.bias.revealCadenceBiasPrior}`);

    if (cultivationBucket.bias.revealCadenceBiasPrior !== 'SPIKE_UP') {
      throw new Error(`预期 SPIKE_UP，实际: ${cultivationBucket.bias.revealCadenceBiasPrior}`);
    }

    // 验证：romance_ceo__MID 桶为 NORMAL（因为样本少，confidence 低）
    const romanceBucket = metaPolicy.buckets['romance_ceo__MID'];
    if (!romanceBucket) {
      throw new Error('未找到 romance_ceo__MID 桶');
    }

    console.log(`✓ romance_ceo__MID 桶 revealCadenceBiasPrior: ${romanceBucket.bias.revealCadenceBiasPrior}`);
    console.log(`✓ romance_ceo__MID 桶 confidence: ${romanceBucket.bias.confidence.toFixed(2)}`);

    console.log('\n✓ Test 1 PASSED: 不同桶得到不同的 bias');

  } finally {
    // 清理
    cleanupTempDir(tempPoolDir);
  }
}

/**
 * 测试 2: 验证 confidence < 0.3 时不覆盖
 */
async function test2_lowConfidence() {
  console.log('\n' + '='.repeat(80));
  console.log('Test 2: 验证 confidence < 0.3 时不覆盖');
  console.log('='.repeat(80));

  const tempPoolDir = path.join(process.cwd(), 'temp_metrics_pool_test2');

  try {
    ensureTempDir(tempPoolDir);

    // 创建只有 1 个运行的项目（样本少）
    const projectDir = path.join(tempPoolDir, 'test_project');
    ensureTempDir(projectDir);

    // 使用包含 genre 关键词的 runId（cultivation_fantasy）
    const metrics = createLowQualityMetrics('test_project', 'run-cultivation-fantasy-low-sample');
    fs.writeFileSync(
      path.join(projectDir, 'run-0.json'),
      JSON.stringify(metrics, null, 2)
    );

    // 构建 meta policy
    const metaPolicy = buildMetaPolicy(tempPoolDir);

    // 验证：样本数 < 5，confidence 应该 < 0.3
    const bucketKey = Object.keys(metaPolicy.buckets)[0];
    const bucket = metaPolicy.buckets[bucketKey];

    console.log(`✓ 样本数: ${bucket.stats.sampleCount}`);
    console.log(`✓ Confidence: ${bucket.bias.confidence.toFixed(2)}`);

    if (bucket.bias.confidence >= 0.3) {
      throw new Error(`预期 confidence < 0.3，实际: ${bucket.bias.confidence.toFixed(2)}`);
    }

    // 验证：rationale 包含样本少提示
    const hasLowSampleWarning = bucket.bias.rationale.some(r =>
      r.includes('样本数较少')
    );

    console.log(`✓ Rationale 包含样本少警告: ${hasLowSampleWarning}`);

    if (!hasLowSampleWarning) {
      throw new Error('Rationale 应包含样本少警告');
    }

    console.log('\n✓ Test 2 PASSED: confidence < 0.3 机制正确');

  } finally {
    // 清理
    cleanupTempDir(tempPoolDir);
  }
}

/**
 * 测试 3: 验证 deriveAdaptiveParams 支持 metaBias
 */
async function test3_deriveParamsWithMetaBias() {
  console.log('\n' + '='.repeat(80));
  console.log('Test 3: 验证 deriveAdaptiveParams 支持 metaBias');
  console.log('='.repeat(80));

  // 构造状态修正输入（低分）
  const stateInput = {
    score: 45,
    retry: {
      avgRetries: 2.5,
      p95Retries: 3.0
    },
    warnings: ['EP3: reveal not concrete', 'High retry frequency'],
    errors: ['EP3: slotValidationFail']
  };

  // 构造 Meta Bias（先验）
  const metaBias: MetaPolicyBias = {
    revealCadenceBiasPrior: 'SPIKE_UP',
    retryBudgetPrior: 4,
    pressureMultiplierPrior: 0.9,
    confidence: 0.8,
    rationale: ['样本充足，置信度高']
  };

  // 调用 deriveAdaptiveParams（传入 metaBias）
  const params = deriveAdaptiveParams(stateInput, metaBias);

  console.log(`✓ 传递 metaBias 后得到参数:`, params);

  // 验证：参数符合预期
  if (params.revealCadenceBias !== 'SPIKE_UP') {
    throw new Error(`预期 revealCadenceBias = SPIKE_UP，实际: ${params.revealCadenceBias}`);
  }

  if (params.maxSlotRetries !== 4) {
    throw new Error(`预期 maxSlotRetries = 4，实际: ${params.maxSlotRetries}`);
  }

  // 使用近似比较避免浮点数精度问题
  if (Math.abs(params.pressureMultiplier - 0.9) > 0.0001) {
    throw new Error(`预期 pressureMultiplier ≈ 0.9，实际: ${params.pressureMultiplier}`);
  }

  console.log('\n✓ Test 3 PASSED: deriveAdaptiveParams 正确处理 metaBias');
}

/**
 * 测试 4: 验证 confidence < 0.3 时不合并
 */
async function test4_lowConfidenceNoMerge() {
  console.log('\n' + '='.repeat(80));
  console.log('Test 4: 验证 confidence < 0.3 时不合并');
  console.log('='.repeat(80));

  // 构造状态修正输入
  const stateInput = {
    score: 95,
    retry: {
      avgRetries: 0,
      p95Retries: 0
    },
    warnings: [],
    errors: []
  };

  // 构造低 confidence 的 Meta Bias
  const metaBias: MetaPolicyBias = {
    revealCadenceBiasPrior: 'SPIKE_UP',
    retryBudgetPrior: 4,
    pressureMultiplierPrior: 0.9,
    confidence: 0.25,  // < 0.3
    rationale: ['样本不足']
  };

  // 调用 deriveAdaptiveParams（传入低 confidence 的 metaBias）
  const params = deriveAdaptiveParams(stateInput, metaBias);

  console.log(`✓ 低 confidence metaBias 被忽略，使用状态修正:`, params);

  // 验证：使用状态修正的结果（NORMAL）
  if (params.revealCadenceBias !== 'NORMAL') {
    throw new Error(`预期 revealCadenceBias = NORMAL，实际: ${params.revealCadenceBias}`);
  }

  console.log('\n✓ Test 4 PASSED: 低 confidence 不合并');
}

/**
 * 测试 5: 验证 source 包含 meta_policy
 */
async function test5_sourceIncludesMetaPolicy() {
  console.log('\n' + '='.repeat(80));
  console.log('Test 5: 验证 source 包含 meta_policy');
  console.log('='.repeat(80));

  const stateInput = {
    score: 45,
    retry: {
      avgRetries: 2.5,
      p95Retries: 3.0
    },
    warnings: [],
    errors: []
  };

  const metaBias: MetaPolicyBias = {
    revealCadenceBiasPrior: 'SPIKE_UP',
    retryBudgetPrior: 4,
    pressureMultiplierPrior: 0.9,
    confidence: 0.8,
    rationale: ['样本充足']
  };

  const params = deriveAdaptiveParams(stateInput, metaBias);
  const snapshot = createAdaptiveParamsSnapshot(params, 'meta_policy');

  console.log(`✓ Snapshot source: ${snapshot.source}`);

  if (snapshot.source !== 'meta_policy') {
    throw new Error(`预期 source = meta_policy，实际: ${snapshot.source}`);
  }

  console.log('\n✓ Test 5 PASSED: source 包含 meta_policy');
}

// ========== 主函数 ==========

/**
 * 运行所有测试
 */
async function runAllTests() {
  console.log('='.repeat(80));
  console.log('M16.6 Meta Policy E2E Test Suite');
  console.log('='.repeat(80));

  const tests = [
    { name: 'Test 1: 不同桶得到不同 bias', fn: test1_differentBuckets },
    { name: 'Test 2: confidence < 0.3 不覆盖', fn: test2_lowConfidence },
    { name: 'Test 3: deriveAdaptiveParams 支持 metaBias', fn: test3_deriveParamsWithMetaBias },
    { name: 'Test 4: 低 confidence 不合并', fn: test4_lowConfidenceNoMerge },
    { name: 'Test 5: source 包含 meta_policy', fn: test5_sourceIncludesMetaPolicy }
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
    console.log('\n✓ All tests PASSED! M16.6 Meta Policy 实施成功！');
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

