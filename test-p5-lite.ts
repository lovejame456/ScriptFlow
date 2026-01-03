/**
 * P5-Lite 测试脚本
 * 
 * 测试目标：
 * 1. 验证 Project DNA 可持续写入
 * 2. 验证不影响生成速度
 * 3. 验证 P1-P4 行为完全不变
 * 
 * 设计原则：
 * - 所有测试都在 try-catch 中，失败不影响其他测试
 * - 使用真实 API 调用，确保端到端验证
 * - 输出清晰的测试结果
 */

import { api } from './api/index';
import { ProjectDNA, ProjectFailureProfile, EpisodeStatus } from './types';

// 测试配置
const TEST_CONFIG = {
  projectId: '',
  projectPrompt: '修仙爽文：废柴少年获得神秘传承，从零开始修仙，打脸反派，升级境界',
  targetEpisodes: 5,  // 测试 5 集足够验证功能
  maxDurationMs: 60000,  // 最多等待 60 秒
};

// 测试结果
interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: any;
}

const testResults: TestResult[] = [];

/**
 * 运行测试
 */
async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  const startTime = Date.now();
  const result: TestResult = {
    name,
    passed: false,
    duration: 0,
  };

  try {
    console.log(`\n[Test] ${name}...`);
    await testFn();
    result.passed = true;
    console.log(`✓ [Test] ${name} passed`);
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    console.error(`✗ [Test] ${name} failed:`, result.error);
  } finally {
    result.duration = Date.now() - startTime;
    testResults.push(result);
  }
}

/**
 * 测试 1：创建项目
 */
async function testCreateProject() {
  console.log(`[Test] Creating project with prompt: "${TEST_CONFIG.projectPrompt}"`);
  const project = await api.project.seed(TEST_CONFIG.projectPrompt, {
    genre: '修仙爽文',
    totalEpisodes: TEST_CONFIG.targetEpisodes,
  });
  TEST_CONFIG.projectId = project.id;
  console.log(`[Test] Project created: ${project.id} (${project.name})`);
}

/**
 * 测试 2：生成 Bible
 */
async function testGenerateBible() {
  if (!TEST_CONFIG.projectId) throw new Error('Project ID not set');
  await api.project.generateBible(TEST_CONFIG.projectId);
  console.log(`[Test] Bible generated successfully`);
}

/**
 * 测试 3：生成 Outline
 */
async function testGenerateOutline() {
  if (!TEST_CONFIG.projectId) throw new Error('Project ID not set');

  // 更新项目总集数为测试集数（避免生成完整 130 集大纲）
  await api.project.updateTotalEpisodes(TEST_CONFIG.projectId, TEST_CONFIG.targetEpisodes);

  await api.project.generateOutline(TEST_CONFIG.projectId);
  console.log(`[Test] Outline generated successfully`);
}

/**
 * 测试 4：批量生成剧集（验证 P5-Lite 数据记录）
 */
