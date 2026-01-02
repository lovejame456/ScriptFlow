import type { PlatformId } from './platform';

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  CREATE = 'CREATE',
  PROJECT = 'PROJECT',
  OUTLINE = 'OUTLINE',
  EPISODES = 'EPISODES',
  WORKSPACE = 'WORKSPACE',
  EXPORT = 'EXPORT',
  PRODUCTION = 'PRODUCTION',
  CHARACTERS = 'CHARACTERS'
}

export enum EpisodeStatus {
  PENDING = '待生成',
  GENERATING = '正在生成本集剧情…',
  DRAFT = '剧本已生成，可立即阅读',
  COMPLETED = '已通过商业校验',
  FAILED = '失败',
  PASS = 'PASS',
  MANUAL_OVERRIDE = '人工接管'
}

export type GenreType = string;

export type RoleType = 'PROTAGONIST' | 'ANTAGONIST' | 'SUPPORT';
type VillainTier = 'LOW' | 'MID' | 'HIGH'; // 内部使用,不导出

// --- Story Memory & Bible (The Immutable Core) ---

export interface CanonEvent {
  id: string;
  description: string;
  episodeIndex?: number;
}

export interface ProjectBible {
  canonRules: {
    worldSetting: string;
    coreRules: string[];
    powerOrWealthSystem: string;
    forbiddenChanges: string[];
  };
  keyEvents: CanonEvent[];
}

export interface CharacterState {
  identity: string;
  goal: string;
  relationships: Record<string, string>;
  secretsKnown: string[];
  secretsHidden: string[];
}

// --- 角色详细结构 (M6-1: 角色系统强化) ---

export interface CharacterBackground {
  origin: string;                    // 出身环境
  keyExperience: string[];          // 关键成长经历
  lifeStage: '上升期' | '停滞期' | '下滑期';  // 人生阶段
}

export interface PersonalityDetail {
  external: string;                  // 对外呈现的性格
  internal: string;                  // 内在真实性格
  decisionPattern: string;           // 决策习惯
}

export interface CoreMotivationDetail {
  desire: string;                    // 当前最想得到的东西
  fear: string;                      // 最害怕失去的东西
  price: string;                     // 愿意付出的代价
}

export interface CoreWeaknessDetail {
  fatalFlaw: string;                 // 性格或认知上的致命问题
  storyTrigger: string;              // 在剧情中最容易被击中的软肋
}

export interface RelationToProtagonistDetail {
  origin: string;                    // 与主角的关系来源
  currentConflict: string;           // 当前冲突点
  escalationTrend: string;           // 未来冲突升级方向
}

export interface CommercialFunctionDetail {
  storyFunction: string;             // 该角色在剧情中的功能
  pleasureType: ('背叛' | '羞辱' | '压制' | '反转' | '清算' | '打脸')[];  // 主要承担的爽点类型
}

// --- 仇恨链结构 (M6-1: 冲突控制) ---

export interface ConflictStageSpec {
  stageIndex: number;
  mainAntagonist: string;
  conflictSource: string;           // 仇恨或压迫的具体来源
  pressureMethod: string;            // 对主角施加压力的方式
  protagonistState: '被动承受' | '被迫反击' | '主动进攻';
  resolutionType: '小胜' | '反转失败' | '阶段性清算';
  // M6-2: 模板新增字段
  mainAntagonistType?: string;       // 反派类型（如"低阶压迫者"）
  requiredPleasure?: string[];       // 必须产出的爽点类型
}

// M6-2: 仇恨链模板接口（前端适配）
export interface ConflictTemplate {
  genre: string;
  stages: ConflictStageSpec[];
}

export interface ConflictChain {
  stages: ConflictStageSpec[];
}

// --- 角色出场权重计划 (M6-1: 出场控制) ---

export interface CharacterFunctionEpisode {
  episodeRange: string;             // "1-10" 格式
  function: '施压' | '反转触发' | '关系破裂' | '身份揭露' | '清算对象';
}

export interface CharacterPresenceRole {
  name: string;
  roleType: RoleType;
  appearanceWeight: number;          // 出场权重 0-1, 主角通常 >=0.6
  mainFunctionEpisodes: CharacterFunctionEpisode[];
}

