/**
 * Policy Engine - 策略引擎（M16.5）
 *
 * 职责：
 * - 根据 Metrics 自动推导 AdaptiveParams（自适应参数）
 * - 实现从"指标"到"决策"的闭环优化
 * - 遵循三条铁律：指标→决策，决策→参数，参数→生成
 *
 * 原则：
 * - 失败优于兜底：宁可使用默认参数，也不产生误导性决策
 * - 策略可解释：每个参数调整都有明确的触发条件
 * - 铁律不可变：策略规则固定，不随项目变化
 */

import { AdaptiveParams } from '../../types';
import { MetaPolicyBias } from './metaTypes';

/**
 * 自适应策略输入
 * 
 * 从 Metrics aggregates 中提取的关键指标
 */
export interface AdaptivePolicyInput {
  /**
   * 健康评分（0-100）
   * 来自 aggregates.health.score
   */
  score: number;
  
  /**
   * 重试统计
   * 来自 aggregates.retry
   */
  retry: {
    avgRetries: number;
    p95Retries: number;
  };
  
  /**
   * 警告列表
   * 来自 aggregates.health.warnings
   */
  warnings: string[];
  
  /**
   * 错误列表
   * 来自 aggregates.health.errors
   */
  errors: string[];
}

/**
 * 策略参数来源
 */
export type ParamSource = 'baseline' | 'last_run' | 'meta_policy' | 'default';

/**
 * 策略引擎输出
 */
export interface AdaptiveParamsWithSource extends AdaptiveParams {
  /**
   * 参数来源
   * - baseline: 从 baseline metrics 推导
   * - last_run: 从最后一次运行 metrics 推导
   * - default: 使用默认参数（无 metrics 可用）
   */
  source: ParamSource;
}

/**
 * 默认自适应参数
 */
const DEFAULT_PARAMS: AdaptiveParams = {
  revealCadenceBias: 'NORMAL',
  maxSlotRetries: 3,
  pressureMultiplier: 1.0
};

/**
 * 根据策略输入推导自适应参数
 *
 * M16.5 策略规则（按优先级）：
 *
 * 1. 高重试/低分策略：
 *    - score < 60 或 p95Retries >= 2
 *    - revealCadenceBias: 'SPIKE_UP'（增加 SPIKE 频率，提高 Reveal 质量）
 *    - maxSlotRetries: 4（增加重试机会）
 *    - pressureMultiplier: 0.9（降低压力，避免 Writer 过载）
 *
 * 2. 结构错误策略：
 *    - errors.length > 0
 *    - maxSlotRetries: 4（增加重试，修复结构问题）
 *
 * 3. 警告积累策略：
 *    - warnings.length >= 3
 *    - pressureMultiplier: 0.85（降低压力，减少警告）
 *
 * 4. 默认策略：
 *    - revealCadenceBias: 'NORMAL'
 *    - maxSlotRetries: 3
 *    - pressureMultiplier: 1.0
 *
 * M16.6 增强：支持 Meta-Priority Bias（先验偏置）
 *    - 如果 metaBias.confidence >= 0.3，则与状态修正合并
 *    - 合并逻辑：先验 + 状态修正，保留边界
 *
 * @param input - 策略输入
 * @param metaBias - M16.6 元策略偏置（可选）
 * @returns AdaptiveParams - 自适应参数
 */
export function deriveAdaptiveParams(
  input: AdaptivePolicyInput,
  metaBias?: MetaPolicyBias
): AdaptiveParams {
  // 1. 先计算状态修正（M16.5 原有逻辑）
  let revealCadenceBias: AdaptiveParams['revealCadenceBias'] = 'NORMAL';
  let maxSlotRetries = 3;
  let pressureMultiplier = 1.0;

  // 规则 1: 高重试/低分策略
  if (input.score < 60 || input.retry.p95Retries >= 2) {
    console.log(`[PolicyEngine] Rule 1 triggered: score=${input.score}, p95Retries=${input.retry.p95Retries}`);
    revealCadenceBias = 'SPIKE_UP';
    maxSlotRetries = 4;
    pressureMultiplier = 0.9;
  }

  // 规则 2: 结构错误策略
  if (input.errors.length > 0) {
    console.log(`[PolicyEngine] Rule 2 triggered: ${input.errors.length} errors`);
    maxSlotRetries = 4;
  }

  // 规则 3: 警告积累策略
  if (input.warnings.length >= 3) {
    console.log(`[PolicyEngine] Rule 3 triggered: ${input.warnings.length} warnings`);
    pressureMultiplier = 0.85;
  }

  const stateBasedParams: AdaptiveParams = {
    revealCadenceBias,
    maxSlotRetries,
    pressureMultiplier
  };

  console.log(`[PolicyEngine] State-based adaptive params:`, stateBasedParams);

  // 2. 合并 Meta Bias（M16.6 先验）
  if (metaBias && metaBias.confidence >= 0.3) {
    const mergedParams = mergeWithMetaBias(stateBasedParams, metaBias);
    console.log(`[PolicyEngine] Merged with meta bias:`, mergedParams);
    console.log(`[PolicyEngine] Meta bias rationale:`, metaBias.rationale);
    return mergedParams;
  }

  return stateBasedParams;
}

