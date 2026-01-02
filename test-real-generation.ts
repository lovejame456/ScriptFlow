// P1 使用期自治优化第二轮 - 真实 DeepSeek 生成测试

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 先加载环境变量（必须在任何导入之前）
dotenv.config({ path: join(__dirname, '.env') });

console.log('[P1 第二轮] 真实 DeepSeek 生成测试启动');
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

async function runRealGenerationTest() {
  console.log('\n========================================');
  console.log('P1 第二轮真实生成测试');
  console.log('========================================\n');

  // 检查现有项目
  let projects = await api.project.getAll();
  console.log(`找到 ${projects.length} 个现有项目`);

  let project;
  if (projects.length === 0) {
    console.log('\n创建新项目...');
    const testPrompt = '现代都市甜宠剧，霸道总裁追妻记';
    project = await api.project.seed(testPrompt);
    console.log(`✓ 项目创建成功: ${project.name} (ID: ${project.id})\n`);
  } else {
    project = projects[0];
    console.log(`使用现有项目: ${project.name} (ID: ${project.id})\n`);
  }

  // 生成 Bible
  console.log('========================================');
  console.log('步骤 1: 生成 Bible');
  console.log('========================================');
  try {
    await api.project.generateBible(project.id);
    console.log('✓ Bible 生成成功\n');
  } catch (e: any) {
    console.log(`⚠ Bible 生成失败: ${e.message}`);
    console.log('尝试重试...\n');
    await api.project.generateBible(project.id);
    console.log('✓ Bible 生成成功（重试后）\n');
  }

  // 生成 Outline
  console.log('========================================');
  console.log('步骤 2: 生成 Outline');
  console.log('========================================');
  try {
    await api.project.generateOutline(project.id);
    console.log('✓ Outline 生成成功\n');
  } catch (e: any) {
    console.log(`⚠ Outline 生成失败: ${e.message}`);
    console.log('尝试重试...\n');
    await api.project.generateOutline(project.id);
    console.log('✓ Outline 生成成功（重试后）\n');
  }

  // 更新项目引用
  project = await projectRepo.get(project.id);
  console.log(`项目总集数: ${project.totalEpisodes}`);
  console.log(`重点集: ${project.episodes.filter((e: any) => e.importance === 'KEY').map((e: any) => `EP${e.id}`).join(', ')}`);

  // 生成前 3 集测试
  console.log('\n========================================');
  console.log('步骤 3: 生成前 3 集（测试真实 DeepSeek 行为）');
  console.log('========================================\n');

  const totalToGenerate = 3;
  for (let i = 1; i <= totalToGenerate; i++) {
    console.log(`\n----- 生成 EP${i} -----`);

    try {
      const result = await api.episode.generate(project.id, i);
      console.log(`✓ EP${i} 生成成功`);
      console.log(`  success: ${result.success}`);

      if (result.success) {
        // 获取最新项目数据
        const updatedProject = await projectRepo.get(project.id);
        const episode = updatedProject.episodes[i - 1];

        if (episode) {
          console.log(`  标题: ${episode.title}`);
          console.log(`  状态: ${episode.status}`);
          console.log(`  Hook: ${episode.outline?.hook || '(无)'}`);
          console.log(`  内容长度: ${episode.content?.length || 0} 字符`);
        }

        if (result.alignerResult) {
          console.log(`  Aligner: ${result.alignerResult.severity}`);
          if (result.alignerResult.issues.length > 0) {
            console.log(`  问题:`);
            result.alignerResult.issues.forEach((issue: any) => {
              console.log(`    - ${issue.code}: ${issue.message}`);
            });
          }
        }
      } else {
        console.log(`✗ EP${i} 生成失败`);
        if (result.error) {
          console.log(`  错误: ${result.error}`);
        }
      }
    } catch (e: any) {
      console.log(`✗ EP${i} 生成异常: ${e.message}`);
    }
  }

  console.log('\n========================================');
  console.log('测试完成');
  console.log('========================================\n');

  // 最终项目状态
  const finalProject = await projectRepo.get(project.id);
  console.log(`\n最终状态:`);
  console.log(`- 已完成集数: ${finalProject.episodes.filter((e: any) => e.status === 'COMPLETED').length}`);
  console.log(`- 失败集数: ${finalProject.episodes.filter((e: any) => e.status === 'FAILED').length}`);

  console.log('\n[P1 第二轮] 测试结束');
}

runRealGenerationTest().catch(console.error);
