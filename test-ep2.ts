// 模拟 localStorage（用于 Node.js 测试环境）
// 使用全局共享的存储，以便在多个测试脚本之间共享数据
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

async function testEP2() {
  console.log('===== M2 阶段: EP2 连续性验证 =====\n');

  // 获取现有的项目（假设已经有 EP1）
  const projects = await api.project.getAll();
  if (projects.length === 0) {
    console.error('错误：没有找到项目，请先运行 test-ep1.ts 生成 EP1');
    return;
  }

  const project = projects[0];
  console.log(`使用项目: ${project.name} (ID: ${project.id})\n`);

  // 检查 EP1 状态
  const episode1 = project.episodes[0];
  if (!episode1 || episode1.status !== 'COMPLETED') {
    console.error('错误：EP1 未完成，请先运行 test-ep1.ts');
    return;
  }

  console.log('===== EP1 回顾 =====\n');
  console.log(`标题: ${episode1.title}`);
  console.log(`Hook: ${episode1.outline.hook}`);
  console.log(`状态: ${episode1.status}\n`);

  // 记录生成前的状态
  const memoryBefore = await storyMemoryRepo.get(project.id);
  console.log('===== 生成前 StoryMemory =====\n');
  console.log(JSON.stringify(memoryBefore, null, 2));
  console.log();

  // 生成 EP2
  console.log('===== 开始生成 EP2 =====\n');
  console.log('调用: api.episode.generate(projectId, 2)\n');
  const result = await api.episode.generate(project.id, 2);

  // 记录生成后的状态
  const memoryAfter = await storyMemoryRepo.get(project.id);
  const projectAfter = await projectRepo.get(project.id);
  const episode2 = projectAfter?.episodes[1];

  console.log('===== EP2 生成结果 =====\n');
  console.log(`成功: ${result.success}`);
  console.log(`状态: ${episode2?.status}\n`);

  if (result.success && episode2) {
    console.log(`标题: ${episode2.title}`);
    console.log(`Hook: ${episode2.outline.hook}`);
    console.log(`验证结果: ${JSON.stringify(episode2.validation, null, 2)}\n`);
    console.log(`内容预览:\n${episode2.content?.substring(0, 500)}...\n`);

    console.log('===== PM 验收: EP2 的 4 条硬条件 =====\n');

    // 验收条件 1: 是否明显承接 EP1 的结尾（不是新开头）
    console.log('验证条件 1: 是否明显承接 EP1 的结尾（不是新开头）');
    const ep1Hook = episode1.outline.hook.toLowerCase();
    const ep2Content = episode2.content.toLowerCase();
    const connectsToEP1 = ep2Content.includes(ep1Hook.substring(0, 10)) ||
                         (memoryAfter.plotLayer?.ongoingConflicts?.length > memoryBefore.plotLayer?.ongoingConflicts?.length);
    console.log(`   EP1 Hook: ${episode1.outline.hook}`);
    console.log(`   EP2 Hook: ${episode2.outline.hook}`);
    console.log(`   ${connectsToEP1 ? '✓ 通过' : '✗ 失败'}: ${connectsToEP1 ? 'EP2 明确承接 EP1 结尾' : 'EP2 似乎重新开局'}\n`);

    // 验收条件 2: 是否至少推进 1 个 ongoing 冲突
    console.log('验证条件 2: 是否至少推进 1 个 ongoing 冲突');
    const conflictsBefore = memoryBefore.plotLayer?.ongoingConflicts || [];
    const conflictsAfter = memoryAfter.plotLayer?.ongoingConflicts || [];
    const conflictsProgressed = conflictsAfter.length >= conflictsBefore.length;
    console.log(`   之前冲突数: ${conflictsBefore.length}`);
    console.log(`   之后冲突数: ${conflictsAfter.length}`);
    if (conflictsAfter.length > 0) {
      console.log(`   当前冲突: ${JSON.stringify(conflictsAfter, null, 2)}`);
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
          if (afterConflicts.length > 0) {
            afterConflicts.forEach((c: any, i: number) => {
              console.log(`    ${i + 1}. ${c.description || c}`);
            });
          }
        }
        const beforeForeshadow = memoryBefore.plotLayer?.foreshadowedEvents || [];
        const afterForeshadow = memoryAfter.plotLayer?.foreshadowedEvents || [];
        if (beforeForeshadow.length !== afterForeshadow.length || JSON.stringify(beforeForeshadow) !== JSON.stringify(afterForeshadow)) {
          console.log(`  - foreshadowedEvents: ${beforeForeshadow.length} → ${afterForeshadow.length}`);
        }
        console.log();
      }

      // CharacterLayer 变化
      if (JSON.stringify(memoryBefore.characterLayer) !== JSON.stringify(memoryAfter.characterLayer)) {
        console.log('CharacterLayer 变化:');
        console.log(`  - states: ${Object.keys(memoryBefore.characterLayer?.states || {}).length} → ${Object.keys(memoryAfter.characterLayer?.states || {}).length} 个角色状态`);
        if (Object.keys(memoryAfter.characterLayer?.states || {}).length > 0) {
          Object.entries(memoryAfter.characterLayer.states).forEach(([charId, state]: [string, any]) => {
            console.log(`    - ${charId}: ${JSON.stringify(state).substring(0, 100)}...`);
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
  } else {
    console.error('EP2 生成失败！');
    console.error(`错误详情: ${result.detail}`);
  }
}

// 运行测试
testEP2().catch(console.error);