export interface CharacterPresencePlan {
  totalEpisodes: number;
  roles: CharacterPresenceRole[];
}

// --- 主 Character 接口 (向后兼容) ---

export interface Character {
  id: string;
  name: string;
  gender: string;
  ageRange: string;
  socialIdentity: string;

  // 简单字段 (向后兼容)
  personality: string;
  motivation: string;
  coreDesire: string;
  coreWeakness: string;
  relationshipToProtagonist: string;
  plotFunction: string;

  // 详细结构字段 (M6-1 新增, 可选)
  background?: CharacterBackground;
  personalityDetail?: PersonalityDetail;
  coreMotivationDetail?: CoreMotivationDetail;
  coreWeaknessDetail?: CoreWeaknessDetail;
  relationToProtagonistDetail?: RelationToProtagonistDetail;
  commercialFunctionDetail?: CommercialFunctionDetail;

  roleType: RoleType;
  tier?: VillainTier;       // 内部保留,前端不显示
  description: string;
  status: CharacterState;
}

export interface CanonLayer {
  worldRules: string[];
  lockedEvents: CanonEvent[];
  deadCharacters: string[];
}

export interface CharacterLayer {
  states: Record<string, CharacterState>;
}

export interface PlotProgressLayer {
  lockedEvents: string[];
  ongoingConflicts: string[];
  foreshadowedEvents: string[];
  stallCounter?: number;
  lastProgressEpisodeIndex?: number;
}

export interface StoryMemory {
  canonLayer: CanonLayer;
  characterLayer: CharacterLayer;
  plotLayer: PlotProgressLayer;
}

// --- M12: Narrative State ---

/**
 * Narrative State（叙事状态机）
 * 这是 Skeleton 的运行态投影,后续所有 Agent 必须基于此做受控推进
 * 而非"重新想象"世界观、角色、冲突
 */
export interface NarrativeState {
  /**
   * 角色状态映射
   * 键为角色名,值为角色的初始状态
   */
  characters: Record<string, {
    role: 'PROTAGONIST' | 'ANTAGONIST' | 'SUPPORT' | 'PRESSURE';
    goal: string;       // 目标
    flaw: string;       // 导致反复失败的内在缺陷
    relationship: string; // 与其他角色的关系
    status: 'unresolved'; // 初始状态为未解决
  }>;
  /**
   * 三层冲突梯度
   * 只允许按 IMMEDIATE -> MID_TERM -> END_GAME 的顺序解锁
   */
  conflicts: {
    immediate: { description: string; status: 'active' };   // 当前必须立刻解决的危机
    mid_term: { description: string; status: 'locked' };    // 推动剧情升级的对抗（初始锁定）
    end_game: { description: string; status: 'locked' };      // 最终不可回避的核心矛盾（初始锁定）
  };
  /**
   * 世界观规则
   * immutable: 不可变规则（来自 Skeleton）
   * violated: 已违反的规则列表（后续用于校验）
   */
  worldRules: {
    immutable: string[];
    violated: string[];
  };
  /**
   * 当前叙事阶段
   * 用于限制 Agent 的行为范围
   */
  phase: 'EP1' | 'EP2' | 'EP3+';
}

/**
 * StateDelta - 状态变更提案（M12.2）
 * Writer 输出的状态变化提议，需通过 Aligner 校验后才能合并
 */
export interface StateDelta {
  /**
   * 冲突状态变更
   * 只允许按层级顺序解锁：active -> resolved
   */
  conflicts?: {
    immediate?: { status?: 'active' | 'resolved' };
    mid_term?: { status?: 'locked' | 'active' | 'resolved' };
    end_game?: { status?: 'locked' | 'active' | 'resolved' };
  };
  /**
   * 角色状态变更
   * 仅允许修改 status 字段
   */
  characters?: Record<string, {
    status?: 'unresolved' | 'injured' | 'compromised' | 'resolved';
  }>;
  /**
   * 世界观违规记录（只读，不允许修改 immutable）
   * 仅用于记录违反 immutable 规则的情况
   */
  worldRuleViolations?: string[];  // 记录违反的世界规则
}

