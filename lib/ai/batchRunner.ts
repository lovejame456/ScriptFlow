import { generateEpisodeFast } from './episodeFlow';
import { batchRepo } from '../batch/batchRepo';
import { BatchState, BatchStatus, EpisodeStatus, AdaptiveParams, AdaptiveParamsWithSource } from '../../types';
import { episodeRepo } from '../store/episodeRepo';
import { projectRepo } from '../store/projectRepo';
import { getPacingContext } from '../pacing/pacingEngine';
import { isStructureFailError } from './slotValidator';
import { metrics } from '../metrics/runMetrics';
import fs from 'node:fs';
import path from 'node:path';
import {
  deriveAdaptiveParams,
  extractPolicyInput,
  getDefaultParams,
  createAdaptiveParamsSnapshot,
  ParamSource
} from '../metrics/policyEngine';
import {
  MetaPolicy,
  ProjectProfile,
  MetaPolicyBias
} from '../metrics/metaTypes';
import { bucketByProfile } from '../metrics/metaAggregator';
// P3.1: 导入失败聚类分析
import { analyzeProjectFailures } from '../guidance/failureCluster';
// P3.3: 导入创作顾问
import { generateEpisodeAdvice, shouldGenerateAdviceRealtime } from '../guidance/creativeAdvisor';

export async function startBatch(args: {
  projectId: string;
  start: number;
  end: number;
  projectProfile?: ProjectProfile;  // M16.6: 新增项目画像
}): Promise<BatchState> {
  const { projectId, start, end, projectProfile } = args;

  // M16.4: 初始化 metrics
  metrics.startRun({
    runId: `${projectId}_${Date.now()}`,
    projectId,
    fromEpisode: start,
    toEpisode: end
  });

  // M16.5/M16.6: 加载或推导自适应参数（传入 projectProfile）
  const adaptiveParamsResult = loadOrDeriveAdaptiveParams(projectId, projectProfile);
  console.log(`[BatchRunner] M16.5/M16.6: Loaded adaptive params:`, adaptiveParamsResult);

  // M16.5: 记录自适应参数到 metrics
  metrics.recordAdaptiveParams(adaptiveParamsResult);

  const batchState: BatchState = {
    projectId,
    status: 'RUNNING',
    startEpisode: start,
    endEpisode: end,
    currentEpisode: start,
    completed: [],
    failed: [],
    hardFailCount: 0,
    updatedAt: Date.now(),
    adaptiveParams: {
      revealCadenceBias: adaptiveParamsResult.revealCadenceBias,
      maxSlotRetries: adaptiveParamsResult.maxSlotRetries,
      pressureMultiplier: adaptiveParamsResult.pressureMultiplier
    }
  };

  batchRepo.save(batchState);
  console.log(`[BatchRunner] Started batch for ${projectId}: EP${start}-${end}`);

  // Start the loop in background (don't await)
  runLoop(projectId).catch(err => {
    console.error('[BatchRunner] Loop error:', err);
  });

  return batchState;
}

export async function pauseBatch(projectId: string): Promise<BatchState> {
  const batch = batchRepo.get(projectId);
  if (!batch) {
    throw new Error('Batch not found');
  }

  if (batch.status !== 'RUNNING') {
    throw new Error(`Cannot pause batch with status ${batch.status}`);
  }

  batch.status = 'PAUSED';
  batchRepo.save(batch);
  console.log(`[BatchRunner] Paused batch for ${projectId}`);

  return batch;
}

export async function resumeBatch(projectId: string): Promise<BatchState> {
  const batch = batchRepo.get(projectId);
  if (!batch) {
    throw new Error('Batch not found');
  }

  if (batch.status === 'DONE' || batch.status === 'FAILED') {
    console.log(`[BatchRunner] Batch already ${batch.status}, cannot resume`);
    return batch;
  }

  if (batch.status !== 'PAUSED' && batch.status !== 'RUNNING') {
    throw new Error(`Cannot resume batch with status ${batch.status}`);
  }

  // Calculate resume point: from the last completed episode + 1
  const lastCompleted = batch.completed.length > 0 ? Math.max(...batch.completed) : batch.startEpisode - 1;
  const resumeFrom = Math.max(lastCompleted + 1, batch.currentEpisode);

  batch.currentEpisode = resumeFrom;
  batch.status = 'RUNNING';
  batchRepo.save(batch);

  console.log(`[BatchRunner] Resumed batch for ${projectId} from EP${resumeFrom}`);

  // Start the loop in background (don't await)
  runLoop(projectId).catch(err => {
    console.error('[BatchRunner] Loop error:', err);
  });

  return batch;
}

