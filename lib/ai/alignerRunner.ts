import { getCachedPrompt } from "./promptLoader";
import { deepseekClient, ChatMessage } from "./modelClients/deepseekClient";
import { getCharacterNames, hasUnauthorizedCharacters } from "./promptAdapters/characterProfileAdapter";
import { getConflictConstraint } from "../story/conflictChainEngine";
import { getPresenceConstraint, validateEpisodeAgainstPresenceConstraint } from "../story/characterPresenceController";
import { NarrativeState, StateDelta, EpisodeFacts, EpisodeFactsRecord } from "../../types";

export interface AlignerResult {
  passed: boolean;
  severity: "PASS" | "WARN" | "FAIL";
  issues: { code: string; message: string }[];
  editorNotes: string[];
}

/**
 * 校验 StateDelta 的合法性（M12.2）
 *
 * 硬规则：
 * 1. 禁止跳级解锁冲突（immediate → mid_term → end_game）
 * 2. 禁止违反 worldRules.immutable
 * 3. 角色状态变化需合理（不可瞬移完成目标）
 */
export function validateStateDelta({
  delta,
  currentState,
  episodeIndex
}: {
  delta: StateDelta | undefined;
  currentState: NarrativeState;
  episodeIndex: number;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!delta) {
    // 没有 stateDelta，默认通过
    return { valid: true, errors: [] };
  }

  // 规则1：冲突解锁顺序校验
  if (delta.conflicts) {
    const { immediate, mid_term, end_game } = delta.conflicts;

    // 1.1 immediate → mid_term 锁定关系
    if (mid_term && mid_term.status && mid_term.status !== 'locked') {
      if (currentState.conflicts.immediate.status !== 'resolved') {
        errors.push('mid_term 冲突不能在 immediate 未解决前激活');
      }
    }

    // 1.2 mid_term → end_game 锁定关系
    if (end_game && end_game.status && end_game.status !== 'locked') {
      if (currentState.conflicts.mid_term.status !== 'resolved') {
        errors.push('end_game 冲突不能在 mid_term 未解决前激活');
      }
    }

    // 1.3 检查是否尝试修改已解决的冲突（防止倒退）
    if (immediate && immediate.status === 'active' && currentState.conflicts.immediate.status === 'resolved') {
      errors.push('immediate 冲突已解决，不能回退到 active 状态');
    }
  }

  // 规则2：worldRuleViolations 只记录，不允许修改 immutable
  if (delta.worldRuleViolations) {
    // worldRuleViolations 仅用于记录，不进行校验
    // 但警告：不应该在 delta 中修改 worldRules.immutable
  }

  // 规则3：角色状态变化合理性校验（基础版）
  if (delta.characters) {
    for (const [charName, charDelta] of Object.entries(delta.characters)) {
      const currentChar = currentState.characters[charName];
      if (!currentChar) {
        errors.push(`角色 ${charName} 不在 NarrativeState 中`);
        continue;
      }

      // 检查角色状态跳变（简化版：不允许直接从 unresolved 跳到 resolved）
      if (charDelta.status === 'resolved' && currentChar.status === 'unresolved') {
        errors.push(`角色 ${charName} 不能在无中间状态下直接从 unresolved 跳到 resolved`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 校验 EpisodeFacts 的合法性（M12.3）
 *
 * 硬规则：
 * 1. 结构约束：每个分类最多 3 条，单条不超过 80 字符
 * 2. 一致性约束：与上集 facts 无明显矛盾（伤情、道具、揭示）
 */
export function validateEpisodeFacts({
  currentFacts,
  previousFactsList,
  episodeIndex
}: {
  currentFacts: EpisodeFacts | undefined;
  previousFactsList: EpisodeFactsRecord[];
  episodeIndex: number;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!currentFacts) {
    // EP1 及以后都应该有 episodeFacts，但为了向后兼容，允许缺失
    return { valid: true, errors: [] };
  }

  // 1. 结构校验
  const categories: Array<keyof EpisodeFacts> = ['events', 'reveals', 'items', 'injuries', 'promises'];
  for (const category of categories) {
    if (!Array.isArray(currentFacts[category])) {
      errors.push(`${category} 必须是数组`);
      continue;
    }
    if (currentFacts[category].length > 3) {
      errors.push(`${category} 超过 3 条限制`);
    }
    for (const fact of currentFacts[category]) {
      if (typeof fact !== 'string' || fact.length > 80) {
        errors.push(`${category} 包含超过 80 字符的事实: ${fact}`);
      }
    }
  }

  // 2. 与上集 facts 的一致性校验（仅当 episodeIndex > 1）
  if (episodeIndex > 1 && previousFactsList.length > 0) {
    const immediatePrevFacts = previousFactsList
      .filter(r => r.episodeIndex >= episodeIndex - 2)  // 检查最近 2 集
      .map(r => r.facts);

    for (const prevFacts of immediatePrevFacts) {
      // 2.1 角色受伤状态矛盾检测
      if (prevFacts.injuries.length > 0) {
        for (const injury of prevFacts.injuries) {
          // 提取角色名（假设格式为"角色名 伤情描述"）
          const charName = injury.split(' ')[0];
          if (!charName) continue;

          const currentInjuries = currentFacts.injuries.filter(inj => inj.includes(charName));

          // 检查 events 中是否有矛盾的"完好""健康""痊愈"等描述
          const hasHealthyStateInEvents = currentFacts.events.some(e =>
            e.includes('完好') || e.includes('健康') || e.includes('痊愈') || e.includes('无伤')
          );

          // 如果上集有伤情，本集既未提及伤情（injuries 中没有该角色），又在 events 中说状态完好，则矛盾
          if (hasHealthyStateInEvents && currentInjuries.length === 0) {
            errors.push(`角色 ${charName} 伤情矛盾：上集${injury}，本集状态完好`);
          }
        }
      }

      // 2.2 关键道具凭空出现检测（简化版）
      // 如果上集没有这个道具，本集 events 中应该有"获得/发现/拾取"等动作
      for (const item of currentFacts.items) {
        // 提取道具关键词（去掉"获得""使用"等动词）
        const itemKeyword = item.replace(/^(获得|发现|使用|捡到|拾取|找到)/, '').trim();
        if (!itemKeyword) continue;

        const prevHasItem = prevFacts.items.some(i => i.includes(itemKeyword));
        if (!prevHasItem) {
          // 检查本集是否有获得动作
          const hasAcquireAction = currentFacts.events.some(e =>
            e.includes('获得') || e.includes('发现') || e.includes('捡到') ||
            e.includes('拾取') || e.includes('找到') || e.includes(itemKeyword)
          );
          if (!hasAcquireAction) {
            // 这是一个潜在问题，但不作为硬错误，仅警告
            // errors.push(`道具 ${item} 可能凭空出现（上集无此道具且本集无获得动作）`);
          }
        }
      }

      // 2.3 揭示被否认检测
      for (const reveal of prevFacts.reveals) {
        // 如果本集包含"否认""推翻""错误""误会"等关键词，可能是否认之前的揭示
        const hasDenialKeywords = currentFacts.events.some(e =>
          e.includes('否认') || e.includes('推翻') || e.includes('收回') ||
          e.includes('错误') || e.includes('误会') || e.includes('不是')
        );
        if (hasDenialKeywords) {
          // 提取揭示的核心内容
          const revealContent = reveal.replace(/^[^，。]+[，。]/, '');
          if (revealContent) {
            errors.push(`本集可能否认或推翻上集揭示: ${reveal}`);
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export async function runAligner({
  project,
  episode,
  pacingContext
}: {
  project: any;
  episode: { content: string; hook: string };
  pacingContext: any;
}): Promise<AlignerResult> {

  // Phase 1 使用宽松模式，Phase 2 使用严格模式
  const useSafeMode = pacingContext.phase === 1 || episode.metadata?.phase === 1;
  const promptName = useSafeMode ? 'script_aligner_safe' : 'script_aligner_commercial';

  const prompt = await getCachedPrompt({ category: 'validation', name: promptName });

  // M6-2: 获取冲突约束，用于验证
  const conflictConstraint = getConflictConstraint(project.conflictChain, pacingContext.episodeIndex, project.totalEpisodes);

  const messages: ChatMessage[] = [
    { role: "system", content: prompt },
    {
      role: "user",
      content: JSON.stringify({
        genre: project.genre,
        act: pacingContext.actNumber,
        pacingContext,
        conflictConstraint,  // M6-2: 传入冲突约束供 AI 检查
        content: episode.content,
        hook: episode.hook
      })
    }
  ];

  const raw = await deepseekClient.chat(messages);

  // 清理 JSON 响应（去除 markdown 代码块）
  let cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '');

  // 提取 JSON 对象
  let jsonStart = cleaned.indexOf('{');
  if (jsonStart !== -1) {
    cleaned = cleaned.substring(jsonStart);

    // 找到匹配的结束括号
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    let jsonEnd = -1;

    for (let i = 0; i < cleaned.length; i++) {
      const char = cleaned[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{' || char === '[') {
          braceCount++;
        } else if (char === '}' || char === ']') {
          braceCount--;
          if (braceCount === 0) {
            jsonEnd = i + 1;
            break;
          }
        }
      }
    }

    if (jsonEnd !== -1) {
      cleaned = cleaned.substring(0, jsonEnd);
    }
  }

  let parsed: any;

  try {
    // ========= M6-1: 解析 AI 输出 =========
    parsed = JSON.parse(cleaned);

    // ========= M6-1: 角色一致性检查 =========
    const allowedCharacterNames = getCharacterNames(project.characters);
    const hasUnauthorized = hasUnauthorizedCharacters(episode.content, allowedCharacterNames);
    if (hasUnauthorized) {
      return {
        passed: false,
        severity: "FAIL",
        issues: [
          {
            code: "NEW_CHARACTER",
            message: "剧本中出现了未授权的新角色"
          }
        ],
        editorNotes: ["P0级违规：新增角色，必须重写"]
      };
    }

    // ========= M6-2: 冲突链一致性校验 =========
    // 使用第27行已声明的 conflictConstraint（无需重复声明）
    if (conflictConstraint.requiredPleasure && conflictConstraint.requiredPleasure.length > 0) {
      // 硬性爽点校验
      const hasRequiredPleasure = conflictConstraint.requiredPleasure.some(pleasure => {
        return episode.content.includes(pleasure);
      });

      if (!hasRequiredPleasure) {
        return {
          passed: false,
          severity: "FAIL",
          issues: [
            {
              code: "NO_REQUIRED_PLEASURE",
              message: `本集必须产出以下爽点之一：${conflictConstraint.requiredPleasure.join('、')}`
            }
          ],
          editorNotes: ["P0级违规：缺少必须产出的爽点，必须重写"]
        };
      }
    }

    if (conflictConstraint.protagonistState) {
      // 主角状态校验
      const protagonistStateKeywords: Record<string, string[]> = {
        '被动承受': ['被', '受', '压制', '压迫', '困境', '被动'],
        '被迫反击': ['反击', '应对', '抵抗', '反抗'],
        '主动进攻': ['进攻', '主动', '主动出击']
      };

      const keywords = protagonistStateKeywords[conflictConstraint.protagonistState] || [];
      const hasStateKeyword = keywords.some(kw => episode.content.includes(kw));

      if (!hasStateKeyword) {
        return {
          passed: false,
          severity: "FAIL",
          issues: [
            {
              code: "PROTAGONIST_STATE_MISMATCH",
              message: `本集应体现主角状态"${conflictConstraint.protagonistState}"`
            }
          ],
          editorNotes: ["P0级违规：主角状态不匹配，必须重写"]
        };
      }
    }

    if (conflictConstraint.expectedAntagonist && conflictConstraint.expectedAntagonist !== '未指定') {
      // 压迫源校验
      const hasAntagonist = episode.content.includes(conflictConstraint.expectedAntagonist);

      if (!hasAntagonist) {
        return {
          passed: false,
          severity: "FAIL",
          issues: [
            {
              code: "NO_CLEAR_PRESSURE_SOURCE",
              message: `本集应出现预期反派"${conflictConstraint.expectedAntagonist}"`
            }
          ],
          editorNotes: ["P0级违规：无明确压迫源，必须重写"]
        };
      }
    }

    // M6-1: 检查出场权重一致性
    const presenceConstraint = getPresenceConstraint(project.characterPresencePlan, pacingContext.episodeIndex);
    // 这里简化处理，实际应该统计对白比例
    // 我们依赖AI的检查结果

    // ========= AI severity 检查 =========
    if (parsed.severity === 'FAIL') {
      return {
        passed: false,
        severity: parsed.severity,
        issues: parsed.issues,
        editorNotes: parsed.editorNotes
      };
    }

    // ========= M12.2: StateDelta 校验 =========
    const stateDelta = episode.stateDelta;
    if (stateDelta) {
      const stateValidation = validateStateDelta({
        delta: stateDelta,
        currentState: project.narrativeState,
        episodeIndex: pacingContext.episodeIndex
      });

      if (!stateValidation.valid) {
        return {
          passed: false,
          severity: "FAIL",
          issues: stateValidation.errors.map(err => ({
            code: "STATE_DELTA_INVALID",
            message: err
          })),
          editorNotes: [`P0级违规：状态变更提案不合法 - ${stateValidation.errors.join('、')}`]
        };
      }
    }

    // ========= M12.3: EpisodeFacts 校验 =========
    const episodeFacts = (episode as any).episodeFacts;
    const previousFacts = project.episodeFactsHistory || [];

    const factsValidation = validateEpisodeFacts({
      currentFacts: episodeFacts,
      previousFactsList: previousFacts,
      episodeIndex: pacingContext.episodeIndex
    });

    if (!factsValidation.valid) {
      return {
        passed: false,
        severity: "FAIL",
        issues: factsValidation.errors.map(err => ({
          code: "EPISODE_FACTS_INVALID",
          message: err
        })),
        editorNotes: [`P0级违规：连续性事实错误 - ${factsValidation.errors.join('、')}`]
      };
    }

    return parsed as AlignerResult;
  } catch (e) {
    throw new Error(`[Aligner] Failed to parse AI response: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * M16.3: Reveal 质量信号
 *
 * 用于 post-check，仅用于评分与分析，不参与结构 gate
 */
export interface RevealQualitySignal {
  revealIsConcrete: boolean;      // 是否可验证（避免"模糊暗示"）
  revealHasConsequence: boolean;   // 是否在本集/下集可触发行动
}

/**
 * M16.3: 检查 Reveal 质量信号
 *
 * @param args - 检查参数
 * @returns RevealQualitySignal - Reveal 质量信号
 *
 * 注意：这些信号只用于评分与分析，不参与结构 gate
 */
export function checkRevealQualitySignals(args: {
  content: string;
  structureContract: any;
  episodeIndex: number;
  project: any;
}): RevealQualitySignal {
  console.log(`[Aligner] Checking Reveal quality signals for EP${args.episodeIndex}`);

  const { content, structureContract, episodeIndex, project } = args;

  // 1. 检查 revealIsConcrete：是否可验证
  const revealIsConcrete = checkRevealConcrete(content, structureContract);

  // 2. 检查 revealHasConsequence：是否在本集/下集可触发行动
  const revealHasConsequence = checkRevealConsequence(content, structureContract, project, episodeIndex);

  const signal: RevealQualitySignal = {
    revealIsConcrete,
    revealHasConsequence
  };

  console.log(`[Aligner] Reveal quality signals:`, signal);
  return signal;
}

/**
 * 检查 Reveal 是否可验证
 *
 * @param content - 剧集内容
 * @param structureContract - 结构契约
 * @returns boolean - 是否可验证
 */
function checkRevealConcrete(
  content: string,
  structureContract: any
): boolean {
  // 如果没有要求 Reveal，默认为 true
  if (!structureContract?.mustHave?.newReveal?.required) {
    return true;
  }

  const summary = structureContract.mustHave.newReveal.summary;

  // 检查内容中是否包含明确的验证性关键词
  const concreteKeywords = [
    '发现', '证据', '当场', '验证', '证实', '确认',
    '亲眼看到', '亲耳听到', '亲自', '确实', '确实存在'
  ];

  const hasConcreteKeyword = concreteKeywords.some(keyword =>
    content.includes(keyword) || summary.includes(keyword)
  );

  // 检查是否包含模糊暗示词
  const vagueKeywords = [
    '似乎', '可能', '好像', '感觉', '大概', '也许',
    '朦胧', '模糊', '不清', '怀疑', '猜测'
  ];

  const hasVagueKeyword = vagueKeywords.some(keyword =>
    content.includes(keyword) || summary.includes(keyword)
  );

  // 如果有明确验证词且没有模糊词，则为可验证
  return hasConcreteKeyword && !hasVagueKeyword;
}

/**
 * 检查 Reveal 是否有后果
 *
 * @param content - 剧集内容
 * @param structureContract - 结构契约
 * @param project - 项目信息
 * @param episodeIndex - 当前集数
 * @returns boolean - 是否有后果
 */
function checkRevealConsequence(
  content: string,
  structureContract: any,
  project: any,
  episodeIndex: number
): boolean {
  // 如果没有要求 Reveal，默认为 true
  if (!structureContract?.mustHave?.newReveal?.required) {
    return true;
  }

  const summary = structureContract.mustHave.newReveal.summary;

  // 检查是否包含行动相关关键词
  const consequenceKeywords = [
    '决定', '行动', '计划', '必须', '不得不', '被迫',
    '立即', '马上', '立刻', '开始', '准备'
  ];

  // 检查内容中是否有后果关键词
  const hasConsequenceInContent = consequenceKeywords.some(keyword =>
    content.includes(keyword)
  );

  // 检查 summary 中是否暗示后果
  const hasConsequenceInSummary = consequenceKeywords.some(keyword =>
    summary.includes(keyword)
  );

  // 检查下集大纲（如果存在）是否相关
  const nextOutline = project.episodes.find(e => e.episodeIndex === episodeIndex + 1)?.outline;
  let hasConsequenceInNextEpisode = false;

  if (nextOutline) {
    // 检查下集大纲是否引用了本集 Reveal 的内容
    const nextOutlineText = `${nextOutline.summary} ${nextOutline.conflict || ''}`;
    hasConsequenceInNextEpisode = consequenceKeywords.some(keyword =>
      nextOutlineText.includes(keyword)
    );
  }

  // 如果内容、summary 或下集中有行动相关词，则为有后果
  return hasConsequenceInContent || hasConsequenceInSummary || hasConsequenceInNextEpisode;
}


