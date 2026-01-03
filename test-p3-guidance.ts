/**
 * P3: Quality Guidance & Creative Collaboration - End-to-End Test
 * 
 * 测试目标：
 * 1. P3.1 失败模式聚类 - 自动识别并归类 DEGRADED 原因
 * 2. P3.2 微调指令注入 - 用户选择预设指令，系统转成结构约束
 * 3. P3.3 创作方向建议 - 基于降级密度提供集数调整建议
 */

import { projectRepo } from './lib/store/projectRepo';
import { analyzeProjectFailures } from './lib/guidance/failureCluster';
import { applyUserInstruction, getPresetInstructions } from './lib/guidance/instructionMapper';
import { generateEpisodeAdvice, shouldGenerateAdviceRealtime } from './lib/guidance/creativeAdvisor';
import { api } from './api';

// 模拟 localStorage 以支持测试环境
const mockLocalStorage = new Map<string, string>();
if (typeof localStorage === 'undefined') {
  (global as any).localStorage = {
    getItem: (key: string) => mockLocalStorage.get(key) || null,
    setItem: (key: string, value: string) => mockLocalStorage.set(key, value),
    removeItem: (key: string) => mockLocalStorage.delete(key),
    clear: () => mockLocalStorage.clear()
  };
}

// 测试配置
const TEST_PROJECT_ID = 'test-p3-project';

/**
 * P3.1 测试：失败模式聚类
 */
async function testP3_1_FailureClustering() {
  console.log('\n=== P3.1: 失败模式聚类测试 ===\n');

  try {
    // 1. 创建测试项目
    console.log('1. 创建测试项目...');
    const seed = await api.project.seed('复仇爽文测试项目', {
      genre: '复仇',
      totalEpisodes: 80
    });
    console.log(`✓ 项目创建成功: ${seed.id}`);

    // 2. 模拟失败数据（localStorage）
    console.log('\n2. 模拟失败数据...');
    const mockFailureLogs = [
      {
        projectId: seed.id,
        episodeIndex: 5,
        attempt: 1,
        error: 'Reveal 模糊',
        alignerResult: {
          severity: 'FAIL',
          issues: [
            { code: 'NO_HIGHLIGHT', message: '无明显爽点' },
            { code: 'WEAK_HOOK', message: 'Hook 过弱' }
          ],
          editorNotes: []
        },
        timestamp: Date.now()
      },
      {
        projectId: seed.id,
        episodeIndex: 15,
        attempt: 1,
        error: '动机不足',
        alignerResult: {
          severity: 'FAIL',
          issues: [
            { code: 'GENRE_MISMATCH', message: '不符合复仇题材' },
            { code: 'NO_REQUIRED_PLEASURE', message: '缺少必须爽点' }
          ],
          editorNotes: []
        },
        timestamp: Date.now()
      },
      {
        projectId: seed.id,
        episodeIndex: 25,
        attempt: 1,
        error: '冲突未推进',
        alignerResult: {
          severity: 'FAIL',
          issues: [
            { code: 'NO_PLOT_PROGRESS', message: '剧情原地踏步' },
            { code: 'PACING_SLOW', message: '节奏拖慢' }
          ],
          editorNotes: []
        },
        timestamp: Date.now()
      }
    ];

    // 保存到 localStorage
    localStorage.setItem(
      `scriptflow_attempts_${seed.id}`,
      JSON.stringify(mockFailureLogs)
    );
    console.log(`✓ 模拟了 ${mockFailureLogs.length} 条失败记录`);

    // 3. 保存项目到 repo
    await projectRepo.save(seed.id, {
      totalEpisodes: 80  // 确保与模拟数据一致
    } as any);
    
    // 手动设置剧集数据（避免依赖自动创建逻辑）
    const project = await projectRepo.get(seed.id);
    if (project) {
      project.episodes = [
        { id: 5, episodeIndex: 5, status: 'DEGRADED', title: '第 5 集', outline: {} as any, content: '', validation: {} as any },
        { id: 15, episodeIndex: 15, status: 'DEGRADED', title: '第 15 集', outline: {} as any, content: '', validation: {} as any },
        { id: 25, episodeIndex: 25, status: 'DEGRADED', title: '第 25 集', outline: {} as any, content: '', validation: {} as any }
      ];
      await projectRepo.save(seed.id, project as any);
    }

    // 4. 运行失败聚类分析
    console.log('\n3. 运行失败聚类分析...');
    const analysis = await analyzeProjectFailures(seed.id);
    
    // 5. 验证结果
    console.log('\n4. 验证分析结果:');
    console.log(`   - 总集数: ${analysis.totalEpisodes}`);
    console.log(`   - 降级集数: ${analysis.degradedEpisodes}`);
    console.log(`   - 降级密度: ${Math.round((analysis.degradedEpisodes / analysis.totalEpisodes) * 100)}%`);
    console.log(`   - 主要失败模式: ${analysis.primaryMode}`);
    console.log(`   - 人类总结: ${analysis.humanSummary}`);
    console.log(`\n   聚类统计:`);
    console.log(`   - REVEAL_VAGUE: ${analysis.clusters.revealVague}`);
    console.log(`   - MOTIVATION_WEAK: ${analysis.clusters.motivationWeak}`);
    console.log(`   - CONFLICT_STALLED: ${analysis.clusters.conflictStalled}`);
    console.log(`   - UNKNOWN: ${analysis.clusters.unknown}`);
    console.log(`\n   具体建议:`);
    analysis.recommendations.forEach((rec, idx) => {
      console.log(`   ${idx + 1}. ${rec}`);
    });

    // 6. 验证存储
    console.log('\n5. 验证存储...');
    const savedAnalysis = await projectRepo.getFailureAnalysis(seed.id);
    if (!savedAnalysis) {
      throw new Error('失败分析未保存');
    }
    console.log('✓ 失败分析已正确保存');

    console.log('\n✅ P3.1 测试通过');
    return true;
  } catch (error: any) {
    console.error('\n❌ P3.1 测试失败:', error.message);
    return false;
  }
}