/**
 * EpisodeFacts - 连续性事实层（M12.3）
 * 每集输出的极短、可校验的"事实记忆"，供后续集引用，解决忘事/矛盾
 */
export interface EpisodeFacts {
  /**
   * 关键事件
   * 示例："主角在雨夜与反派发生第一次正面冲突"
   */
  events: string[];
  /**
   * 揭示/秘密揭晓
   * 示例："主角发现自己有特殊能力"
   */
  reveals: string[];
  /**
   * 关键道具/线索
   * 示例："获得反派遗落的神秘手机"
   */
  items: string[];
  /**
   * 角色受伤状态
   * 示例："主角右臂被划伤，轻伤"
   */
  injuries: string[];
  /**
   * 承诺/誓言
   * 示例："发誓一定要查清真相"
   */
  promises: string[];
}

/**
 * EpisodeFactsRecord - 连续性事实记录
 * 按集数索引保存的所有 facts
 */
export interface EpisodeFactsRecord {
  episodeIndex: number;
  facts: EpisodeFacts;
}

/**
 * RevealHistory - Reveal 历史记录（M16.3）
 *
 * 用于记录每集的 Reveal 信息，支持类型轮换和去重
 */
export interface RevealHistory {
  episode: number;
  type: 'FACT' | 'INFO' | 'RELATION' | 'IDENTITY';
  scope: string;
  summary: string;
  noRepeatKey: string;
}

/**
 * Quality Signals - 质量信号（M13）
 * 标记每一集的结构性质量特征，不影响生成，仅用于后续分析
 */
export interface QualitySignals {
  /** 是否推进冲突层级 */
  conflictProgressed: boolean;
  /** 角色是否付出代价 */
  costPaid: boolean;
  /** 是否复用历史 facts */
  factReused: boolean;
  /** 是否产生新的 reveal */
  newReveal: boolean;
  /** 是否回应历史 promise */
  promiseAddressed: boolean;
  /** 是否通过所有状态/事实校验 */
  stateCoherent: boolean;
}

/**
 * Signals Summary - 质量信号聚合（M14.1）
 * 聚合同一 Project / Run 的质量信号统计信息
 */
export interface SignalsSummary {
  /** 总集数 */
  totalEpisodes: number;
  /** 每个 signal 的命中次数 */
  signalHitCount: {
    conflictProgressed: number;
    costPaid: number;
    factReused: number;
    newReveal: number;
    promiseAddressed: number;
    stateCoherent: number;
  };
  /** 每个 signal 的命中率 (0-1) */
  signalHitRate: {
    conflictProgressed: number;
    costPaid: number;
    factReused: number;
    newReveal: number;
    promiseAddressed: number;
    stateCoherent: number;
  };
  /** 每集命中的 signal 数量 */
  perEpisodeSignals: {
    episodeIndex: number;
    hitCount: number;  // 0-6
    signals: QualitySignals;  // 原始信号
  }[];
}

/**
 * Quality Pattern - 质量结构模式（M14.2）
 * 表示高质量内容中常见的信号组合模式（pair/triple）
 */
export interface QualityPattern {
  /** 模式标识，例如 "conflictProgressed+costPaid" */
  patternKey: string;
  /** 模式大小：2=pair，3=triple */
  size: 2 | 3;
  /** 出现次数 */
  occurrenceCount: number;
  /** 在高质量集中出现比例 (0-1) */
  highQualityCoverage: number;
  /** 命中 signal 的平均数量 */
  averageHitCount: number;
  /** 人类可读解释 */
  description: string;
}

/**
 * Pattern Discovery Result - 模式发现结果（M14.2）
 * 包含高质量模式、缺失信号警示和人类可读洞察
 */
export interface PatternDiscoveryResult {
  /** 高质量集常见模式（按高质量覆盖率降序） */
  highQualityPatterns: QualityPattern[];
  /** 缺失信号警示（低质量集中缺失率高的信号） */
  missingSignalsWarnings: {
    signalName: string;
    missingRate: number;  // 在低质量集中的缺失率 (0-1)
    description: string;
  }[];
  /** 人类可读洞察（2-5条） */
  insights: string[];
}

