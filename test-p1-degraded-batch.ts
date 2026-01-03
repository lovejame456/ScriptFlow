/**
 * P1 产品稳定性 Sprint 验证测试脚本
 *
 * 验收标准：
 * 1) 任何单集结构失败不得中断 Batch
 * 2) 系统自动进行 Relaxed Retry（降低约束）
 * 3) 若 Relaxed Retry 仍失败，标记为 DEGRADED 并继续
 * 4) Summary 显示降级信息和行动建议
 * 5) Metrics 记录 degradedCount
 *
 * 运行方式：
 * - Node.js: ts-node test-p1-degraded-batch.ts
 */

import { api } from './api/index.ts';
import { projectRepo } from './lib/store/projectRepo.ts';
import { episodeRepo } from './lib/store/episodeRepo.ts';
import { batchRepo } from './lib/batch/batchRepo.ts';
import { EpisodeStatus, BatchState } from './types.js';
import fs from 'node:fs';
import path from 'node:path';

// ==================== 测试辅助函数 ====================

function logTest(testName: string) {
  console.log(`\n========================================`);
  console.log(`🧪 ${testName}`);
  console.log(`========================================\n`);
}

function logBatchState(state: BatchState | null) {
  if (!state) {
    console.log('❌ BatchState is null');
    return;
  }
  console.log('📊 BatchState:');
  console.log(`  Status: ${state.status}`);
  console.log(`  Range: EP${state.startEpisode} - EP${state.endEpisode}`);
  console.log(`  Current: EP${state.currentEpisode}`);
  console.log(`  Completed: [${state.completed.join(', ') || '无'}]`);
  console.log(`  Failed: [${state.failed.join(', ') || '无'}]`);
  console.log(`  Degraded: [${state.degraded?.join(', ') || '无'}]`);
  console.log(`  Health: ${state.health || 'HEALTHY'}`);
  console.log(`  Last Error: ${state.lastError || 'None'}`);
  console.log(`  Updated At: ${new Date(state.updatedAt).toLocaleString()}`);
}

async function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== 测试：P1 DEGRADED Batch ====================