/**
 * 合并状态修正参数与 Meta Bias
 *
 * 合并逻辑：先验 + 状态修正，保留边界
 *
 * @param stateParams - 状态修正参数（M16.5）
 * @param metaBias - 元策略偏置（M16.6）
 * @returns AdaptiveParams - 合并后的参数
 */
function mergeWithMetaBias(
  stateParams: AdaptiveParams,
  metaBias: MetaPolicyBias
): AdaptiveParams {
  const merged: AdaptiveParams = {
    // Reveal 偏置：优先使用 metaBias，除非状态修正有明确需求
    revealCadenceBias: metaBias.revealCadenceBiasPrior,

    // 重试预算：取两者较大值（更保守，提高成功率）
    maxSlotRetries: Math.max(stateParams.maxSlotRetries, metaBias.retryBudgetPrior) as 2 | 3 | 4,

    // 压力倍数：加权平均（0.6 * metaBias + 0.4 * stateParams）
    // 保留边界：0.8 ~ 1.2
    pressureMultiplier: Math.max(0.8, Math.min(1.2,
      0.6 * metaBias.pressureMultiplierPrior + 0.4 * stateParams.pressureMultiplier
    ))
  };

  console.log(`[PolicyEngine] Merged params:`, {
    revealCadenceBias: {
      meta: metaBias.revealCadenceBiasPrior,
      state: stateParams.revealCadenceBias,
      merged: merged.revealCadenceBias
    },
    maxSlotRetries: {
      meta: metaBias.retryBudgetPrior,
      state: stateParams.maxSlotRetries,
      merged: merged.maxSlotRetries
    },
    pressureMultiplier: {
      meta: metaBias.pressureMultiplierPrior,
      state: stateParams.pressureMultiplier,
      merged: merged.pressureMultiplier
    }
  });

  return merged;
}

/**
 * 从 Metrics JSON 提取策略输入
 * 
 * @param metricsJson - Metrics JSON 对象（M16.4 RunMetrics）
 * @returns AdaptivePolicyInput | null - 策略输入，如果数据不完整则返回 null
 */
export function extractPolicyInput(metricsJson: any): AdaptivePolicyInput | null {
  try {
    if (!metricsJson || !metricsJson.aggregates) {
      console.warn('[PolicyEngine] Metrics JSON missing aggregates');
      return null;
    }

    const { aggregates } = metricsJson;
    const { health, retry } = aggregates;

    if (!health || !retry) {
      console.warn('[PolicyEngine] Metrics aggregates missing health or retry');
      return null;
    }

    const input: AdaptivePolicyInput = {
      score: health.score ?? 100,
      retry: {
        avgRetries: retry.avgRetries ?? 0,
        p95Retries: retry.p95Retries ?? 0
      },
      warnings: health.warnings ?? [],
      errors: health.errors ?? []
    };

    console.log(`[PolicyEngine] Extracted policy input:`, {
      score: input.score,
      avgRetries: input.retry.avgRetries,
      p95Retries: input.retry.p95Retries,
      warningsCount: input.warnings.length,
      errorsCount: input.errors.length
    });

    return input;
  } catch (error) {
    console.error('[PolicyEngine] Failed to extract policy input:', error);
    return null;
  }
}

/**
 * 获取默认自适应参数（带来源标记）
 * 
 * @returns AdaptiveParamsWithSource - 默认参数
 */
export function getDefaultParams(): AdaptiveParamsWithSource {
  return {
    ...DEFAULT_PARAMS,
    source: 'default'
  };
}

/**
 * 创建自适应参数快照（用于 Metrics 记录）
 * 
 * @param params - 自适应参数
 * @param source - 参数来源
 * @returns 自适应参数快照
 */
export function createAdaptiveParamsSnapshot(
  params: AdaptiveParams,
  source: ParamSource
): AdaptiveParamsWithSource {
  return {
    ...params,
    source
  };
}