/**
 * Structure Playbook - 结构打法卡（M14.3）
 * 人类可读的结构打法建议，供策划/编剧/产品决策使用
 */
export interface StructurePlaybook {
  /** 打法卡标题 */
  title: string;
  /** 适用集数范围 */
  applicableEpisodes: string;
  /** 核心规则（2-4条） */
  coreRules: string[];
  /** 常见风险（2-3条） */
  commonPitfalls: string[];
  /** 基于的模式（patternKey） */
  basedOnPatterns?: string[];
  /** 基于的信号（signalName） */
  basedOnSignals?: string[];
  /** 打法类型 */
  playbookType: 'quality' | 'fix';
}

/**
 * Structure Playbooks Result - 结构打法卡生成结果（M14.3）
 */
export interface StructurePlaybooksResult {
  /** 生成的打法卡列表（2-4张） */
  playbooks: StructurePlaybook[];
  /** 生成摘要 */
  summary: string;
}

// --- M15: Production & Validation 真实生产验证 ---

/**
 * M15.1 生产验证报告
 *
 * 用于验证 Structure Playbooks 是否能在真实生产中稳定提升内容质量
 */
export interface M15ProductionReport {
  testId: string;
  timestamp: string;
  projectId: string;
  model: string;

  // 基本信息
  summary: {
    totalEpisodes: number;
    successfulEpisodes: number;
    failedEpisodes: number;
    totalDuration: number;
  };

  // 质量指标（5个核心指标）
  qualityMetrics: {
    avgHitCount: number;
    highQualityEpisodes: number;  // hitCount >= 4
    highQualityRate: number;      // proportion of high quality episodes
    lowQualityEpisodes: number;   // hitCount <= 1
    lowQualityRate: number;       // proportion of low quality episodes
    promiseAddressedHitRate: number;
    conflictProgressedHitRate: number;
    newRevealHitRate: number;
    factReusedHitRate: number;
  };

  // 打法卡执行情况
  playbooks: StructurePlaybook[];
  playbookEffectiveness: {
    playbookIndex: number;
    playbookTitle: string;
    targetEpisodes: number[];  // 主攻集数
    executionQuality: 'high' | 'medium' | 'low';
    observations: string[];
  }[];

  // 质量趋势
  signalsTrend: {
    episodeIndex: number;
    hitCount: number;
    signals: QualitySignals;
  }[];

  // Pattern 稳定性
  patternStability: {
    patternKey: string;
    occurrenceCount: number;
    highQualityCoverage: number;
    isStable: boolean;
  }[];

  // 人类可执行性评估
  humanUsability: {
    playbookClarity: number;  // 1-5评分
    decisionSupport: boolean;
    easeOfUse: 'very_easy' | 'easy' | 'moderate' | 'hard';
    feedback: string[];
  };

  // 总结与建议
  summaryAndRecommendations: {
    overallEffectiveness: 'highly_effective' | 'effective' | 'needs_adjustment' | 'ineffective';
    keyFindings: string[];
    nextActions: string[];
    suggestedDecision: 'continue' | 'adjust_density' | 'adjust_intensity' | 'change_fix';
  };

  // 剧集详情
  episodeResults: EpisodeTestResult[];

  // 信号聚合
  signalsSummary?: SignalsSummary;

  // 模式发现
  patternDiscovery?: PatternDiscoveryResult;
}

/**
 * M15.1 剧集测试结果（简化版，与E2E测试兼容）
 */
export interface EpisodeTestResult {
  episodeIndex: number;
  status: EpisodeStatus;
  contentLength: number;
  qualityPassed: boolean;
  alignerPassed: boolean;
  qualitySignals?: QualitySignals;
  metrics?: {
    totalTime: number;
    llm_ms?: number;
    validate_ms?: number;
    align_ms?: number;
    save_ms?: number;
  };
  error?: string;
  warnings: string[];
}

// --- M10: Skeleton & Enrich 结构 ---

/**
 * Bible Skeleton 结构（快速生成版本）
 * 用于 EP1 Phase1 快速首屏,不阻塞生成
 */