/**
 * P3.2 测试：微调指令注入
 */
async function testP3_2_InstructionMapper() {
  console.log('\n=== P3.2: 微调指令注入测试 ===\n');

  try {
    // 1. 获取预设指令
    console.log('1. 获取预设指令...');
    const presets = getPresetInstructions();
    console.log(`✓ 找到 ${presets.length} 个预设指令:`);
    presets.forEach(p => {
      console.log(`   - ${p.label}: ${p.description}`);
    });

    // 2. 创建模拟结构契约
    console.log('\n2. 创建模拟结构契约...');
    const mockContract = {
      episode: 1,
      mustHave: {
        newReveal: {
          required: false,
          summary: '揭示主角身份',
          pressureHint: ''
        },
        conflictProgress: {
          required: true,
          summary: '推进主线冲突',
          pressureMultiplier: 1.0
        },
        costPaid: {
          required: false,
          summary: '付出代价',
          pressureHint: ''
        }
      }
    } as any;
    console.log('✓ 原始契约创建成功');

    // 3. 测试每个指令
    console.log('\n3. 测试指令应用:');
    for (const preset of presets) {
      console.log(`\n   测试指令: ${preset.label}`);
      
      const modifiedContract = applyUserInstruction(mockContract, preset.id);
      
      // 验证修改
      if (preset.id === 'strengthen-antagonist') {
        if (modifiedContract.mustHave.conflictProgress.pressureMultiplier === mockContract.mustHave.conflictProgress.pressureMultiplier * 1.2) {
          console.log(`   ✓ 压力倍数正确增加到 1.2 倍`);
        } else {
          throw new Error('强化反派指令未正确应用');
        }
      } else if (preset.id === 'reveal-early') {
        if (modifiedContract.mustHave.newReveal.required === true && modifiedContract.mustHave.newReveal.priority === 'critical') {
          console.log(`   ✓ Reveal 要求正确设置为强制且关键`);
        } else {
          throw new Error('提前揭示真相指令未正确应用');
        }
      } else if (preset.id === 'increase-cost') {
        if (modifiedContract.mustHave.costPaid.required === true && modifiedContract.mustHave.costPaid.costLevel === 'high') {
          console.log(`   ✓ 代价要求正确设置为强制且高等级`);
        } else {
          throw new Error('加重代价指令未正确应用');
        }
      }
    }

    console.log('\n✅ P3.2 测试通过');
    return true;
  } catch (error: any) {
    console.error('\n❌ P3.2 测试失败:', error.message);
    return false;
  }
}

/**
 * P3.3 测试：创作方向建议
 */
