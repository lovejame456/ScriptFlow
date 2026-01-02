/**
 * 旧 DRAFT 剧集迁移脚本
 *
 * 功能：
 * 1. 扫描所有项目
 * 2. 筛选条件：episodeIndex === 1 && status === DRAFT && content.length >= 400
 * 3. 标记 metadata.needsEnhance = true
 * 4. 更新 humanSummary 为「可进行后台增强」
 * 5. 输出迁移统计报告
 *
 * 使用方法：
 * ts-node scripts/migrateDraftEpisodes.ts
 */

import { projectRepo } from '../lib/store/projectRepo';
import { episodeRepo } from '../lib/store/episodeRepo';
import { EpisodeStatus } from '../types';

interface MigrationStats {
  totalProjects: number;
  processedEpisodes: number;
  skippedEpisodes: number;
  errors: string[];
}

async function migrateDraftEpisodes(): Promise<MigrationStats> {
  console.log('========================================');
  console.log('开始迁移旧 DRAFT 剧集...');
  console.log('========================================\n');

  const stats: MigrationStats = {
    totalProjects: 0,
    processedEpisodes: 0,
    skippedEpisodes: 0,
    errors: []
  };

  try {
    // 获取所有项目
    const allProjects = await projectRepo.getAll();
    stats.totalProjects = allProjects.length;

    console.log(`找到 ${allProjects.length} 个项目\n`);

    // 遍历所有项目
    for (const project of allProjects) {
      console.log(`处理项目：${project.name} (ID: ${project.id})`);

      if (!project.episodes || project.episodes.length === 0) {
        console.log(`  ⏭️  跳过：没有剧集\n`);
        continue;
      }

      // 查找 EP1
      const episode1 = project.episodes.find(e => e.episodeIndex === 1);

      if (!episode1) {
        console.log(`  ⏭️  跳过：没有 EP1\n`);
        continue;
      }

      // 检查条件
      const isDraft = episode1.status === EpisodeStatus.DRAFT;
      const hasContent = episode1.content && episode1.content.length >= 400;
      const alreadyEnhanced = episode1.metadata?.enhanced === true;

      console.log(`  当前状态：${episode1.status}`);
      console.log(`  内容长度：${episode1.content?.length || 0} 字`);
      console.log(`  已增强：${alreadyEnhanced ? '是' : '否'}`);

      // 跳过条件
      if (!isDraft) {
        console.log(`  ⏭️  跳过：状态不是 DRAFT\n`);
        stats.skippedEpisodes++;
        continue;
      }

      if (!hasContent) {
        console.log(`  ⏭️  跳过：内容长度不足 400 字\n`);
        stats.skippedEpisodes++;
        continue;
      }

      if (alreadyEnhanced) {
        console.log(`  ⏭️  跳过：已经增强完成\n`);
        stats.skippedEpisodes++;
        continue;
      }

      // 执行迁移
      try {
        await episodeRepo.save(project.id, 1, {
          metadata: {
            phase: 1,
            needsEnhance: true,
            enhanced: false
          },
          humanSummary: '可进行后台增强'
        });

        console.log(`  ✅ 成功：标记为需要增强\n`);
        stats.processedEpisodes++;
      } catch (error: any) {
        const errorMsg = `项目 ${project.name} EP1 迁移失败：${error.message || String(error)}`;
        console.error(`  ❌ 错误：${errorMsg}\n`);
        stats.errors.push(errorMsg);
      }
    }

    // 输出统计报告
    console.log('========================================');
    console.log('迁移完成！统计报告');
    console.log('========================================\n');
    console.log(`总项目数：${stats.totalProjects}`);
    console.log(`处理成功：${stats.processedEpisodes} 个剧集`);
    console.log(`跳过数量：${stats.skippedEpisodes} 个剧集`);
    console.log(`错误数量：${stats.errors.length} 个错误`);

    if (stats.errors.length > 0) {
      console.log('\n错误详情：');
      stats.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }

    console.log('\n提示：');
    if (stats.processedEpisodes > 0) {
      console.log('  - 已标记的剧集将自动进入后台增强队列');
      console.log('  - 后台增强任务会自动执行（最多并发 3 个）');
      console.log('  - 可以在剧集详情页面查看增强进度');
    } else {
      console.log('  - 没有需要迁移的剧集');
      console.log('  - 所有 EP1 DRAFT 剧集要么内容不足，要么已增强');
    }

    console.log('\n========================================');

  } catch (error: any) {
    console.error('迁移脚本执行失败：', error);
    throw error;
  }

  return stats;
}

// 执行迁移
migrateDraftEpisodes()
  .then(stats => {
    if (stats.errors.length > 0) {
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('脚本异常退出：', error);
    process.exit(1);
  });


