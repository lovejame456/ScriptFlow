/**
 * M16.6 Meta Policy Build Script
 *
 * 用途：
 * - 扫描 metrics_pool/ 中的所有跨项目 Metrics
 * - 生成 meta/meta_policy.json（项目级偏置）
 *
 * 使用方法：
 *   npm run meta:build
 */

import path from 'node:path';
import {
  buildMetaPolicy,
  writeMetaPolicy
} from '../lib/metrics/metaAggregator';

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(80));
  console.log('M16.6 Meta Policy Build');
  console.log('='.repeat(80));

  const poolDir = path.join(process.cwd(), 'metrics_pool');
  const outputPath = path.join(process.cwd(), 'meta', 'meta_policy.json');

  console.log(`\n[Config]`);
  console.log(`  - Metrics Pool: ${poolDir}`);
  console.log(`  - Output: ${outputPath}`);

  try {
    // 构建 Meta Policy
    const metaPolicy = buildMetaPolicy(poolDir);

    // 写入文件
    writeMetaPolicy(outputPath, metaPolicy);

    // 输出摘要
    console.log('\n' + '='.repeat(80));
    console.log('Build Summary');
    console.log('='.repeat(80));
    console.log(`Version: ${metaPolicy.version}`);
    console.log(`Generated At: ${metaPolicy.generatedAt}`);
    console.log(`Total Buckets: ${Object.keys(metaPolicy.buckets).length}`);

    for (const [bucketKey, { bias, stats }] of Object.entries(metaPolicy.buckets)) {
      console.log(`\nBucket: ${bucketKey}`);
      console.log(`  - Sample Count: ${stats.sampleCount}`);
      console.log(`  - Mean Score: ${stats.meanScore.toFixed(1)}`);
      console.log(`  - P95 Retries: ${stats.p95Retries.toFixed(2)}`);
      console.log(`  - Error Rate: ${(stats.errorRate * 100).toFixed(1)}%`);
      console.log(`  - Confidence: ${bias.confidence.toFixed(2)}`);
      console.log(`  - Reveal Bias: ${bias.revealCadenceBiasPrior}`);
      console.log(`  - Retry Budget: ${bias.retryBudgetPrior}`);
      console.log(`  - Pressure Multiplier: ${bias.pressureMultiplierPrior.toFixed(2)}`);
      console.log(`  - Rationale:`);
      for (const line of bias.rationale) {
        console.log(`      • ${line}`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('✓ Meta policy build completed successfully');
    console.log('='.repeat(80));

  } catch (error: any) {
    console.error('\n✗ Meta policy build failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行主函数
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