export interface BibleSkeleton {
  variant: 'SKELETON';
  logline: string;  // 因果句式：当【主角处境】时，因为【触发事件】，被迫【核心行动】，从而引发【长期冲突】
  genre: string;    // 题材
  audience: string; // 目标受众
  episodePlan: string; // 集数计划（简短描述）
  worldRules: string[];  // 3-5条世界观规则
  characterPoolLite: Array<{
    name: string;
    role: 'PROTAGONIST' | 'ANTAGONIST' | 'SUPPORT' | 'PRESSURE';
    goal: string;
    flaw: string;
    relationship: string;
  }>;  // <=8人,每人name/role/goal/flaw/relationship
  coreConflicts: Array<{
    level: 'IMMEDIATE' | 'MID_TERM' | 'END_GAME';
    description: string;
  }>;  // 三层冲突梯度
  toneStyle: string;  // 基调风格
  hookPayModel: string;  // 爽点模式
  forbidden: string[];  // 硬约束：禁止【具体行为 / 具体剧情走向 / 具体风格】
}

/**
 * Outline Skeleton 结构（快速生成版本）
 * 用于 EP1 Phase1 快速首屏,不阻塞生成
 */
export interface OutlineSkeleton {
  variant: 'SKELETON';
  acts: Array<{
    act: number;
    beats: string[];  // 每幕 3-5个 beats（短句）
  }>;  // 3或4幕
}

// --- Episodes & Outline ---

/**
 * 冲突阶段枚举
 * 用于 Outline 生成时声明本集的冲突阶段类型
 */
export enum ConflictStage {
  PASSIVE_ENDURE = 'PASSIVE_ENDURE',        // 被动承受
  MAIN_CONFLICT_PUSH = 'MAIN_CONFLICT_PUSH', // 推进主线冲突
  ACTIVE_CHOICE = 'ACTIVE_CHOICE',           // 主动选择
  POWER_SHIFT = 'POWER_SHIFT',               // 地位/力量变化
  REVERSAL = 'REVERSAL',                     // 反转
  CLIFFHANGER = 'CLIFFHANGER'                // 悬念升级
}

export interface EpisodeOutline {
  episodeIndex: number;
  summary: string;
  conflict: string;
  highlight: string;
  hook: string;
  act: number;
  conflictStage?: ConflictStage; // 冲突阶段（可选字段，用于向后兼容）
}

export interface ValidationResult {
  fastCheck: {
    passed: boolean;
    errors: string[];
  };
  qualityCheck: {
    passed: boolean;
    issues: string[];
  };
  attempt?: number;
}

export interface AlignmentResult {
  passed: boolean;
  severity: "PASS" | "WARN" | "FAIL";
  issues: { code: string; message: string }[];
  editorNotes: string[];
}

export interface Episode {
  id: number;
  episodeIndex: number;
  status: EpisodeStatus;
  title: string;
  outline: EpisodeOutline;
  content: string;
  summary?: string;
  highlight?: string;
  hook?: string;
  act?: number;
  validation?: ValidationResult;
  alignment?: AlignmentResult;
  stateDelta?: StateDelta;  // M12.2: 状态变更提案
  episodeFacts?: EpisodeFacts;  // M12.3: 连续性事实
  qualitySignals?: QualitySignals;  // M13: 质量信号（生成后计算）
  humanSummary?: string;
  importance?: "KEY" | "NORMAL";
  importanceReason?: string;
  enhanceRetryCount?: number;
  maxRetryCount?: number;
  metadata?: {
    phase?: number;
    needsEnhance?: boolean;
    enhanced?: boolean;
    enhanceError?: string;
  };
}

// --- Pacing Templates ---

export interface PacingAct {
  act: number;
  range: [number, number];
  goal: string;
}

export interface PacingTemplate {
  id: string;
  name: string;
  episodeRange: [number, number];
  acts: PacingAct[];
  hardRules: string[];
}

// --- Project ---

export interface CostStats {
  estimatedTotalCost: number;
  actualCost: number;
}

