/**
 * P1 产品稳定性 Sprint 代码验证脚本
 *
 * 验收标准：
 * 1) EpisodeStatus.DEGRADED 已添加到 types.ts
 * 2) BatchState.degraded 数组已添加
 * 3) buildRelaxedSlots 函数存在于 episodeFlow.ts
 * 4) buildDegradedSummary 函数存在于 episodeFlow.ts
 * 5) Metrics 记录 degradedCount
 *
 * 运行方式：
 * - Node.js: ts-node test-p1-verify-degraded.ts
 */

import * as ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

// ==================== 验证函数 ====================

function verify(filename: string, checks: { name: string; test: (source: string) => boolean }[]) {
  console.log(`\n🔍 验证 ${filename}...`);

  const source = fs.readFileSync(filename, 'utf-8');
  let passed = 0;
  let failed = 0;

  for (const check of checks) {
    try {
      const result = check.test(source);
      if (result) {
        console.log(`  ✅ ${check.name}`);
        passed++;
      } else {
        console.log(`  ❌ ${check.name}`);
        failed++;
      }
    } catch (error: any) {
      console.log(`  ❌ ${check.name}: ${error.message}`);
      failed++;
    }
  }

  console.log(`  结果: ${passed}/${checks.length} 通过`);
  return { passed, failed, total: checks.length };
}

// ==================== 主验证流程 ====================

console.log('========================================');
console.log('🧪 P1 产品稳定性 Sprint 代码验证');
console.log('========================================\n');

let totalPassed = 0;
let totalFailed = 0;

// 1. 验证 types.ts
const typesResult = verify('types.ts', [
  {
    name: 'EpisodeStatus 包含 DEGRADED 状态',
    test: (source) => {
      // 使用更宽松的正则匹配
      return /DEGRADED/.test(source) && /降级完成/.test(source);
    }
  },
  {
    name: 'BatchState 包含 degraded 数组',
    test: (source) => {
      // 使用正则匹配 degraded 字段
      return /degraded\?\s*:\s*number\[\]/.test(source);
    }
  }
]);

totalPassed += typesResult.passed;
totalFailed += typesResult.failed;

// 2. 验证 episodeFlow.ts
const episodeFlowResult = verify('lib/ai/episodeFlow.ts', [
  {
    name: 'buildRelaxedSlots 函数存在',
    test: (source) => {
      return /function\s+buildRelaxedSlots/.test(source);
    }
  },
  {
    name: 'buildDegradedSummary 函数存在',
    test: (source) => {
      return /function\s+buildDegradedSummary/.test(source);
    }
  },
  {
    name: 'buildDegradedSummary 包含降级文案',
    test: (source) => {
      return /结构异常.*系统已自动降级并继续生成/.test(source);
    }
  },
  {
    name: 'buildDegradedSummary 包含建议操作',
    test: (source) => {
      return /建议操作：/.test(source) && /重新生成.*更明确 Reveal/.test(source);
    }
  },
  {
    name: 'generateEpisodeFast 包含 Relaxed Retry 逻辑',
    test: (source) => {
      return /P1:.*Relaxed Retry/.test(source) || /降级模式.*不强求严格的结构完整性/.test(source);
    }
  },
  {
    name: 'generateEpisodeFast 返回 DEGRADED 对象',
    test: (source) => {
      return /status:\s*EpisodeStatus\.DEGRADED/.test(source);
    }
  }
]);

totalPassed += episodeFlowResult.passed;
totalFailed += episodeFlowResult.failed;

// 3. 验证 batchRunner.ts
const batchRunnerResult = verify('lib/ai/batchRunner.ts', [
  {
    name: 'BatchRunner 处理 DEGRADED 状态',
    test: (source) => {
      return /result\.status\s*===?\s*EpisodeStatus\.DEGRADED/.test(source);
    }
  },
  {
    name: 'DEGRADED 剧集加入 degraded 数组',
    test: (source) => {
      return /batch\.degraded\.push\(episodeIndex\)/.test(source);
    }
  },
  {
    name: 'DEGRADED 时不暂停 Batch',
    test: (source) => {
      // 检查 DEGRADED 处理逻辑中不包含 batch.status = 'PAUSED'
      const degradedBlock = source.match(/if\s*\(result\.status\s*===?\s*EpisodeStatus\.DEGRADED\)[\s\S]*?\n\s*}/);
      return degradedBlock && !degradedBlock[0].includes("batch.status = 'PAUSED'");
    }
  },
  {
    name: 'DEGRADED 时继续下一集',
    test: (source) => {
      return /DEGRADED.*batch\.currentEpisode\s*\+\s*=\s*1/.test(source.replace(/\s/g, ''));
    }
  }
]);

totalPassed += batchRunnerResult.passed;
totalFailed += batchRunnerResult.failed;

// 4. 验证 runMetrics.ts
const runMetricsResult = verify('lib/metrics/runMetrics.ts', [
  {
    name: 'computeAggregates 统计 degradedCount',
    test: (source) => {
      return /let\s+degradedCount\s*=\s*0/.test(source);
    }
  },
  {
    name: 'aggregates 包含 degradedCount',
    test: (source) => {
      return /degradedCount,/.test(source);
    }
  },
  {
    name: '判断重试次数超过阈值计为降级',
    test: (source) => {
      return /retryCount\s*>\s*3.*degradedCount\+\+/.test(source.replace(/\s/g, '')) ||
             /retryCount.*DEFAULT_MAX_SLOT_RETRIES.*degradedCount/.test(source.replace(/\s/g, ''));
    }
  }
]);

totalPassed += runMetricsResult.passed;
totalFailed += runMetricsResult.failed;

// ==================== 汇总结果 ====================

console.log('\n========================================');
console.log('📋 验证结果汇总');
console.log('========================================\n');

console.log(`✅ 通过: ${totalPassed}`);
console.log(`❌ 失败: ${totalFailed}`);
console.log(`📊 总计: ${totalPassed + totalFailed}\n`);

if (totalFailed === 0) {
  console.log('🎉 所有代码验证通过！\n');
  console.log('P1 产品稳定性 Sprint 实施已完成：');
  console.log('1. ✅ EpisodeStatus.DEGRADED 状态已添加');
  console.log('2. ✅ BatchState.degraded 数组已添加');
  console.log('3. ✅ Relaxed Retry 逻辑已实现');
  console.log('4. ✅ buildDegradedSummary 函数已添加');
  console.log('5. ✅ BatchRunner 支持 DEGRADED 状态');
  console.log('6. ✅ Metrics 记录 degradedCount');
  console.log('\n下一步：');
  console.log('- 运行 test-p1-degraded-batch.ts 进行端到端测试');
  console.log('- 检查 Metrics 报告中的 degradedCount 统计');
} else {
  console.log('❌ 部分验证失败，请检查上述失败项\n');
  process.exit(1);
}

