// P1 第二轮 - 完整测试（创建项目 + 生成 20 集）

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 先加载环境变量
dotenv.config({ path: join(__dirname, '.env') });

console.log('[P1 第二轮] 真实 DeepSeek 生成测试（完整）');
console.log('[DEBUG] VITE_DEEPSEEK_API_KEY:', process.env.VITE_DEEPSEEK_API_KEY ? '✓ 已加载' : '✗ 未加载');

// 模拟 localStorage
const globalStore = {} as Record<string, string>;
// @ts-ignore
global.localStorage = {
  store: globalStore,
  getItem: function(key: string) { return this.store[key] || null; },
  setItem: function(key: string, value: string) { this.store[key] = value; },
  clear: function() { this.store = {}; }
};

// 导入系统
import { api } from './api';
import { projectRepo } from './lib/store/projectRepo';
import { batchRepo } from './lib/batch/batchRepo';

async function runFullTest() {
  console.log('\n========================================');
  console.log('P1 第二轮完整测试（生成 20 集）');
  console.log('========================================\n');

  // 创建新项目
  console.log('步骤 0: 创建新项目');
  console.log('========================================');
  const testPrompt = '现代都市甜宠剧，霸道总裁追妻记';
  const project = await api.project.seed(testPrompt);
  console.log(`✓ 项目创建成功: ${project.name} (ID: ${project.id})\n`);

  // 生成 Bible
  console.log('步骤 1: 生成 Bible');
  console.log('========================================');
  try {
    await api.project.generateBible(project.id);
    console.log('✓ Bible 生成成功\n');
  } catch (e: any) {
    console.log(`⚠ Bible 生成失败: ${e.message}，重试中...`);
    await api.project.generateBible(project.id);
    console.log('✓ Bible 生成成功（重试后）\n');
  }

  // 生成 Outline
  console.log('步骤 2: 生成 Outline');
  console.log('========================================');
  try {
    await api.project.generateOutline(project.id);
    console.log('✓ Outline 生成成功\n');
  } catch (e: any) {
    console.log(`⚠ Outline 生成失败: ${e.message}，重试中...`);
    await api.project.generateOutline(project.id);
    console.log('✓ Outline 生成成功（重试后）\n');
  }

  // 更新项目引用
  const projectAfterOutline = await projectRepo.get(project.id);
  console.log(`项目信息:`);
  console.log(`  总集数: ${projectAfterOutline.totalEpisodes}`);
  console.log(`  题材: ${projectAfterOutline.genre}`);
  console.log(`  重点集: ${projectAfterOutline.episodes.filter((e: any) => e.importance === 'KEY').map((e: any) => `EP${e.id}`).join(', ') || '无'}\n`);

  // 批量生成前 20 集
  console.log('步骤 3: 批量生成 EP1-EP20');
  console.log('========================================\n');

  try {
    const batchState = await api.batch.start(project.id, 1, 20);
    console.log(`批量生成启动成功`);
    console.log(`  范围: EP${batchState.startEpisode} - EP${batchState.endEpisode}`);
    console.log(`  当前: EP${batchState.currentEpisode}`);
    console.log(`  状态: ${batchState.status}\n`);
  } catch (e: any) {
    console.log(`批量生成启动失败: ${e.message}`);
    return;
  }

  // 轮询等待完成
  let isRunning = true;
  let pollCount = 0;
  const maxPolls = 600; // 最多轮询 10 分钟

  let healthyCount = 0;
  let warningCount = 0;
  let riskyCount = 0;
  let failCount = 0;

  while (isRunning && pollCount < maxPolls) {
    await new Promise(resolve => setTimeout(resolve, 2000));

    const currentBatch = batchRepo.get(project.id);
    if (!currentBatch) {
      console.log('批量任务已停止');
      isRunning = false;
      break;
    }

    // 统计健康度变化
    if (currentBatch.health === 'HEALTHY') healthyCount++;
    if (currentBatch.health === 'WARNING') warningCount++;
    if (currentBatch.health === 'RISKY') riskyCount++;
    if (currentBatch.failed.length > failCount) failCount = currentBatch.failed.length;

    // 每 5 次轮询输出一次状态（避免刷屏）
    if (pollCount % 5 === 0 || currentBatch.status !== 'RUNNING') {
      console.log(`[轮询 ${pollCount + 1}]`);
      console.log(`  当前: EP${currentBatch.currentEpisode} / EP${currentBatch.endEpisode}`);
      console.log(`  已完成: ${currentBatch.completed.length}`);
      console.log(`  失败: ${currentBatch.failed.length}`);
      console.log(`  状态: ${currentBatch.status}`);
      console.log(`  健康度: ${currentBatch.health || 'N/A'}`);

      if (currentBatch.lastError) {
        console.log(`  最后错误: ${currentBatch.lastError}`);
      }

      // 显示健康度统计
      console.log(`  健康度统计: HEALTHY=${healthyCount}, WARNING=${warningCount}, RISKY=${riskyCount}, FAIL=${failCount}`);
    }

    // 检查是否完成
    if (currentBatch.status === 'DONE' || currentBatch.status === 'FAILED' || currentBatch.status === 'PAUSED') {
      isRunning = false;
      console.log(`\n批量任务结束: ${currentBatch.status}`);
    }

    pollCount++;
  }

  // 最终状态
  console.log('\n========================================');
  console.log('最终状态');
  console.log('========================================\n');

  const finalProject = await projectRepo.get(project.id);
  const finalBatch = batchRepo.get(project.id);

  console.log(`项目:`);
  console.log(`  总集数: ${finalProject.totalEpisodes}`);
  console.log(`  已完成: ${finalProject.episodes.filter((e: any) => e.status === 'COMPLETED').length}`);
  console.log(`  失败: ${finalProject.episodes.filter((e: any) => e.status === 'FAILED').length}`);

  if (finalBatch) {
    console.log(`\n批量任务:`);
    console.log(`  状态: ${finalBatch.status}`);
    console.log(`  健康度: ${finalBatch.health}`);
    console.log(`  已完成: ${finalBatch.completed.length}`);
    console.log(`  失败: ${finalBatch.failed.length}`);
    console.log(`  连续失败: ${finalBatch.hardFailCount}`);

    if (finalBatch.failed.length > 0) {
      console.log(`  失败集数: ${finalBatch.failed.join(', ')}`);
    }
  }

  console.log(`\n健康度统计:`);
  console.log(`  HEALTHY: ${healthyCount} 次`);
  console.log(`  WARNING: ${warningCount} 次`);
  console.log(`  RISKY: ${riskyCount} 次`);
  console.log(`  失败集数: ${failCount}`);

  console.log('\n========================================');
  console.log('P1 第二轮测试完成');
  console.log('========================================');
}

runFullTest().catch(console.error);




