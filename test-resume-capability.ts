/**
 * 测试：生产运行态可恢复机制
 *
 * 此文件用于手动验证系统的恢复能力是否符合验收标准。
 *
 * 验收标准：
 * 1. 生成过程中熄屏 → 点亮 → UI 自动恢复运行态
 * 2. 生成过程中刷新页面（Cmd + R）→ UI 自动恢复
 * 3. 生成过程中回首页 → 再进项目 → UI 自动恢复
 * 4. 长时间生成下进度条与 COMPLETED 集数一致
 * 5. 没有新的 lint / ts 报错
 */

import { api } from './api';
import { projectRepo } from './lib/store/projectRepo';

/**
 * 测试辅助函数：模拟后台任务运行
 */
async function simulateBackgroundGeneration(projectId: string) {
  console.log('[Test] Simulating background generation...');
  await api.task.start(projectId);
}

/**
 * 测试辅助函数：检查恢复状态
 */
async function verifyRestore(projectId: string) {
  const task = await api.task.get(projectId);
  const batch = await api.batch.getState(projectId);

  console.log('[Test] Current task status:', task?.status);
  console.log('[Test] Current batch status:', batch?.status);
  console.log('[Test] Completed episodes:', batch?.completed);
  console.log('[Test] Current episode:', batch?.currentEpisode);

  // 验证状态驱动一致性
  const project = await api.project.get(projectId);
  const completedEpisodes = project.episodes.filter(e => e.status === '已完成');

  if (completedEpisodes.length !== batch?.completed.length) {
    console.error('[Test] ❌ 状态不一致：UI 显示已完成集数与 batch.completed 不匹配');
    console.error(`[Test] UI completed: ${completedEpisodes.length}, Batch completed: ${batch?.completed.length}`);
  } else {
    console.log('[Test] ✅ 状态一致性验证通过');
  }
}

/**
 * 手动测试步骤
 */
export const manualTestSteps = [
  {
    id: 1,
    name: '测试熄屏恢复',
    steps: [
      '1. 打开项目，点击"开始冷启动验证"',
      '2. 等待生成开始（task.status = RUNNING）',
      '3. 关闭电脑屏幕（macOS: Control+Shift+Eject）',
      '4. 等待 10 秒',
      '5. 点亮屏幕',
      '6. 预期：UI 自动显示"正在生产中"，轮询继续运行'
    ],
    expectedBehavior: '熄屏后点亮，UI 自动恢复到运行态'
  },
  {
    id: 2,
    name: '测试页面刷新恢复',
    steps: [
      '1. 打开项目，点击"开始冷启动验证"',
      '2. 等待生成开始',
      '3. 按 Cmd + R 刷新页面',
      '4. 预期：页面加载后自动显示"正在生产中"，轮询自动启动'
    ],
    expectedBehavior: '刷新页面后，UI 自动恢复到运行态'
  },
  {
    id: 3,
    name: '测试重新进入项目',
    steps: [
      '1. 打开项目，点击"开始冷启动验证"',
      '2. 等待生成开始',
      '3. 点击侧边栏"返回首页"',
      '4. 点击项目卡片重新进入',
      '5. 预期：UI 自动显示"正在生产中"，轮询自动启动'
    ],
    expectedBehavior: '从首页重新进入，UI 自动恢复到运行态'
  },
  {
    id: 4,
    name: '测试 tab 挂起恢复',
    steps: [
      '1. 打开项目，点击"开始冷启动验证"',
      '2. 等待生成开始',
      '3. 切换到其他浏览器 tab',
      '4. 等待 10 秒',
      '5. 切换回项目 tab',
      '6. 预期：UI 自动刷新，轮询继续运行'
    ],
    expectedBehavior: 'tab 挂起后恢复，UI 自动刷新状态'
  },
  {
    id: 5,
    name: '验证进度条一致性',
    steps: [
      '1. 让一批剧集生成完成（至少 10 集）',
      '2. 检查 EpisodesView 的进度条',
      '3. 点击进入 UnifiedWorkspace',
      '4. 检查 Batch Progress 百分比',
      '5. 对比实际已完成集数',
      '6. 预期：进度条百分比 = (已完成集数 / 总集数) * 100'
    ],
    expectedBehavior: '进度条与 COMPLETED 集数严格一致'
  }
];

/**
 * 自动化状态验证（可选）
 */
export async function automatedStateCheck(projectId: string) {
  console.log('\n=== 自动化状态验证 ===');

  // 验证 1：检查 restoreHelper 导入正确
  try {
    const { restoreFromTask } = await import('./lib/ai/restoreHelper');
    console.log('[Test] ✅ restoreHelper 模块加载成功');
  } catch (e) {
    console.error('[Test] ❌ restoreHelper 模块加载失败', e);
    return false;
  }

  // 验证 2：检查组件恢复逻辑存在
  const fs = require('fs');
  const unifiedWorkspace = fs.readFileSync('./components/UnifiedWorkspace.tsx', 'utf8');
  const episodesView = fs.readFileSync('./components/EpisodesView.tsx', 'utf8');

  const hasRestoreImport = unifiedWorkspace.includes('restoreFromTask');
  const hasColdStartLogic = unifiedWorkspace.includes('handleColdStartResume');
  const episodesHasRestoreImport = episodesView.includes('restoreFromTask');

  console.log(`[Test] UnifiedWorkspace 导入 restoreFromTask: ${hasRestoreImport ? '✅' : '❌'}`);
  console.log(`[Test] UnifiedWorkspace 有冷启动逻辑: ${hasColdStartLogic ? '✅' : '❌'}`);
  console.log(`[Test] EpisodesView 导入 restoreFromTask: ${episodesHasRestoreImport ? '✅' : '❌'}`);

  // 验证 3：检查状态驱动注释
  const batchRunner = fs.readFileSync('./lib/ai/batchRunner.ts', 'utf8');
  const hasStateDrivenComment = batchRunner.includes('P0 状态驱动断言');
  console.log(`[Test] batchRunner 有状态驱动注释: ${hasStateDrivenComment ? '✅' : '❌'}`);

  const allPassed = hasRestoreImport && hasColdStartLogic && episodesHasRestoreImport && hasStateDrivenComment;

  if (allPassed) {
    console.log('\n[Test] ✅ 所有代码检查通过');
  } else {
    console.log('\n[Test] ❌ 部分代码检查失败');
  }

  return allPassed;
}

// 如果直接运行此文件
if (require.main === module) {
  console.log('生产运行态可恢复机制 - 测试工具\n');
  console.log('手动测试步骤：');
  manualTestSteps.forEach(test => {
    console.log(`\n${test.id}. ${test.name}`);
    test.steps.forEach(step => console.log(`  ${step}`));
    console.log(`  预期: ${test.expectedBehavior}`);
  });

  console.log('\n运行自动化状态验证...\n');
  automatedStateCheck('demo-project-id').then(() => {
    console.log('\n请按照手动测试步骤验证系统恢复能力。');
  });
}


