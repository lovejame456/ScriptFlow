/**
 * 调试 Bible 生成失败的测试脚本
 */

import { createProjectSeed, buildBible } from './lib/ai/episodeFlow';
import { projectRepo } from './lib/store/projectRepo';

async function debugBibleGeneration() {
  console.log('=== 开始调试 Bible 生成 ===\n');

  try {
    // 1. 创建一个测试项目
    console.log('步骤 1: 创建测试项目 seed...');
    const seed = await createProjectSeed(
      '一个现代修仙故事，主角从零开始修炼',
      '仙侠'
    );
    console.log('Seed 生成成功:', JSON.stringify(seed, null, 2));

    // 2. 生成 Bible
    console.log('\n步骤 2: 生成 Bible...');
    const project = {
      id: 'test-debug',
      name: seed.title || '测试项目',
      genre: seed.genre || '仙侠',
      seed: seed,
      totalEpisodes: 10,
      episodes: []
    };

    const result = await buildBible(project);
    console.log('\nBible 生成成功!');
    console.log('Bible keys:', Object.keys(result.bible));
    console.log('角色数量:', result.characters?.length || 0);

    if (result.bible.canonRules) {
      console.log('世界观设定:', result.bible.canonRules.worldSetting);
      console.log('核心规则:', result.bible.canonRules.coreRules);
    }

  } catch (error: any) {
    console.error('\n=== 错误发生 ===');
    console.error('错误类型:', error.name);
    console.error('错误消息:', error.message);
    console.error('错误堆栈:', error.stack);
  }
}

// 运行调试脚本
debugBibleGeneration().catch(console.error);



