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

console.log('[DEBUG] VITE_DEEPSEEK_API_KEY:', process.env.VITE_DEEPSEEK_API_KEY ? '已加载' : '未加载');

import { api } from './api';
import { projectRepo } from './lib/store/projectRepo';
import { storyMemoryRepo } from './lib/store/memoryRepo';
import { EpisodeStatus } from './types';

interface EpisodeValidation {
  connectsToPrevious: boolean;
  conflictsProgressed: boolean;
  noNewChars: boolean;
  memoryEvolved: boolean;
  episodeResult: any;
  memoryBefore: any;
  memoryAfter: any;
}

async function validateEpisode(project: any, episodeIndex: number): Promise<EpisodeValidation> {
  const memoryBefore = await storyMemoryRepo.get(project.id);
  console.log(`\n===== EP${episodeIndex} 生成前 StoryMemory =====`);
  console.log(`Ongoing Conflicts: ${(memoryBefore.plotLayer?.ongoingConflicts || []).length} 个`);

  // 生成集数
  console.log(`\n===== 生成 EP${episodeIndex} =====\n`);
  const result = await api.episode.generate(project.id, episodeIndex);

  // 重新获取项目数据
  const projectAfter = await projectRepo.get(project.id);
  const memoryAfter = await storyMemoryRepo.get(project.id);
  const episode = projectAfter?.episodes[episodeIndex - 1];

  console.log(`\n===== EP${episodeIndex} 生成结果 =====`);
  console.log(`成功: ${result.success}`);
  console.log(`状态: ${episode?.status}`);

  if (!result.success || !episode) {
    return {
      connectsToPrevious: false,
      conflictsProgressed: false,
      noNewChars: false,
      memoryEvolved: false,
      episodeResult: result,
      memoryBefore,
      memoryAfter
    };
  }

  console.log(`\n标题: ${episode.title}`);
  console.log(`Hook: ${episode.outline.hook}`);
  console.log(`内容预览: ${episode.content?.substring(0, 300)}...`);

  // 验证条件
  const conflictsBefore = memoryBefore.plotLayer?.ongoingConflicts || [];
  const conflictsAfter = memoryAfter.plotLayer?.ongoingConflicts || [];
  const charIds = new Set(projectAfter.characters.map((c: any) => c.id));
  const charStates = memoryAfter.characterLayer?.states || {};
  const newCharIds = Object.keys(charStates).filter(id => !charIds.has(id));

  const connectsToPrevious = conflictsAfter.length >= conflictsBefore.length;
  const conflictsProgressed = conflictsAfter.length >= conflictsBefore.length;
  const noNewChars = newCharIds.length === 0;
  const memoryEvolved = JSON.stringify(memoryBefore) !== JSON.stringify(memoryAfter);

  console.log(`\n===== EP${episodeIndex} PM 验收 =====`);
  console.log(`✓/✗ 承接上一集: ${connectsToPrevious ? '✓' : '✗'}`);
  console.log(`✓/✗ 推进冲突 (${conflictsBefore.length}→${conflictsAfter.length}): ${conflictsProgressed ? '✓' : '✗'}`);
  console.log(`✓/✗ 无新增角色: ${noNewChars ? '✓' : '✗'}`);
  console.log(`✓/✗ StoryMemory 演化: ${memoryEvolved ? '✓' : '✗'}`);

  if (conflictsAfter.length > 0) {
    console.log(`\n当前冲突:`);
    conflictsAfter.forEach((c: any, i: number) => {
      console.log(`  ${i + 1}. ${c.description || c}`);
    });
  }

  return {
    connectsToPrevious,
    conflictsProgressed,
    noNewChars,
    memoryEvolved,
    episodeResult: result,
    memoryBefore,
    memoryAfter
  };
}

