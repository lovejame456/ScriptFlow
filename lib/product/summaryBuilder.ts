/**
 * Summary Builder - 产品可读摘要构建器
 *
 * 职责：
 * - 将工程级 metrics 转换为产品经理/内容策划可读的摘要
 * - 不暴露工程细节
 * - 未来可直接展示在 UI 中
 *
 * 输入：metrics JSON + promotion 状态 + project meta
 * 输出：人类可读的产品摘要（string）
 */

import fs from 'node:fs';
import path from 'node:path';
import { MetricsData } from './regressionGate';
import { EpisodeMetrics } from '../metrics/runMetrics';

/**
 * Promotion 状态
 */
export type PromotionStatus = 'promoted' | 'pending' | 'failed' | 'skipped';

/**
 * Pending 状态
 */
interface PendingState {
  runId: string;
  metricsPath: string;
  timestamp: string;
}

/**
 * Summary 输入
 */
export interface SummaryInput {
  metrics: MetricsData;
  promotionStatus: PromotionStatus;
  project: {
    id: string;
    name: string;
    logline: string;
    totalEpisodes: number;
    genre: string;
  };
  goldMetrics?: MetricsData | null;
  pendingState?: PendingState | null;
}

/**
 * Reveal 类型（用于显示）
 */
type RevealType = 'INFO' | 'FACT' | 'RELATION' | 'IDENTITY';

/**
 * Contract 信息（简化版）
 */
interface ContractInfo {
  reveal: {
    required: boolean;
    type: RevealType;
    scope: 'PROTAGONIST' | 'ANTAGONIST' | 'WORLD';
    cadenceTag?: 'NORMAL' | 'SPIKE';
    noRepeatKey?: string;
  };
}

/**
 * Episode 信息（简化版）
 */
interface EpisodeInfo {
  episode: number;
  contract: ContractInfo;
}

/**
 * 构建 Summary
 *
 * @param input - 输入数据
 * @returns 格式化的产品摘要
 */
