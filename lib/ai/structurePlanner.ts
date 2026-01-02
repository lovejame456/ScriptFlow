/**
 * Structure Planner - 结构规划器（M16）
 *
 * 职责：
 * - 在任何 Writer 调用前，决定本集"必须出现的结构"
 * - 生成机器可解析、可校验的 StructureContract（JSON，强约束）
 *
 * 原则：
 * - 结构先于内容：没 Contract，不生成
 * - slot 先于段落：Writer 不允许"自由发挥"
 * - 失败优于兜底：宁可 FAIL，也不污染系统信号
 */

import { deepseekClient, ChatMessage } from './modelClients/deepseekClient';
import { getCachedPrompt } from './promptLoader';
import { jsonrepair } from 'jsonrepair';
// M16.3: 导入 revealScheduler
import {
  generateRevealPolicy,
  generateNoRepeatKey,
  RevealHistory,
  validateRevealSummary
} from './revealScheduler';
// M16.3: 导入 antagonistBinder
import {
  bindRevealToAntagonistPressure,
  validateRevealAgainstBinding,
  AntagonistPressureBinding
} from './antagonistBinder';

/**
 * 辅助函数：清理 AI 返回的 JSON 响应（去除 markdown 代码块和注释）
 */
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
    // 只要找到开始，就假设后面都是 JSON 内容（可能被截断），交给 jsonrepair 处理
    cleaned = cleaned.substring(jsonStart);
  }

  // 移除开头和结尾的空白
  cleaned = cleaned.trim();
  return cleaned;
}

/**
 * 辅助函数：使用 jsonrepair 修复各种非标准 JSON 格式
 */
function safeJsonParse(jsonString: string): any {
  try {
    // 使用 jsonrepair 库进行基础修复
    const repaired = jsonrepair(jsonString);
    return JSON.parse(repaired);
  } catch (repairError) {
    const errorMsg = repairError instanceof Error ? repairError.message : String(repairError);
    throw new Error(
      `[StructurePlanner] JSON parsing failed: ${errorMsg}\n` +
      `Context: ${jsonString.substring(0, 200)}...`
    );
  }
}

/**
 * New Reveal 类型枚举
 */
export type RevealType = 'FACT' | 'INFO' | 'RELATION' | 'IDENTITY';

/**
 * 结构契约（Structure Contract）
 *
 * 这是 Writer 之前的必经产物，机器可解析、可校验
 *
 * M16.3 新增字段：
 * - cadenceTag: 调度标签（NORMAL / SPIKE）
 * - noRepeatKey: 去重 key（用于防止同义重复）
 * - pressureVector: 压力向量（来自 antagonist binder）
 * - pressureHint: 压力提示（用于指导 writer）
 */
export interface StructureContract {
  episode: number;
  mustHave: {
    newReveal: {
      required: boolean;
      type: RevealType;
      scope: 'PROTAGONIST' | 'ANTAGONIST' | 'WORLD';
      summary: string;
      cadenceTag?: 'NORMAL' | 'SPIKE';        // M16.3: 调度标签
      noRepeatKey?: string;                     // M16.3: 去重 key
      pressureVector?: string;                  // M16.3: 压力向量
      pressureHint?: string;                     // M16.3: 压力提示
    };
  };
  optional: {
    conflictProgressed?: boolean;
    costPaid?: boolean;
  };
}

/**
 * 生成结构契约
 *
 * @param episodeIndex - 剧集编号
 * @param project - 项目信息
 * @param outline - 本集大纲
 * @returns StructureContract - 结构契约
 *
 * M16.3: 集成 revealScheduler 实现类型调度和去重
 */
