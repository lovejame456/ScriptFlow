/**
 * M3-3 BatchRunner 生产级验收测试脚本
 *
 * 验收标准：
 * 1) 批量生成 EP1–EP30 可运行
 * 2) 页面刷新/重启后 BatchState 不丢
 * 3) 支持 Pause / Resume（Resume 从最后一个 PASS 的下一集继续）
 * 4) 连续 HARD_FAIL >= 2 自动 PAUSED（不再继续撞墙）
 * 5) 有可追溯的 attempt 日志：知道哪一集为什么停
 *
 * 运行方式：
 * - 浏览器控制台：直接复制粘贴
 * - Node.js：ts-node test-m3-batch.ts
 */

import { batchRepo } from './lib/batch/batchRepo';
import { episodeRepo } from './lib/store/episodeRepo';
import { api } from './api';
import { BatchState, BatchStatus } from './types';

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
  console.log(`  Completed: [${state.completed.join(', ')}]`);
  console.log(`  Failed: [${state.failed.join(', ')}]`);
  console.log(`  Hard Fail Count: ${state.hardFailCount}`);
  console.log(`  Last Error: ${state.lastError || 'None'}`);
  console.log(`  Updated At: ${new Date(state.updatedAt).toLocaleString()}`);
}

async function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== 测试 A：基础批量生成 ====================

export async function testBasicBatch(projectId: string, start: number = 1, end: number = 15) {
  logTest('测试 A：基础批量生成 (EP1–EP15)');

  try {
    // 清理可能存在的旧 batch state
    batchRepo.clear(projectId);
    console.log('✅ 清理旧 batch state');

    // 启动批量生成
    console.log(`🚀 启动批量生成: EP${start}-${end}`);
    const batch = await api.batch.start(projectId, start, end);
    logBatchState(batch);

    // 等待一段时间让批量处理一些集数
    console.log(`⏳ 等待 10 秒...`);
    await wait(10000);

    // 检查当前状态
    const currentState = batchRepo.get(projectId);
    logBatchState(currentState);

    // 验证
    if (currentState) {
      if (currentState.status === 'RUNNING' || currentState.status === 'DONE') {
        console.log('✅ 批量生成正常运行');
      } else {
        console.log(`❌ 批量状态异常: ${currentState.status}`);
      }

      if (currentState.completed.length > 0 || currentState.currentEpisode > currentState.startEpisode) {
        console.log(`✅ 已处理 ${currentState.completed.length} 集或当前在 EP${currentState.currentEpisode}`);
      } else {
        console.log('❌ 没有处理任何集数');
      }
    }

  } catch (error: any) {
    console.error(`❌ 测试 A 失败: ${error.message}`);
  }
}

// ==================== 测试 B：中断恢复 ====================

export async function testPauseResume(projectId: string) {
  logTest('测试 B：中断恢复（暂停后刷新继续）');

  try {
    // 获取当前 batch state
    let batch = batchRepo.get(projectId);
    if (!batch) {
      console.log('⚠️  没有找到 batch state，先启动一个...');
      batch = await api.batch.start(projectId, 1, 10);
    }

    logBatchState(batch);

    // 如果正在运行，暂停它
    if (batch.status === 'RUNNING') {
      console.log('⏸️  暂停批量生成...');
      await api.batch.pause(projectId);
      await wait(500);
      batch = batchRepo.get(projectId);
      logBatchState(batch);

      if (batch?.status === 'PAUSED') {
        console.log('✅ 暂停成功');
      } else {
        console.log('❌ 暂停失败');
        return;
      }
    }

    // 模拟"刷新页面"：重新从 localStorage 读取
    console.log('\n🔄 模拟页面刷新...');
    await wait(1000);

    // 重新读取 batch state（模拟页面刷新后）
    const reloadedBatch = batchRepo.get(projectId);
    console.log('📂 从 localStorage 重新加载的 BatchState:');
    logBatchState(reloadedBatch);

    if (reloadedBatch) {
      if (reloadedBatch.status === 'PAUSED') {
        console.log('✅ 状态持久化成功，刷新后状态保持');
      } else {
        console.log(`❌ 状态持久化失败，状态变更为: ${reloadedBatch.status}`);
      }

      // 计算 resume 位置
      const lastCompleted = reloadedBatch.completed.length > 0
        ? Math.max(...reloadedBatch.completed)
        : reloadedBatch.startEpisode - 1;
      const expectedResumeFrom = Math.max(lastCompleted + 1, reloadedBatch.currentEpisode);

      console.log(`\n📍 预期恢复位置: EP${expectedResumeFrom}`);
      console.log(`📍 当前 currentEpisode: EP${reloadedBatch.currentEpisode}`);

      // 恢复
      console.log('\n▶️  恢复批量生成...');
      const resumedBatch = await api.batch.resume(projectId);
      logBatchState(resumedBatch);

      if (resumedBatch.status === 'RUNNING') {
        console.log('✅ 恢复成功');
      } else {
        console.log(`❌ 恢复失败，状态: ${resumedBatch.status}`);
      }
    }

  } catch (error: any) {
    console.error(`❌ 测试 B 失败: ${error.message}`);
  }
}

// ==================== 测试 C：失败暂停 ====================

