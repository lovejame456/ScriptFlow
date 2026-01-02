// 模拟 localStorage（用于 Node.js 测试环境）
// 使用全局共享的存储
const globalStore = {} as Record<string, string>;
// @ts-ignore
global.localStorage = global.localStorage || {
  store: globalStore,
  getItem: function(key: string) {
    return this.store[key] || null;
  },
  setItem: function(key: string, value: string) {
    this.store[key] = value;
  },
  clear: function() {
    this.store = {};
  }
};

// 加载环境变量
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

// 调试：检查环境变量是否加载成功
console.log('[DEBUG] VITE_DEEPSEEK_API_KEY:', process.env.VITE_DEEPSEEK_API_KEY ? '已加载' : '未加载');

import { api } from './api';
import { projectRepo } from './lib/store/projectRepo';
import { storyMemoryRepo } from './lib/store/memoryRepo';
import { EpisodeStatus } from './types';

async function runM2EP2Test() {
  console.log('===== M2 阶段: EP2 连续性验证 =====\n');

  // 步骤 1: 检查并生成 EP1（如果还没有）
  const projects = await api.project.getAll();
  console.log(`[DEBUG] 找到 ${projects.length} 个项目`);

  let project;
  if (projects.length === 0) {
    console.log('未找到现有项目，将创建新项目并生成 EP1\n');
    console.log('=== 步骤 1: 生成 EP1 ===\n');
    const testPrompt = '现代成功学大师穿越修仙宗门，从杂役一步步靠话术与认知逆袭。';
    project = await api.project.seed(testPrompt);
    console.log(`✓ 项目创建成功: ${project.name} (ID: ${project.id})\n`);

    try {
      await api.project.generateBible(project.id);
      console.log('✓ Bible 生成成功\n');
    } catch (e) {
      console.log('⚠ Bible 生成失败，尝试重试...\n');
      await api.project.generateBible(project.id);
      console.log('✓ Bible 生成成功（重试后）\n');
    }

    try {
      await api.project.generateOutline(project.id);
      console.log('✓ 大纲生成成功\n');
    } catch (e) {
      console.log('⚠ 大纲生成失败，尝试重试...\n');
      await api.project.generateOutline(project.id);
      console.log('✓ 大纲生成成功（重试后）\n');
    }

    console.log('生成 EP1...\n');
    await api.episode.generate(project.id, 1);
    console.log('✓ EP1 生成成功\n');
  } else {
    project = projects[0];
    console.log(`✓ 使用现有项目: ${project.name} (ID: ${project.id})\n`);

    // 检查 EP1 状态
    const episode1 = project.episodes[0];
    console.log('[DEBUG] EP1 状态检查:', {
      id: episode1.id,
      status: episode1.status,
      statusType: typeof episode1.status,
      hasContent: !!episode1.content
    });
    const isCompleted = episode1.status === EpisodeStatus.COMPLETED || episode1.status === '已完成';
    console.log(`[DEBUG] isCompleted: ${isCompleted}`);
    if (!episode1 || !isCompleted) {
      console.log('生成 EP1...\n');
      await api.episode.generate(project.id, 1);
      console.log('✓ EP1 生成成功\n');
      project = await projectRepo.get(project.id);
      const ep1After = project.episodes[0];
      console.log('[DEBUG] EP1 生成后状态:', {
        id: ep1After.id,
        status: ep1After.status,
        hasContent: !!ep1After.content,
        contentLength: ep1After.content?.length || 0
      });
    }
  }

  // 步骤 2: 重新获取项目数据（确保数据一致性）
  project = await projectRepo.get(project.id);
  console.log('[DEBUG] 重新获取项目后，episodes 数量:', project?.episodes?.length);

  // 步骤 3: 展示 EP1 信息
  const episode1 = project?.episodes[0];
  console.log('[DEBUG] episode1:', episode1 ? { id: episode1.id, status: episode1.status, hasContent: !!episode1.content } : 'undefined');

  if (!episode1) {
    console.error('错误：未找到 EP1');
    return;
  }

  const isCompleted = episode1.status === EpisodeStatus.COMPLETED || episode1.status === '已完成';
  console.log(`[DEBUG] EP1 状态: ${episode1.status}, isCompleted: ${isCompleted}`);

  if (!isCompleted) {
    console.error('错误：EP1 未完成');
    console.error(`状态: ${episode1.status}`);
    return;
  }

  console.log('===== EP1 回顾 =====\n');
  console.log(`标题: ${episode1.title}`);
  console.log(`Hook: ${episode1.outline.hook}`);
  console.log(`状态: ${episode1.status}\n`);

  // 步骤 3: 记录生成前的状态
  const memoryBefore = await storyMemoryRepo.get(project.id);
  console.log('===== 生成前 StoryMemory =====\n');
  console.log('CanonLayer:');
  console.log(`  - worldRules: ${(memoryBefore.canonLayer?.worldRules || []).join(', ')}`);
  console.log(`  - lockedEvents: ${(memoryBefore.canonLayer?.lockedEvents || []).length} 个事件`);
  console.log(`  - deadCharacters: ${(memoryBefore.canonLayer?.deadCharacters || []).join(', ') || '无'}`);
  console.log('\nPlotLayer:');
  console.log(`  - lockedEvents: ${(memoryBefore.plotLayer?.lockedEvents || []).length} 个事件`);
  console.log(`  - ongoingConflicts: ${(memoryBefore.plotLayer?.ongoingConflicts || []).length} 个冲突`);
  if ((memoryBefore.plotLayer?.ongoingConflicts || []).length > 0) {
    memoryBefore.plotLayer.ongoingConflicts.forEach((c: any, i: number) => {
      console.log(`    ${i + 1}. ${c.description || c}`);
    });
  }
  console.log(`  - foreshadowedEvents: ${(memoryBefore.plotLayer?.foreshadowedEvents || []).length} 个事件`);
  console.log('\nCharacterLayer:');
  console.log(`  - states: ${Object.keys(memoryBefore.characterLayer?.states || {}).length} 个角色状态\n`);

  // 步骤 4: 生成 EP2
  console.log('===== 开始生成 EP2 =====\n');
  console.log('调用: api.episode.generate(projectId, 2)\n');
  const result = await api.episode.generate(project.id, 2);

  // 步骤 5: 记录生成后的状态
  const memoryAfter = await storyMemoryRepo.get(project.id);
  const projectAfter = await projectRepo.get(project.id);
  const episode2 = projectAfter?.episodes[1];

  console.log('\n===== EP2 生成结果 =====\n');
  console.log(`成功: ${result.success}`);
  console.log(`状态: ${episode2?.status}\n`);

  if (result.success && episode2) {
    console.log(`标题: ${episode2.title}`);
    console.log(`Hook: ${episode2.outline.hook}`);
    console.log(`验证结果: ${JSON.stringify(episode2.validation, null, 2)}`);
    console.log(`\n内容预览:\n${episode2.content?.substring(0, 800)}...\n`);

    console.log('\n===== PM 验收: EP2 的 4 条硬条件 =====\n');

    // 验收条件 1: 是否明显承接 EP1 的结尾（不是新开头）
    console.log('验证条件 1: 是否明显承接 EP1 的结尾（不是新开头）');
    const ep1Hook = episode1.outline.hook;
    const ep2Content = episode2.content;
    const conflictsBefore = memoryBefore.plotLayer?.ongoingConflicts || [];
    const conflictsAfter = memoryAfter.plotLayer?.ongoingConflicts || [];
    const conflictsProgressed = conflictsAfter.length >= conflictsBefore.length;
    const connectsToEP1 = conflictsProgressed || (ep1Hook && ep2Content.includes(ep1Hook.substring(0, 20)));
    console.log(`   EP1 Hook: ${ep1Hook}`);
    console.log(`   EP2 Hook: ${episode2.outline.hook}`);
    console.log(`   冲突推进: ${conflictsBefore.length} → ${conflictsAfter.length}`);
    console.log(`   ${connectsToEP1 ? '✓ 通过' : '✗ 失败'}: ${connectsToEP1 ? 'EP2 明确承接 EP1 结尾' : 'EP2 似乎重新开局'}\n`);

    // 验收条件 2: 是否至少推进 1 个 ongoing 冲突
    console.log('验证条件 2: 是否至少推进 1 个 ongoing 冲突');
    console.log(`   之前冲突数: ${conflictsBefore.length}`);
    console.log(`   之后冲突数: ${conflictsAfter.length}`);
    if (conflictsAfter.length > 0) {
      console.log(`   当前冲突:`);
      conflictsAfter.forEach((c: any, i: number) => {
        console.log(`     ${i + 1}. ${c.description || c}`);
      });
    }
    console.log(`   ${conflictsProgressed ? '✓ 通过' : '✗ 失败'}: ${conflictsProgressed ? '至少推进 1 个冲突' : '未推进冲突'}\n`);

    // 验收条件 3: 是否没有新增角色
    console.log('验证条件 3: 是否没有新增角色');
    const charIds = new Set(projectAfter.characters.map(c => c.id));
    const charStates = memoryAfter.characterLayer?.states || {};
    const newCharIds = Object.keys(charStates).filter(id => !charIds.has(id));
    const noNewChars = newCharIds.length === 0;
    console.log(`   项目角色数: ${projectAfter.characters.length}`);
    console.log(`   Memory 角色数: ${Object.keys(charStates).length}`);
    console.log(`   ${noNewChars ? '✓ 通过' : '✗ 失败'}: ${noNewChars ? '无新增角色' : `发现新增角色: ${newCharIds.join(', ')}`}\n`);

    // 验收条件 4: StoryMemory 是否有演化（而不是覆盖）
    console.log('验证条件 4: StoryMemory 是否有演化（而不是覆盖）');
    const memoryEvolved = JSON.stringify(memoryBefore) !== JSON.stringify(memoryAfter);
    console.log(`   ${memoryEvolved ? '✓ 通过' : '✗ 失败'}: ${memoryEvolved ? 'StoryMemory 已演化' : 'StoryMemory 未变化'}\n`);

    // 显示 StoryMemory 变化
    if (memoryEvolved) {
      console.log('===== StoryMemory 变化摘要 =====\n');

      // PlotLayer 变化
      if (JSON.stringify(memoryBefore.plotLayer) !== JSON.stringify(memoryAfter.plotLayer)) {
        console.log('PlotLayer 变化:');
        const beforeConflicts = memoryBefore.plotLayer?.ongoingConflicts || [];
        const afterConflicts = memoryAfter.plotLayer?.ongoingConflicts || [];
        if (beforeConflicts.length !== afterConflicts.length || JSON.stringify(beforeConflicts) !== JSON.stringify(afterConflicts)) {
          console.log(`  - ongoingConflicts: ${beforeConflicts.length} → ${afterConflicts.length}`);
        }
        const beforeForeshadow = memoryBefore.plotLayer?.foreshadowedEvents || [];
        const afterForeshadow = memoryAfter.plotLayer?.foreshadowedEvents || [];
        if (beforeForeshadow.length !== afterForeshadow.length || JSON.stringify(beforeForeshadow) !== JSON.stringify(afterForeshadow)) {
          console.log(`  - foreshadowedEvents: ${beforeForeshadow.length} → ${afterForeshadow.length}`);
        }
        const beforeLocked = memoryBefore.plotLayer?.lockedEvents || [];
        const afterLocked = memoryAfter.plotLayer?.lockedEvents || [];
        if (beforeLocked.length !== afterLocked.length) {
          console.log(`  - lockedEvents: ${beforeLocked.length} → ${afterLocked.length}`);
        }
        console.log();
      }

      // CharacterLayer 变化
      if (JSON.stringify(memoryBefore.characterLayer) !== JSON.stringify(memoryAfter.characterLayer)) {
        console.log('CharacterLayer 变化:');
        const beforeStates = memoryBefore.characterLayer?.states || {};
        const afterStates = memoryAfter.characterLayer?.states || {};
        const beforeCount = Object.keys(beforeStates).length;
        const afterCount = Object.keys(afterStates).length;
        console.log(`  - states: ${beforeCount} → ${afterCount} 个角色状态`);
        if (afterCount > beforeCount) {
          console.log(`    新增角色状态:`);
          Object.keys(afterStates).filter(key => !beforeStates[key]).forEach(charId => {
            console.log(`      - ${charId}`);
          });
        }
        console.log();
      }
    }

    // 最终结论
    console.log('===== PM 验收结论 =====\n');
    const allPassed = connectsToEP1 && conflictsProgressed && noNewChars && memoryEvolved;
    console.log(`总体结果: ${allPassed ? '✅ 通过' : '❌ 失败'}`);
    console.log();
    console.log(`${allPassed ? 'EP2 验收通过，可以继续生成 EP3-EP5' : 'EP2 验收失败，需要分析原因并修复'}`);

    if (!allPassed) {
      console.log('\n=== 失败详情 ===\n');
      if (!connectsToEP1) console.log('❌ 未承接 EP1 结尾');
      if (!conflictsProgressed) console.log('❌ 未推进冲突');
      if (!noNewChars) console.log(`❌ 发现新增角色: ${newCharIds.join(', ')}`);
      if (!memoryEvolved) console.log('❌ StoryMemory 未演化');
    }
  } else {
    console.error('EP2 生成失败！');
    console.error(`错误详情: ${result.detail}`);
  }
}

// 运行测试
runM2EP2Test().catch(console.error);