export interface Project {
  id: string;
  name: string;
  genre: GenreType;
  logline: string;        // 保留: 一句话卖点
  synopsis: string;        // 新增: 剧情总纲(800-1500字)
  audience: string;
  totalEpisodes: number;
  pacingTemplateId: string;
  bible: ProjectBible;
  characters: Character[];
  episodes: Episode[];
  storyMemory: StoryMemory;
  costStats: CostStats;
  stability: number;
  createdAt: string;
  updatedAt: string;
  platformId?: PlatformId; // M5-1: 平台 ID，默认 'generic'
  conflictChain?: ConflictChain;  // M6-1: 仇恨链 (可选)
  characterPresencePlan?: CharacterPresencePlan;  // M6-1: 角色出场权重 (可选)
  charactersProfileMarkdown?: string;  // 🆕 商业角色小传(可选)
  storyOverviewMarkdown?: string;       // 🆕 投稿级剧情总纲(可选)
  bibleSkeleton?: BibleSkeleton;  // M10: Bible Skeleton (快速版本)
  outlineSkeleton?: OutlineSkeleton;  // M10: Outline Skeleton (快速版本)
  narrativeState?: NarrativeState;  // M12: 叙事状态机 (可选)
  episodeFactsHistory?: EpisodeFactsRecord[];  // M12.3: 连续性事实历史 (可选)
  revealHistory?: RevealHistory[];  // M16.3: Reveal 历史记录 (可选)
}

export interface ProjectSeed {
  name: string;
  genre: GenreType;
  audience: string;
  totalEpisodes: number;
  pacingTemplateId: string;
  logline: string;
  synopsis?: string;
}

export const PACING_TEMPLATES: Record<string, PacingTemplate> = {
  'romance_ceo': {
    id: 'romance_ceo',
    name: '甜宠 / 霸总',
    episodeRange: [60, 120],
    acts: [
      { act: 1, range: [1, 10], goal: '相遇 + 误会 + 初甜' },
      { act: 2, range: [11, 30], goal: '感情升温 + 阻碍' },
      { act: 3, range: [31, 60], goal: '身份 / 阶级冲突爆发' },
      { act: 4, range: [61, 120], goal: '终极对立 + 情感收束' }
    ],
    hardRules: [
      '每3集必须有情绪爽点',
      '每10集必须有关系质变',
      '禁止长时间无互动'
    ]
  },
  'revenge_rebirth': {
    id: 'revenge_rebirth',
    name: '复仇 / 重生',
    episodeRange: [80, 150],
    acts: [
      { act: 1, range: [1, 10], goal: '重生 / 觉醒 / 立誓' },
      { act: 2, range: [11, 40], goal: '低阶反派逐个清算' },
      { act: 3, range: [41, 90], goal: '中阶反派 + 阴谋反噬' },
      { act: 4, range: [91, 150], goal: '终极反派 + 因果清算' }
    ],
    hardRules: [
      '每5集必须打脸一次',
      '反派必须阶梯式升级',
      '主角不可无意义受挫'
    ]
  },
  'cultivation_fantasy': {
    id: 'cultivation_fantasy',
    name: '穿越 / 修仙 / 玄幻',
    episodeRange: [80, 180],
    acts: [
      { act: 1, range: [1, 15], goal: '废柴开局 + 规则认知' },
      { act: 2, range: [16, 50], goal: '成长 + 小世界突破' },
      { act: 3, range: [51, 120], goal: '大世界冲突 + 势力博弈' },
      { act: 4, range: [121, 180], goal: '终极体系对抗' }
    ],
    hardRules: [
      '每阶段必须有境界或资源跃迁',
      '禁止刷副本不成长'
    ]
  },
  'urban_concept': {
    id: 'urban_concept',
    name: '都市脑洞',
    episodeRange: [40, 80],
    acts: [
      { act: 1, range: [1, 8], goal: '能力出现 + 试探' },
      { act: 2, range: [9, 30], goal: '能力变现 / 风险扩大' },
      { act: 3, range: [31, 80], goal: '能力反噬 / 抉择' }
    ],
    hardRules: [
      '能力必须有代价',
      '每5集制造新变量'
    ]
  },
  'urban_wealth': {
    id: 'urban_wealth',
    name: '都市财富 / 神豪',
    episodeRange: [60, 120],
    acts: [
      { act: 1, range: [1, 15], goal: '逆袭觉醒 + 初露锋芒' },
      { act: 2, range: [16, 45], goal: '资本积累 + 对抗升级' },
      { act: 3, range: [46, 90], goal: '财富碾压 + 身份反转' },
      { act: 4, range: [91, 120], goal: '终极碾压 + 地位确立' }
    ],
    hardRules: [
      '每5集必须有打脸',
      '每10集必须有阶级反转',
      '金钱必须是核心冲突载体'
    ]
  }
};

