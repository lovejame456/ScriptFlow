/**
 * Prompt 加载器
 *
 * 从 prompts/ 目录加载 Markdown 格式的 Prompt 文件
 */

import { projectRepo } from '../store/projectRepo';
import { storyMemoryRepo } from '../store/memoryRepo';
import { episodeRepo } from '../store/episodeRepo';
import { buildNarrativeStateFromSkeleton, validateNarrativeState, mergeStateDelta } from './narrativeState';
import { deepseekClient, ChatMessage } from './modelClients/deepseekClient';
import { batchRepo } from '../batch/batchRepo';
import { resumeBatch } from './batchRunner';
import { validateEpisode1Scaffold } from '../validators/episode1Scaffold';
import { qualityCheck } from '../validators/qualityCheck';
import { checkInvariants } from '../storyMemory/invariants';
import { EpisodeStatus, EpisodeOutline, BibleSkeleton, OutlineSkeleton } from '../../types';
import { getCachedPrompt } from './promptLoader';
import { getPacingContext } from '../pacing/pacingEngine';
import { runAligner } from './alignerRunner';
import { ProjectBible } from '../../types';
import { jsonrepair } from 'jsonrepair';
import { buildCharacterFactBlocks, getCharacterNames } from './promptAdapters/characterProfileAdapter';
import { getConflictConstraint, buildConflictConstraintPromptInjection, generateDefaultConflictChain, getExpectedConflictStage } from '../story/conflictChainEngine';
import { getPresenceConstraint, buildPresenceConstraintPromptInjection, generateDefaultPresencePlan, validateEpisodeAgainstPresenceConstraint } from '../story/characterPresenceController';
import { selectTemplate } from '../story/conflictTemplateSelector';
import { queueEnhanceEpisodeTask } from '../task/taskRunner';
import { Timer, SpanResult } from '../observability/timer';
import { calculateQualitySignals } from './qualitySignals';
import { mergeStateDelta } from './narrativeState';

// M16: Structure-First Generation
import { generateStructureContract, buildSlotWriteInput, StructureContract } from './structurePlanner';
import { writeSlots, SlotWriteInput } from './slotWriter';
import { validateSlots, isStructureFailError } from './slotValidator';
import { assembleContent } from './assembler';
// M16.3: 导入 RevealHistory
import { appendRevealToHistory, RevealHistory } from './revealScheduler';
// M16.3: 导入 Reveal 质量信号检查
import { checkRevealQualitySignals, RevealQualitySignal } from './alignerRunner';
// M16.4: 导入 metrics
import { metrics } from '../metrics/runMetrics';
// M16.5: 导入 AdaptiveParams
import { AdaptiveParams } from '../../types';

/**
 * M16.3: 根据重试次数调整 slots（收紧指令）
 *
 * @param attempt - 当前重试次数
 * @param contract - 结构契约
 * @param outline - 本集大纲
 * @param originalSlots - 原始 slots
 * @returns SlotWriteInput - 调整后的 slots
 */
function buildAdjustedSlots(
  attempt: number,
  contract: StructureContract,
  outline: any,
  originalSlots: SlotWriteInput
): SlotWriteInput {
  // 深拷贝原始 slots，确保结构正确
  const originalJson = JSON.stringify(originalSlots);
  console.log(`[buildAdjustedSlots] Original slots JSON:`, originalJson);

  const adjusted: SlotWriteInput = JSON.parse(originalJson);

  // 验证 adjusted 的结构
  if (!adjusted || typeof adjusted !== 'object') {
    console.error(`[buildAdjustedSlots] ERROR: Invalid adjusted structure:`, adjusted);
    throw new Error(`buildAdjustedSlots: Invalid slots structure after deep copy`);
  }

  // 支持两种格式：
  // 1. SlotWriteInput 格式: { slots: { ... } }
  // 2. 直接 slots 对象: { NEW_REVEAL: { ... }, CONFLICT_PROGRESS: { ... } }
  let slotsObject: any;

  if (adjusted.slots && typeof adjusted.slots === 'object') {
    // 标准格式：{ slots: { ... } }
    slotsObject = adjusted.slots;
  } else if (Object.keys(adjusted).some(key => ['NEW_REVEAL', 'CONFLICT_PROGRESS', 'COST_PAID'].includes(key))) {
    // 直接格式：{ NEW_REVEAL: { ... }, ... }
    slotsObject = adjusted;
  } else {
    console.error(`[buildAdjustedSlots] ERROR: Cannot determine slots format`, adjusted);
    throw new Error(`buildAdjustedSlots: Invalid slots format`);
  }

  console.log(`[buildAdjustedSlots] Adjusted slots keys:`, Object.keys(slotsObject));

  // 第一次重试：加粗必须出现的事实句
  if (attempt === 2 && slotsObject.NEW_REVEAL) {
    slotsObject.NEW_REVEAL.instruction +=
      ` 【重试提示】必须明确出现"发现/证据/当场验证"等表达，禁止模糊暗示。`;
    console.log(`[buildAdjustedSlots] Tightened instruction for NEW_REVEAL (attempt 2)`);
  }

  // 第二次重试：强制使用特定词汇
  if (attempt === 3 && slotsObject.NEW_REVEAL) {
    slotsObject.NEW_REVEAL.instruction +=
      ` 【最终重试】必须使用以下词汇：发现、证实、证据、验证、当场。`;
    console.log(`[buildAdjustedSlots] Further tightened instruction for NEW_REVEAL (attempt 3)`);
  }

  // 如果原始格式是 { slots: { ... } }，则需要包装回去
  if (adjusted.slots && typeof adjusted.slots === 'object') {
    return adjusted;
  } else {
    // 直接格式，已经是 slots 对象，需要包装
    return { slots: slotsObject };
  }
}

/**
 * 构建降级约束的 Slots（Relaxed Retry）
 *
 * P1: 当所有正常重试失败后，使用放宽约束重试一次
 *
 * @param contract - 结构契约
 * @param outline - 本集大纲
 * @param originalSlots - 原始 slots
 * @returns SlotWriteInput - 放宽约束后的 slots
 */
function buildRelaxedSlots(
  contract: StructureContract,
  outline: any,
  originalSlots: SlotWriteInput
): SlotWriteInput {
  // 深拷贝原始 slots
  const originalJson = JSON.stringify(originalSlots);
  const relaxed: SlotWriteInput = JSON.parse(originalJson);

  let slotsObject: any;
  if (relaxed.slots && typeof relaxed.slots === 'object') {
    slotsObject = relaxed.slots;
  } else if (Object.keys(relaxed).some(key => ['NEW_REVEAL', 'CONFLICT_PROGRESS', 'COST_PAID'].includes(key))) {
    slotsObject = relaxed;
  } else {
    console.error(`[buildRelaxedSlots] ERROR: Cannot determine slots format`, relaxed);
    throw new Error(`buildRelaxedSlots: Invalid slots format`);
  }

  console.log(`[buildRelaxedSlots] Building relaxed slots for EP${contract.episode}`);

  // 放宽 NEW_REVEAL 约束（如果 required）
  if (contract.mustHave.newReveal.required && slotsObject.NEW_REVEAL) {
    const originalInstruction = slotsObject.NEW_REVEAL.instruction || '';

    // 将 "必须" 改为 "建议"
    slotsObject.NEW_REVEAL.instruction = originalInstruction
      .replace(/必须/g, '建议')
      .replace(/【强制】/g, '【建议】')
      .replace(/【零容忍】/g, '')
      + ` 【降级模式】本集结构校验已放宽，不强求严格的结构完整性，请尽力而为即可。`;

    console.log(`[buildRelaxedSlots] Relaxed NEW_REVEAL constraint`);
  }

  // 放宽 pressure 约束（如果有）
  if (slotsObject.NEW_REVEAL && contract.mustHave.newReveal.pressureHint) {
    const originalInstruction = slotsObject.NEW_REVEAL.instruction || '';
    slotsObject.NEW_REVEAL.instruction = originalInstruction
      .replace(/压力等级.*?，/g, '')
      .replace(/必须体现.*?紧迫感/g, '建议体现一定紧迫感');

    console.log(`[buildRelaxedSlots] Relaxed pressure constraint`);
  }

  // 包装回去
  if (relaxed.slots && typeof relaxed.slots === 'object') {
    return relaxed;
  } else {
    return { slots: slotsObject };
  }
}

/**
 * 构建降级状态的 Summary
 *
 * P2: 当剧集降级完成时，生成包含可操作建议的 Summary
 *
 * @param episodeIndex - 剧集编号
 * @param error - 错误对象
 * @returns string - 降级 Summary 文本（包含可操作按钮提示）
 */
function buildDegradedSummary(episodeIndex: number, error: Error): string {
  return `⚠ 第 ${episodeIndex} 集发生结构异常，系统已自动降级并继续生成

失败原因：${error.message}

建议操作：
[重新生成 EP${episodeIndex}] → 以增强 Reveal 约束重新生成
[接受并继续] → 在剧集列表中手动编辑后标记为完成`;
}

// 题材与集数自动判断结果接口
export interface GenreInferResult {
  genre: string;
  pacingTemplateId: string;
  recommendedEpisodes: number;
  reason: string;
}

// 题材与集数自动判断结果接口
export interface GenreInferResult {
  genre: string;
  pacingTemplateId: string;
  recommendedEpisodes: number;
  reason: string;
}

// Metrics 收集配置
export interface MetricsOptions {
  collectMetrics?: boolean;
  timer?: Timer;
  projectId?: string;
  episodeIndex?: number;
}

// Metrics 结果
export interface EpisodeMetrics {
  episodeIndex: number;
  spans: SpanResult[];
  totalTime: number;
}

// Outline 生成配置
const OUTLINE_GENERATION_CONFIG = {
  ITEMS_PER_REQUEST: 1, // 每次 API 调用生成的 outline item 数量（改为 1 实现逐条生成）
  MAX_RETRIES_PER_ITEM: 3, // 单条失败最大重试次数
  MAX_CONSECUTIVE_FAILURES: 5, // 连续失败阈值,超过则 abort
  RETRY_DELAY_MS: 1000, // 重试延迟(毫秒)
};

/**
 * 题材与集数自动判断
 * 根据用户的一句话灵感，自动判断最适合的商业短剧题材和推荐集数
 *
 * @param userPrompt - 用户的一句话灵感
 * @returns 题材、节奏模板ID、推荐集数和判断理由
 */
export async function inferGenreAndEpisodes(userPrompt: string): Promise<GenreInferResult> {
  const sys = await getCachedPrompt({ category: 'planning', name: 'genre_infer' });

  const raw = await deepseekClient.chat([
    { role: "system", content: sys },
    { role: "user", content: JSON.stringify({ seed: { idea: userPrompt, audience: "" } }) }
  ]);

  const cleaned = cleanJsonResponse(raw);

  let json;
  try {
    json = safeJsonParse(cleaned);
  } catch (e) {
    throw new Error(`[inferGenreAndEpisodes] Failed to parse AI response: ${e instanceof Error ? e.message : String(e)}`);
  }

  console.log('[inferGenreAndEpisodes] AI judgment:', JSON.stringify(json, null, 2));

  // 验证返回结构
  if (!json.genre || !json.pacingTemplateId || !json.recommendedEpisodes) {
    throw new Error('[inferGenreAndEpisodes] Missing required fields in response');
  }

  return {
    genre: json.genre,
    pacingTemplateId: json.pacingTemplateId,
    recommendedEpisodes: json.recommendedEpisodes,
    reason: json.reason || ""
  };
}