export function buildSummary(input: SummaryInput): string {
  const { metrics, promotionStatus, project, goldMetrics, pendingState } = input;
  const lines: string[] = [];

  // Header
  lines.push('================================');
  lines.push('📦 ScriptFlow · Run Summary');
  lines.push('================================');
  lines.push('');

  // Prompt
  lines.push('Prompt:');
  lines.push(`  ${project.logline}`);
  lines.push('');

  // Episodes
  lines.push('Episodes:');
  const episodeMetrics = metrics.episodes || [];
  if (episodeMetrics && episodeMetrics.length > 0) {
    const firstEp = episodeMetrics[0].episode;
    const lastEp = episodeMetrics[episodeMetrics.length - 1].episode;
    lines.push(`  EP${firstEp} → EP${lastEp} (共 ${episodeMetrics.length} 集)`);
  } else {
    lines.push(`  EP1 → EP${project.totalEpisodes}`);
  }
  lines.push('');

  // Quality
  lines.push('Quality:');
  const aggregates = metrics.aggregates;
  const health = aggregates?.health || { score: 0, warnings: [], errors: [] };
  const score = health.score || 0;

  // 计算分数变化（如果有 gold）
  let scoreChange = '';
  if (goldMetrics && goldMetrics.aggregates?.health) {
    const goldScore = goldMetrics.aggregates.health.score;
    const diff = score - goldScore;
    if (diff > 0) {
      scoreChange = ` (↑ +${diff})`;
    } else if (diff < 0) {
      scoreChange = ` (↓ ${diff})`;
    }
  }

  lines.push(`  Health Score: ${score}${scoreChange}`);
  lines.push(`  Errors: ${health.errors?.length || 0}`);
  lines.push(`  Warnings: ${health.warnings?.length || 0}`);
  lines.push('');

  // Structure（如果有 episodes 数据）
  if (episodeMetrics && episodeMetrics.length > 0) {
    lines.push('Structure:');

    // 统计 reveal types
    const typeCounts: Record<string, number> = {
      INFO: 0,
      FACT: 0,
      RELATION: 0,
      IDENTITY: 0
    };

    let spikeCount = 0;
    const types: string[] = [];

    for (const ep of episodeMetrics) {
      const type = ep.contract.reveal.type;
      typeCounts[type] = (typeCounts[type] || 0) + 1;
      types.push(type);

      if (ep.contract.reveal.cadenceTag === 'SPIKE') {
        spikeCount++;
      }
    }

    // 获取不重复的 reveal types（按出现顺序）
    const uniqueTypes = Array.from(new Set(types));
    if (uniqueTypes.length > 0) {
      lines.push(`  Reveal Types: ${uniqueTypes.join(' → ')}`);
    }

    // SPIKE Ratio
    const spikeRatio = Math.round((spikeCount / episodeMetrics.length) * 100);
    lines.push(`  SPIKE Ratio: ${spikeRatio}%`);
    lines.push('');
  }

  // Stability
  lines.push('Stability:');
  const retry = aggregates?.retry || { avgRetries: 0, p95Retries: 0 };
  lines.push(`  Retry P95: ${retry.p95Retries}`);
  lines.push(`  Avg Retries: ${retry.avgRetries.toFixed(1)}`);
  lines.push('');

  // Adaptive（如果有 adaptiveParams）
  const adaptiveParams = metrics.adaptiveParams;
  if (adaptiveParams) {
    lines.push('Adaptive:');
    lines.push(`  Cadence Bias: ${adaptiveParams.revealCadenceBias}`);
    lines.push(`  Retry Budget: ${adaptiveParams.maxSlotRetries}`);
    lines.push(`  Pressure Multiplier: ${adaptiveParams.pressureMultiplier.toFixed(2)}`);

    // 添加来源说明
    const adaptiveDescription = aggregates?.adaptiveParams?.description;
    if (adaptiveDescription) {
      const linesOfDesc = adaptiveDescription.split('|').map(s => s.trim());
      if (linesOfDesc.length > 1) {
        lines.push(`  Source: ${linesOfDesc[0].replace('来源: ', '')}`);
      }
    }
    lines.push('');
  }

  // Promotion
  lines.push('Promotion:');
  if (promotionStatus === 'promoted') {
    lines.push(`  Gold Status: 🟢 PROMOTED`);
    lines.push(`  Run ID: ${metrics.runId}`);
  } else if (promotionStatus === 'pending') {
    if (pendingState && pendingState.runId === metrics.runId) {
      lines.push(`  Gold Status: 🟡 PENDING (2/2 - 可晋升)`);
    } else {
      lines.push(`  Gold Status: 🟡 PENDING (1 / 2)`);
    }
    lines.push(`  Run ID: ${metrics.runId}`);
  } else if (promotionStatus === 'failed') {
    lines.push(`  Gold Status: 🔴 FAILED`);
    lines.push(`  Run ID: ${metrics.runId}`);
  } else {
    lines.push(`  Gold Status: ⚪ SKIPPED (非 CI 环境)`);
  }

  // Adaptive Params 来源
  if (adaptiveParams && adaptiveParams.source) {
    lines.push(`  Params Source: ${adaptiveParams.source}`);
  }
  lines.push('');

  // Notes（warnings 和关键信息）
  lines.push('Notes:');
  const notes: string[] = [];

  // 添加警告
  const warnings = health.warnings || [];
  warnings.forEach(warning => {
    notes.push(`  ⚠ ${warning}`);
  });

  // 添加错误
  const errors = health.errors || [];
  errors.forEach(error => {
    notes.push(`  ❌ ${error}`);
  });

  // 如果没有警告和错误，添加正面反馈
  if (errors.length === 0 && warnings.length === 0) {
    notes.push('  ✅ 系统稳定，无结构失败');
  }

  // 根据 score 添加额外说明
  if (score >= 90) {
    notes.push('  ✨ 质量优秀，接近完美');
  } else if (score >= 80) {
    notes.push('  👍 质量良好，系统运行稳定');
  } else if (score >= 70) {
    notes.push('  ✅ 质量及格，达到预期标准');
  } else if (score >= 60) {
    notes.push('  ⚠️ 质量一般，建议优化');
  }

  // 确保至少有一条 note
  if (notes.length === 0) {
    notes.push('  ℹ️ 系统运行完成');
  }

  notes.forEach(note => lines.push(note));
  lines.push('');
  lines.push('================================');

  return lines.join('\n');
}

/**
 * 读取 Gold Baseline
 *
 * @returns Gold Metrics 或 null
 */
export function readGoldBaseline(): MetricsData | null {
  const goldPath = path.join(process.cwd(), 'baseline/gold/m16_metrics_gold.json');
  
  if (!fs.existsSync(goldPath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(goldPath, 'utf-8');
    return JSON.parse(content) as MetricsData;
  } catch (error: any) {
    console.warn(`[SummaryBuilder] Failed to read gold baseline:`, error.message);
    return null;
  }
}

/**
 * 读取 Pending 状态
 *
 * @returns Pending State 或 null
 */
export function readPendingState(): PendingState | null {
  const pendingPath = path.join(process.cwd(), 'baseline/gold/pending.json');
  
  if (!fs.existsSync(pendingPath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(pendingPath, 'utf-8');
    return JSON.parse(content) as PendingState;
  } catch (error: any) {
    console.warn(`[SummaryBuilder] Failed to read pending state:`, error.message);
    return null;
  }
}

