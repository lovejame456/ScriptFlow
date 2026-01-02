import fs from 'node:fs';
import path from 'node:path';
import { StructureContract } from '../ai/structurePlanner';
import { RevealType } from '../ai/revealScheduler';
// M16.5: 导入 AdaptiveParams 类型
import { AdaptiveParamsWithSource } from '../metrics/policyEngine';

type PressureVector = 'POWER' | 'RESOURCE' | 'STATUS' | 'RELATION' | 'LIFE_THREAT';

export interface EpisodeMetrics {
  episode: number;
  contract: {
    reveal: {
      required: boolean;
      type: RevealType;
      scope: 'PROTAGONIST' | 'ANTAGONIST' | 'WORLD';
      cadenceTag?: 'NORMAL' | 'SPIKE';
      noRepeatKey?: string;
    };
    pressure?: { vector?: PressureVector; hint?: string };
  };
  writer: {
    slotRetries: number;
    slotValidation: { passed: boolean; errors: string[] };
  };
  postSignals?: {
    revealIsConcrete?: boolean;
    revealHasConsequence?: boolean;
  };
}

export interface RunMetrics {
  runId: string;
  projectId: string;
  timestamp: string;
  range: { fromEpisode: number; toEpisode: number };
  episodes: EpisodeMetrics[];
  aggregates?: any;
  // M16.5: 自适应参数快照
  adaptiveParams?: AdaptiveParamsWithSource;
}

class MetricsCollector {
  private run: RunMetrics | null = null;

  startRun(args: { runId: string; projectId: string; fromEpisode: number; toEpisode: number }) {
    this.run = {
      runId: args.runId,
      projectId: args.projectId,
      timestamp: new Date().toISOString(),
      range: { fromEpisode: args.fromEpisode, toEpisode: args.toEpisode },
      episodes: []
    };
  }

  ensureRun() {
    if (!this.run) throw new Error('METRICS: run not started');
    return this.run;
  }

  upsertEpisode(ep: EpisodeMetrics) {
    const run = this.ensureRun();
    const idx = run.episodes.findIndex(e => e.episode === ep.episode);
    if (idx >= 0) run.episodes[idx] = { ...run.episodes[idx], ...ep };
    else run.episodes.push(ep);
    run.episodes.sort((a, b) => a.episode - b.episode);
  }

  recordContract(episode: number, contract: StructureContract) {
    this.upsertEpisode({
      episode,
      contract: {
        reveal: {
          required: contract.mustHave.newReveal.required,
          type: contract.mustHave.newReveal.type,
          scope: contract.mustHave.newReveal.scope,
          cadenceTag: (contract as any).mustHave?.newReveal?.cadenceTag,
          noRepeatKey: (contract as any).mustHave?.newReveal?.noRepeatKey
        },
        pressure: {
          vector: (contract as any).mustHave?.newReveal?.pressureVector,
          hint: (contract as any).mustHave?.newReveal?.pressureHint
        }
      },
      writer: { slotRetries: 0, slotValidation: { passed: true, errors: [] } }
    });
  }

  recordRetry(episode: number, slotRetries: number) {
    const run = this.ensureRun();
    const existing = run.episodes.find(e => e.episode === episode);
    if (!existing) {
      this.upsertEpisode({
        episode,
        contract: { reveal: { required: false, type: 'FACT' as any, scope: 'WORLD' as any } },
        writer: { slotRetries, slotValidation: { passed: true, errors: [] } }
      });
      return;
    }
    existing.writer.slotRetries = slotRetries;
  }

  recordSlotValidation(episode: number, passed: boolean, errors: string[]) {
    const run = this.ensureRun();
    const existing = run.episodes.find(e => e.episode === episode);
    if (!existing) return;
    existing.writer.slotValidation = { passed, errors };
  }

  recordPostSignals(episode: number, signals: { revealIsConcrete?: boolean; revealHasConsequence?: boolean }) {
    const run = this.ensureRun();
    const existing = run.episodes.find(e => e.episode === episode);
    if (!existing) return;
    existing.postSignals = { ...(existing.postSignals || {}), ...signals };
  }

  // M16.5: 记录自适应参数快照
  recordAdaptiveParams(adaptiveParams: AdaptiveParamsWithSource) {
    const run = this.ensureRun();
    run.adaptiveParams = adaptiveParams;
    console.log(`[Metrics] Recorded adaptive params:`, adaptiveParams);
  }

  finalizeAndWrite(outDir = 'reports') {
    const run = this.ensureRun();
    run.aggregates = computeAggregates(run);

    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, `m16_metrics_${run.runId}.json`);
    fs.writeFileSync(file, JSON.stringify(run, null, 2), 'utf-8');
    return { file, run };
  }
}