// --- Batch Runner (M3-3) ---

export type BatchStatus = "IDLE" | "RUNNING" | "PAUSED" | "FAILED" | "DONE";

// --- M16.5: Adaptive Params（自适应参数） ---

/**
 * AdaptiveParams - 自适应参数（M16.5）
 * 
 * 由策略引擎根据 Metrics 自动生成，用于动态调整生成行为
 */
export interface AdaptiveParams {
  /**
   * Reveal 节奏偏置
   * - NORMAL: 标准节奏（约 20% SPIKE）
   * - SPIKE_UP: 提高 SPIKE 频率（约 40% SPIKE）
   * - SPIKE_DOWN: 降低 SPIKE 频率（约 10% SPIKE）
   */
  revealCadenceBias: 'NORMAL' | 'SPIKE_UP' | 'SPIKE_DOWN';
  
  /**
   * 最大 Slot 重试次数
   * - 默认: 3
   * - 自适应: 可能提高到 4（当 score < 60 或 errors > 0）
   */
  maxSlotRetries: number;
  
  /**
   * 压力倍数
   * - 默认: 1.0
   * - 0.8-0.9: 降低压力（warnings 较多时）
   * - 1.0-1.2: 标准/增强压力
   */
  pressureMultiplier: number;
}

export interface BatchState {
  projectId: string;
  status: BatchStatus;
  startEpisode: number;
  endEpisode: number;
  currentEpisode: number;
  completed: number[];
  failed: number[];
  hardFailCount: number;
  lastError?: string;
  updatedAt: number;
  health?: "HEALTHY" | "WARNING" | "RISKY";
  // M16.5: 自适应参数快照
  adaptiveParams?: AdaptiveParams;
}

export interface EpisodeAttemptLog {
  projectId: string;
  episodeIndex: number;
  attempt: number;
  error: string;
  invariantErrors?: string[];
  pacingContext?: any;
  timestamp: number;
  alignerResult?: {
    severity: "PASS" | "WARN" | "FAIL";
    issues: { code: string; message: string }[];
    editorNotes: string[];
  };
  humanSummary?: string;
}

// --- Generation Task (M4-1) ---

export type GenerationTaskStatus =
  "IDLE" | "RUNNING" | "PAUSED" | "FAILED" | "DONE";

export type GenerationStep =
  "SEED" | "BIBLE" | "OUTLINE" | "EPISODE";

export interface GenerationTask {
  taskId: string;
  projectId: string;
  status: GenerationTaskStatus;
  step: GenerationStep;
  currentEpisode?: number;
  totalEpisodes: number;
  lastError?: string;
  updatedAt: number;
}

// --- EnhanceEpisodeTask（后台增强任务） ---

export type EnhanceEpisodeTaskStatus = "RUNNING" | "QUEUED" | "FAILED" | "COMPLETED";

export interface EnhanceEpisodeTask {
  taskId: string;
  projectId: string;
  episodeIndex: number;
  status: EnhanceEpisodeTaskStatus;
  retryCount: number;
  maxRetryCount: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  updatedAt: number;
}

// --- M10: EnrichBibleTask & EnrichOutlineTask ---

export type EnrichBibleTaskStatus = "RUNNING" | "QUEUED" | "FAILED" | "COMPLETED";

export interface EnrichBibleTask {
  taskId: string;
  projectId: string;
  status: EnrichBibleTaskStatus;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  updatedAt: number;
}

export type EnrichOutlineTaskStatus = "RUNNING" | "QUEUED" | "FAILED" | "COMPLETED";

export interface EnrichOutlineTask {
  taskId: string;
  projectId: string;
  status: EnrichOutlineTaskStatus;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  updatedAt: number;
}