export async function generateStructureContract({
  episodeIndex,
  project,
  outline
}: {
  episodeIndex: number;
  project: any;
  outline: any;
}): Promise<StructureContract> {

  console.log(`[StructurePlanner] Generating contract for EP${episodeIndex}`);

  // M16.3: 获取 revealHistory
  const revealHistory: RevealHistory[] = project.revealHistory || [];

  // 硬规则：Episode >= 2 必须有 New Reveal
  const isNewRevealRequired = episodeIndex >= 2;

  // 如果 EP1，直接返回简单契约（不需要 AI）
  if (episodeIndex === 1) {
    const contract: StructureContract = {
      episode: episodeIndex,
      mustHave: {
        newReveal: {
          required: false,
          type: 'FACT',
          scope: 'PROTAGONIST',
          summary: 'EP1 无需强制 New Reveal'
        }
      },
      optional: {
        conflictProgressed: true,
        costPaid: false
      }
    };
    
    console.log(`[StructurePlanner] EP1 contract generated (no AI)`);
    return contract;
  }

  // EP2+ 使用 AI 生成结构契约
  try {
    // M16.3: 使用 revealScheduler 生成 Reveal Policy
    const revealPolicy = generateRevealPolicy(episodeIndex, revealHistory);
    console.log(`[StructurePlanner] Generated reveal policy:`, revealPolicy);

    const systemPrompt = await getCachedPrompt({
      category: 'planning',
      name: 'structure_planner'
    });

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: JSON.stringify({
          episodeIndex,
          project: {
            genre: project.genre,
            logline: project.logline,
            totalEpisodes: project.totalEpisodes
          },
          outline: {
            summary: outline.summary,
            conflict: outline.conflict,
            highlight: outline.highlight,
            act: outline.act
          },
          isNewRevealRequired,
          // M16.3: 传递 revealPolicy 到 AI
          revealPolicy: {
            required: revealPolicy.required,
            type: revealPolicy.type,
            scope: revealPolicy.scope,
            avoidTypes: revealPolicy.avoidTypes
          },
          // 强制：EP2+ 必须有 New Reveal
          hardRules: {
            newRevealRequired: isNewRevealRequired,
            revealTypes: ['FACT', 'INFO', 'RELATION', 'IDENTITY'],
            revealScopes: ['PROTAGONIST', 'ANTAGONIST', 'WORLD']
          }
        })
      }
    ];

    const raw = await deepseekClient.chat(messages, { temperature: 0.3 });
    const cleaned = cleanJsonResponse(raw);
    const json = safeJsonParse(cleaned);

    // 验证返回结构
    if (!json || typeof json !== 'object') {
      throw new Error('[StructurePlanner] Invalid response structure');
    }

    // 强制硬规则覆盖（确保 required = true）
    if (isNewRevealRequired) {
      json.mustHave = json.mustHave || {};
      json.mustHave.newReveal = json.mustHave.newReveal || {};
      json.mustHave.newReveal.required = true;
    }

    // 验证必需字段
    if (!json.mustHave?.newReveal?.type) {
      throw new Error('[StructurePlanner] Missing required field: mustHave.newReveal.type');
    }
    if (!json.mustHave?.newReveal?.scope) {
      throw new Error('[StructurePlanner] Missing required field: mustHave.newReveal.scope');
    }
    if (!json.mustHave?.newReveal?.summary) {
      throw new Error('[StructurePlanner] Missing required field: mustHave.newReveal.summary');
    }

    // 验证枚举值
    const validRevealTypes: RevealType[] = ['FACT', 'INFO', 'RELATION', 'IDENTITY'];
    if (!validRevealTypes.includes(json.mustHave.newReveal.type)) {
      throw new Error(`[StructurePlanner] Invalid reveal type: ${json.mustHave.newReveal.type}`);
    }

    const validScopes = ['PROTAGONIST', 'ANTAGONIST', 'WORLD'];
    if (!validScopes.includes(json.mustHave.newReveal.scope)) {
      throw new Error(`[StructurePlanner] Invalid reveal scope: ${json.mustHave.newReveal.scope}`);
    }

    // M16.3: 验证 Reveal summary 是否符合约束
    const summaryValidation = validateRevealSummary(revealPolicy, json.mustHave.newReveal.summary, revealHistory);
    if (!summaryValidation.valid) {
      throw new Error(`[StructurePlanner] ${summaryValidation.error}`);
    }

    // M16.3: 绑定到反派压力
    const antagonistBinding = bindRevealToAntagonistPressure({
      episode: episodeIndex,
      revealType: json.mustHave.newReveal.type,
      revealScope: json.mustHave.newReveal.scope,
      project,
      outline
    });

    // M16.3: 验证 Reveal summary 是否符合压力绑定要求
    const bindingValidation = validateRevealAgainstBinding(
      json.mustHave.newReveal.summary,
      antagonistBinding
    );
    if (!bindingValidation.valid) {
      throw new Error(`[StructurePlanner] ${bindingValidation.error}`);
    }

    // M16.3: 生成去重 key
    const noRepeatKey = generateNoRepeatKey(json.mustHave.newReveal.summary);

    // M16.3: 生成 cadenceTag（简单实现：EP6 为 SPIKE，其他为 NORMAL）
    const cadenceTag: 'NORMAL' | 'SPIKE' = episodeIndex === 6 ? 'SPIKE' : 'NORMAL';

    // 构建完整的契约
    const contract: StructureContract = {
      episode: episodeIndex,
      mustHave: {
        newReveal: {
          required: json.mustHave.newReveal.required,
          type: json.mustHave.newReveal.type,
          scope: json.mustHave.newReveal.scope,
          summary: json.mustHave.newReveal.summary,
          // M16.3: 添加新字段
          cadenceTag,
          noRepeatKey,
          pressureVector: antagonistBinding.pressure,
          pressureHint: antagonistBinding.hint
        }
      },
      optional: {
        conflictProgressed: json.optional?.conflictProgressed,
        costPaid: json.optional?.costPaid
      }
    };

    console.log(`[StructurePlanner] Contract generated for EP${episodeIndex}:`, {
      newReveal: {
        required: contract.mustHave.newReveal.required,
        type: contract.mustHave.newReveal.type,
        scope: contract.mustHave.newReveal.scope,
        summary: contract.mustHave.newReveal.summary.substring(0, 50) + '...',
        cadenceTag: contract.mustHave.newReveal.cadenceTag,
        noRepeatKey: contract.mustHave.newReveal.noRepeatKey,
        pressureVector: contract.mustHave.newReveal.pressureVector
      }
    });

    return contract;

  } catch (error: any) {
    console.error(`[StructurePlanner] Failed to generate contract for EP${episodeIndex}:`, error);
    
    // 失败时不使用 fallback，直接抛出异常
    // M16 铁律：失败优于兜底
    throw new Error(
      `[StructurePlanner] Failed to generate structure contract for EP${episodeIndex}: ${error.message || String(error)}`
    );
  }
}