async function testP3_3_CreativeAdvisor() {
  console.log('\n=== P3.3: 创作方向建议测试 ===\n');

  try {
    // 1. 创建测试项目
    console.log('1. 创建测试项目...');
    const seed = await api.project.seed('甜宠爽文测试项目', {
      genre: '甜宠',
      totalEpisodes: 80
    });
    console.log(`✓ 项目创建成功: ${seed.id}`);

    // 2. 设置高降级密度（模拟失败）
    console.log('\n2. 模拟高降级密度...');
    const mockFailureAnalysis = {
      projectId: seed.id,
      totalEpisodes: 80,
      degradedEpisodes: 35,  // 43.75% > HIGH_DENSITY_THRESHOLD (40%)
      clusters: {
        revealVague: 15,
        motivationWeak: 12,
        conflictStalled: 8,
        unknown: 0
      },
      primaryMode: 'REVEAL_VAGUE' as const,
      humanSummary: '你的项目有 35 集（44%）需要优化，主要卡在：信息揭示不具体',
      recommendations: ['使用"提前揭示真相"微调指令', '增加明确的证据或验证场景'],
      timestamp: new Date().toISOString()
    };

    await projectRepo.saveFailureAnalysis(seed.id, mockFailureAnalysis);
    console.log(`✓ 设置降级密度: ${Math.round((mockFailureAnalysis.degradedEpisodes / mockFailureAnalysis.totalEpisodes) * 100)}%`);

    // 3. 运行创作顾问
    console.log('\n3. 运行创作顾问...');
    const project = await projectRepo.get(seed.id);
    if (!project) {
      throw new Error('项目未找到');
    }

    const advice = await generateEpisodeAdvice(seed.id, project);
    
    if (!advice) {
      throw new Error('创作顾问未生成建议');
    }

    // 4. 验证建议内容
    console.log('\n4. 验证建议内容:');
    console.log(`   - 当前集数: ${advice.currentTotalEpisodes}`);
    console.log(`   - 推荐集数: ${advice.recommendedEpisodes}`);
    console.log(`   - 降级密度: ${Math.round(advice.degradedDensity * 100)}%`);
    console.log(`   - 置信度: ${advice.confidence}`);
    console.log(`   - 建议理由: ${advice.reason}`);

    // 5. 验证题材特定逻辑
    console.log('\n5. 验证题材特定逻辑:');
    if (advice.recommendedEpisodes === 40 && advice.confidence === 'high') {
      console.log(`   ✓ 甜宠题材正确建议精简至 40 集（高置信度）`);
    } else {
      throw new Error('甜宠题材建议不符合预期');
    }

    // 6. 测试实时检查
    console.log('\n6. 测试实时降级密度检查...');
    const shouldGenerate = await shouldGenerateAdviceRealtime(seed.id);
    console.log(`   ✓ 是否应该生成建议: ${shouldGenerate}`);

    // 7. 验证存储
    console.log('\n7. 验证存储...');
    await projectRepo.saveEpisodeAdvice(seed.id, advice);
    const savedAdvice = await projectRepo.getEpisodeAdvice(seed.id);
    if (!savedAdvice) {
      throw new Error('创作建议未保存');
    }
    console.log('✓ 创作建议已正确保存');

    console.log('\n✅ P3.3 测试通过');
    return true;
  } catch (error: any) {
    console.error('\n❌ P3.3 测试失败:', error.message);
    return false;
  }
}

/**
 * 综合集成测试
 */
async function testIntegration() {
  console.log('\n=== 综合集成测试 ===\n');
  console.log('测试 P3.1、P3.2、P3.3 三个功能的集成效果...\n');

  try {
    const results = {
      p3_1: await testP3_1_FailureClustering(),
      p3_2: await testP3_2_InstructionMapper(),
      p3_3: await testP3_3_CreativeAdvisor()
    };

    console.log('\n=== 测试结果汇总 ===\n');
    console.log(`P3.1 失败模式聚类: ${results.p3_1 ? '✅ 通过' : '❌ 失败'}`);
    console.log(`P3.2 微调指令注入: ${results.p3_2 ? '✅ 通过' : '❌ 失败'}`);
    console.log(`P3.3 创作方向建议: ${results.p3_3 ? '✅ 通过' : '❌ 失败'}`);

    const allPassed = Object.values(results).every(r => r === true);

    if (allPassed) {
      console.log('\n🎉 所有测试通过！P3 Sprint 实施成功。');
    } else {
      console.log('\n⚠️  部分测试失败，请检查详细日志。');
    }

    return allPassed;
  } catch (error: any) {
    console.error('\n❌ 集成测试失败:', error.message);
    return false;
  }
}

/**
 * 主入口
 */
async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   P3: Quality Guidance Test Suite      ║');
  console.log('╚══════════════════════════════════════╝');

  const startTime = Date.now();
  const passed = await testIntegration();
  const duration = Date.now() - startTime;

  console.log(`\n总耗时: ${(duration / 1000).toFixed(2)} 秒`);

  process.exit(passed ? 0 : 1);
}

// 运行测试
main().catch(error => {
  console.error('测试执行失败:', error);
  process.exit(1);
});