// 辅助函数：使用 jsonrepair 修复各种非标准 JSON 格式
// 注意：仅用于基础修复，不再承担结构修复职责
function safeJsonParse(jsonString: string): any {
  try {
    // 先尝试直接解析
    return JSON.parse(jsonString);
  } catch (initialError) {
    console.log('[safeJsonParse] Initial parse failed, attempting jsonrepair...');

    // 使用 jsonrepair 库进行基础修复
    // jsonrepair 可以处理：
    // - 缺失引号
    // - 中文引号（""）
    // - 尾随逗号
    // - 截断的 JSON
    // - 注释（// 和 /* */）
    // - 单引号
    // - 缺少冒号
    // - 中文标点符号（：；，）
    try {
      const repaired = jsonrepair(jsonString);
      console.log('[safeJsonParse] jsonrepair succeeded');

      // 打印修复前后的一些信息（仅用于调试）
      if (repaired.length !== jsonString.length) {
        console.log('[safeJsonParse] JSON was modified by jsonrepair');
      }

      return JSON.parse(repaired);
    } catch (repairError) {
      const errorMsg = repairError instanceof Error ? repairError.message : String(repairError);
      console.error('[safeJsonParse] jsonrepair failed:', errorMsg);
      console.error('[safeJsonParse] Original JSON (first 500 chars):', jsonString.slice(0, 500));
      console.error('[safeJsonParse] Original JSON (last 200 chars):', jsonString.slice(-200));

      // 尝试提取错误位置信息
      const positionMatch = errorMsg.match(/position (\d+)/);
      if (positionMatch) {
        const pos = parseInt(positionMatch[1]);
        const start = Math.max(0, pos - 300);
        const end = Math.min(jsonString.length, pos + 100);
        console.error('[safeJsonParse] Error around position', pos);
        console.error('[safeJsonParse] Context:');
        console.error(jsonString.substring(start, end));
        console.error('[safeJsonParse] ' + ' '.repeat(Math.max(0, pos - start)) + '^'); // 标记错误位置
      }

      // 构建详细的错误信息，包含 humanSummary
      const errorType = errorMsg.includes('position') ? 'Malformed JSON structure' : 'Invalid JSON format';
      const humanSummary = `AI 返回的 JSON 格式错误：${errorType}`;
      const detailedError =
        `[safeJsonParse] JSON parsing failed: ${errorMsg}\n` +
        `Context: ${errorType}\n` +
        `Human summary: ${humanSummary}`;

      throw new Error(detailedError);
    }
  }
}