async function runLoop(projectId: string): Promise<void> {
  let batch = batchRepo.get(projectId);
  if (!batch) {
    console.error(`[BatchRunner] Batch not found for ${projectId}`);
    return;
  }

  console.log(`[BatchRunner] Starting loop for ${projectId}, current: EP${batch.currentEpisode}, end: EP${batch.endEpisode}`);

  while (true) {
    // Reload batch state on each iteration to check for PAUSED
    batch = batchRepo.get(projectId);
    if (!batch) {
      console.error(`[BatchRunner] Batch lost for ${projectId}`);
      return;
    }

    // Check if paused
    if (batch.status === 'PAUSED') {
      console.log(`[BatchRunner] Batch paused for ${projectId}`);
      return;
    }

    // Check if done
    if (batch.currentEpisode > batch.endEpisode) {
      // Check if this was just a phase end or true completion
      const project = await projectRepo.get(projectId);
      if (project && batch.endEpisode < project.totalEpisodes) {
        batch.status = 'PAUSED';
        console.log(`[BatchRunner] Batch paused at phase end (EP${batch.endEpisode}) for ${projectId}`);
      } else {
        batch.status = 'DONE';
        console.log(`[BatchRunner] Batch completed for ${projectId}`);

        // M16.4: 写入 metrics 报告
        try {
          const { file } = metrics.finalizeAndWrite('reports');
          console.log(`[BatchRunner] M16.4 metrics report written to: ${file}`);
        } catch (err) {
          console.warn(`[BatchRunner] Failed to write metrics report:`, err);
        }
      }

      batchRepo.save(batch);

      // P3.1: Batch 完成或暂停时，分析失败模式
      try {
        console.log(`[BatchRunner] P3.1: Running failure analysis...`);
        const failureAnalysis = await analyzeProjectFailures(projectId);
        await projectRepo.saveFailureAnalysis(projectId, failureAnalysis);
        console.log(`[BatchRunner] P3.1: Failure analysis saved:`, failureAnalysis.humanSummary);
      } catch (err) {
        console.warn(`[BatchRunner] P3.1: Failed to run failure analysis:`, err);
      }

      // P3.3: Phase 暂停或完成时，生成创作建议
      if (batch.status === 'PAUSED' || batch.status === 'DONE') {
        try {
          console.log(`[BatchRunner] P3.3: Generating episode advice...`);
          const episodeAdvice = await generateEpisodeAdvice(projectId, project);
          
          if (episodeAdvice) {
            await projectRepo.saveEpisodeAdvice(projectId, episodeAdvice);
            console.log(`[BatchRunner] P3.3: Episode advice saved:`, episodeAdvice.reason);
          }
        } catch (err) {
          console.warn(`[BatchRunner] P3.3: Failed to generate episode advice:`, err);
        }
      }

      // P5-Lite: 记录 Failure Snapshot（不影响现有逻辑）
      try {
        // 确保 Project DNA 已初始化（即使没有失败画像）
        const { getOrInitDNA, recordFailureSnapshot } = await import('../business/projectDNA');
        await getOrInitDNA(projectId);

        const failureProfile = await projectRepo.getFailureProfile(projectId);
        if (failureProfile) {
          const degradedRatio = batch.degraded?.length / (batch.endEpisode - batch.startEpisode + 1) || 0;
          await recordFailureSnapshot(projectId, failureProfile, degradedRatio);
          console.log(`[BatchRunner] P5-Lite: Failure snapshot recorded`);
        }
      } catch (err) {
        console.warn(`[BatchRunner] P5-Lite: Failed to record failure snapshot:`, err);
      }

      // P5-Lite: 内部稳定性预测（仅用于日志，不影响 UI）
      try {
        const { analyzeStability } = await import('../business/predictabilityEngine');
        const prediction = await analyzeStability(projectId);
        console.log(`[BatchRunner] P5-Lite Stability Prediction:`, {
          risk: prediction.next10EpisodesRisk,
          expectedDegradedRate: (prediction.expectedDegradedRate * 100).toFixed(1) + '%',
          confidence: (prediction.confidence * 100).toFixed(1) + '%',
          notes: prediction.notes.slice(0, 2)  // 只打印前 2 条说明
        });
      } catch (err) {
        console.warn(`[BatchRunner] P5-Lite: Failed to analyze stability:`, err);
      }

      return;
    }

    // Check if still running
    if (batch.status !== 'RUNNING') {
      console.log(`[BatchRunner] Batch status changed to ${batch.status}, stopping loop`);
      return;
    }

    const episodeIndex = batch.currentEpisode;
    const project = await projectRepo.get(projectId);
    const episode = project.episodes[episodeIndex - 1];

    // 跳过人工接管集
    if (episode.status === EpisodeStatus.MANUAL_OVERRIDE) {
      console.log(`[BatchRunner] Skipping EP${episodeIndex} (MANUAL_OVERRIDE)`);
      batch.currentEpisode += 1;
      batchRepo.save(batch);
      continue;
    }

    console.log(`[BatchRunner] Processing ${projectId} EP${episodeIndex}`);

    try {
      // 使用 generateEpisodeFast，立即返回 DRAFT（包含后台增强任务）
      const result = await generateEpisodeFast({ projectId, episodeIndex });

      // === P1: DEGRADED 状态处理 ===
      // 当剧集结构失败后自动降级时，状态为 DEGRADED
      // 不阻塞 Batch，继续生成下一集
      if (result.status === EpisodeStatus.DEGRADED) {
        console.log(`[BatchRunner] EP${episodeIndex} is DEGRADED, adding to degraded list and continuing`);

        // 将降级集加入 degraded 数组
        if (!batch.degraded) {
          batch.degraded = [];
        }
        batch.degraded.push(episodeIndex);
        batch.degraded = [...new Set(batch.degraded)];

        // 更新健康状态
        batch.health = calculateHealth(batch);

        // 继续下一集（不暂停 Batch）
        batch.currentEpisode += 1;
        batchRepo.save(batch);
        console.log(`[BatchRunner] Continuing batch after DEGRADED EP${episodeIndex}`);
        continue;
      }

      // === P0 新规则：DRAFT 状态不阻塞 Batch ===
      //
      // generateEpisodeFast 返回的是 DRAFT 状态，但这是正常的：
      // 1. DRAFT: 剧本已生成，用户可以立即阅读（可见性优先）
      // 2. 后台增强任务会异步执行 Aligner，完成后自动升级为 COMPLETED
      // 3. Batch 不等待 COMPLETED，继续推进下一集
      //
      // 这确保了用户不需要等待 Aligner（30-80s），大大缩短等待时间。
      if (result.status !== EpisodeStatus.COMPLETED) {
        console.log(`[BatchRunner] EP${episodeIndex} 进入 DRAFT，Batch 继续推进`);

        // P0 断言：确保 DRAFT 状态有 humanSummary
        const episode = project.episodes[episodeIndex - 1];
        if (!episode.humanSummary) {
          console.warn(`[BatchRunner] WARNING: EP${episodeIndex} is DRAFT but missing humanSummary`);
          await episodeRepo.save(projectId, episodeIndex, {
            humanSummary: '剧本已生成，可立即阅读'
          });
        }

        // ✅ 新规则：DRAFT 不再视为失败，Batch 直接继续
        batch.currentEpisode += 1;
        batchRepo.save(batch);
        
        // P3.3: 实时监控降级密度（每集生成完成后检查）
        try {
          const shouldGenerateRealtime = await shouldGenerateAdviceRealtime(projectId);
          if (shouldGenerateRealtime) {
            console.log(`[BatchRunner] P3.3: Realtime degraded density threshold reached, generating advice...`);
            const episodeAdvice = await generateEpisodeAdvice(projectId, project);
            if (episodeAdvice) {
              await projectRepo.saveEpisodeAdvice(projectId, episodeAdvice);
              console.log(`[BatchRunner] P3.3: Realtime episode advice saved:`, episodeAdvice.reason);
            }
          }
        } catch (err) {
          console.warn(`[BatchRunner] P3.3: Failed to generate realtime advice:`, err);
        }
        
        continue;
      }

      // P0 断言：只有真正通过校验的剧集才能计入进度
      const episode = project.episodes[episodeIndex - 1];
      if (episode.status !== EpisodeStatus.COMPLETED) {
        throw new Error(`[BatchRunner] CRITICAL: Attempted to mark EP${episodeIndex} as completed, but status is ${episode.status}`);
      }

      // Success: mark completed, reset hardFailCount, move to next
      batch.completed.push(episodeIndex);
      // Remove duplicates
      batch.completed = [...new Set(batch.completed)];
      batch.hardFailCount = 0;
      batch.currentEpisode += 1;
      batch.lastError = undefined;

      // 计算并保存 KEY 集标记
      await episodeRepo.save(projectId, episodeIndex, await calculateImportance(projectId, episodeIndex));

      // 计算健康状态
      batch.health = calculateHealth(batch);

      batchRepo.save(batch);
      console.log(`[BatchRunner] EP${episodeIndex} completed successfully`);

    } catch (err: any) {
      // === 状态驱动：系统级错误标记为 FAILED ===
      //
      // FAILED 仅用于系统级错误（网络故障、API 超时、未知异常等），
      // 内容质量问题应该在 generateOneEpisode 内部处理为 DRAFT。
      //
      // 注意：FAILED 不会被计入 batch.completed，因此不会错误推进进度。
      batch.failed.push(episodeIndex);
      // Remove duplicates
      batch.failed = [...new Set(batch.failed)];
      batch.hardFailCount += 1;
      batch.lastError = err.message || String(err);

      // 将失败集的状态标记为 FAILED（系统级错误）
      await episodeRepo.save(projectId, episodeIndex, {
        status: EpisodeStatus.FAILED,
        humanSummary: `系统级错误：${err.message || String(err)}，需要检查日志后重试`
      });
      console.error(`[BatchRunner] Marked EP${episodeIndex} as FAILED (system error)`);

      // 计算健康状态
      batch.health = calculateHealth(batch);

      batchRepo.save(batch);

      console.error(`[BatchRunner] EP${episodeIndex} hard failed: ${batch.lastError}`);

      // === EP1 强阻塞逻辑（仅限系统级错误） ===
      if (episodeIndex === 1) {
        // 检查是否为真正的系统级错误（网络故障、API 超时、未知异常等）
        // 内容质量问题已经在 generateOneEpisode 内部处理为 DRAFT，不会到达这里
        const failReason = err.message || String(err);
        const isSystemError =
          failReason.includes('network') ||
          failReason.includes('timeout') ||
          failReason.includes('API') ||
          failReason.includes('connection') ||
          failReason.includes('undefined') ||
          failReason.includes('null');

        if (isSystemError) {
          // 只有真正的系统级错误才触发 PAUSED
          batch.status = 'PAUSED';
          batchRepo.save(batch);

          const summary = `第 1 集生成失败（系统级错误）：${failReason}。第 1 集为强依赖节点，请检查网络或重试后再继续。`;

          await episodeRepo.save(projectId, episodeIndex, {
            humanSummary: summary
          });

          console.log(`[BatchRunner] EP1 system error detected, batch paused: ${summary}`);
          return;
        } else {
          // 内容质量问题不阻塞，继续推进
          console.log(`[BatchRunner] EP1 content quality issue (not blocking): ${failReason}`);
          batch.currentEpisode += 1;
          batchRepo.save(batch);
          console.log(`[BatchRunner] Skipping EP1 quality issue, continuing to EP${batch.currentEpisode}`);
        }
      }

      // P1 修复：永不因失败而暂停，总是继续下一集
      batch.currentEpisode += 1;
      batchRepo.save(batch);
      console.log(`[BatchRunner] Skipping failed EP${episodeIndex}, continuing to EP${batch.currentEpisode}`);
    }

    // Small delay to allow UI updates
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

export async function runBatch(args: {
  projectId: string;
  start: number;
  end: number;
  concurrency?: number;
}) {
  // Legacy API compatibility: redirect to startBatch
  console.warn('[BatchRunner] runBatch is deprecated, use startBatch instead');
  return startBatch(args);
}

async function calculateImportance(projectId: string, episodeIndex: number) {
  const project = await projectRepo.get(projectId);
  const pacingContext = getPacingContext(project, episodeIndex);

  let importance: "KEY" | "NORMAL" = "NORMAL";
  let importanceReason: string | undefined;

  // 固定关键节点
  if ([1, 5, 10].includes(episodeIndex)) {
    importance = "KEY";
    importanceReason = "红果留存关键节点";
  }

  // 关系质变节点
  if (pacingContext.kpi.progressType === "RELATION_SHIFT") {
    importance = "KEY";
    importanceReason = "关系质变节点";
  }

  return { importance, importanceReason };
}

function calculateHealth(batch: BatchState): "HEALTHY" | "WARNING" | "RISKY" {
  if (batch.hardFailCount >= 1) {
    return "RISKY";
  }

  // 有失败记录就是 WARNING
  if (batch.failed.length >= 3) {
    return "WARNING";
  }

  return "HEALTHY";
}

// ========== M16.5/M16.6: 自适应参数加载 ==========

/**
 * 加载或推导自适应参数
 *
 * 优先级（M16.6 升级）：
 * 1. meta/meta_policy.json（Meta-Policy）+ baseline/last_run (meta_policy)
 * 2. baseline/m16_metrics_baseline.json (baseline)
 * 3. reports/m16_metrics_*.json 中最新的 (last_run)
 * 4. 默认参数 (default)
 *
 * @param projectId - 项目 ID
 * @param projectProfile - 项目画像（M16.6）
 * @returns AdaptiveParamsWithSource - 自适应参数（带来源标记）
 */
function loadOrDeriveAdaptiveParams(
  projectId: string,
  projectProfile?: ProjectProfile
): AdaptiveParamsWithSource {
  console.log(`[BatchRunner] M16.5/M16.6: Loading adaptive params for project ${projectId}`);

  // M16.6: 尝试加载 Meta Policy（新增最高优先级）
  const metaBias = tryLoadMetaPolicy(projectId, projectProfile);
  if (metaBias) {
    console.log(`[BatchRunner] M16.6: Using meta policy bias`);
    console.log(`[BatchRunner] M16.6: Meta bias:`, metaBias);

    // 读取状态修正指标（baseline / last_run）
    const policyInput = loadStateBasedInput(projectId);

    if (policyInput) {
      // 合并 Meta Bias + 状态修正
      const params = deriveAdaptiveParams(policyInput, metaBias);
      return createAdaptiveParamsSnapshot(params, 'meta_policy');
    } else {
      // 只有 Meta Bias，没有状态修正
      const params = {
        revealCadenceBias: metaBias.revealCadenceBiasPrior,
        maxSlotRetries: metaBias.retryBudgetPrior,
        pressureMultiplier: metaBias.pressureMultiplierPrior
      };
      return createAdaptiveParamsSnapshot(params, 'meta_policy');
    }
  }

  // M16.5: 优先级 2 - 尝试读取 baseline
  const baselinePath = path.join(process.cwd(), 'baseline', 'm16_metrics_baseline.json');
  const baselineResult = tryLoadMetricsFile(baselinePath);
  if (baselineResult) {
    console.log(`[BatchRunner] M16.5: Using baseline metrics from ${baselinePath}`);
    const params = deriveAdaptiveParams(baselineResult);
    return createAdaptiveParamsSnapshot(params, 'baseline');
  }

  // M16.5: 优先级 3 - 尝试读取最后一次运行
  const lastRunResult = tryLoadLastRunMetrics(projectId);
  if (lastRunResult) {
    console.log(`[BatchRunner] M16.5: Using last run metrics`);
    const params = deriveAdaptiveParams(lastRunResult);
    return createAdaptiveParamsSnapshot(params, 'last_run');
  }

  // 优先级 4 - 使用默认参数
  console.log(`[BatchRunner] M16.5: No metrics found, using default params`);
  return getDefaultParams();
}

/**
 * 加载基于状态的策略输入（baseline 或 last_run）
 *
 * @param projectId - 项目 ID
 * @returns AdaptivePolicyInput | null
 */
function loadStateBasedInput(projectId: string): any | null {
  // 1. 尝试 baseline
  const baselinePath = path.join(process.cwd(), 'baseline', 'm16_metrics_baseline.json');
  const baselineResult = tryLoadMetricsFile(baselinePath);
  if (baselineResult) {
    console.log(`[BatchRunner] M16.6: Loaded baseline state input`);
    return baselineResult;
  }

  // 2. 尝试 last_run
  const lastRunResult = tryLoadLastRunMetrics(projectId);
  if (lastRunResult) {
    console.log(`[BatchRunner] M16.6: Loaded last_run state input`);
    return lastRunResult;
  }

  console.log(`[BatchRunner] M16.6: No state-based input found`);
  return null;
}

/**
 * 尝试加载 Meta Policy
 *
 * @param projectId - 项目 ID
 * @param projectProfile - 项目画像
 * @returns MetaPolicyBias | null - Meta 偏置，加载失败或 confidence 不足则返回 null
 */
function tryLoadMetaPolicy(
  projectId: string,
  projectProfile?: ProjectProfile
): MetaPolicyBias | null {
  try {
    const metaPolicyPath = path.join(process.cwd(), 'meta', 'meta_policy.json');

    if (!fs.existsSync(metaPolicyPath)) {
      console.log(`[BatchRunner] M16.6: Meta policy not found: ${metaPolicyPath}`);
      return null;
    }

    const content = fs.readFileSync(metaPolicyPath, 'utf-8');
    const metaPolicy: MetaPolicy = JSON.parse(content);

    console.log(`[BatchRunner] M16.6: Loaded meta policy v${metaPolicy.version}`);

    // 如果没有提供 projectProfile，尝试从项目元数据推断
    if (!projectProfile) {
      console.warn(`[BatchRunner] M16.6: No project profile provided, skipping meta policy`);
      return null;
    }

    // 根据 projectProfile 找到对应 bucket 的 bias
    const bucketKey = bucketByProfile(projectProfile);
    const bucket = metaPolicy.buckets[bucketKey];

    if (!bucket) {
      console.log(`[BatchRunner] M16.6: Bucket not found for ${bucketKey}, skipping meta policy`);
      return null;
    }

    const { bias } = bucket;

    // 检查 confidence，低于 0.3 不使用
    if (bias.confidence < 0.3) {
      console.log(`[BatchRunner] M16.6: Meta bias confidence too low (${bias.confidence.toFixed(2)}), skipping`);
      return null;
    }

    console.log(`[BatchRunner] M16.6: Using meta bias for bucket ${bucketKey}`);
    console.log(`[BatchRunner] M16.6: Meta bias rationale:`, bias.rationale);

    return bias;
  } catch (error: any) {
    console.warn(`[BatchRunner] M16.6: Failed to load meta policy:`, error.message);
    return null;
  }
}

/**
 * 尝试加载指定路径的 Metrics 文件
 * 
 * @param filePath - 文件路径
 * @returns AdaptivePolicyInput | null - 策略输入，加载失败则返回 null
 */
function tryLoadMetricsFile(filePath: string): any | null {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`[BatchRunner] M16.5: Metrics file not found: ${filePath}`);
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const metricsJson = JSON.parse(content);
    
    // 提取策略输入
    const policyInput = extractPolicyInput(metricsJson);
    if (policyInput) {
      console.log(`[BatchRunner] M16.5: Successfully extracted policy input from ${filePath}`);
      return policyInput;
    }

    console.warn(`[BatchRunner] M16.5: Failed to extract policy input from ${filePath}`);
    return null;
  } catch (error: any) {
    console.warn(`[BatchRunner] M16.5: Failed to load metrics file ${filePath}:`, error.message);
    return null;
  }
}

