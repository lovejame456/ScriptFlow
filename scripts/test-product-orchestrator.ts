/**
 * 产品级运行中枢测试
 * 
 * 验证：
 * - runProject 完整流程
 * - Metrics 收集
 * - Summary 生成
 * - summaryText 保存
 */

import { runProject } from './run-project';
import { projectRepo } from '../lib/store/projectRepo';
import fs from 'node:fs';
import path from 'node:path';

async function testProductOrchestrator() {
  console.log('='.repeat(80));
  console.log('测试：产品级运行中枢');
  console.log('='.repeat(80));

  const testPrompt = '现代成功学大师穿越修仙界（测试）';
  
  try {
    // 运行项目
    const result = await runProject({
      prompt: testPrompt,
      source: 'cli'
    });

    console.log('\n✓ 运行完成');
    console.log(`  Project ID: ${result.projectId}`);
    console.log(`  Run ID: ${result.runId}`);
    console.log(`  Metrics Path: ${result.metricsPath}`);
    console.log(`  Promotion Status: ${result.promotionStatus}`);
    console.log(`  Regression Gate: ${result.regressionGateResult.passed ? 'PASSED' : 'FAILED'}`);

    // 验证 Summary 是否保存
    const project = await projectRepo.get(result.projectId);
    if (!project) {
      throw new Error('项目未找到');
    }

    if (!project.summaryText) {
      throw new Error('Summary 未保存到项目');
    }

    console.log('\n✓ Summary 已保存到项目');
    console.log('\n=== Summary 内容 ===');
    console.log(project.summaryText);
    console.log('=== Summary 结束 ===\n');

    // 验证 Summary 包含关键信息
    const summary = project.summaryText;
    const requiredSections = [
      'ScriptFlow · Run Summary',
      'Quality:',
      'Health Score:',
      'Errors:',
      'Warnings:',
      'Notes:'
    ];

    const missingSections = requiredSections.filter(section => !summary.includes(section));
    if (missingSections.length > 0) {
      throw new Error(`Summary 缺少必要部分: ${missingSections.join(', ')}`);
    }

    console.log('✓ Summary 包含所有必要部分');

    // 验证 Metrics 文件存在
    if (result.metricsPath && !fs.existsSync(result.metricsPath)) {
      throw new Error(`Metrics 文件不存在: ${result.metricsPath}`);
    }

    if (result.metricsPath) {
      console.log(`✓ Metrics 文件存在: ${result.metricsPath}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ 所有测试通过！产品级运行中枢工作正常');
    console.log('='.repeat(80));

    return result;
  } catch (error: any) {
    console.error('\n✗ 测试失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}

// 运行测试
testProductOrchestrator()
  .then(() => {
    console.log('\n✓ 测试完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ 测试失败');
    process.exit(1);
  });