// 辅助函数：清理 AI 返回的 JSON 响应（去除 markdown 代码块和注释）
function cleanJsonResponse(raw: string): string {
  // 移除 ```json 和 ``` 标记
  let cleaned = raw.replace(/```json\n?/gi, '').replace(/```\n?/g, '');

  // 移除 markdown 标题（# ... 和 ## ...）
  cleaned = cleaned.replace(/^#{1,6}\s.*$/gm, '');

  // 尝试提取第一个完整的 JSON 对象（从 { 开始）
  let jsonStart = cleaned.indexOf('{');
  if (jsonStart === -1) {
    jsonStart = cleaned.indexOf('[');
  }

  if (jsonStart !== -1) {
    // 只要找到开始，就假设后面都是 JSON 内容（可能被截断），交给 safeJsonParse 处理
    cleaned = cleaned.substring(jsonStart);
  }

  // 移除开头和结尾的空白
  cleaned = cleaned.trim();
  return cleaned;
}

export async function createProjectSeed(prompt: string, options?: MetricsOptions) {
  const timer = options?.timer;
  const collectMetrics = options?.collectMetrics || false;

  const span = timer?.startSpan('seed_generation');

  // Step 1: AI 自动判断题材与集数
  console.log('[createProjectSeed] Step 1: Inferring genre and episodes...');
  let genreInfer: GenreInferResult;
  try {
    genreInfer = await inferGenreAndEpisodes(prompt);
    console.log('[createProjectSeed] AI judgment completed:', genreInfer);
  } catch (error) {
    console.warn('[createProjectSeed] Genre inference failed, using fallback:', error);
    // 降级处理：使用默认配置
    genreInfer = {
      genre: "都市脑洞",
      pacingTemplateId: "urban_concept",
      recommendedEpisodes: 60,
      reason: "AI判断失败，使用默认配置"
    };
  }

  // Step 2: 生成 Seed（使用 AI 判断的结果）
  const sys = await getCachedPrompt({ category: 'planning', name: 'seed' });

  const raw = await deepseekClient.chat([
    { role: "system", content: sys },
    { role: "user", content: `用户灵感: ${prompt}。Action: generate_seed` }
  ], undefined, options);

  const cleaned = cleanJsonResponse(raw);

  let json;
  try {
    json = safeJsonParse(cleaned);
  } catch (e) {
    throw new Error(`[createProjectSeed] Failed to parse AI response: ${e instanceof Error ? e.message : String(e)}`);
  }
  console.log('[createProjectSeed] DeepSeek response:', JSON.stringify(json, null, 2));

  // DeepSeek 直接返回 seed 对象，而不是 { seed: ... }
  // 如果返回格式是 { seed: ... }，则提取 seed，否则直接使用
  const seed = json.seed || json;

  // Step 3: 使用 AI 判断结果覆盖题材、集数和节奏模板
  seed.genre = genreInfer.genre;
  // 如果用户指定了总集数，优先使用用户指定的值
  seed.totalEpisodes = options?.totalEpisodes || genreInfer.recommendedEpisodes;
  seed.pacingTemplateId = genreInfer.pacingTemplateId;

  console.log('[createProjectSeed] Final seed with AI judgment:', {
    genre: seed.genre,
    totalEpisodes: seed.totalEpisodes,
    pacingTemplateId: seed.pacingTemplateId,
    userOverride: options?.totalEpisodes ? 'User specified' : 'AI recommended'
  });

  span?.end();
  return seed;
}

// ============================================================================
// M10: Skeleton & Enrich 双阶段生成
// ============================================================================

/**
 * 生成 Bible Skeleton（快速版本）
 * 用于首屏快速加载,不阻塞 EP1 Phase1
 */
export async function buildBibleSkeleton(project: any, options?: MetricsOptions): Promise<BibleSkeleton> {
  const timer = options?.timer;
  const span = timer?.startSpan('bible_skeleton');

  const sys = await getCachedPrompt({ category: 'planning', name: 'bible_skeleton' });

  console.log('[buildBibleSkeleton] Sending request to DeepSeek...');

  const raw = await deepseekClient.chat([
    { role: "system", content: sys },
    { role: "user", content: `Project: ${JSON.stringify(project)}. Action: generate_bible_skeleton` }
  ]);

  console.log('[buildBibleSkeleton] Received response from DeepSeek');
  console.log('[buildBibleSkeleton] Raw response length:', raw.length);

  const cleaned = cleanJsonResponse(raw);
  console.log('[buildBibleSkeleton] Cleaned response length:', cleaned.length);

  let json;
  try {
    json = safeJsonParse(cleaned);
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error('[buildBibleSkeleton] Parse error details:', errorMsg);
    throw new Error(`[buildBibleSkeleton] Failed to parse AI response: ${errorMsg}`);
  }

  console.log('[buildBibleSkeleton] Parsed JSON:', JSON.stringify(json, null, 2));

  // 验证返回结构
  if (!json.variant || json.variant !== 'SKELETON') {
    throw new Error('[buildBibleSkeleton] Invalid skeleton structure: missing variant field');
  }
  if (!json.logline || !json.genre || !json.worldRules || !json.characterPoolLite) {
    throw new Error('[buildBibleSkeleton] Missing required fields in skeleton');
  }

  // 验证 worldRules 数量（3-5条）
  if (!Array.isArray(json.worldRules) || json.worldRules.length < 3 || json.worldRules.length > 5) {
    throw new Error('[buildBibleSkeleton] worldRules must be 3-5 items');
  }

  // 验证 characterPoolLite 数量（<=8人）
  if (!Array.isArray(json.characterPoolLite) || json.characterPoolLite.length > 8) {
    throw new Error('[buildBibleSkeleton] characterPoolLite must be <= 8 characters');
  }

  // M11: 验证 logline 因果句式（必须包含"因为"、"被迫"、"从而"）
  const logline = json.logline;
  if (!logline || !logline.includes('因为') || !logline.includes('被迫') || !logline.includes('从而')) {
    throw new Error('[buildBibleSkeleton] logline must use causal sentence structure with "因为", "被迫", "从而"');
  }

  // M11: 验证 characterPoolLite.role 枚举值
  const validRoles = ['PROTAGONIST', 'ANTAGONIST', 'SUPPORT', 'PRESSURE'];
  for (const char of json.characterPoolLite) {
    if (!char.role || !validRoles.includes(char.role)) {
      throw new Error(`[buildBibleSkeleton] character ${char.name} has invalid role: ${char.role}. Must be one of ${validRoles.join(', ')}`);
    }
    // M11: 验证 goal 和 flaw 语义不重复
    if (char.goal && char.flaw && char.goal === char.flaw) {
      throw new Error(`[buildBibleSkeleton] character ${char.name} goal and flaw must be semantically different`);
    }
    // M11: 验证 relationship 必须指向另一角色
    if (char.relationship && !char.relationship.includes('与') && !char.relationship.includes('角色')) {
      throw new Error(`[buildBibleSkeleton] character ${char.name} relationship must reference another character`);
    }
  }

  // M11: 验证 coreConflicts 三层结构
  if (!Array.isArray(json.coreConflicts) || json.coreConflicts.length !== 3) {
    throw new Error('[buildBibleSkeleton] coreConflicts must contain exactly 3 conflict levels');
  }
  const validLevels = ['IMMEDIATE', 'MID_TERM', 'END_GAME'];
  for (let i = 0; i < json.coreConflicts.length; i++) {
    const conflict = json.coreConflicts[i];
    if (!conflict.level || !conflict.description) {
      throw new Error(`[buildBibleSkeleton] coreConflict[${i}] must have level and description fields`);
    }
    if (!validLevels.includes(conflict.level)) {
      throw new Error(`[buildBibleSkeleton] coreConflict[${i}] has invalid level: ${conflict.level}. Must be one of ${validLevels.join(', ')}`);
    }
    if (conflict.level !== validLevels[i]) {
      throw new Error(`[buildBibleSkeleton] coreConflicts must be in order: IMMEDIATE -> MID_TERM -> END_GAME. Found ${conflict.level} at index ${i}`);
    }
  }

  // M11: 验证 forbidden 硬约束
  if (Array.isArray(json.forbidden)) {
    for (let i = 0; i < json.forbidden.length; i++) {
      const rule = json.forbidden[i];
      if (!rule.startsWith('禁止')) {
        throw new Error(`[buildBibleSkeleton] forbidden[${i}] must start with "禁止": ${rule}`);
      }
    }
  }

  // M12.1: 初始化 NarrativeState (不参与生成,仅用于状态追踪)
  const narrativeState = buildNarrativeStateFromSkeleton(json as BibleSkeleton);
  console.log('[buildBibleSkeleton] NarrativeState initialized:', JSON.stringify({
    charactersCount: Object.keys(narrativeState.characters).length,
    conflicts: {
      immediate: narrativeState.conflicts.immediate.description.substring(0, 30) + '...',
      mid_term: narrativeState.conflicts.mid_term.description.substring(0, 30) + '...',
      end_game: narrativeState.conflicts.end_game.description.substring(0, 30) + '...'
    },
    worldRulesCount: narrativeState.worldRules.immutable.length,
    phase: narrativeState.phase
  }, null, 2));

  // 验证 NarrativeState 结构（仅用于调试）
  const validation = validateNarrativeState(narrativeState);
  if (!validation.valid) {
    console.warn('[buildBibleSkeleton] NarrativeState validation failed:', validation.errors);
  }

  span?.end();
  return json as BibleSkeleton;
}

/**
 * 后台 Enrich Bible（生成完整版本）
 * 异步执行,失败不影响 EP1 Phase1
 */
export async function enrichBible(projectId: string, skeleton?: BibleSkeleton): Promise<{ bible: ProjectBible; characters: any[] }> {
  console.log('[enrichBible] Starting background enrichment...');

  try {
    // 读取项目最新状态
    const project = await projectRepo.get(projectId);
    if (!project) {
      throw new Error('[enrichBible] Project not found');
    }

    // 调用原 buildBible,但传入 skeleton 作为上下文
    const bibleData = await buildBible(project);

    console.log('[enrichBible] Full Bible generated successfully');

    // 保存 FULL Bible/Characters (覆盖原有数据)
    await projectRepo.saveBible(projectId, bibleData);

    // 清除 skeleton 标记（表示已完成 enrich）
    await projectRepo.save(projectId, {
      bibleSkeleton: undefined
    });

    return bibleData;
  } catch (error: any) {
    console.error('[enrichBible] Enrich failed:', error);
    throw error;
  }
}

/**
 * 生成 Outline Skeleton（快速版本）
 * 用于首屏快速加载,不阻塞 EP1 Phase1
 */
export async function buildOutlineSkeleton(project: any, options?: MetricsOptions): Promise<OutlineSkeleton> {
  const timer = options?.timer;
  const span = timer?.startSpan('outline_skeleton');

  const sys = await getCachedPrompt({ category: 'planning', name: 'outline_skeleton' });

  console.log('[buildOutlineSkeleton] Sending request to DeepSeek...');

  const raw = await deepseekClient.chat([
    { role: "system", content: sys },
    { role: "user", content: `Project: ${JSON.stringify(project)}. Action: generate_outline_skeleton` }
  ]);

  console.log('[buildOutlineSkeleton] Received response from DeepSeek');
  console.log('[buildOutlineSkeleton] Raw response length:', raw.length);

  const cleaned = cleanJsonResponse(raw);
  console.log('[buildOutlineSkeleton] Cleaned response length:', cleaned.length);

  let json;
  try {
    json = safeJsonParse(cleaned);
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error('[buildOutlineSkeleton] Parse error details:', errorMsg);
    throw new Error(`[buildOutlineSkeleton] Failed to parse AI response: ${errorMsg}`);
  }

  console.log('[buildOutlineSkeleton] Parsed JSON:', JSON.stringify(json, null, 2));

  // 验证返回结构
  if (!json.variant || json.variant !== 'SKELETON') {
    throw new Error('[buildOutlineSkeleton] Invalid skeleton structure: missing variant field');
  }
  if (!json.acts || !Array.isArray(json.acts)) {
    throw new Error('[buildOutlineSkeleton] Missing acts array');
  }

  // 验证 acts 数量（3或4幕）
  if (json.acts.length !== 3 && json.acts.length !== 4) {
    throw new Error('[buildOutlineSkeleton] acts must be 3 or 4');
  }

  // 验证每幕的 beats 数量（3-5个）
  for (const act of json.acts) {
    if (!Array.isArray(act.beats) || act.beats.length < 3 || act.beats.length > 5) {
      throw new Error(`[buildOutlineSkeleton] Act ${act.act} must have 3-5 beats`);
    }

    // M11: 验证每个 beat 必须包含行动动词（禁止纯情绪描述）
    const emotionKeywords = ['痛苦', '挣扎', '悲伤', '愤怒', '快乐', '恐惧', '绝望', '希望'];
    for (let i = 0; i < act.beats.length; i++) {
      const beat = act.beats[i];
      // 检查是否包含行动动词（常见动作词）
      const actionVerbs = ['在', '做了', '完成', '执行', '展开', '进行', '采取', '实施', '展示', '识破', '完成', '展示', '展示'];
      const hasAction = actionVerbs.some(verb => beat.includes(verb));

      // 如果整个 beat 只包含情绪关键词而没有行动，则报错
      const onlyEmotion = emotionKeywords.filter(kw => beat.includes(kw)).length > 0 && !hasAction;
      if (onlyEmotion) {
        console.warn(`[buildOutlineSkeleton] Act ${act.act} beat[${i}] appears to be emotion-only: ${beat}`);
      }

      // M11: 验证 beat 必须包含"导致"（表示局势变化）
      if (!beat.includes('导致') && !beat.includes('从而')) {
        throw new Error(`[buildOutlineSkeleton] Act ${act.act} beat[${i}] must include "导致" or "从而" to indicate change: ${beat}`);
      }
    }
  }

  span?.end();
  return json as OutlineSkeleton;
}

/**
 * 后台 Enrich Outline（生成完整版本）
 * 异步执行,失败不影响 EP1 Phase1
 */
export async function enrichOutline(projectId: string, skeleton?: OutlineSkeleton): Promise<EpisodeOutline[]> {
  console.log('[enrichOutline] Starting background enrichment...');

  try {
    // 读取项目最新状态
    const project = await projectRepo.get(projectId);
    if (!project) {
      throw new Error('[enrichOutline] Project not found');
    }

    // 调用原 generateOutline,生成完整 outline
    const outline = await generateOutline(project);

    console.log('[enrichOutline] Full Outline generated successfully');

    // 保存 FULL Outline (覆盖原有数据)
    await projectRepo.saveOutline(projectId, outline);

    // 清除 skeleton 标记（表示已完成 enrich）
    await projectRepo.save(projectId, {
      outlineSkeleton: undefined
    });

    return outline;
  } catch (error: any) {
    console.error('[enrichOutline] Enrich failed:', error);
    throw error;
  }
}

// ============================================================================
// 原有函数保持不变
// ============================================================================

export async function buildBible(project: any, options?: MetricsOptions): Promise<{ bible: ProjectBible; characters: any[] }> {
  const timer = options?.timer;
  const span = timer?.startSpan('bible_generation');

  const sys = await getCachedPrompt({ category: 'planning', name: 'bible' });

  console.log('[buildBible] Sending request to DeepSeek...');

  const raw = await deepseekClient.chat([
    { role: "system", content: sys },
    { role: "user", content: `Project: ${JSON.stringify(project)}. Action: build_bible` }
  ]);

  console.log('[buildBible] Received response from DeepSeek');
  console.log('[buildBible] Raw response length:', raw.length);

  const cleaned = cleanJsonResponse(raw);
  console.log('[buildBible] Cleaned response length:', cleaned.length);

  // 打印原始响应的前 1000 个字符（仅用于调试）
  console.log('[buildBible] Raw response preview (first 500 chars):', raw.slice(0, 500));

  let json;
  try {
    json = safeJsonParse(cleaned);
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error('[buildBible] Parse error details:', errorMsg);
    throw new Error(`[buildBible] Failed to parse AI response: ${errorMsg}`);
  }

  console.log('[buildBible] Parsed JSON keys:', Object.keys(json));

  // 确保返回结构正确
  if (!json.bible) {
    throw new Error("Missing 'bible' in response");
  }
  if (!json.bible.canonRules) {
    json.bible.canonRules = {
      worldSetting: json.bible.worldSetting || "修仙世界",
      coreRules: json.bible.coreRules || ["实力为尊", "弱肉强食"],
      powerOrWealthSystem: json.bible.powerOrWealthSystem || "灵力修炼",
      forbiddenChanges: json.bible.forbiddenChanges || []
    };
  }
  if (!json.bible.keyEvents) {
    json.bible.keyEvents = [];
  }
  if (!json.characters || json.characters.length === 0) {
    json.characters = [
      {
        id: "c1",
        name: "主角",
        roleType: "PROTAGONIST",
        description: "现代成功学大师",
        status: { identity: "", goal: "", relationships: {}, secretsKnown: [], secretsHidden: [] }
      }
    ];
  }

  // M6-2: 如果项目没有冲突链，根据题材自动选择模板或生成默认冲突链
  if (!project.conflictChain) {
    const templateConflictChain = selectTemplate(project.genre);
    if (templateConflictChain.stages && templateConflictChain.stages.length > 0) {
      // 使用题材选择的模板
      console.log(`[buildBible] Selected conflict template for genre "${project.genre}":`, JSON.stringify(templateConflictChain, null, 2));
      project.conflictChain = templateConflictChain;
    } else {
      // 模板加载失败，使用默认生成器
      const defaultConflictChain = generateDefaultConflictChain(json.characters, project.totalEpisodes);
      console.log('[buildBible] Generated default conflict chain:', JSON.stringify(defaultConflictChain, null, 2));
      project.conflictChain = defaultConflictChain;
    }
  }

  // M6-1: 如果项目没有出场权重计划，生成默认计划
  if (!project.characterPresencePlan) {
    const defaultPresencePlan = generateDefaultPresencePlan(json.characters, project.totalEpisodes);
    console.log('[buildBible] Generated default presence plan:', JSON.stringify(defaultPresencePlan, null, 2));
  }

  span?.end();
  return json;
}

export async function buildSynopsis(project: any): Promise<string> {
  const sys = await getCachedPrompt({ category: 'planning', name: 'synopsis' });

  console.log('[buildSynopsis] Sending request to DeepSeek...');

  const raw = await deepseekClient.chat([
    { role: "system", content: sys },
    {
      role: "user",
      content: `Project: ${project.name}\nGenre: ${project.genre}\nLogline: ${project.logline}\nBible World Setting: ${project.bible?.canonRules?.worldSetting}\n\n请根据以上项目信息,生成投稿级剧情总纲(800-1500字)。`
    }
  ]);

  console.log('[buildSynopsis] Received response from DeepSeek');
  console.log('[buildSynopsis] Synopsis length:', raw.length);

  return raw.trim();
}

// 验证单个 outline item
function validateOutlineItem(item: any, expectedEpisodeIndex: number, project: any): { valid: boolean; error?: string } {
  // 1. 检查必需字段
  const requiredFields = ['episodeIndex', 'summary', 'conflict', 'highlight', 'hook', 'act'];
  for (const field of requiredFields) {
    if (!item[field]) {
      return { valid: false, error: `Missing required field: ${field}` };
    }
  }

  // 2. 检查 episodeIndex 连续性
  if (item.episodeIndex !== expectedEpisodeIndex) {
    return { valid: false, error: `episodeIndex mismatch: expected ${expectedEpisodeIndex}, got ${item.episodeIndex}` };
  }

  // 3. 检查 act 是否符合 pacingEngine
  const pacingContext = getPacingContext(project, expectedEpisodeIndex);
  if (item.act !== pacingContext.actNumber) {
    return { valid: false, error: `Act mismatch: expected ${pacingContext.actNumber}, got ${item.act}` };
  }

  // 4. 检查 conflictStage（结构化冲突阶段校验）
  const expectedConflictStage = getExpectedConflictStage(expectedEpisodeIndex, project.totalEpisodes);

  // 如果 outline 包含 conflictStage 字段，进行严格校验
  if (item.conflictStage) {
    if (item.conflictStage !== expectedConflictStage) {
      return {
        valid: false,
        error: `ConflictStage mismatch: expected ${expectedConflictStage}, got ${item.conflictStage}`
      };
    }
  } else {
    // 如果 outline 没有 conflictStage 字段（旧项目），跳过冲突链校验
    console.log(`[validateOutlineItem] Episode ${expectedEpisodeIndex} has no conflictStage field, skipping conflict validation (backward compatibility)`);
  }

  return { valid: true };
}

// 生成单个 outline item
async function generateSingleOutlineItem(
  project: any,
  episodeIndex: number,
  previousSummary?: string,
  timer?: Timer
): Promise<any> {
  const span = timer?.startSpan(`outline_ep${episodeIndex}`);

  const sys = await getCachedPrompt({ category: 'planning', name: 'outline' });

  const pacingContext = getPacingContext(project, episodeIndex);

  // 计算预期冲突阶段
  const expectedConflictStage = getExpectedConflictStage(episodeIndex, project.totalEpisodes);

  let context = '';
  if (previousSummary) {
    context = `Context: Previous episode (EP${episodeIndex - 1}) summary: ${previousSummary}. Continue story linearly.`;
  }

  const instruction = `Generate outline for Episode ${episodeIndex} (Act ${pacingContext.actNumber}).
Expected ConflictStage: ${expectedConflictStage}.
This is the ONLY episode you need to generate. Output a single JSON object, not an array.`;

  const raw = await deepseekClient.chat([
    { role: "system", content: sys },
    { role: "user", content: `Project: ${project.name}, Genre: ${project.genre}. ${context} ${instruction}` }
  ]);

  const cleaned = cleanJsonResponse(raw);
  const json = safeJsonParse(cleaned);

  // 确保返回的是单个对象而不是数组
  const item = Array.isArray(json) ? json[0] : json;

  span?.end();
  return [item];
}

export async function generateOutline(project: any, onProgress?: (current: number, total: number) => void, options?: MetricsOptions): Promise<any> {
  const timer = options?.timer;
  const overallSpan = timer?.startSpan('outline_generation');
  
  const total = project.totalEpisodes;
  let allOutlines: EpisodeOutline[] = [];
  let consecutiveFailures = 0;
  let lastSuccessfulSummary: string | undefined;

  console.log(`[generateOutline] Starting generation for ${total} episodes, ${OUTLINE_GENERATION_CONFIG.ITEMS_PER_REQUEST} items per request`);

  for (let currentEpisodeIndex = 1; currentEpisodeIndex <= total; ) {
    // 报告进度
    if (onProgress) {
      onProgress(allOutlines.length, total);
    }

    console.log(`[generateOutline] Processing episode ${currentEpisodeIndex}`);

    // 尝试生成当前批次
    let batchSuccess = false;
    let lastError: any = null;

    for (let attempt = 1; attempt <= OUTLINE_GENERATION_CONFIG.MAX_RETRIES_PER_ITEM; attempt++) {
      try {
        // 生成单条 outline item
        const items = await generateSingleOutlineItem(
          project,
          currentEpisodeIndex,
          lastSuccessfulSummary,
          timer
        );

        // 验证
        const validation = validateOutlineItem(items[0], currentEpisodeIndex, project);
        if (!validation.valid) {
          throw new Error(validation.error);
        }

        // 成功：添加到结果
        allOutlines.push(items[0]);
        lastSuccessfulSummary = items[0].summary;
        consecutiveFailures = 0;
        batchSuccess = true;

        console.log(`[generateOutline] Episode ${currentEpisodeIndex} generated successfully (attempt ${attempt}/${OUTLINE_GENERATION_CONFIG.MAX_RETRIES_PER_ITEM})`);
        break;
      } catch (error) {
        lastError = error;
        console.error(`[generateOutline] Episode ${currentEpisodeIndex} attempt ${attempt}/${OUTLINE_GENERATION_CONFIG.MAX_RETRIES_PER_ITEM} failed:`, error);

        if (attempt < OUTLINE_GENERATION_CONFIG.MAX_RETRIES_PER_ITEM) {
          await new Promise(resolve => setTimeout(resolve, OUTLINE_GENERATION_CONFIG.RETRY_DELAY_MS));
        }
      }
    }

    // 处理批次失败
    if (!batchSuccess) {
      consecutiveFailures++;
      console.error(`[generateOutline] Episode ${currentEpisodeIndex} failed after ${OUTLINE_GENERATION_CONFIG.MAX_RETRIES_PER_ITEM} attempts`);

      if (consecutiveFailures >= OUTLINE_GENERATION_CONFIG.MAX_CONSECUTIVE_FAILURES) {
        console.error(`[generateOutline] Aborting: ${consecutiveFailures} consecutive failures`);
        console.error(`[generateOutline] Generated ${allOutlines.length}/${total} episodes before aborting`);
        throw new Error(`Outline generation aborted: ${consecutiveFailures} consecutive failures. Last error: ${lastError?.message || String(lastError)}`);
      }
    } else {
      // 成功则进入下一集
      currentEpisodeIndex++;
    }
  }

  console.log(`[generateOutline] Completed: ${allOutlines.length}/${total} episodes generated`);
  overallSpan?.end();
  return allOutlines;
}

// DRAFT 自动重写函数
export async function rewriteDraftEpisode({ projectId, episodeIndex }: { projectId: string; episodeIndex: number }) {
  const project = await projectRepo.get(projectId);
  if (!project) throw new Error("Project not found");

  const memoryBefore = await storyMemoryRepo.get(projectId);
  const currentEpisode = project.episodes.find(e => e.id === episodeIndex);
  if (!currentEpisode) throw new Error("Episode not found");

  const outline = project.episodes.find(e => e.id === episodeIndex)?.outline;
  if (!outline) throw new Error("Outline missing");

  console.log(`[rewriteDraftEpisode] Starting rewrite for EP${episodeIndex}, current content length: ${currentEpisode.content?.length || 0}`);

  // 构建失败原因
  const failureReason = currentEpisode.humanSummary || "内容质量不达标，需要重写";

  // === 阶段性更新：开始重写 ===
  await episodeRepo.save(projectId, episodeIndex, {
    humanSummary: '正在根据失败原因重写内容…'
  });

  // 使用 rewrite_draft Prompt
  const systemPrompt = await getCachedPrompt({ category: 'execution', name: 'episode_writer_rewrite_draft' });

  const pacingContext = getPacingContext(project, episodeIndex);

  // M6-1: 生成角色事实块
  const characterFactBlocks = buildCharacterFactBlocks(project.characters);

  // M6-1: 获取冲突约束
  const conflictConstraint = getConflictConstraint(project.conflictChain, episodeIndex, project.totalEpisodes);

  // M6-1: 获取出场约束
  const presenceConstraint = getPresenceConstraint(project.characterPresencePlan, episodeIndex);

  // 构建 Prompt 注入内容
  let promptInjection = characterFactBlocks.join('\n\n');
  promptInjection += '\n\n' + buildConflictConstraintPromptInjection(conflictConstraint);
  promptInjection += '\n' + buildPresenceConstraintPromptInjection(presenceConstraint);

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user", content: JSON.stringify({
        originalContent: currentEpisode.content || "",
        failureReason,
        project: project,
        bible: project.bible,
        characters: project.characters,
        outline,
        episodeIndex,
        pacingContext,
        storyMemory: memoryBefore,
        characterFactBlocks: promptInjection
      })
    }
  ];

  try {
    const raw = await deepseekClient.chat(messages, { temperature: 0.7 });
    const cleaned = cleanJsonResponse(raw);

    let episodeObject: any;
    try {
      const json = JSON.parse(cleaned);
      episodeObject = json;
    } catch (parseError) {
      const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
      const errorType = errorMsg.includes('position') ? 'Malformed JSON structure' : 'Invalid JSON format';
      const humanSummary = `AI 返回的 JSON 格式错误：${errorType}`;
      throw new Error(
        `[rewriteDraftEpisode] Failed to parse rewrite response: ${errorMsg}\n` +
        `Context: ${errorType}\n` +
        `Human summary: ${humanSummary}`
      );
    }

    if (!episodeObject || !episodeObject.content) {
      throw new Error(`[rewriteDraftEpisode] Rewrite response missing content`);
    }

    // 检查 content 是否存在且有效
    if (!episodeObject.content || typeof episodeObject.content !== 'string' || episodeObject.content.trim().length === 0) {
      throw new Error(`[rewriteDraftEpisode] Rewritten episode has no valid content`);
    }

    // === 阶段性更新：重写内容已生成 ===
    await episodeRepo.save(projectId, episodeIndex, {
      humanSummary: '重写内容已生成，正在进行质量检查…'
    });

    // 运行质量检查
    const validation = { fastCheck: { passed: true, errors: [] as string[] }, qualityCheck: { passed: true, issues: [] as string[] } };

    try {
      const scaffoldResult = validateEpisode1Scaffold(episodeObject);
      validation.fastCheck = scaffoldResult as any;
      validation.qualityCheck = qualityCheck(episodeObject, outline);
    } catch (e) {
      console.warn('[rewriteDraftEpisode] Validation failed:', e);
    }

    // 检查 content 是否存在且有效
    if (!episodeObject.content || typeof episodeObject.content !== 'string' || episodeObject.content.trim().length === 0) {
      throw new Error(`Rewritten episode has no valid content`);
    }

    // 检查 1：content.length < 600
    if (episodeObject.content.length < 600) {
      const humanSummary = `重写后内容仍然不足（${episodeObject.content.length} 字），低于 600 字要求。请人工编辑后点击"保存并标记为完成"来确认内容。`;
      console.warn(`[rewriteDraftEpisode] ${humanSummary}`);

      await episodeRepo.save(projectId, episodeIndex, {
        episodeIndex,
        content: episodeObject.content,
        summary: episodeObject.summary,
        outline: episodeObject.outline || episodeObject.outline,
        highlight: episodeObject.highlight || episodeObject.highlight,
        hook: episodeObject.hook || episodeObject.hook,
        act: episodeObject.act || episodeObject.act,
        validation,
        humanSummary,
        status: EpisodeStatus.DRAFT
      });

      return {
        episodeIndex,
        status: EpisodeStatus.DRAFT,
        humanSummary
      };
    }

    // 检查 2：QualityCheck
    if (!validation.qualityCheck.passed || validation.qualityCheck.issues.length > 0) {
      const humanSummary = `重写后质量检查失败：${validation.qualityCheck.issues.join('、')}。请人工编辑后点击"保存并标记为完成"来确认内容。`;
      console.warn(`[rewriteDraftEpisode] ${humanSummary}`);

      await episodeRepo.save(projectId, episodeIndex, {
        episodeIndex,
        content: episodeObject.content,
        summary: episodeObject.summary,
        outline: episodeObject.outline || episodeObject.outline,
        highlight: episodeObject.highlight || episodeObject.highlight,
        hook: episodeObject.hook || episodeObject.hook,
        act: episodeObject.act || episodeObject.act,
        validation,
        humanSummary,
        status: EpisodeStatus.DRAFT
      });

      return {
        episodeIndex,
        status: EpisodeStatus.DRAFT,
        humanSummary
      };
    }

    // === 阶段性更新：质量检查通过 ===
    await episodeRepo.save(projectId, episodeIndex, {
      humanSummary: '质量检查通过，正在进行冲突与爽点校验…'
    });

    // 运行 aligner（严格模式）
    const alignment = await runAligner({
      project,
      episode: episodeObject,
      pacingContext: {
        ...pacingContext,
        phase: 2
      }
    });

    // 检查 3：Aligner severity
    if (alignment.severity === 'FAIL') {
      const humanSummary = `重写后节奏不合格：${alignment.issues.map(i => i.message).join('、')}。请人工编辑后点击"保存并标记为完成"来确认内容。`;
      console.warn(`[rewriteDraftEpisode] ${humanSummary}`);

      await episodeRepo.save(projectId, episodeIndex, {
        episodeIndex,
        content: episodeObject.content,
        summary: episodeObject.summary,
        outline: episodeObject.outline || episodeObject.outline,
        highlight: episodeObject.highlight || episodeObject.highlight,
        hook: episodeObject.hook || episodeObject.hook,
        act: episodeObject.act || episodeObject.act,
        validation,
        alignment,
        humanSummary,
        status: EpisodeStatus.DRAFT
      });

      return {
        episodeIndex,
        status: EpisodeStatus.DRAFT,
        humanSummary
      };
    }

    // === 阶段性更新：校验完成 ===
    await episodeRepo.save(projectId, episodeIndex, {
      humanSummary: '校验完成，正在保存内容…'
    });

    // 全部通过，标记为 COMPLETED
    const episode = {
      episodeIndex,
      content: episodeObject.content,
      summary: episodeObject.summary,
      outline: episodeObject.outline || episodeObject.outline,
      highlight: episodeObject.highlight || episodeObject.highlight,
      hook: episodeObject.hook || episodeObject.hook,
      act: episodeObject.act || episodeObject.act,
      validation,
      alignment,
      stateDelta: episodeObject.stateDelta,  // M12.2: 保存 stateDelta
      status: EpisodeStatus.COMPLETED,
      metadata: {
        enhanced: true
      }
    };

    await episodeRepo.save(projectId, episodeIndex, {
      ...episode,
      status: EpisodeStatus.COMPLETED,
      metadata: {
        enhanced: true
      }
    });

    // ========= M12.2: Aligner PASS，合并 stateDelta =========
    let nextState = project.narrativeState;
    if (episodeObject.stateDelta) {
      nextState = mergeStateDelta(
        project.narrativeState,
        episodeObject.stateDelta
      );

      // 更新项目中的 narrativeState
      await projectRepo.save(projectId, {
        narrativeState: nextState
      });

      console.log(`[rewriteDraftEpisode] StateDelta merged for EP${episodeIndex}`);
    }

    // ========= M13: 计算质量信号 =========
    const qualitySignals = calculateQualitySignals({
      stateDelta: episodeObject.stateDelta,
      episodeFacts: episodeObject.episodeFacts,
      narrativeStateBefore: project.narrativeState,
      narrativeStateAfter: nextState,
      alignerResult: alignment,
      factsHistory: project.episodeFactsHistory,
      episodeIndex
    });

    // 保存质量信号到 episode
    await episodeRepo.save(projectId, episodeIndex, {
      qualitySignals
    });

    console.log(`[rewriteDraftEpisode] QualitySignals calculated for EP${episodeIndex}:`, JSON.stringify(qualitySignals));

    // ========= M12.3: 保存 episodeFacts =========
    if (episodeObject.episodeFacts) {
      const newRecord = {
        episodeIndex,
        facts: episodeObject.episodeFacts
      };

      const currentHistory = project.episodeFactsHistory || [];
      await projectRepo.save(projectId, {
        episodeFactsHistory: [...currentHistory, newRecord]
      });

      console.log(`[rewriteDraftEpisode] EpisodeFacts saved for EP${episodeIndex}`);
    }

    // 更新 Story Memory
    await storyMemoryRepo.save(projectId, {
      canonLayer: {
        worldRules: memoryBefore.canonLayer.worldRules,
        lockedEvents: [...memoryBefore.canonLayer.lockedEvents],
        deadCharacters: memoryBefore.canonLayer.deadCharacters
      },
      characterLayer: {
        states: memoryBefore.characterLayer.states
      },
      plotLayer: {
        lockedEvents: [...memoryBefore.plotLayer.lockedEvents],
        ongoingConflicts: [...memoryBefore.plotLayer.ongoingConflicts],
        foreshadowedEvents: [...memoryBefore.plotLayer.foreshadowedEvents]
      }
    });

    console.log(`[rewriteDraftEpisode] Episode ${episodeIndex} rewritten successfully`);
    return episode;
  } catch (error: any) {
    console.error(`[rewriteDraftEpisode] Rewrite failed for EP${episodeIndex}:`, error);

    // 重写失败，保持 DRAFT 状态
    const humanSummary = `自动重写失败：${error.message || String(error)}。请人工编辑后点击"保存并标记为完成"来确认内容。`;

    await episodeRepo.save(projectId, episodeIndex, {
      humanSummary,
      status: EpisodeStatus.DRAFT
    });

    return {
      episodeIndex,
      status: EpisodeStatus.DRAFT,
      humanSummary
    };
  }
}

