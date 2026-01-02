/**
 * Meta Policy Types - M16.6 多项目跨学习类型定义
 *
 * 职责：
 * - 定义项目画像（ProjectProfile）
 * - 定义项目级偏置（MetaPolicyBias）
 * - 定义全局策略映射（MetaPolicy）
 */

/**
 * ProjectProfile - 项目画像
 *
 * 用于描述项目的基本特征，用于分桶和跨项目学习
 */
export interface ProjectProfile {
  /**
   * 题材
   * 示例：'cultivation_fantasy', 'romance_ceo', 'revenge_rebirth'
   */
  genre: string;

  /**
   * 总集数
   */
  totalEpisodes: number;

  /**
   * 平台（可选）
   * 示例：'hongguo', 'fanqie', 'custom'
   */
  platform?: string;

  /**
   * 风格标签（可选）
   * 示例：['爽文', '修仙', '甜宠']
   */
  styleTags?: string[];
}

/**
 * MetaPolicyBias - 项目级偏置（M16.6 核心输出）
 *
 * 从跨项目 Metrics 学习到的先验偏置，喂给 M16.5 Policy Engine
 */
export interface MetaPolicyBias {
  /**
   * Reveal 节奏偏置先验
   * - NORMAL: 标准节奏（约 20% SPIKE）
   * - SPIKE_UP: 提高 SPIKE 频率（约 40% SPIKE）
   * - SPIKE_DOWN: 降低 SPIKE 频率（约 10% SPIKE）
   */
  revealCadenceBiasPrior: 'NORMAL' | 'SPIKE_UP' | 'SPIKE_DOWN';

  /**
   * 最大 Slot 重试次数先验
   * 给 maxSlotRetries 一个先验值
   */
  retryBudgetPrior: 2 | 3 | 4;

  /**
   * 压力倍数先验
   * 范围：0.8 ~ 1.2
   */
  pressureMultiplierPrior: number;

  /**
   * 置信度
   * 范围：0 ~ 1
   * 样本数越多越高，低于 0.3 时不强行覆盖
   */
  confidence: number;

  /**
   * 推理依据
   * 为什么给这个偏置（人类可读）
   */
  rationale: string[];
}

/**
 * BucketStats - 桶统计信息
 *
 * 聚合后用于推导 Bias 的统计数据
 */
export interface BucketStats {
  /**
   * 样本数（运行次数）
   */
  sampleCount: number;

  /**
   * 平均健康评分
   */
  meanScore: number;

  /**
   * P95 重试次数
   */
  p95Retries: number;

  /**
   * 错误率
   * runsWithErrors / totalRuns
   */
  errorRate: number;

  /**
   * 平滑错误率（M16.6.1）
   * 使用 Beta 平滑：(runsWithErrors + 1) / (sampleCount + 2)
   * 防止样本少时 errorRate 暴涨到 100%
   */
  errorRateSmoothed: number;

  /**
   * SPIKE 占比
   * cadence.SPIKE / totalEpisodesObserved
   */
  spikeRatio: number;

  /**
   * 平均警告数量
   */
  avgWarnings: number;

  /**
   * 平均错误数量
   */
  avgErrors: number;
}

/**
 * MetaPolicy - 全局策略映射
 *
 * M16.6 的核心输出文件，存储在 meta/meta_policy.json
 */
export interface MetaPolicy {
  /**
   * 版本号
   */
  version: string;

  /**
   * 生成时间
   */
  generatedAt: string;

  /**
   * 桶映射
   * bucketKey → { bias, stats }
   */
  buckets: Record<string, {
    /**
     * 该桶的偏置
     */
    bias: MetaPolicyBias;

    /**
     * 该桶的统计信息
     */
    stats: BucketStats;
  }>;
}

/**
 * 集数分桶类型
 */
export type LengthBucket = 'SHORT' | 'MID' | 'LONG';

/**
 * MetricsRun - Metrics 运行记录（来自 metrics_pool/）
 */
export interface MetricsRun {
  runId: string;
  projectId: string;
  timestamp: string;
  range: { fromEpisode: number; toEpisode: number };
  episodes: any[];
  aggregates: {
    reveal: {
      typeCounts: Record<string, number>;
      typeTransitionsOk: boolean;
      cadence: Record<string, number>;
    };
    retry: {
      episodesWithRetry: number;
      avgRetries: number;
      p95Retries: number;
    };
    health: {
      warnings: string[];
      errors: string[];
      score: number;
    };
  };
}