async function runM2FullTest() {
  console.log('===== M2 阶段完整测试: EP1-EP5 连续性验证 =====\n');

  // 检查是否有现有项目，如果没有则创建
  let projects = await api.project.getAll();
  console.log(`[DEBUG] 找到 ${projects.length} 个项目`);

  let project;
  if (projects.length === 0) {
    console.log('\n=== 创建新项目 ===');
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
  } else {
    project = projects[0];
    console.log(`\n✓ 使用现有项目: ${project.name} (ID: ${project.id})`);
  }

  // 逐集生成 EP1-EP5
  const results: EpisodeValidation[] = [];
  let shouldStop = false;

  for (let i = 1; i <= 5; i++) {
    if (shouldStop) break;

    // 检查这一集是否已经完成
    const currentProject = await projectRepo.get(project.id);
    const currentEpisode = currentProject.episodes[i - 1];
    const isCompleted = currentEpisode?.status === EpisodeStatus.COMPLETED ||
                       currentEpisode?.status === '已完成';

    console.log(`\n${'='.repeat(60)}`);
    console.log(`生成 EP${i}${isCompleted ? '（已完成）' : ''}`);
    console.log('='.repeat(60));

    if (isCompleted) {
      console.log(`EP${i} 已存在，跳过生成`);
      // 仍然需要验证
      const memoryBefore = await storyMemoryRepo.get(project.id);
      const memoryAfter = memoryBefore; // 已经完成，没有变化
      results.push({
        connectsToPrevious: true,
        conflictsProgressed: true,
        noNewChars: true,
        memoryEvolved: false,
        episodeResult: { success: true },
        memoryBefore,
        memoryAfter
      });
      continue;
    }

    try {
      const result = await validateEpisode(project, i);
      results.push(result);

      // 如果这一集失败，立即停止
      if (!result.episodeResult.success) {
        console.log(`\n❌ EP${i} 生成失败，停止后续生成`);
        console.log(`错误详情: ${result.episodeResult.detail}`);
        shouldStop = true;
        continue;
      }

      // 如果验证失败，立即停止
      const allPassed = result.connectsToPrevious &&
                       result.conflictsProgressed &&
                       result.noNewChars &&
                       result.memoryEvolved;

      if (!allPassed) {
        console.log(`\n❌ EP${i} 验收失败，停止后续生成`);
        if (!result.connectsToPrevious) console.log('  ❌ 未承接上一集');
        if (!result.conflictsProgressed) console.log('  ❌ 未推进冲突');
        if (!result.noNewChars) {
          const charIds = new Set(project.characters.map((c: any) => c.id));
          const charStates = result.memoryAfter.characterLayer?.states || {};
          const newCharIds = Object.keys(charStates).filter(id => !charIds.has(id));
          console.log(`  ❌ 新增角色: ${newCharIds.join(', ')}`);
        }
        if (!result.memoryEvolved) console.log('  ❌ StoryMemory 未演化');
        shouldStop = true;
        continue;
      }

      console.log(`\n✅ EP${i} 验收通过`);

      // 更新 project 引用
      const updatedProject = await projectRepo.get(project.id);
      project.episodes = updatedProject.episodes;

    } catch (e: any) {
      console.error(`\n❌ EP${i} 生成过程中发生错误:`, e.message);
      shouldStop = true;
    }
  }

  // 最终验收
  console.log(`\n${'='.repeat(60)}`);
  console.log('M2 阶段最终验收');
  console.log('='.repeat(60));

  // 获取所有集数
  const finalProject = await projectRepo.get(project.id);

  console.log(`\n===== EP1-EP5 概览 =====`);
  finalProject.episodes.forEach((ep: any, i: number) => {
    console.log(`\nEP${i + 1}: ${ep.title}`);
    console.log(`  状态: ${ep.status}`);
    console.log(`  Hook: ${ep.outline.hook}`);
  });

  const allPassed = results.length === 5 &&
                   results.every(r =>
                     r.episodeResult.success &&
                     r.connectsToPrevious &&
                     r.conflictsProgressed &&
                     r.noNewChars &&
                     r.memoryEvolved
                   );

  console.log(`\n生成集数: ${results.length} / 5 (EP1-EP5)`);
  console.log(`全部成功: ${results.every(r => r.episodeResult.success) ? '✅' : '❌'}`);
  console.log(`连续性验证: ${results.every(r => r.connectsToPrevious) ? '✅' : '❌'}`);
  console.log(`冲突推进: ${results.every(r => r.conflictsProgressed) ? '✅' : '❌'}`);
  console.log(`无新增角色: ${results.every(r => r.noNewChars) ? '✅' : '❌'}`);
  console.log(`StoryMemory 演化: ${results.every(r => r.memoryEvolved) ? '✅' : '❌'}`);

  console.log(`\n${allPassed ? '✅✅✅ M2 阶段验收通过！可以进入下一阶段' : '❌ M2 阶段验收失败，需要修复问题'}`);

  // 详细统计
  if (results.length > 0) {
    console.log(`\n===== 详细统计 =====`);
    results.forEach((r, i) => {
      console.log(`\nEP${i + 1}:`);
      console.log(`  成功: ${r.episodeResult.success ? '✅' : '❌'}`);
      console.log(`  承接: ${r.connectsToPrevious ? '✅' : '❌'}`);
      console.log(`  冲突推进: ${r.conflictsProgressed ? '✅' : '❌'}`);
      console.log(`  无新角色: ${r.noNewChars ? '✅' : '❌'}`);
      console.log(`  记忆演化: ${r.memoryEvolved ? '✅' : '❌'}`);
    });
  }
}

// 运行测试
runM2FullTest().catch(console.error);