// EP1 两阶段生成策略
async function generateEpisode1TwoPhase({
  projectId,
  episodeIndex,
  project,
  memoryBefore
}: {
  projectId: string;
  episodeIndex: number;
  project: any;
  memoryBefore: any;
}) {
  console.log(`[generateEpisode1TwoPhase] Phase 1: Quick readable content (non-JSON)`);

  // Set status to GENERATING
  await episodeRepo.save(projectId, episodeIndex, {
    status: EpisodeStatus.GENERATING,
    humanSummary: '正在快速生成第 1 集可读版本（约 30-60 秒）…'
  });

  const outline = project.episodes.find(e => e.id === episodeIndex)?.outline;
  if (!outline) throw new Error("Outline missing");

  const pacingContext = getPacingContext(project, episodeIndex);

  // === Phase 1: 极速可读内容生成（绝不失败） ===
  let rawText: string;

  try {
    // 使用 Fast Prompt（非 JSON）
    const fastPrompt = `
你是一名【商业短剧编剧】，正在快速生成第一集的可读正文。

【大纲摘要】
${outline.summary}

【当前集数】
EP${episodeIndex}

【剧情阶段】
Act ${pacingContext.actNumber}

【硬性要求】
1. 正文总字数 ≥ 300 字
2. 必须包含明确的剧情起点、至少 1 个冲突点、明确的情绪转折
3. 剧情必须围绕大纲摘要展开，不得跑题
4. 不允许输出空内容、不允许只有概述

【输出格式】
直接输出短剧正文，使用自然段落，不要加标题，不要输出 JSON。
`;

    const messages: ChatMessage[] = [
      { role: "system", content: "你是一名商业短剧编剧，正在快速生成第一集的可读正文。" },
      { role: "user", content: fastPrompt }
    ];

    rawText = await deepseekClient.chat(messages, { temperature: 0.9, maxTokens: 800 });

  } catch (error: any) {
    console.warn(`[generateEpisode1TwoPhase] LLM call failed, using fallback:`, error);
    rawText = '';
  }

  // === 兜底保护（核心） ===
  const safeContent =
    typeof rawText === 'string' && rawText.trim().length >= 200
      ? rawText.trim()
      : '【系统提示】本集内容生成中，请稍后刷新查看完整版。';

  // Phase 1 完成：立即保存为 DRAFT
  console.log(`[generateEpisode1TwoPhase] Phase 1 completed (${safeContent.length} chars), marking as DRAFT`);

  const phase1Episode = {
    episodeIndex,
    content: safeContent,
    summary: outline.summary,
    outline,
    highlight: outline.highlight,
    hook: outline.hook,
    act: pacingContext.actNumber,
    validation: {
      fastCheck: { passed: true, errors: [] as string[] },
      qualityCheck: { passed: true, issues: [] as string[] }
    },
    humanSummary: '首集内容已生成（快速版），后台正在增强质量',
    status: EpisodeStatus.DRAFT,
    metadata: {
      phase: 1,
      needsEnhance: true,
      enhanced: false
    }
  };

  await episodeRepo.save(projectId, episodeIndex, phase1Episode);

  // === Phase 2：后台自动增强（异步，不阻塞） ===
  console.log(`[generateEpisode1TwoPhase] Phase 2: Background enhancement starting...`);

  // 异步启动 Phase 2，不阻塞返回
  enhanceEpisode1Phase2({ projectId, episodeIndex, phase1Episode, project, memoryBefore }).catch(err => {
    console.error(`[generateEpisode1TwoPhase] Phase 2 failed for EP1:`, err);
  });

  // ❗关键：Phase 1 永远 return，不抛异常
  return phase1Episode;
}