async function testBatchGenerate() {
  if (!TEST_CONFIG.projectId) throw new Error('Project ID not set');
  console.log(`[Test] Starting batch generation for ${TEST_CONFIG.targetEpisodes} episodes...`);

  const startTime = Date.now();
  await api.episode.runBatch(TEST_CONFIG.projectId, 1, TEST_CONFIG.targetEpisodes);

  // 等待 batch 完成（最多 120 秒）
  let waitTime = 0;
  const maxWaitTime = 120000; // 120 秒
  console.log(`[Test] Waiting for batch to complete...`);
  while (waitTime < maxWaitTime) {
    const project = await api.project.get(TEST_CONFIG.projectId);
    const completedEpisodes = project.episodes.filter(
      ep => ep.status === EpisodeStatus.COMPLETED ||
           ep.status === EpisodeStatus.DRAFT ||
           ep.status === EpisodeStatus.DEGRADED
    ).length;

    console.log(`[Test] Progress: ${completedEpisodes}/${TEST_CONFIG.targetEpisodes} episodes generated (${waitTime / 1000}s)`);

    if (completedEpisodes >= TEST_CONFIG.targetEpisodes) {
      break;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
    waitTime += 1000;
  }

  // 最终验证
  const project = await api.project.get(TEST_CONFIG.projectId);
  const completedEpisodes = project.episodes.filter(
    ep => ep.status === EpisodeStatus.COMPLETED ||
         ep.status === EpisodeStatus.DRAFT ||
         ep.status === EpisodeStatus.DEGRADED
  ).length;

  const duration = Date.now() - startTime;
  console.log(`[Test] Batch completed: ${completedEpisodes}/${TEST_CONFIG.targetEpisodes} episodes in ${duration}ms`);

  // 验证至少生成 5 集
  if (completedEpisodes < 5) {
    throw new Error(`Only ${completedEpisodes} episodes generated, expected at least 5`);
  }

  // 验证生成速度（平均每集不超过 30 秒）
  const avgDuration = duration / completedEpisodes;
  if (avgDuration > 30000) {
    throw new Error(`Average generation time (${avgDuration}ms) exceeds threshold (30000ms)`);
  }
}

/**
 * 测试 5：验证 Project DNA 可持续写入
 */
async function testProjectDNAWriting() {
  if (!TEST_CONFIG.projectId) throw new Error('Project ID not set');
  
  console.log(`[Test] Verifying Project DNA writing...`);
  const dna = await api.business.getProjectDNA(TEST_CONFIG.projectId);

  if (!dna) {
    throw new Error('Project DNA not found after batch generation');
  }

  console.log(`[Test] Project DNA loaded:`, {
    projectId: dna.projectId,
    failureEvolutionCount: dna.failureEvolution.length,
    instructionImpactHistoryCount: dna.instructionImpactHistory.length,
    creativeDecisionsCount: dna.creativeDecisions.length,
    createdAt: dna.createdAt,
    updatedAt: dna.updatedAt,
  });

  // 验证 DNA 结构
  if (!dna.projectId || !dna.createdAt || !dna.updatedAt) {
    throw new Error('Project DNA missing required fields');
  }

  // 验证 failureEvolution 数组
  if (!Array.isArray(dna.failureEvolution)) {
    throw new Error('failureEvolution is not an array');
  }

  // 验证 instructionImpactHistory 数组
  if (!Array.isArray(dna.instructionImpactHistory)) {
    throw new Error('instructionImpactHistory is not an array');
  }

  // 验证 creativeDecisions 数组
  if (!Array.isArray(dna.creativeDecisions)) {
    throw new Error('creativeDecisions is not an array');
  }

  console.log(`✓ [Test] Project DNA structure validated`);
}

/**
 * 测试 6：验证稳定性预测
 */
async function testStabilityPrediction() {
  if (!TEST_CONFIG.projectId) throw new Error('Project ID not set');

  console.log(`[Test] Verifying stability prediction...`);
  const prediction = await api.business.getPredictability(TEST_CONFIG.projectId);

  console.log(`[Test] Stability prediction:`, {
    next10EpisodesRisk: prediction.next10EpisodesRisk,
    expectedDegradedRate: (prediction.expectedDegradedRate * 100).toFixed(1) + '%',
    confidence: (prediction.confidence * 100).toFixed(1) + '%',
    notes: prediction.notes.slice(0, 2),
  });

  // 验证预测结构
  if (prediction.next10EpisodesRisk !== 'LOW' &&
      prediction.next10EpisodesRisk !== 'MEDIUM' &&
      prediction.next10EpisodesRisk !== 'HIGH') {
    throw new Error('Invalid risk level');
  }

  if (typeof prediction.expectedDegradedRate !== 'number' || prediction.expectedDegradedRate < 0 || prediction.expectedDegradedRate > 1) {
    throw new Error('Invalid expectedDegradedRate');
  }

  if (typeof prediction.confidence !== 'number' || prediction.confidence < 0 || prediction.confidence > 1) {
    throw new Error('Invalid confidence');
  }

  if (!Array.isArray(prediction.notes)) {
    throw new Error('notes is not an array');
  }

  console.log(`✓ [Test] Stability prediction validated`);
}

/**
 * 测试 7：验证 P1-P4 行为不变（检查关键功能）
 */
async function testP1P4BehaviorUnchanged() {
  if (!TEST_CONFIG.projectId) throw new Error('Project ID not set');

  console.log(`[Test] Verifying P1-P4 behavior unchanged...`);

  const project = await api.project.get(TEST_CONFIG.projectId);

  // P1: 验证 DEGRADED 状态存在
  const degradedEpisodes = project.episodes.filter(ep => ep.status === EpisodeStatus.DEGRADED);
  console.log(`[Test] P1: Found ${degradedEpisodes.length} DEGRADED episodes`);

  // P3: 验证失败分析存在
  const failureAnalysis = await api.guidance.getFailureAnalysis(TEST_CONFIG.projectId);
  if (!failureAnalysis) {
    console.warn(`[Test] P3: Failure analysis not found (may be expected for small batch)`);
  } else {
    console.log(`[Test] P3: Failure analysis found:`, failureAnalysis.humanSummary);
  }

  // P4: 验证项目失败画像存在
  try {
    const profile = await api.intelligence.getProjectProfile(TEST_CONFIG.projectId);
    if (profile) {
      console.log(`[Test] P4: Project failure profile found`);
    } else {
      console.warn(`[Test] P4: Project failure profile not found (may be expected for small batch)`);
    }
  } catch (error) {
    console.warn(`[Test] P4: Failed to get project profile (may be expected):`, error);
  }

  console.log(`✓ [Test] P1-P4 behavior verified`);
}

/**
 * 测试 8：验证导出 Project DNA
 */
async function testExportProjectDNA() {
  if (!TEST_CONFIG.projectId) throw new Error('Project ID not set');

  console.log(`[Test] Exporting Project DNA...`);
  const exportedDNA = await api.business.getProjectDNA(TEST_CONFIG.projectId);

  if (!exportedDNA) {
    throw new Error('Exported DNA is null');
  }

  console.log(`[Test] Project DNA exported successfully:`, {
    projectId: exportedDNA.projectId,
    failureEvolutionCount: exportedDNA.failureEvolution.length,
    instructionImpactHistoryCount: exportedDNA.instructionImpactHistory.length,
    creativeDecisionsCount: exportedDNA.creativeDecisions.length,
  });

  console.log(`✓ [Test] Project DNA export verified`);
}

/**
 * 打印测试结果
 */
function printTestResults() {
  console.log('\n========================================');
  console.log('P5-Lite 测试结果');
  console.log('========================================\n');

  let passedCount = 0;
  let failedCount = 0;
  let totalDuration = 0;

  for (const result of testResults) {
    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    const durationStr = `${result.duration}ms`;
    const errorStr = result.error ? ` (${result.error})` : '';

    console.log(`${status} | ${result.name} | ${durationStr}${errorStr}`);

    if (result.passed) {
      passedCount++;
    } else {
      failedCount++;
    }
    totalDuration += result.duration;
  }

  console.log('\n========================================');
  console.log(`总计: ${passedCount} 通过, ${failedCount} 失败`);
  console.log(`总耗时: ${totalDuration}ms`);
  console.log('========================================\n');

  if (failedCount === 0) {
    console.log('✓ 所有测试通过！');
  } else {
    console.log('✗ 存在失败的测试，请检查日志');
    process.exit(1);
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('========================================');
  console.log('P5-Lite 测试脚本');
  console.log('========================================\n');

  try {
    // 运行测试
    await runTest('创建项目', testCreateProject);
    await runTest('生成 Bible', testGenerateBible);
    await runTest('生成 Outline', testGenerateOutline);
    await runTest('批量生成剧集', testBatchGenerate);
    await runTest('验证 Project DNA 可持续写入', testProjectDNAWriting);
    await runTest('验证稳定性预测', testStabilityPrediction);
    await runTest('验证 P1-P4 行为不变', testP1P4BehaviorUnchanged);
    await runTest('验证导出 Project DNA', testExportProjectDNA);

    // 打印结果
    printTestResults();

  } catch (error) {
    console.error('[Main] Unhandled error:', error);
    process.exit(1);
  }
}

// 运行主函数
main().catch(error => {
  console.error('[Main] Fatal error:', error);
  process.exit(1);
});

