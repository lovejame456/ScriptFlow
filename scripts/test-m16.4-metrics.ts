/**
 * M16.4 Metrics 系统测试
 *
 * 验收标准：
 * 1. MetricsCollector 正确初始化和记录
 * 2. 运行测试后生成 reports/m16_metrics_*.json
 * 3. npm run metrics:m16 能正确解析和显示
 * 4. 聚合指标正确计算
 */

import { metrics } from '../lib/metrics/runMetrics';
import fs from 'node:fs';
import path from 'node:path';

async function runM16MetricsTest() {
  console.log('='.repeat(80));
  console.log('M16.4 Metrics System Test');
  console.log('='.repeat(80));

  try {
    // Step 1: 初始化 metrics
    console.log('\n[Step 1] Initializing metrics...');
    metrics.startRun({
      runId: 'test-m16.4',
      projectId: 'test-project',
      fromEpisode: 1,
      toEpisode: 3
    });
    console.log('✓ Metrics initialized');

    // Step 2: 模拟 EP1（无 Reveal）
    console.log('\n[Step 2] Simulating EP1...');
    metrics.recordContract(1, {
      episode: 1,
      mustHave: {
        newReveal: {
          required: false,
          type: 'FACT',
          scope: 'PROTAGONIST',
          summary: 'EP1 无需强制 New Reveal'
        }
      },
      optional: {
        conflictProgressed: true
      }
    });
    metrics.recordRetry(1, 0);
    metrics.recordSlotValidation(1, true, []);
    metrics.recordPostSignals(1, {
      revealIsConcrete: true,
      revealHasConsequence: true
    });
    console.log('✓ EP1 metrics recorded');

    // Step 3: 模拟 EP2（有 Reveal，重试）
    console.log('\n[Step 3] Simulating EP2...');
    metrics.recordContract(2, {
      episode: 2,
      mustHave: {
        newReveal: {
          required: true,
          type: 'INFO',
          scope: 'PROTAGONIST',
          summary: '主角发现自己的功法是绝世神功',
          cadenceTag: 'NORMAL',
          noRepeatKey: 'reveal_power_secret'
        }
      },
      optional: {
        conflictProgressed: true
      }
    });
    metrics.recordRetry(2, 1); // 重试 1 次
    metrics.recordSlotValidation(2, true, []);
    metrics.recordPostSignals(2, {
      revealIsConcrete: true,
      revealHasConsequence: true
    });
    console.log('✓ EP2 metrics recorded (with retry)');

    // Step 4: 模拟 EP3（Reveal + 验证失败）
    console.log('\n[Step 4] Simulating EP3...');
    metrics.recordContract(3, {
      episode: 3,
      mustHave: {
        newReveal: {
          required: true,
          type: 'RELATION',
          scope: 'ANTAGONIST',
          summary: '反派发现主角的真实身份',
          cadenceTag: 'NORMAL',
          noRepeatKey: 'reveal_identity_secret'
        }
      },
      optional: {
        conflictProgressed: true
      }
    });
    metrics.recordRetry(3, 2); // 重试 2 次
    metrics.recordSlotValidation(3, false, ['NEW_REVEAL slot missing']);
    metrics.recordPostSignals(3, {
      revealIsConcrete: false, // 弱信号
      revealHasConsequence: false
    });
    console.log('✓ EP3 metrics recorded (with validation failure)');

    // Step 5: 最终化并写入报告
    console.log('\n[Step 5] Finalizing metrics and writing report...');
    const { file, run } = metrics.finalizeAndWrite('reports');
    console.log(`✓ Metrics report written to: ${file}`);

    // Step 6: 验证报告内容
    console.log('\n[Step 6] Validating report content...');
    const report = JSON.parse(fs.readFileSync(file, 'utf-8'));

    const checks = [
      { name: 'runId', check: report.runId === 'test-m16.4' },
      { name: 'projectId', check: report.projectId === 'test-project' },
      { name: 'episodes count', check: report.episodes.length === 3 },
      { name: 'EP1 contract', check: report.episodes[0].contract.reveal.required === false },
      { name: 'EP2 retries', check: report.episodes[1].writer.slotRetries === 1 },
      { name: 'EP3 validation', check: report.episodes[2].writer.slotValidation.passed === false },
      { name: 'aggregates present', check: !!report.aggregates },
      { name: 'health score', check: typeof report.aggregates.health.score === 'number' }
    ];

    let allPassed = true;
    for (const { name, check } of checks) {
      if (check) {
        console.log(`  ✓ ${name}`);
      } else {
        console.log(`  ✗ ${name}`);
        allPassed = false;
      }
    }

    // Step 7: 显示聚合指标摘要
    console.log('\n[Step 7] Aggregates Summary:');
    console.log(`  Health Score: ${report.aggregates.health.score}`);
    console.log(`  Reveal Type Counts:`, report.aggregates.reveal.typeCounts);
    console.log(`  Cadence:`, report.aggregates.reveal.cadence);
    console.log(`  Retry Stats:`, report.aggregates.retry);
    console.log(`  Errors:`, report.aggregates.health.errors);
    console.log(`  Warnings:`, report.aggregates.health.warnings);

    // Step 8: 生成测试报告
    console.log('\n' + '='.repeat(80));
    console.log('Test Result');
    console.log('='.repeat(80));

    if (allPassed) {
      console.log('✓ M16.4 METRICS TEST PASSED');
      console.log(`  - Report generated: ${file}`);
      console.log(`  - To view: npm run metrics:m16 -- ${file}`);
      console.log('\n✓ M16.4 指标化与可视化系统实施成功！');
    } else {
      console.log('✗ M16.4 METRICS TEST FAILED');
      console.log('\n✗ 部分检查失败，请查看上述详细信息。');
      process.exit(1);
    }

    console.log('='.repeat(80));
    return report;

  } catch (error: any) {
    console.error('\n✗ Test execution failed:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// 运行测试
runM16MetricsTest().then(() => {
  console.log('\nTest completed successfully.');
  process.exit(0);
}).catch((error) => {
  console.error('Test failed with exception:', error);
  process.exit(1);
});