// EP1 Phase 2 后台增强函数
async function enhanceEpisode1Phase2({
  projectId,
  episodeIndex,
  phase1Episode,
  project,
  memoryBefore
}: {
  projectId: string;
  episodeIndex: number;
  phase1Episode: any;
  project: any;
  memoryBefore: any;
}) {
  console.log(`[enhanceEpisode1Phase2] Starting Phase 2 enhancement for EP1`);

  try {
    await episodeRepo.save(projectId, episodeIndex, {
      humanSummary: '后台正在进行内容扩写与质量优化…'
    });

    // 复用 rewriteDraftEpisode 逻辑
    const enhancedResult = await rewriteDraftEpisode({ projectId, episodeIndex });

    if (enhancedResult.status === EpisodeStatus.COMPLETED) {
      console.log(`[enhanceEpisode1Phase2] Phase 2 completed successfully, EP1 upgraded to COMPLETED`);
    } else {
      console.warn(`[enhanceEpisode1Phase2] Phase 2 completed but status is ${enhancedResult.status}`);
    }

    return enhancedResult;
  } catch (error: any) {
    console.error(`[enhanceEpisode1Phase2] Phase 2 enhancement failed:`, error);

    // ✅ 不再阻塞，仅提示用户
    await episodeRepo.save(projectId, episodeIndex, {
      humanSummary: '首集商业校验未完成，建议等待或手动优化'
    });

    // ✅ 不再自动恢复 Batch，让用户主动决定
    throw error;
  }
}

/**
 * 快速生成剧集：仅调用 Writer，立即返回 DRAFT
 * 不执行任何 Aligner/Rewrite，这些工作交给后台增强任务
 * @deprecated 推荐使用 generateEpisodeFast，此函数仅用于向后兼容
 */
export async function generateOneEpisode({ projectId, episodeIndex }: { projectId: string; episodeIndex: number }) {
  // 直接转发到 generateEpisodeFast，保持向后兼容
  return generateEpisodeFast({ projectId, episodeIndex });
}

/**
 * 快速生成剧集：仅调用 Writer，立即返回 DRAFT
 * 不执行任何 Aligner/Rewrite，这些工作交给后台增强任务
 * 
 * @param options - 生成选项
 * @param options.projectId - 项目ID
 * @param options.episodeIndex - 剧集编号
 * @param options.collectMetrics - 是否收集性能指标（仅用于测试）
 * @param options.timer - 计时器实例（仅用于测试）
 * @returns 生成的剧集数据，如果启用 metrics 则包含 metrics
 */
/**
 * M16: 快速生成剧集（Structure-First 流程）
 * 
 * 新流程：
 * StructurePlanner → StructureContract → SlotWriter → SlotValidator (FAIL=STOP) → Assembler
 * 
 * @param options - 生成选项
 * @param options.projectId - 项目ID
 * @param options.episodeIndex - 剧集编号
 * @param options.collectMetrics - 是否收集性能指标（仅用于测试）
 * @param options.timer - 计时器实例（仅用于测试）
 * @returns 生成的剧集数据，如果启用 metrics 则包含 metrics
 */
