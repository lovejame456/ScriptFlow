/**
 * S0 Sprint：结构一致性修复验证
 *
 * 目标：验证移除关键词匹配后，EP1-10 能正常生成，DEGRADED ≤ 2
 *
 * 成功标准：
 * - EP1-10 至少 8 集进入 DRAFT / COMPLETED
 * - DEGRADED ≤ 2
 * - 不出现集中同类失败
 */

import { createProjectSeed } from '../lib/ai/episodeFlow';
import { projectRepo } from '../lib/store/projectRepo';
import { generateEpisodeFast } from '../lib/ai/episodeFlow';
import { EpisodeStatus } from '../types';

interface S0TestResult {
  episodeIndex: number;
  status: EpisodeStatus;
  error?: string;
  contractGenerated: boolean;
  validationPassed: boolean;
}

interface S0TestReport {
  projectName: string;
  projectId: string;
  results: S0TestResult[];
  summary: {
    totalEpisodes: number;
    draftCount: number;
    completedCount: number;
    degradedCount: number;
    failedCount: number;
    successRate: number;
  };
  passed: boolean;
}

/**
 * 运行 S0 结构一致性修复验证
 */
async function runS0StructureConsistencyTest() {
  console.log('='.repeat(80));
  console.log('S0 Sprint：结构一致性修复验证');
  console.log('='.repeat(80));

  const results: S0TestResult[] = [];

  try {
    // Step 1: 创建测试项目
    console.log('\n[Step 1] Creating test project...');
    // 直接创建项目，避免 API 调用（S0 测试重点是结构一致性，不是 AI 生成质量）
    const project = await projectRepo.createFromSeed({
      name: 'S0 测试项目',
      genre: 'cultivation_fantasy',
      audience: '修仙爱好者',
      totalEpisodes: 10,
      pacingTemplateId: 'cultivation_fantasy',
      logline: '一个现代修仙者穿越到古代修仙世界，发现自己修仙功法是绝世神功，引起各方势力觊觎和追杀。',
      synopsis: '主角穿越到古代修仙世界，发现自己的现代修仙功法是这个世界失传的绝学，因此引起各方势力的觊觎和追杀。'
    });

    console.log(`[Step 1] Project created: ${project.name} (${project.id})`);
    console.log(`  - Genre: ${project.genre}`);
    console.log(`  - Total Episodes: ${project.totalEpisodes}`);
    console.log(`  - Pacing Template: ${project.pacingTemplateId}`);

    // Step 2: 生成 outline（必需，否则 episodeFlow 会找不到 outline）
    console.log('\n[Step 2] Generating outline...');
    // 使用简化的 outline（避免 API 调用）
    const outline = Array.from({ length: 10 }, (_, i) => ({
      episodeIndex: i + 1,
      summary: `EP${i + 1}: 主角修仙路上遇到新的挑战和机遇`,
      conflict: i % 2 === 0 ? '与反派势力冲突' : '修仙突破',
      highlight: '实力提升',
      hook: '引出后续剧情',
      act: Math.ceil((i + 1) / 3)
    }));

    await projectRepo.saveOutline(project.id, outline);
    console.log(`  ✓ Outline generated: ${outline.length} episodes`);

    // Step 3: 生成 EP1-10
    console.log('\n[Step 2] Generating EP1-10...');

    for (let episodeIndex = 1; episodeIndex <= 10; episodeIndex++) {
      console.log(`\n--- Generating EP${episodeIndex} ---`);

      const result: S0TestResult = {
        episodeIndex,
        status: EpisodeStatus.FAILED,
        contractGenerated: false,
        validationPassed: false
      };

      try {
        // 使用 generateEpisodeFast 快速生成（不执行 Aligner/Rewrite）
        const episode = await generateEpisodeFast({
          projectId: project.id,
          episodeIndex
        });

        console.log(`  ✓ EP${episodeIndex} generated successfully`);
        console.log(`    - Status: ${episode.status}`);
        console.log(`    - Content length: ${episode.content?.length || 0} chars`);

        result.status = episode.status;
        result.contractGenerated = !!episode.structureContract;
        result.validationPassed = episode.validation?.fastCheck?.passed ?? false;

      } catch (error: any) {
        console.error(`  [X] EP${episodeIndex} failed:`, error.message || String(error));
        result.error = error.message || String(error);
      }

      results.push(result);
    }

    // Step 3: 生成测试报告
    console.log('\n[Step 3] Generating test report...');

    const draftCount = results.filter(r => r.status === EpisodeStatus.DRAFT).length;
    const completedCount = results.filter(r => r.status === EpisodeStatus.COMPLETED).length;
    const degradedCount = results.filter(r => r.status === EpisodeStatus.DEGRADED).length;
    const failedCount = results.filter(r => r.status === EpisodeStatus.FAILED).length;

    const report: S0TestReport = {
      projectName: project.name,
      projectId: project.id,
      results,
      summary: {
        totalEpisodes: results.length,
        draftCount,
        completedCount,
        degradedCount,
        failedCount,
        successRate: ((draftCount + completedCount) / results.length * 100)
      },
      passed: degradedCount <= 2 && (draftCount + completedCount) >= 8
    };

    console.log('\n' + '='.repeat(80));
    console.log('S0 Sprint 测试报告');
    console.log('='.repeat(80));
    console.log(`项目: ${report.projectName} (${report.projectId})`);
    console.log(`总集数: ${report.summary.totalEpisodes}`);
    console.log(`DRAFT: ${report.summary.draftCount} 集`);
    console.log(`COMPLETED: ${report.summary.completedCount} 集`);
    console.log(`DEGRADED: ${report.summary.degradedCount} 集`);
    console.log(`FAILED: ${report.summary.failedCount} 集`);
    console.log(`成功率: ${report.summary.successRate.toFixed(1)}%`);

    console.log('\n详细结果:');
    for (const result of results) {
      console.log(`\n--- EP${result.episodeIndex} ---`);
      console.log(`  状态: ${result.status}`);
      console.log(`  合约生成: ${result.contractGenerated ? '✓' : '[X]'}`);
      console.log(`  验证通过: ${result.validationPassed ? '✓' : '[X]'}`);
      if (result.error) {
        console.log(`  错误: ${result.error}`);
      }
    }

    // Step 4: 判定测试结果
    console.log('\n' + '='.repeat(80));
    console.log('测试结果判定');
    console.log('='.repeat(80));

    console.log(`DEGRADED 数量: ${report.summary.degradedCount} (标准: ≤ 2)`);
    console.log(`DRAFT/COMPLETED 数量: ${report.summary.draftCount + report.summary.completedCount} (标准: ≥ 8)`);

    if (report.passed) {
      console.log('\n✓ S0 Sprint 修复成功！');
      console.log('  - DEGRADED ≤ 2: ✓');
      console.log('  - DRAFT/COMPLETED ≥ 8: ✓');
      console.log('\n系统已达到"可用"状态，可以进入正常创作。');
    } else {
      console.log('\n[X] S0 Sprint 修复未达标');
      console.log(`  - DEGRADED ≤ 2: ${report.summary.degradedCount <= 2 ? '✓' : '[X]'}`);
      console.log(`  - DRAFT/COMPLETED ≥ 8: ${report.summary.draftCount + report.summary.completedCount >= 8 ? '✓' : '[X]'}`);
      console.log('\n系统仍然存在结构性失败，需要进一步修复。');
    }

    console.log('='.repeat(80));

    return report;

  } catch (error: any) {
    console.error('\n[X] Test execution failed:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// 运行测试
runS0StructureConsistencyTest().then((report) => {
  console.log('\n测试完成。');

  // 根据 test 结果设置退出码
  process.exit(report.passed ? 0 : 1);
}).catch((error) => {
  console.error('Test failed with exception:', error);
  process.exit(1);
});