/**
 * 尝试加载最后一次运行的 Metrics
 * 
 * @param projectId - 项目 ID
 * @returns AdaptivePolicyInput | null - 策略输入，加载失败则返回 null
 */
function tryLoadLastRunMetrics(projectId: string): any | null {
  try {
    const reportsDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) {
      console.log(`[BatchRunner] M16.5: Reports directory not found: ${reportsDir}`);
      return null;
    }

    // 读取所有 m16_metrics_*.json 文件
    const files = fs.readdirSync(reportsDir)
      .filter(f => f.startsWith('m16_metrics_') && f.endsWith('.json'))
      .filter(f => f !== 'm16_metrics_baseline.json'); // 排除 baseline

    if (files.length === 0) {
      console.log(`[BatchRunner] M16.5: No metrics files found in ${reportsDir}`);
      return null;
    }

    // 按修改时间排序，取最新的
    const filesWithMtime = files.map(f => ({
      file: f,
      mtime: fs.statSync(path.join(reportsDir, f)).mtimeMs
    })).sort((a, b) => b.mtime - a.mtime);

    const latestFile = filesWithMtime[0].file;
    const latestPath = path.join(reportsDir, latestFile);

    console.log(`[BatchRunner] M16.5: Latest metrics file: ${latestFile}`);
    return tryLoadMetricsFile(latestPath);
  } catch (error: any) {
    console.warn(`[BatchRunner] M16.5: Failed to load last run metrics:`, error.message);
    return null;
  }
}