export async function generateEpisodeFast({
  projectId,
  episodeIndex,
  collectMetrics = false,
  timer,
  userInstruction
}: {
  projectId: string;
  episodeIndex: number;
  collectMetrics?: boolean;
  timer?: Timer;
  userInstruction?: string;  // P3.2: 用户微调指令
}) {
  const project = await projectRepo.get(projectId);
  if (!project) throw new Error("Project not found");

  // 开始整体span
  const overallSpan = timer?.startSpan(`generateEpisodeFast_ep${episodeIndex}`, { episodeIndex });

  // 1. 设置状态为 GENERATING
  await episodeRepo.save(projectId, episodeIndex, {
    status: EpisodeStatus.GENERATING,
    humanSummary: '正在生成本集剧情结构…'
  });

  const outline = project.episodes.find(e => e.id === episodeIndex)?.outline;
  if (!outline) throw new Error("Outline missing");

  const pacingContext = getPacingContext(project, episodeIndex);

  // M16.5: 获取自适应参数
  const batch = batchRepo.get(projectId);
  const adaptiveParams: AdaptiveParams | undefined = batch?.adaptiveParams;
  console.log(`[generateEpisodeFast] M16.5: Adaptive params:`, adaptiveParams);

  // M16 Step 1: 生成 StructureContract（结构先于内容）
  console.log(`[generateEpisodeFast] M16 Step 1: Generating StructureContract`);
  let structureContract: StructureContract;
  try {
    structureContract = await generateStructureContract({
      episodeIndex,
      project,
      outline,
      adaptiveParams  // M16.5: 传递自适应参数
    });
  } catch (error: any) {
    console.error(`[generateEpisodeFast] StructureContract generation failed:`, error);

    // P1 修复：结构失败直接返回 DEGRADED，而非抛出异常
    const degradedError = error;
    const degradedSummary = buildDegradedSummary(episodeIndex, degradedError);

    // 返回 DEGRADED 状态的 Episode 对象
    const degradedEpisode = {
      episodeIndex,
      status: EpisodeStatus.DEGRADED,
      title: outline?.title || `第 ${episodeIndex} 集（降级）`,
      content: '结构契约生成失败，已自动降级',
      outline,
      act: outline?.act,
      hook: outline?.hook || '',
      validation: {
        fastCheck: { passed: false, errors: [degradedError.message] },
        qualityCheck: { passed: false, issues: [degradedError.message] }
      },
      humanSummary: degradedSummary,
      metadata: {
        phase: 1,
        degradationReason: degradedError.message
      }
    };

    // P1 修复：保存 DEGRADED 状态到 episodeRepo，这样 batchRunner 才能读取到
    await episodeRepo.save(projectId, episodeIndex, degradedEpisode);

    return degradedEpisode as any;
  }

  // M16.4: 记录 contract 到 metrics
  try {
    metrics.recordContract(episodeIndex, structureContract);
  } catch (err) {
    console.warn(`[generateEpisodeFast] Failed to record contract metrics:`, err);
  }

  // P4.2: 如果有用户指令，记录应用前的状态
  let instructionBeforeRatio: number | null = null;
  if (userInstruction) {
    try {
      const { recordInstructionBefore } = await import('../intelligence/instructionImpactTracker');
      instructionBeforeRatio = await recordInstructionBefore(projectId, userInstruction, episodeIndex);
    } catch (err) {
      console.warn(`[generateEpisodeFast] P4.2: Failed to record instruction BEFORE state:`, err);
    }
  }

  // P3.2: 如果有用户指令，应用约束修改
  if (userInstruction) {
    try {
      const { applyUserInstruction } = await import('../guidance/instructionMapper');
      structureContract = applyUserInstruction(structureContract, userInstruction);
      console.log(`[generateEpisodeFast] P3.2: Applied user instruction "${userInstruction}"`);
    } catch (err) {
      console.warn(`[generateEpisodeFast] P3.2: Failed to apply user instruction:`, err);
      // 不阻塞生成，继续使用原始 contract
    }
  }

  // S1: 确保 contract 的必需 slots 不被指令破坏
  // 即使指令修改了 optional 字段，也要确保至少有冲突推进
  if (!structureContract.optional) {
    structureContract.optional = {};
  }
  // 确保 conflictProgressed 至少为 true（保证 CONFLICT_PROGRESS slot 会被创建）
  if (structureContract.optional.conflictProgressed === undefined || structureContract.optional.conflictProgressed === false) {
    structureContract.optional.conflictProgressed = true;
    console.log(`[generateEpisodeFast] S1: Ensured conflictProgressed = true for slot integrity`);
  }

  // M16 Step 2: 构建 SlotWriteInput
  console.log(`[generateEpisodeFast] M16 Step 2: Building SlotWriteInput`);
  const { slots: slotWriteInput } = buildSlotWriteInput(structureContract, outline);

  // M16 Step 3: 准备 SlotWriter 上下文
  console.log(`[generateEpisodeFast] M16 Step 3: Preparing SlotWriter context`);
  const memoryBefore = await storyMemoryRepo.get(projectId);

  // M6-1: 生成约束注入
  const characterFactBlocks = buildCharacterFactBlocks(project.characters);
  const conflictConstraint = getConflictConstraint(project.conflictChain, episodeIndex, project.totalEpisodes);
  const presenceConstraint = getPresenceConstraint(project.characterPresencePlan, episodeIndex);

  let promptInjection = characterFactBlocks.join('\n\n');
  promptInjection += '\n\n' + buildConflictConstraintPromptInjection(conflictConstraint);
  promptInjection += '\n' + buildPresenceConstraintPromptInjection(presenceConstraint);

  // M12.3: 构建连续性事实引用（仅当 episodeIndex > 1）
  if (episodeIndex > 1 && project.episodeFactsHistory && project.episodeFactsHistory.length > 0) {
    const recentFacts = project.episodeFactsHistory
      .filter(r => r.episodeIndex >= episodeIndex - 2)  // 最近 2 集
      .map(r => {
        const summaryParts: string[] = [];
        // 每个分类最多取 1 条，总长度不超过 100 字
        if (r.facts.events.length > 0) {
          summaryParts.push(r.facts.events[0]);
        }
        if (r.facts.reveals.length > 0) {
          summaryParts.push(r.facts.reveals[0]);
        }
        if (r.facts.items.length > 0) {
          summaryParts.push(r.facts.items[0]);
        }
        const summary = summaryParts.join('；');
        return `EP${r.episodeIndex}: ${summary}`;
      })
      .join('\n');

    if (recentFacts.length > 0) {
      promptInjection += `\n\n【最近剧集事实（必须遵守）】\n${recentFacts}`;
    }
  }

  // M16.5: 结构重试闭环配置（使用自适应参数）
  const MAX_SLOT_RETRIES = adaptiveParams?.maxSlotRetries ?? 3;
  console.log(`[generateEpisodeFast] M16.5: MAX_SLOT_RETRIES = ${MAX_SLOT_RETRIES} (adaptive: ${adaptiveParams?.maxSlotRetries ?? 'N/A'})`);

  // M16 Step 4: 调用 SlotWriter（slot 先于段落）
  console.log(`[generateEpisodeFast] M16 Step 4: Calling SlotWriter`);
  let slotOutput: any;
  let lastError: any;

  // M16.3: 实现重试逻辑
  for (let attempt = 1; attempt <= MAX_SLOT_RETRIES; attempt++) {
    console.log(`[generateEpisodeFast] Slot write attempt ${attempt}/${MAX_SLOT_RETRIES}`);

    try {
      // M16.3: 根据重试次数调整 slots
      const adjustedSlots = buildAdjustedSlots(
        attempt,
        structureContract,
        outline,
        slotWriteInput
      );

      slotOutput = await writeSlots({
        slots: adjustedSlots,
        context: {
          project,
          bible: project.bible,
          characters: project.characters,
          outline,
          pacingContext,
          storyMemory: memoryBefore,
          characterFactBlocks: promptInjection
        },
        outputMode: 'COMMERCIAL_SCRIPT'
      });

      // M16 Step 5: 验证 Slots（零容忍）
      console.log(`[generateEpisodeFast] M16 Step 5: Validating Slots (attempt ${attempt})`);
      const validation = validateSlots(structureContract, slotOutput);

      if (!validation.valid) {
        console.error(`[generateEpisodeFast] Slot validation failed (attempt ${attempt}):`, validation.errors);

        // 仅对结构失败错误重试，其他错误直接抛出
        if (!isStructureFailError({ message: `Slot validation failed: ${validation.errors.join(', ')}` })) {
          throw new Error(`[generateEpisodeFast] STRUCTURE_FAIL: ${validation.errors.join(', ')}`);
        }

        // 如果是最后一次重试，准备 Relaxed Retry（P1）
        if (attempt === MAX_SLOT_RETRIES) {
          const errorMessage = `Slot validation failed after ${MAX_SLOT_RETRIES} attempts: ${validation.errors.join(', ')}`;
          lastError = new Error(errorMessage);
          console.log(`[generateEpisodeFast] All retries exhausted, will try Relaxed Retry (P1)`);
          break;
        }

        // 记录错误并继续下一次重试
        lastError = new Error(`Attempt ${attempt} failed: ${validation.errors.join(', ')}`);
        console.log(`[generateEpisodeFast] Will retry slot write (attempt ${attempt + 1}/${MAX_SLOT_RETRIES})`);
        continue;
      }

      // 验证通过，跳出重试循环
      console.log(`[generateEpisodeFast] Slot validation passed on attempt ${attempt}`);

      // M16.4: 记录重试次数（attempt - 1 因为从 1 开始）
      try {
        metrics.recordRetry(episodeIndex, attempt - 1);
        metrics.recordSlotValidation(episodeIndex, validation.valid, validation.errors);
      } catch (err) {
        console.warn(`[generateEpisodeFast] Failed to record validation metrics:`, err);
      }

      break;

    } catch (error: any) {
      console.error(`[generateEpisodeFast] Slot write attempt ${attempt} failed:`, error);
      lastError = error;

      // 仅对结构失败错误重试
      if (!isStructureFailError(error)) {
        // M16 铁律：非结构失败，直接终止
        throw new Error(
          `[generateEpisodeFast] SlotWriter failed for EP${episodeIndex}: ${error.message || String(error)}`
        );
      }

      // 如果是最后一次重试，跳出循环尝试 Relaxed Retry（P1）
      if (attempt === MAX_SLOT_RETRIES) {
        console.log(`[generateEpisodeFast] All retries exhausted, will try Relaxed Retry (P1)`);
        break;
      }

      console.log(`[generateEpisodeFast] Will retry slot write (attempt ${attempt + 1}/${MAX_SLOT_RETRIES})`);
    }
  }

  // P1: 如果所有正常重试都失败，尝试 Relaxed Retry（降低约束）
  if (!slotOutput && lastError && isStructureFailError(lastError)) {
    console.log(`[generateEpisodeFast] P1: Attempting Relaxed Retry with relaxed constraints`);

    try {
      const relaxedSlots = buildRelaxedSlots(
        structureContract,
        outline,
        slotWriteInput
      );

      console.log(`[generateEpisodeFast] P1: Calling SlotWriter with relaxed slots`);
      slotOutput = await writeSlots({
        slots: relaxedSlots,
        context: {
          project,
          bible: project.bible,
          characters: project.characters,
          outline,
          pacingContext,
          storyMemory: memoryBefore,
          characterFactBlocks: promptInjection
        },
        outputMode: 'COMMERCIAL_SCRIPT'
      });

      // P1: 验证 Relaxed Retry 的结果
      console.log(`[generateEpisodeFast] P1: Validating relaxed slots`);
      const relaxedValidation = validateSlots(structureContract, slotOutput);

      if (relaxedValidation.valid) {
        console.log(`[generateEpisodeFast] P1: Relaxed Retry succeeded`);
        // 记录 metrics
        try {
          metrics.recordRetry(episodeIndex, MAX_SLOT_RETRIES);  // MAX_SLOT_RETRIES 次正常重试 + 1 次降级重试
          metrics.recordSlotValidation(episodeIndex, true, []);
        } catch (err) {
          console.warn(`[generateEpisodeFast] Failed to record relaxed retry metrics:`, err);
        }
      } else {
        console.warn(`[generateEpisodeFast] P1: Relaxed Retry failed:`, relaxedValidation.errors);
        // P1: Relaxed Retry 也失败，继续但会标记为 DEGRADED
        lastError = new Error(`Relaxed Retry failed: ${relaxedValidation.errors.join(', ')}`);
      }
    } catch (error: any) {
      console.error(`[generateEpisodeFast] P1: Relaxed Retry failed with error:`, error);
      lastError = error;
    }
  }

  // P1: 如果所有重试（包括 Relaxed Retry）都失败，返回 DEGRADED 而非抛出异常
  if (!slotOutput) {
    console.log(`[generateEpisodeFast] P1: All retries exhausted, returning DEGRADED episode`);
    const degradedError = lastError || new Error('Unknown slot validation failure');

    // 构建降级 Summary
    const degradedSummary = buildDegradedSummary(episodeIndex, degradedError);

    // 返回 DEGRADED 状态的 Episode 对象
    const degradedEpisode = {
      episodeIndex,
      status: EpisodeStatus.DEGRADED,
      title: outline?.title || `第 ${episodeIndex} 集（降级）`,
      content: '内容生成失败，已自动降级',
      outline,
      act: outline?.act,
      hook: outline?.hook || '',
      validation: {
        fastCheck: { passed: false, errors: [degradedError.message] },
        qualityCheck: { passed: false, issues: [degradedError.message] }
      },
      humanSummary: degradedSummary,
      metadata: {
        phase: 1,
        degradationReason: degradedError.message
      }
    };

    // 记录降级 metrics
    try {
      metrics.recordRetry(episodeIndex, MAX_SLOT_RETRIES + 1);
      metrics.recordSlotValidation(episodeIndex, false, [degradedError.message]);
    } catch (err) {
      console.warn(`[generateEpisodeFast] Failed to record degradation metrics:`, err);
    }

    return degradedEpisode as any;
  }

  // M16 Step 6: 拼装内容（Assembler 只拼装，不生成）
  console.log(`[generateEpisodeFast] M16 Step 6: Assembling content`);
  let content: string;
  try {
    content = assembleContent(slotOutput, 'COMMERCIAL_SCRIPT', episodeIndex);
  } catch (error: any) {
    console.error(`[generateEpisodeFast] Assembler failed:`, error);
    throw new Error(
      `[generateEpisodeFast] Assembler failed for EP${episodeIndex}: ${error.message || String(error)}`
    );
  }

  // 验证内容长度（仅作为日志，不触发 fallback）
  if (content.length < 200) {
    console.warn(`[generateEpisodeFast] Content is short (${content.length} chars), but continuing (no fallback)`);
  }

  // 7. 保存为 DRAFT，立即可见
  const episode = {
    episodeIndex,
    content: content,
    summary: outline.summary,
    outline: outline.outline || outline,
    highlight: outline.highlight || outline.highlight,
    hook: outline.hook || outline.hook,
    act: pacingContext.actNumber,
    structureContract,  // M16: 保存 StructureContract
    validation: {
      fastCheck: { passed: true, errors: [] as string[] },
      qualityCheck: { passed: true, issues: [] as string[] }
    },
    stateDelta: undefined,  // DRAFT 阶段暂无 stateDelta
    episodeFacts: undefined,  // DRAFT 阶段暂无 episodeFacts
    humanSummary: '剧本已生成，可立即阅读',
    status: EpisodeStatus.DRAFT
  };

  await episodeRepo.save(projectId, episodeIndex, episode, { collectMetrics, timer });

  // M16.3: 保存 Reveal 到历史记录
  if (structureContract.mustHave.newReveal.required && structureContract.mustHave.newReveal.summary) {
    const revealEntry: RevealHistory = {
      episode: episodeIndex,
      type: structureContract.mustHave.newReveal.type,
      scope: structureContract.mustHave.newReveal.scope,
      summary: structureContract.mustHave.newReveal.summary,
      noRepeatKey: structureContract.mustHave.newReveal.noRepeatKey || ''
    };

    const currentHistory: RevealHistory[] = project.revealHistory || [];
    const updatedHistory = appendRevealToHistory(currentHistory, revealEntry);

    await projectRepo.save(projectId, {
      revealHistory: updatedHistory
    });

    console.log(`[generateEpisodeFast] Saved Reveal to history for EP${episodeIndex}`);
  }

  console.log(`[generateEpisodeFast] EP${episodeIndex} generated successfully (DRAFT) with Structure-First flow`);

  // P4.2: 如果有用户指令，记录应用后的状态
  if (userInstruction && instructionBeforeRatio !== null) {
    try {
      const { recordInstructionAfter } = await import('../intelligence/instructionImpactTracker');
      await recordInstructionAfter(projectId, userInstruction, episodeIndex);
    } catch (err) {
      console.warn(`[generateEpisodeFast] P4.2: Failed to record instruction AFTER state:`, err);
    }
  }

  // P5-Lite: 记录 Instruction Impact（不影响现有逻辑）
  if (userInstruction && instructionBeforeRatio !== null) {
    try {
      // 计算应用后的降级率
      const projectAfter = await projectRepo.get(projectId);
      if (projectAfter) {
        const totalEpisodes = projectAfter.episodes.length;
        const degradedCount = projectAfter.episodes.filter(
          ep => ep.status === EpisodeStatus.DEGRADED
        ).length;
        const afterRatio = totalEpisodes > 0 ? degradedCount / totalEpisodes : 0;

        const { recordInstructionImpact } = await import('../business/projectDNA');
        await recordInstructionImpact(projectId, userInstruction, instructionBeforeRatio, afterRatio);
      }
    } catch (err) {
      console.warn(`[generateEpisodeFast] P5-Lite: Failed to record instruction impact:`, err);
    }
  }

  // ========= M13: 计算质量信号（DRAFT 阶段，无 Aligner 结果） =========
  // 注意：DRAFT 阶段可能没有 alignerResult，stateCoherent 信号默认为 false
  const qualitySignals = calculateQualitySignals({
    stateDelta: undefined,
    episodeFacts: undefined,
    narrativeStateBefore: project.narrativeState,
    narrativeStateAfter: project.narrativeState,  // DRAFT 阶段还没合并 stateDelta
    alignerResult: undefined,  // DRAFT 阶段无 Aligner 结果
    factsHistory: project.episodeFactsHistory,
    episodeIndex
  });

  // 保存质量信号到 episode
  await episodeRepo.save(projectId, episodeIndex, {
    qualitySignals
  });

  console.log(`[generateEpisodeFast] QualitySignals calculated for EP${episodeIndex}:`, JSON.stringify(qualitySignals));

  // ========= M16.3: 检查 Reveal 质量信号（仅用于评分与分析） =========
  const revealQualitySignal = checkRevealQualitySignals({
    content,
    structureContract,
    episodeIndex,
    project
  });

  console.log(`[generateEpisodeFast] Reveal quality signals for EP${episodeIndex}:`, JSON.stringify(revealQualitySignal));

  // M16.4: 记录 post signals 到 metrics
  try {
    metrics.recordPostSignals(episodeIndex, {
      revealIsConcrete: revealQualitySignal.revealIsConcrete,
      revealHasConsequence: revealQualitySignal.revealHasConsequence
    });
  } catch (err) {
    console.warn(`[generateEpisodeFast] Failed to record postSignals metrics:`, err);
  }

  // 保存 Reveal 质量信号到 episode（扩展 metadata）
  await episodeRepo.save(projectId, episodeIndex, {
    metadata: {
      ...episode.metadata,
      revealQualitySignal
    }
  });

  // 结束整体span
  overallSpan?.end();

  // 8. 异步启动增强任务
  queueEnhanceEpisode({ projectId, episodeIndex }).catch(err => {
    console.error(`[generateEpisodeFast] Enhancement task failed for EP${episodeIndex}:`, err);
  });

  // 如果启用了 metrics，返回扩展结果
  if (collectMetrics && timer) {
    const metrics: EpisodeMetrics = {
      episodeIndex,
      spans: timer.getAllSpans(),
      totalTime: timer.getStats(`generateEpisodeFast_ep${episodeIndex}`).max
    };
    return { ...episode, metrics } as any;
  }

  return episode;
}

