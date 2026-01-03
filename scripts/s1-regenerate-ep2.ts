#!/usr/bin/env npx tsx
/**
 * S1 Sprint - EP2 重新生成(加重代价)
 */

import { projectRepo } from '../lib/store/projectRepo';
import { api } from '../api';

const PROJECT_ID = 'proj_1767467017516_eijt9';
const EPISODE_INDEX = 2;
const INSTRUCTION_ID = 'increase-cost'; // "加重代价"指令

async function main() {
  console.log('========================================');
  console.log(`S1 Sprint - EP${EPISODE_INDEX} 重新生成`);
  console.log('========================================');
  console.log(`项目ID: ${PROJECT_ID}`);
  console.log(`指令: 加重代价 (${INSTRUCTION_ID})\n`);
  
  try {
    // 加载项目
    const project = await projectRepo.get(PROJECT_ID);
    if (!project) {
      throw new Error(`项目 ${PROJECT_ID} 不存在`);
    }
    
    const episode = project.episodes[EPISODE_INDEX - 1];
    console.log(`✓ 已加载项目: ${project.name}`);
    console.log(`EP${EPISODE_INDEX} 当前状态: ${episode.status}`);
    console.log(`内容长度: ${episode.content?.length || 0} 字符\n`);
    
    if (episode.content && episode.content.length > 0) {
      console.log(`当前内容预览:`);
      console.log(episode.content.substring(0, 300) + '...\n');
    }
    
    // 应用"加重代价"指令重新生成
    console.log(`[开始] 应用"加重代价"指令重新生成 EP${EPISODE_INDEX}...`);
    const result = await api.guidance.applyInstruction(PROJECT_ID, EPISODE_INDEX, INSTRUCTION_ID);
    console.log(`✓ 完成! EP${EPISODE_INDEX} 已重新生成\n`);
    
    // 重新加载项目获取最新状态
    const updatedProject = await projectRepo.get(PROJECT_ID);
    if (!updatedProject) {
      throw new Error(`无法重新加载项目 ${PROJECT_ID}`);
    }
    
    const updatedEpisode = updatedProject.episodes[EPISODE_INDEX - 1];
    console.log(`EP${EPISODE_INDEX} 新状态: ${updatedEpisode.status}`);
    console.log(`新内容长度: ${updatedEpisode.content?.length || 0} 字符\n`);
    
    if (updatedEpisode.content && updatedEpisode.content.length > 0) {
      console.log(`新内容预览:`);
      console.log(updatedEpisode.content.substring(0, 500) + '...\n');
    }
    
    // 提示手动验收
    console.log('========================================');
    console.log('📝 手动验收清单:');
    console.log('========================================');
    console.log(`1. 是否有明确的损失/风险/付出?`);
    console.log(`2. 主角或关键角色的状态是否变化?`);
    console.log(`3. 这一集结尾是否"更难了"而不是"更顺了"?`);
    console.log(`4. 能否用一句话说清:"这一集他失去了什么/背上了什么"?\n`);
    
    if (updatedEpisode.validation?.postSignals) {
      console.log('Metrics检测结果:');
      console.log(`  revealIsConcrete: ${updatedEpisode.validation.postSignals.revealIsConcrete}`);
      console.log(`  revealHasConsequence: ${updatedEpisode.validation.postSignals.revealHasConsequence}\n`);
    }
    
    console.log('========================================');
    console.log(`✓ EP${EPISODE_INDEX} 重新生成完成!`);
    console.log('========================================\n');
    
  } catch (error: any) {
    console.error('\n❌ 执行失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