export const metrics = new MetricsCollector();

// --------- 聚合与预警规则（M16.4 PM规则） ----------
function computeAggregates(run: RunMetrics) {
  const typeCounts: Record<string, number> = { FACT: 0, INFO: 0, RELATION: 0, IDENTITY: 0 };
  const cadence: Record<string, number> = { NORMAL: 0, SPIKE: 0 };
  const vectorCounts: Record<string, number> = { POWER: 0, RESOURCE: 0, STATUS: 0, RELATION: 0, LIFE_THREAT: 0 };

  const types: string[] = [];
  let dup = 0;

  const warnings: string[] = [];
  const errors: string[] = [];

  // 连续重复 type 检查
  for (const ep of run.episodes) {
    const t = ep.contract.reveal.type;
    typeCounts[t] = (typeCounts[t] ?? 0) + 1;
    types.push(t);

    const tag = ep.contract.reveal.cadenceTag || 'NORMAL';
    cadence[tag] = (cadence[tag] ?? 0) + 1;

    const v = ep.contract.pressure?.vector;
    if (v) vectorCounts[v] = (vectorCounts[v] ?? 0) + 1;

    // 结构失败留痕
    if (!ep.writer.slotValidation.passed) {
      errors.push(`EP${ep.episode}: slotValidationFail=${ep.writer.slotValidation.errors.join('|')}`);
    }

    // post 信号弱（只警告）
    if (ep.postSignals) {
      if (ep.postSignals.revealIsConcrete === false) warnings.push(`EP${ep.episode}: reveal not concrete`);
      if (ep.postSignals.revealHasConsequence === false) warnings.push(`EP${ep.episode}: reveal no consequence`);
    }
  }

  let typeTransitionsOk = true;
  for (let i = 1; i < types.length; i++) {
    if (types[i] === types[i - 1]) typeTransitionsOk = false;
  }
  if (!typeTransitionsOk) errors.push('RevealType repeated in consecutive episodes');

  // 重试健康度
  const retries = run.episodes.map(e => e.writer.slotRetries || 0);
  const episodesWithRetry = retries.filter(r => r > 0).length;
  const avgRetries = retries.length ? retries.reduce((a, b) => a + b, 0) / retries.length : 0;
  const p95Retries = percentile(retries, 0.95);

  // PM 预警规则（可调）
  if (episodesWithRetry >= Math.ceil(run.episodes.length * 0.5)) warnings.push('High retry frequency: writer near structure boundary');
  if (p95Retries >= 2) warnings.push('p95 retries >= 2');

  const score = Math.max(0, 100 - errors.length * 20 - warnings.length * 5);

  return {
    reveal: {
      typeCounts,
      typeTransitionsOk,
      duplicatePrevented: dup,
      cadence
    },
    pressure: {
      vectorCounts,
      maxConsecutiveDrop: 0
    },
    retry: { episodesWithRetry, avgRetries, p95Retries },
    health: { warnings, errors, score },
    // M16.5: 自适应参数说明（如果存在）
    ...(run.adaptiveParams ? {
      adaptiveParams: {
        source: run.adaptiveParams.source,
        description: generateAdaptiveParamsDescription(run.adaptiveParams)
      }
    } : {})
  };
}

// M16.5: 生成自适应参数的人类可读描述
function generateAdaptiveParamsDescription(adaptiveParams: AdaptiveParamsWithSource): string {
  const parts: string[] = [];
  
  parts.push(`来源: ${adaptiveParams.source}`);
  parts.push(`Reveal节奏: ${adaptiveParams.revealCadenceBias}`);
  parts.push(`最大重试: ${adaptiveParams.maxSlotRetries}`);
  parts.push(`压力倍数: ${adaptiveParams.pressureMultiplier.toFixed(2)}`);
  
  // 解释策略
  if (adaptiveParams.revealCadenceBias === 'SPIKE_UP') {
    parts.push(`说明: 提高 SPIKE 频率以增强 Reveal 质量`);
  } else if (adaptiveParams.revealCadenceBias === 'SPIKE_DOWN') {
    parts.push(`说明: 降低 SPIKE 频率以控制节奏`);
  }
  
  if (adaptiveParams.maxSlotRetries > 3) {
    parts.push(`说明: 增加重试次数以修复结构问题`);
  }
  
  if (adaptiveParams.pressureMultiplier < 1.0) {
    parts.push(`说明: 降低压力以减少警告积累`);
  } else if (adaptiveParams.pressureMultiplier > 1.0) {
    parts.push(`说明: 增强压力以提高紧张感`);
  }
  
  return parts.join(' | ');
}

function percentile(nums: number[], p: number) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const idx = Math.floor((sorted.length - 1) * p);
  return sorted[idx];
}