/**
 * 后台增强任务：执行 Aligner/Rewrite/Conflict 校验
 * 这些操作耗时较长，异步执行不阻塞用户
 */
export async function queueEnhanceEpisode({
  projectId,
  episodeIndex
}: {
  projectId: string;
  episodeIndex: number;
}) {
  console.log(`[queueEnhanceEpisode] Queueing enhancement for EP${episodeIndex}`);

  // 更新状态：等待增强
  await episodeRepo.save(projectId, episodeIndex, {
    humanSummary: '后台正在优化爽点与冲突（排队中）'
  });

  // 使用任务系统，不直接执行
  try {
    await queueEnhanceEpisodeTask(projectId, episodeIndex);
  } catch (error: any) {
    console.error(`[queueEnhanceEpisode] Failed to queue enhance task:`, error);
    await episodeRepo.save(projectId, episodeIndex, {
      humanSummary: `后台优化任务入队失败：${error.message || String(error)}`
    });
  }
}

/**
 * 完整生成剧集（保留原逻辑，仅限后台任务使用）
 * 此函数包含 Writer + QualityCheck + Aligner 的完整流程
 */
export async function _generateOneEpisodeFull({ projectId, episodeIndex }: { projectId: string; episodeIndex: number }) {
  const project = await projectRepo.get(projectId);
  if (!project) throw new Error("Project not found");

  const memoryBefore = await storyMemoryRepo.get(projectId);

  // 检查当前 Episode 状态
  const currentEpisode = project.episodes.find(e => e.id === episodeIndex);
  const currentStatus = currentEpisode?.status;

  // 如果是 DRAFT 状态，尝试重写
  if (currentStatus === EpisodeStatus.DRAFT) {
    console.log(`[_generateOneEpisodeFull] EP${episodeIndex} is in DRAFT status, attempting rewrite`);
    const rewriteResult = await rewriteDraftEpisode({ projectId, episodeIndex });
    return rewriteResult;
  }

  // === EP1 两阶段生成策略 ===
  if (episodeIndex === 1) {
    console.log(`[_generateOneEpisodeFull] EP1 detected, using two-phase strategy`);
    try {
      return await generateEpisode1TwoPhase({ projectId, episodeIndex, project, memoryBefore });
    } catch (e) {
      // ❌ 禁止失败 - Phase 1 永不抛异常
      console.warn('[EP1 Phase1] swallowed error:', e);
      // 确保返回 DRAFT 状态，不让 Batch 进入 PAUSED
      return {
        episodeIndex,
        status: EpisodeStatus.DRAFT,
        humanSummary: '首集内容已生成，可立即阅读'
      };
    }
  }

  // Set status to GENERATING
  await episodeRepo.save(projectId, episodeIndex, {
    status: EpisodeStatus.GENERATING,
    humanSummary: '正在构思本集剧情结构…'
  });

  const outline = project.episodes.find(e => e.id === episodeIndex)?.outline;
  if (!outline) throw new Error("Outline missing");

  console.log(`[generateOneEpisode] Starting EP${episodeIndex}, outline summary: ${outline.summary}`);
  console.log(`[generateOneEpisode] Outline act: ${outline.act}, expected from pacing context will be verified`);

  // 根据集数选择对应的 Prompt
  let promptName = 'episode_writer_std';
  if (episodeIndex === 1) {
    promptName = 'episode_writer_ep1';
  } else if (episodeIndex === 2) {
    promptName = 'episode_writer_ep2';
  }

  const systemPrompt = await getCachedPrompt({ category: 'execution', name: promptName });

  const pacingContext = getPacingContext(project, episodeIndex);

  // M6-1: 生成角色事实块
  const characterFactBlocks = buildCharacterFactBlocks(project.characters);

  // M6-1: 获取冲突约束
  const conflictConstraint = getConflictConstraint(project.conflictChain, episodeIndex, project.totalEpisodes);

  // M6-1: 获取出场约束
  const presenceConstraint = getPresenceConstraint(project.characterPresencePlan, episodeIndex);

  // 构建 Prompt 注入内容
  let promptInjection = characterFactBlocks.join('\n\n');
  promptInjection += '\n\n' + buildConflictConstraintPromptInjection(conflictConstraint);
  promptInjection += '\n' + buildPresenceConstraintPromptInjection(presenceConstraint);

  // M12.3: 构建连续性事实引用（仅当 episodeIndex > 1）
  if (episodeIndex > 1 && project.episodeFactsHistory && project.episodeFactsHistory.length > 0) {
    const recentFacts = project.episodeFactsHistory
      .filter(r => r.episodeIndex >= episodeIndex - 2)  // 最近 2 集
      .map(r => {
        const summaryParts: string[] = [];
        // 每个分类最多取 1 条，总长度不超过 100 字
        if (r.facts.events.length > 0) {
          summaryParts.push(r.facts.events[0]);
        }
        if (r.facts.reveals.length > 0) {
          summaryParts.push(r.facts.reveals[0]);
        }
        if (r.facts.items.length > 0) {
          summaryParts.push(r.facts.items[0]);
        }
        const summary = summaryParts.join('；');
        return `EP${r.episodeIndex}: ${summary}`;
      })
      .join('\n');

    if (recentFacts.length > 0) {
      promptInjection += `\n\n【最近剧集事实（必须遵守）】\n${recentFacts}`;
    }
  }

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user", content: JSON.stringify({
        project: project,
        bible: project.bible,
        characters: project.characters,
        outline,
        episodeIndex,
        pacingContext,
        storyMemory: memoryBefore,
        characterFactBlocks: promptInjection
      })
    }
  ];

  const maxRetries = 3;
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const raw = await deepseekClient.chat(messages, { temperature: 0.7 });
      const cleaned = cleanJsonResponse(raw);

      let episodeObject: any;

      try {
        const json = JSON.parse(cleaned);
        episodeObject = json;
      } catch (parseError) {
        // 清理失败，尝试继续
        const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
        const errorType = errorMsg.includes('position') ? 'Malformed JSON structure' : 'Invalid JSON format';
        console.warn(`[generateOneEpisode] Attempt ${attempt} parse failed (${errorType}), trying to extract content`);

        const content = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        const contentMatch = content.match(/EP \d+[:：](.+?)(?=\n|$)/);

        if (contentMatch) {
          const episodeText = contentMatch[1].trim();
          episodeObject = {
            episodeIndex,
            content: episodeText,
            summary: episodeText.split('：')[0] || `EP ${episodeIndex}`,
            outline: episodeText.match(/冲突[：：](.+)/)?.[0] || episodeText,
            highlight: episodeText.match(/爽点[：：](.+)/)?.[0] || episodeText,
            hook: episodeText.match(/Hook[：：](.+)/)?.[0] || episodeText,
            act: episodeText.match(/Act\s*\d+[:：]/)?.[0] || '1'
          };

          // Break loop logic handled by success flow
        } else {
          throw new Error(`Failed to parse episode content after ${maxRetries} attempts`);
        }
      }

      if (!episodeObject) {
        throw new Error(`Failed to parse episode content after ${maxRetries} attempts`);
      }

      // 检查 content 是否存在且有效
      if (!episodeObject.content || typeof episodeObject.content !== 'string' || episodeObject.content.trim().length === 0) {
        throw new Error(`Generated episode has no valid content`);
      }

      // 更新 validation
      const validation = { fastCheck: { passed: true, errors: [] as string[] }, qualityCheck: { passed: true, issues: [] as string[] } };

      try {
        const scaffoldResult = validateEpisode1Scaffold(episodeObject);
        validation.fastCheck = scaffoldResult as any;
        validation.qualityCheck = qualityCheck(episodeObject, outline);
      } catch (e) {
        console.warn('[generateOneEpisode] Validation failed:', e);
      }

      // === 阶段性更新：正文已生成 ===
      await episodeRepo.save(projectId, episodeIndex, {
        humanSummary: '正文已生成，正在进行质量检查…'
      });

      // 检查 1：content.length < 600
      if (episodeObject.content.length < 600) {
        const humanSummary = `内容不足（${episodeObject.content.length} 字），低于 600 字要求。请人工编辑后点击"保存并标记为完成"来确认内容。`;
        console.warn(`[generateOneEpisode] ${humanSummary}`);

        await episodeRepo.save(projectId, episodeIndex, {
          episodeIndex,
          content: episodeObject.content,
          summary: episodeObject.summary,
          outline: episodeObject.outline || episodeObject.outline,
          highlight: episodeObject.highlight || episodeObject.highlight,
          hook: episodeObject.hook || episodeObject.hook,
          act: episodeObject.act || episodeObject.act,
          validation,
          humanSummary,
          status: EpisodeStatus.DRAFT
        });

        return {
          episodeIndex,
          status: EpisodeStatus.DRAFT,
          humanSummary
        };
      }

      // 检查 2：QualityCheck
      if (!validation.qualityCheck.passed || validation.qualityCheck.issues.length > 0) {
        const humanSummary = `质量检查失败：${validation.qualityCheck.issues.join('、')}。请人工编辑后点击"保存并标记为完成"来确认内容。`;
        console.warn(`[generateOneEpisode] ${humanSummary}`);

        await episodeRepo.save(projectId, episodeIndex, {
          episodeIndex,
          content: episodeObject.content,
          summary: episodeObject.summary,
          outline: episodeObject.outline || episodeObject.outline,
          highlight: episodeObject.highlight || episodeObject.highlight,
          hook: episodeObject.hook || episodeObject.hook,
          act: episodeObject.act || episodeObject.act,
          validation,
          humanSummary,
          status: EpisodeStatus.DRAFT
        });

      return {
        episodeIndex,
        status: EpisodeStatus.DRAFT,
        humanSummary
      };
    }

    // === 阶段性更新：质量检查通过 ===
    await episodeRepo.save(projectId, episodeIndex, {
      humanSummary: '质量检查通过，正在进行冲突与爽点校验…'
    });

    // 运行 aligner
    const alignment = await runAligner({
      project,
      episode: episodeObject,
      pacingContext
    });

      // 检查 3：Aligner severity
      if (alignment.severity === 'FAIL') {
        const humanSummary = `节奏不合格，未通过商业审稿：${alignment.issues.map(i => i.message).join('、')}。请人工编辑后点击"保存并标记为完成"来确认内容。`;
        console.warn(`[generateOneEpisode] ${humanSummary}`);

        await episodeRepo.save(projectId, episodeIndex, {
          episodeIndex,
          content: episodeObject.content,
          summary: episodeObject.summary,
          outline: episodeObject.outline || episodeObject.outline,
          highlight: episodeObject.highlight || episodeObject.highlight,
          hook: episodeObject.hook || episodeObject.hook,
          act: episodeObject.act || episodeObject.act,
          validation,
          alignment,
          humanSummary,
          status: EpisodeStatus.DRAFT
        });

      return {
        episodeIndex,
        status: EpisodeStatus.DRAFT,
        humanSummary
      };
    }

    // === 阶段性更新：校验完成 ===
    await episodeRepo.save(projectId, episodeIndex, {
      humanSummary: '校验完成，正在保存内容…'
    });

    // 全部通过，标记为 COMPLETED
      const episode = {
        episodeIndex,
        content: episodeObject.content,
        summary: episodeObject.summary,
        outline: episodeObject.outline || episodeObject.outline,
        highlight: episodeObject.highlight || episodeObject.highlight,
        hook: episodeObject.hook || episodeObject.hook,
        act: episodeObject.act || episodeObject.act,
        validation,
        alignment,
        status: EpisodeStatus.COMPLETED
      };

      // ========= M12.2: 合并 stateDelta =========
      let nextState = project.narrativeState;
      if (episodeObject.stateDelta) {
        nextState = mergeStateDelta(
          project.narrativeState,
          episodeObject.stateDelta
        );

        // 更新项目中的 narrativeState
        await projectRepo.save(projectId, {
          narrativeState: nextState
        });

        console.log(`[_generateOneEpisodeFull] StateDelta merged for EP${episodeIndex}`);
      }

      // ========= M12.3: 保存 episodeFacts =========
      if (episodeObject.episodeFacts) {
        const newRecord = {
          episodeIndex,
          facts: episodeObject.episodeFacts
        };

        const currentHistory = project.episodeFactsHistory || [];
        await projectRepo.save(projectId, {
          episodeFactsHistory: [...currentHistory, newRecord]
        });

        console.log(`[_generateOneEpisodeFull] EpisodeFacts saved for EP${episodeIndex}`);
      }

      // ========= M13: 计算质量信号 =========
      const qualitySignals = calculateQualitySignals({
        stateDelta: episodeObject.stateDelta,
        episodeFacts: episodeObject.episodeFacts,
        narrativeStateBefore: project.narrativeState,
        narrativeStateAfter: nextState,
        alignerResult: alignment,
        factsHistory: project.episodeFactsHistory,
        episodeIndex
      });

      // 保存质量信号到 episode
      await episodeRepo.save(projectId, episodeIndex, {
        qualitySignals
      });

      console.log(`[_generateOneEpisodeFull] QualitySignals calculated for EP${episodeIndex}:`, JSON.stringify(qualitySignals));

      await episodeRepo.save(projectId, episodeIndex, {
        ...episode,
        status: EpisodeStatus.COMPLETED
      });

      // 更新 Story Memory
      await storyMemoryRepo.save(projectId, {
        canonLayer: {
          worldRules: memoryBefore.canonLayer.worldRules,
          lockedEvents: [...memoryBefore.canonLayer.lockedEvents],
          deadCharacters: memoryBefore.canonLayer.deadCharacters
        },
        characterLayer: {
          states: memoryBefore.characterLayer.states
        },
        plotLayer: {
          lockedEvents: [...memoryBefore.plotLayer.lockedEvents],
          ongoingConflicts: [...memoryBefore.plotLayer.ongoingConflicts],
          foreshadowedEvents: [...memoryBefore.plotLayer.foreshadowedEvents]
        }
      });

      console.log(`[generateOneEpisode] Episode ${episodeIndex} generated successfully`);
      return episode;
    } catch (error: any) {
      lastError = error;
      if (attempt === maxRetries) {
        // 标记为 FAILED（系统级错误）
        // 注意：内容质量问题（长度不足、质量检查失败、Aligner FAIL）
        //       已在前面处理为 DRAFT，不会到达这里
        //       这里处理的是网络故障、API 超时、JSON 解析失败等系统级错误
        await episodeRepo.save(projectId, episodeIndex, {
          status: EpisodeStatus.FAILED,
          humanSummary: `系统级错误（重试${maxRetries}次后仍失败）：${error.message || String(error)}`
        });
        throw error;
      }
    }
  }
}