export async function testP1DegradedBatch() {
  logTest('P1: DEGRADED Batch 测试');

  const TEST_PROJECT_ID = 'test-p1-degraded-batch';
  const TEST_EPISODE_COUNT = 5;

  try {
    // 1. 创建测试项目
    console.log('📝 创建测试项目...');
    const project = await api.project.seed(
      'P1 DEGRADED 测试项目 - 都市脑洞 5集测试',
      {
        genre: '都市脑洞',
        totalEpisodes: TEST_EPISODE_COUNT,
        pacingTemplateId: 'urban_concept'
      }
    );
    const projectId = project.id;
    console.log(`✅ 项目创建成功: ${projectId}`);

    // 2. 生成大纲
    console.log('\n📚 生成大纲...');
    await api.project.generateOutline(projectId);
    console.log('✅ 大纲生成完成');

    // 3. 启动批量生成（EP1-EP5）
    console.log(`\n🚀 启动批量生成: EP1-EP${TEST_EPISODE_COUNT}`);
    const batch = await api.batch.start(projectId, 1, TEST_EPISODE_COUNT);
    logBatchState(batch);

    // 4. 等待批量生成完成（最长 5 分钟）
    console.log(`\n⏳ 等待批量生成完成（最长 5 分钟）...`);
    let batchCompleted = false;
    const MAX_WAIT_TIME = 5 * 60 * 1000; // 5 分钟
    const CHECK_INTERVAL = 10000; // 每 10 秒检查一次

    for (let elapsed = 0; elapsed < MAX_WAIT_TIME && !batchCompleted; elapsed += CHECK_INTERVAL) {
      await wait(CHECK_INTERVAL);
      elapsed += CHECK_INTERVAL;

      const currentBatch = batchRepo.get(projectId);
      logBatchState(currentBatch);

      if (currentBatch?.status === 'DONE' || currentBatch?.status === 'PAUSED') {
        batchCompleted = true;
      }

      // 打印当前剧集状态
      const projectState = await projectRepo.get(projectId);
      if (projectState) {
        console.log('\n📺 当前剧集状态:');
        for (let i = 1; i <= projectState.episodes.length; i++) {
          const ep = projectState.episodes[i - 1];
          const statusIcon = ep.status === EpisodeStatus.DEGRADED ? '⚠️' :
                            ep.status === EpisodeStatus.COMPLETED ? '✅' :
                            ep.status === EpisodeStatus.FAILED ? '❌' :
                            ep.status === EpisodeStatus.DRAFT ? '📝' : '⏳';
          console.log(`  ${statusIcon} EP${i}: ${ep.status}`);
          if (ep.status === EpisodeStatus.DEGRADED) {
            console.log(`     Summary: ${ep.humanSummary}`);
          }
        }
      }
    }

    // 5. 验证结果
    console.log('\n\n========================================');
    console.log('📋 验收结果');
    console.log('========================================\n');

    const finalBatch = batchRepo.get(projectId);
    const finalProject = await projectRepo.get(projectId);

    // 验证 1: Batch 状态
    if (finalBatch?.status === 'DONE') {
      console.log('✅ Batch 已完成（状态 = DONE）');
    } else if (finalBatch?.status === 'PAUSED') {
      console.log(`⚠️ Batch 已暂停（状态 = PAUSED）`);
      console.log(`   原因: ${finalBatch.lastError || '未知'}`);
    } else {
      console.log(`⚠️ Batch 状态: ${finalBatch?.status}`);
    }

    // 验证 2: 检查是否有 DEGRADED 集数
    const degradedEpisodes = finalProject?.episodes.filter(ep => ep.status === EpisodeStatus.DEGRADED) || [];
    if (degradedEpisodes.length > 0) {
      console.log(`\n✅ 发现 ${degradedEpisodes.length} 个降级集数:`);
      degradedEpisodes.forEach(ep => {
        console.log(`   ⚠️ EP${ep.episodeIndex}: DEGRADED`);
        console.log(`      Summary:\n${ep.humanSummary}`);
      });
    } else {
      console.log('\nℹ️ 未发现降级集数（所有集数正常生成）');
    }

    // 验证 3: Batch.degraded 数组
    if (finalBatch?.degraded && finalBatch.degraded.length > 0) {
      console.log(`\n✅ Batch.degraded 记录了降级集数: [${finalBatch.degraded.join(', ')}]`);
    } else {
      console.log('\nℹ️ Batch.degraded 数组为空或未初始化');
    }

    // 验证 4: Batch 是否继续完成（而不是在第一集失败时停止）
    const completedCount = finalBatch?.completed.length || 0;
    const failedCount = finalBatch?.failed.length || 0;
    const degradedCount = finalBatch?.degraded?.length || 0;
    const totalProcessed = completedCount + failedCount + degradedCount;

    // P1 验证：通过 currentEpisode 判断 Batch 是否处理了所有集
    const hasProcessedAllEpisodes = finalBatch?.currentEpisode >= TEST_EPISODE_COUNT + 1;

    console.log(`\n📊 统计:`);
    console.log(`   COMPLETED: ${completedCount}`);
    console.log(`   FAILED: ${failedCount}`);
    console.log(`   DEGRADED: ${degradedCount}`);
    console.log(`   总计: ${totalProcessed} / ${TEST_EPISODE_COUNT}`);
    console.log(`   CurrentEpisode: ${finalBatch?.currentEpisode} (应该 > ${TEST_EPISODE_COUNT})`);

    if (hasProcessedAllEpisodes || totalProcessed >= TEST_EPISODE_COUNT || finalBatch?.status === 'DONE') {
      console.log('\n✅ Batch 继续完成，未因单集失败而中断');
    } else {
      console.log('\n❌ Batch 未完成，可能因单集失败而中断');
    }

    // 验证 5: Summary 显示行动建议
    console.log('\n📝 Summary 验证:');
    const degradedEpisode = degradedEpisodes[0];
    if (degradedEpisode) {
      const summary = degradedEpisode.humanSummary;
      if (summary.includes('结构异常') && summary.includes('建议操作')) {
        console.log('✅ DEGRADED 集的 Summary 包含结构异常说明和行动建议');
        console.log(`   示例:\n${summary}`);
      } else {
        console.log('❌ DEGRADED 集的 Summary 不符合要求');
        console.log(`   实际: ${summary}`);
      }
    }

    // 验证 6: Metrics 报告
    console.log('\n📊 Metrics 验证:');
    const reportsDir = path.join(process.cwd(), 'reports');
    if (fs.existsSync(reportsDir)) {
      const metricsFiles = fs.readdirSync(reportsDir)
        .filter(f => f.startsWith('m16_metrics_') && f.endsWith('.json'))
        .filter(f => f !== 'm16_metrics_baseline.json');

      if (metricsFiles.length > 0) {
        const latestMetricsFile = metricsFiles
          .map(f => ({
            file: f,
            mtime: fs.statSync(path.join(reportsDir, f)).mtimeMs
          }))
          .sort((a, b) => b.mtime - a.mtime)[0].file;

        const latestMetricsPath = path.join(reportsDir, latestMetricsFile);
        const metricsContent = fs.readFileSync(latestMetricsPath, 'utf-8');
        const metrics = JSON.parse(metricsContent);

        console.log(`✅ 找到 Metrics 报告: ${latestMetricsFile}`);

        if (metrics.aggregates && 'degradedCount' in metrics.aggregates) {
          console.log(`✅ degradedCount 已记录: ${metrics.aggregates.degradedCount}`);
        } else {
          console.log('⚠️ degradedCount 未在 Metrics 中找到（可能因为没有降级集）');
        }
      } else {
        console.log('⚠️ 未找到 Metrics 报告');
      }
    } else {
      console.log('⚠️ reports 目录不存在');
    }

    console.log('\n========================================');
    console.log('🎉 P1 验证测试完成');
    console.log('========================================\n');

  } catch (error: any) {
    console.error('\n❌ 测试失败:', error);
    console.error(error.stack);
    throw error;
  }
}

// ==================== 运行测试 ====================

// ES module 入口检查
if (import.meta.url === `file://${process.argv[1]}`) {
  testP1DegradedBatch()
    .then(() => {
      console.log('✅ 测试执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 测试执行失败:', error);
      process.exit(1);
    });
}

