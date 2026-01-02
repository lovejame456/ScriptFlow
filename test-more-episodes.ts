// P1 第二轮 - 生成更多集数以观察 WARN/FAIL 行为

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

console.log('[P1 第二轮] 批量生成测试');
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

import { api } from './api';
import { projectRepo } from './lib/store/projectRepo';
import { batchRepo } from './lib/batch/batchRepo';

async function runBatchTest() {
  console.log('\n========================================');
  console.log('P1 第二轮批量生成测试（20集）');
  console.log('========================================\n');

  // 获取现有项目
  let projects = await api.project.getAll();
  if (projects.length === 0) {
    console.log('错误：没有找到项目，请先运行 test-real-generation.ts');
    return;
  }

  const project = projects[0];
  console.log(`使用项目: ${project.name} (ID: ${project.id})\n`);

  // 检查已完成的集数
  const completedCount = project.episodes.filter((e: any) => e.status === 'COMPLETED').length;
  console.log(`当前已完成: ${completedCount} 集`);

  // 启动批量生成（EP4-EP20）
  console.log('\n========================================');
  console.log('开始批量生成 EP4-EP20');
  console.log('========================================\n');

  try {
    const batchState = await api.batch.start(project.id, 4, 20);
    console.log(`批量生成启动成功`);
    console.log(`  范围: EP${batchState.startEpisode} - EP${batchState.endEpisode}`);
    console.log(`  当前: EP${batchState.currentEpisode}`);
    console.log(`  状态: ${batchState.status}`);
    console.log(`  健康度: ${batchState.health || 'N/A'}`);
  } catch (e: any) {
    console.log(`批量生成启动失败: ${e.message}`);
    return;
  }

  // 轮询等待完成
  let isRunning = true;
  let pollCount = 0;
  const maxPolls = 300; // 最多轮询 5 分钟

  while (isRunning && pollCount < maxPolls) {
    await new Promise(resolve => setTimeout(resolve, 2000)); // 每 2 秒轮询一次

    const currentBatch = batchRepo.get(project.id);
    if (!currentBatch) {
      console.log('批量任务已停止');
      isRunning = false;
      break;
    }

    console.log(`\n[轮询 ${pollCount + 1}] 状态更新:`);
    console.log(`  当前集: EP${currentBatch.currentEpisode}`);
    console.log(`  已完成: ${currentBatch.completed.length} 集`);
    console.log(`  失败: ${currentBatch.failed.length} 集`);
    console.log(`  状态: ${currentBatch.status}`);
    console.log(`  健康度: ${currentBatch.health || 'N/A'}`);

    if (currentBatch.lastError) {
      console.log(`  最后错误: ${currentBatch.lastError}`);
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

  console.log(`项目状态:`);
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

  console.log('\n[P1 第二轮] 批量测试结束');
}

runBatchTest().catch(console.error);