/**
 * 根据 StructureContract 构建 SlotWriteInput
 * 
 * @param contract - 结构契约
 * @param outline - 本集大纲
 * @returns SlotWriteInput - Slot 写入输入
 */
export function buildSlotWriteInput(
  contract: StructureContract,
  outline: any
): any {
  const slots: any = {};

  // 如果 New Reveal 是必须的，添加 NEW_REVEAL slot
  if (contract.mustHave.newReveal.required) {
    const revealTypeLabel = {
      'FACT': '事实',
      'INFO': '信息',
      'RELATION': '关系',
      'IDENTITY': '身份'
    }[contract.mustHave.newReveal.type];

    const scopeLabel = {
      'PROTAGONIST': '主角',
      'ANTAGONIST': '反派',
      'WORLD': '世界观'
    }[contract.mustHave.newReveal.scope];

    slots.NEW_REVEAL = {
      instruction: `必须清晰呈现一个关于${scopeLabel}的${revealTypeLabel}类新揭示：${contract.mustHave.newReveal.summary}。该揭示必须是明确、不可逆的新信息，将直接影响后续剧情。`,
      minLength: 80
    };
  }

  // 如果可选的冲突推进存在，添加 CONFLICT_PROGRESS slot
  if (contract.optional.conflictProgressed) {
    slots.CONFLICT_PROGRESS = {
      instruction: `围绕本集大纲"${outline.summary}"推进一次外部冲突，体现冲突升级或阶段性变化。`,
      minLength: 0
    };
  }

  // 如果可选的代价支付存在，添加 COST_PAID slot
  if (contract.optional.costPaid) {
    slots.COST_PAID = {
      instruction: `主角为目标付出可感知的代价（如受伤、损失、被羞辱等），让决策更有分量。`,
      minLength: 0
    };
  }

  return { slots };
}