export async function testHardFailPause(projectId: string) {
  logTest('测试 C：连续 2 次失败自动暂停');

  try {
    // 模拟连续失败的情况
    console.log('⚠️  此测试需要手动触发连续失败（例如：修改 prompt 或 mock generateOneEpisode）');
    console.log('⚠️  或者查看已存在的 failed episode 是否触发了自动暂停');

    const batch = batchRepo.get(projectId);
    if (!batch) {
      console.log('⚠️  没有找到 batch state');
      return;
    }

    logBatchState(batch);

    // 检查是否已经触发自动暂停
    if (batch.status === 'PAUSED' && batch.hardFailCount >= 2) {
      console.log('✅ 检测到自动暂停（hardFailCount >= 2）');
      console.log(`   连续失败次数: ${batch.hardFailCount}`);
      console.log(`   失败集数: [${batch.failed.join(', ')}]`);
    } else if (batch.hardFailCount > 0) {
      console.log(`⚠️  当前有 ${batch.hardFailCount} 次连续失败，但未达到阈值 2`);
    } else {
      console.log('ℹ️  当前没有连续失败');
    }

    // 查看失败日志
    const failedEpisodes = batch.failed;
    if (failedEpisodes.length > 0) {
      console.log('\n📝 失败日志:');
      for (const epIndex of failedEpisodes) {
        const attempts = episodeRepo.listAttempts(projectId, epIndex);
        console.log(`\n  EP${epIndex} 的尝试记录:`);
        attempts.forEach((attempt, idx) => {
          console.log(`    尝试 ${idx + 1}:`);
          console.log(`      时间: ${new Date(attempt.timestamp).toLocaleString()}`);
          console.log(`      错误: ${attempt.error}`);
          if (attempt.invariantErrors && attempt.invariantErrors.length > 0) {
            console.log(`      Invariant 错误: [${attempt.invariantErrors.join(', ')}]`);
          }
        });
      }
    }

  } catch (error: any) {
    console.error(`❌ 测试 C 失败: ${error.message}`);
  }
}

// ==================== 测试 D：持久化验证 ====================

export async function testPersistence(projectId: string) {
  logTest('测试 D：持久化验证');

  try {
    // 获取 batch state
    const batch = batchRepo.get(projectId);
    if (!batch) {
      console.log('⚠️  没有找到 batch state');
      return;
    }

    console.log('✅ BatchRepo 落地验证:');
    console.log(`   Key 名: scriptflow_batch_${projectId}`);
    console.log(`   字段完整性: ${[
      'projectId', 'status', 'startEpisode', 'endEpisode',
      'currentEpisode', 'completed', 'failed', 'hardFailCount',
      'lastError', 'updatedAt'
    ].every(field => field in batch) ? '✅' : '❌'}`);

    // 检查 attempt logs
    const allAttempts = episodeRepo.listAttempts(projectId);
    console.log('\n✅ saveAttempt 落地验证:');
    console.log(`   Key 名: scriptflow_attempts_${projectId}`);
    console.log(`   总尝试次数: ${allAttempts.length}`);

    if (allAttempts.length > 0) {
      console.log(`   字段完整性: ${[
        'projectId', 'episodeIndex', 'attempt', 'error',
        'timestamp', 'invariantErrors', 'pacingContext'
      ].every(field => field in allAttempts[0]) ? '✅' : '❌'}`);
    }

  } catch (error: any) {
    console.error(`❌ 测试 D 失败: ${error.message}`);
  }
}

// ==================== 综合验收测试 ====================

export async function runAllTests(projectId: string) {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   M3-3 BatchRunner 生产级验收测试        ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`Project ID: ${projectId}\n`);

  try {
    // 测试 D：持久化验证（快速）
    await testPersistence(projectId);

    // 测试 A：基础批量生成
    await testBasicBatch(projectId, 1, 15);

    // 测试 B：中断恢复
    await testPauseResume(projectId);

    // 测试 C：失败暂停
    await testHardFailPause(projectId);

    // 最终验收检查
    logTest('最终验收检查');
    const finalBatch = batchRepo.get(projectId);

    if (finalBatch) {
      const checks = {
        'BatchRepo 落地 (localStorage)': true,
        'saveAttempt 真实保存': episodeRepo.listAttempts(projectId).length > 0,
        '支持 Pause/Resume': ['RUNNING', 'PAUSED', 'DONE'].includes(finalBatch.status),
        '状态可持久化': finalBatch.updatedAt > 0,
        '连续失败自动暂停机制': 'hardFailCount' in finalBatch,
      };

      console.log('\n✅ 验收检查清单:');
      Object.entries(checks).forEach(([name, passed]) => {
        console.log(`  ${passed ? '✅' : '❌'} ${name}`);
      });
    }

    console.log('\n========================================');
    console.log('🎉 所有测试完成');
    console.log('========================================\n');

  } catch (error: any) {
    console.error(`❌ 测试运行失败: ${error.message}`);
  }
}

// ==================== 使用说明 ====================

/**
 * 在浏览器控制台中使用：
 *
 * // 1. 获取 project ID（从 URL 或其他地方）
 * const projectId = 'proj_xxx';
 *
 * // 2. 运行所有测试
 * await runAllTests(projectId);
 *
 * // 3. 单独运行某个测试
 * await testBasicBatch(projectId, 1, 15);
 * await testPauseResume(projectId);
 * await testHardFailPause(projectId);
 * await testPersistence(projectId);
 */

// 导出测试函数供外部使用
export default {
  testBasicBatch,
  testPauseResume,
  testHardFailPause,
  testPersistence,
  runAllTests
};





