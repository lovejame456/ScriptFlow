#!/usr/bin/env npx tsx
/**
 * S1 Sprint - EP2-EP10内容质量拉升
 * 
 * 目标: 通过"加重代价"指令重新生成EP2-EP10,提升reveal的具体性和后果性
 * 验收标准:
 * - revealHasConsequence ≥ 70%
 * - revealIsConcrete ≥ 60%
 * - DEGRADED ≤ 3
 */

import { projectRepo } from '../lib/store/projectRepo';
import { api } from '../api';

const PROJECT_ID = 'proj_1767467017516_eijt9';
const INSTRUCTION_ID = 'increase-cost'; // "加重代价"指令
const EPISODES_TO_REGENERATE = [2, 3, 4, 5, 6, 7, 8, 9, 10];

interface EpisodeMetrics {
  episode: number;
  revealIsConcrete: boolean;
  revealHasConsequence: boolean;
  status: string;
  contentPreview: string;
}

/**
 * 应用"加重代价"指令重新生成单集
 */
async function regenerateEpisodeWithCostIncrease(projectId: string, episodeIndex: number): Promise<void> {
  console.log(`\n[${new Date().toLocaleTimeString()}] 开始处理 EP${episodeIndex}...`);
  
  try {
    // 应用指令重新生成
    await api.guidance.applyInstruction(projectId, episodeIndex, INSTRUCTION_ID);
    console.log(`✓ EP${episodeIndex} 重新生成完成`);
    
    // 等待一小段时间确保数据保存
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (error: any) {
    console.error(`✗ EP${episodeIndex} 重新生成失败:`, error.message);
    throw error;
  }
}

/**
 * 提取剧集内容预览
 */
function getContentPreview(content: string, maxLength: number = 200): string {
  if (!content) return '(无内容)';
  return content.length > maxLength ? content.substring(0, maxLength) + '...' : content;
}

/**
 * 验收单集: 检查是否满足"具体+有代价+状态改变"
 */
function verifyEpisode(project: any, episodeIndex: number): EpisodeMetrics {
  const episode = project.episodes[episodeIndex - 1];
  if (!episode) {
    throw new Error(`EP${episodeIndex} 不存在`);
  }

  // 从metrics报告中提取数据(如果有)
  const contentPreview = getContentPreview(episode.content);
  
  console.log(`\n--- EP${episodeIndex} 验收 ---`);
  console.log(`状态: ${episode.status}`);
  console.log(`内容预览: ${contentPreview}`);
  
  return {
    episode: episodeIndex,
    revealIsConcrete: episode.validation?.postSignals?.revealIsConcrete ?? false,
    revealHasConsequence: episode.validation?.postSignals?.revealHasConsequence ?? false,
    status: episode.status,
    contentPreview
  };
}

/**
 * 生成验收总结
 */
function generateSummary(results: EpisodeMetrics[]): void {
  console.log('\n========================================');
  console.log('S1 Sprint 执行总结');
  console.log('========================================\n');
  
  const total = results.length;
  const concreteCount = results.filter(r => r.revealIsConcrete).length;
  const consequenceCount = results.filter(r => r.revealHasConsequence).length;
  const degradedCount = results.filter(r => r.status === 'DEGRADED').length;
  
  console.log(`处理剧集总数: ${total}`);
  console.log(`revealIsConcrete: ${concreteCount}/${total} (${Math.round(concreteCount/total*100)}%)`);
  console.log(`revealHasConsequence: ${consequenceCount}/${total} (${Math.round(consequenceCount/total*100)}%)`);
  console.log(`DEGRADED: ${degradedCount}\n`);
  
  // 检查验收标准
  const concretePass = (concreteCount / total) >= 0.60;
  const consequencePass = (consequenceCount / total) >= 0.70;
  const degradedPass = degradedCount <= 3;
  
  console.log('验收结果:');
  console.log(`  revealIsConcrete ≥ 60%: ${concretePass ? '✓ 通过' : '✗ 未通过'}`);
  console.log(`  revealHasConsequence ≥ 70%: ${consequencePass ? '✓ 通过' : '✗ 未通过'}`);
  console.log(`  DEGRADED ≤ 3: ${degradedPass ? '✓ 通过' : '✗ 未通过'}`);
  
  const allPassed = concretePass && consequencePass && degradedPass;
  console.log(`\n总体: ${allPassed ? '✓✓✓ S1 Sprint 成功!' : '✗✗✗ 部分达标,需要进一步优化'}`);
  console.log('========================================\n');
}

/**
 * 主执行流程
 */
async function main() {
  console.log('========================================');
  console.log('S1 Sprint · 内容质量拉升');
  console.log('========================================');
  console.log(`项目ID: ${PROJECT_ID}`);
  console.log(`目标集数: EP${EPISODES_TO_REGENERATE[0]}-EP${EPISODES_TO_REGENERATE[EPISODES_TO_REGENERATE.length - 1]}`);
  console.log(`指令: 加重代价 (${INSTRUCTION_ID})`);
  console.log('========================================\n');
  
  try {
    // 加载项目
    const project = await projectRepo.get(PROJECT_ID);
    if (!project) {
      throw new Error(`项目 ${PROJECT_ID} 不存在`);
    }
    
    console.log(`✓ 已加载项目: ${project.name}`);
    console.log(`  总集数: ${project.totalEpisodes}`);
    console.log(`  已完成: ${project.episodes.filter((e: any) => e.status === 'COMPLETED').length}/${project.totalEpisodes}\n`);
    
    // 逐集执行
    const results: EpisodeMetrics[] = [];
    
    for (let i = 0; i < EPISODES_TO_REGENERATE.length; i++) {
      const episodeIndex = EPISODES_TO_REGENERATE[i];
      
      try {
        // 重新生成
        await regenerateEpisodeWithCostIncrease(PROJECT_ID, episodeIndex);
        
        // 重新加载项目获取最新状态
        const updatedProject = await projectRepo.get(PROJECT_ID);
        if (!updatedProject) {
          throw new Error(`无法重新加载项目 ${PROJECT_ID}`);
        }
        
        // 验收
        const metrics = verifyEpisode(updatedProject, episodeIndex);
        results.push(metrics);
        
        // 提示手动验收
        console.log(`\n📝 请手动验收 EP${episodeIndex}:`);
        console.log(`   - 是否有明确损失/风险/付出?`);
        console.log(`   - 主角或关键角色的状态是否变化?`);
        console.log(`   - 这一集结尾是否"更难了"?`);
        console.log(`   按回车键继续下一集...`);
        
        // 等待用户确认
        // await new Promise(resolve => {
        //   process.stdin.once('data', resolve);
        // });
        
      } catch (error: any) {
        console.error(`处理 EP${episodeIndex} 时出错:`, error.message);
        results.push({
          episode: episodeIndex,
          revealIsConcrete: false,
          revealHasConsequence: false,
          status: 'ERROR',
          contentPreview: error.message
        });
      }
    }
    
    // 生成总结
    generateSummary(results);
    
  } catch (error: any) {
    console.error('\n❌ 执行失败:', error.message);
    process.exit(1);
  }
}

// 执行
main();