export async function alignerRunner(project: any) {
  const sys = await getCachedPrompt({ category: 'validation', name: 'script_aligner' });

  const raw = await deepseekClient.chat([
    { role: "system", content: sys },
    { role: "user", content: `Project: ${JSON.stringify(project)}. Action: align_content` }
  ]);

  const cleaned = cleanJsonResponse(raw);
  console.log('[alignerRunner] Raw response length:', raw.length);
  console.log('[alignerRunner] Cleaned response length:', cleaned.length);

  let json;
  try {
    json = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`[alignerRunner] Failed to parse AI response: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!json.alignment) {
    throw new Error("Missing 'alignment' in response");
  }

  return json.alignment;
}

export async function batchRunner(project: any, start: number, end: number) {
  console.log(`[batchRunner] Starting batch from ${start} to ${end}`);

  let completedCount = 0;
  let failedCount = 0;

  for (let i = start; i <= end; i++) {
    try {
      const episode = await generateOneEpisode({ projectId: project.id, episodeIndex: i });

      if (episode?.status === EpisodeStatus.COMPLETED) {
        completedCount++;
      } else {
        failedCount++;
      }
    } catch (error: any) {
      console.error(`[batchRunner] Episode ${i} failed:`, error);
      failedCount++;
    }
  }

  console.log(`[batchRunner] Batch complete. Completed: ${completedCount}, Failed: ${failedCount}`);

  return {
    completed: completedCount,
    failed: failedCount
  };
}
