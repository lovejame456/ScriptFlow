/**
 * Slot Writer - Slot-based Writer（M16）
 *
 * 职责：
 * - 只写被分配的 slot，不写整集
 * - Writer 不允许"自由发挥"
 * - Writer 不知道 episode 全文，只知道 slot 指令
 *
 * 原则：
 * - Writer 不能决定有没有 NEW_REVEAL
 * - Writer 只能决定怎么写 NEW_REVEAL
 * - slot 先于段落
 */

import { deepseekClient, ChatMessage } from './modelClients/deepseekClient';
import { jsonrepair } from 'jsonrepair';
import { getCachedPrompt } from './promptLoader';

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
      `[SlotWriter] JSON parsing failed: ${errorMsg}\n` +
      `Context: ${jsonString.substring(0, 200)}...`
    );
  }
}

/**
 * Slot 写入输入
 */
export interface SlotWriteInput {
  slots: {
    NEW_REVEAL?: {
      instruction: string;
      minLength: number;
    };
    CONFLICT_PROGRESS?: {
      instruction: string;
      minLength: number;
    };
    COST_PAID?: {
      instruction: string;
      minLength: number;
    };
  };
}

/**
 * Slot 写入输出
 */
export interface SlotWriteOutput {
  NEW_REVEAL?: string;
  CONFLICT_PROGRESS?: string;
  COST_PAID?: string;
}

/**
 * 写入 Slots
 * 
 * @param slots - Slot 写入输入
 * @param context - 上下文信息
 * @returns SlotWriteOutput - Slot 写入输出
 */
export async function writeSlots({
  slots,
  context
}: {
  slots: SlotWriteInput;
  context: {
    project: any;
    bible: any;
    characters: any[];
    outline: any;
    pacingContext: any;
    storyMemory: any;
  };
}): Promise<SlotWriteOutput> {
  
  console.log(`[SlotWriter] Writing slots for EP${context.outline.episodeIndex}`);
  console.log(`[SlotWriter] Required slots:`, Object.keys(slots.slots));

  // 如果没有需要写的 slots，返回空对象
  if (Object.keys(slots.slots).length === 0) {
    console.log(`[SlotWriter] No slots to write, returning empty output`);
    return {};
  }

  // 构建 Slot Writer 的 System Prompt
  const systemPrompt = await buildSlotWriterSystemPrompt();

  // 构建 User Prompt
  const userPrompt = buildSlotWriterUserPrompt({
    slots: slots.slots,
    context
  });

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  try {
    const raw = await deepseekClient.chat(messages, { temperature: 0.7 });
    const cleaned = cleanJsonResponse(raw);
    const json = safeJsonParse(cleaned);

    // 验证返回结构
    if (!json || typeof json !== 'object') {
      throw new Error('[SlotWriter] Invalid response structure');
    }

    // 构建输出（仅包含 Contract 中定义的 slots）
    const output: SlotWriteOutput = {};

    // 处理 NEW_REVEAL slot
    if (slots.slots.NEW_REVEAL) {
      if (!json.NEW_REVEAL || typeof json.NEW_REVEAL !== 'string') {
        throw new Error('[SlotWriter] NEW_REVEAL slot missing or not a string');
      }
      output.NEW_REVEAL = json.NEW_REVEAL.trim();
      console.log(`[SlotWriter] NEW_REVEAL slot written (${output.NEW_REVEAL.length} chars)`);
    }

    // 处理 CONFLICT_PROGRESS slot
    if (slots.slots.CONFLICT_PROGRESS) {
      if (!json.CONFLICT_PROGRESS || typeof json.CONFLICT_PROGRESS !== 'string') {
        throw new Error('[SlotWriter] CONFLICT_PROGRESS slot missing or not a string');
      }
      output.CONFLICT_PROGRESS = json.CONFLICT_PROGRESS.trim();
      console.log(`[SlotWriter] CONFLICT_PROGRESS slot written (${output.CONFLICT_PROGRESS.length} chars)`);
    }

    // 处理 COST_PAID slot
    if (slots.slots.COST_PAID) {
      if (!json.COST_PAID || typeof json.COST_PAID !== 'string') {
        throw new Error('[SlotWriter] COST_PAID slot missing or not a string');
      }
      output.COST_PAID = json.COST_PAID.trim();
      console.log(`[SlotWriter] COST_PAID slot written (${output.COST_PAID.length} chars)`);
    }

    console.log(`[SlotWriter] All slots written successfully`);
    return output;

  } catch (error: any) {
    console.error(`[SlotWriter] Failed to write slots:`, error);
    
    // 失败时不使用 fallback，直接抛出异常
    // M16 铁律：失败优于兜底
    throw new Error(
      `[SlotWriter] Failed to write slots: ${error.message || String(error)}`
    );
  }
}

/**
 * 构建 Slot Writer 的 System Prompt
 */
async function buildSlotWriterSystemPrompt(): Promise<string> {
  // 尝试加载专用 prompt，如果不存在则使用默认 prompt
  try {
    return await getCachedPrompt({ 
      category: 'execution', 
      name: 'slot_writer' 
    });
  } catch (error) {
    // 使用默认 prompt
    return `【你的身份】

你是一名商业短剧的职业编剧，正在按系统分配的「结构插槽（Slot）」写作。

【你的唯一目标（最重要）】

严格按照系统分配的 slot 指令，为每个 slot 写出高质量、符合要求的内容。

slot 是什么？
- slot 是系统预先定义的"必须出现的内容单元"
- 你不能决定有没有某个 slot
- 你只能决定怎么写这个 slot
- 每个 slot 都有明确的写作指令和最小长度要求

【硬性写作要求】

1. 必须为每个分配的 slot 生成内容
2. slot 内容不能是空字符串
3. slot 内容长度必须满足 minLength 要求
4. 必须严格按照 slot 的 instruction 写作
5. 禁止自由发挥，禁止添加系统未分配的 slot

【输出格式】

严格 JSON 格式：
{
  "NEW_REVEAL": "具体文本内容...",
  "CONFLICT_PROGRESS": "具体文本内容...",
  "COST_PAID": "具体文本内容..."
}

注意：
- 只输出分配的 slots，不要输出未分配的 slots
- 文本必须是完整的短剧片段，包含动作、对话、场景等
- 文本必须是可读的、符合商业短剧标准的

【系统提示】

Slot 缺失 = 失败

Slot 不满足 minLength = 失败

Slot 内容与 instruction 不符 = 失败

你不需要解释，不需要自检，只需要按照 slot 指令把内容写好
`;
  }
}

/**
 * 构建 Slot Writer 的 User Prompt
 */
function buildSlotWriterUserPrompt({
  slots,
  context
}: {
  slots: NonNullable<SlotWriteInput['slots']>;
  context: {
    project: any;
    bible: any;
    characters: any[];
    outline: any;
    pacingContext: any;
    storyMemory: any;
  };
}): string {
  const slotInstructions: string[] = [];

  // 构建每个 slot 的指令
  if (slots.NEW_REVEAL) {
    slotInstructions.push(`【Slot 1: NEW_REVEAL】
最小长度：${slots.NEW_REVEAL.minLength} 字
写作指令：${slots.NEW_REVEAL.instruction}`);
  }

  if (slots.CONFLICT_PROGRESS) {
    slotInstructions.push(`【Slot 2: CONFLICT_PROGRESS】
最小长度：${slots.CONFLICT_PROGRESS.minLength} 字
写作指令：${slots.CONFLICT_PROGRESS.instruction}`);
  }

  if (slots.COST_PAID) {
    slotInstructions.push(`【Slot 3: COST_PAID】
最小长度：${slots.COST_PAID.minLength} 字
写作指令：${slots.COST_PAID.instruction}`);
  }

  return `【项目信息】
- 题材：${context.project.genre}
- 总集数：${context.project.totalEpisodes}
- Logline：${context.project.logline}

【本集大纲】
- 集数：EP${context.outline.episodeIndex}
- 幕次：Act ${context.outline.act}
- 摘要：${context.outline.summary}
- 冲突：${context.outline.conflict}
- 爽点：${context.outline.highlight}

【角色信息】
${context.characters.map((char: any) => `- ${char.name}（${char.roleType}）: ${char.description}`).join('\n')}

【Slot 写作任务】

${slotInstructions.join('\n\n')}

【写作要求】
1. 严格按照以上 slot 指令写作
2. 每个 slot 内容必须完整、有画面感、符合短剧标准
3. 文本必须包含动作描述、对话、场景切换等元素
4. 禁止输出空内容、禁止输出占位符、禁止输出"待填充"等无效内容
5. 只输出 JSON 格式，不要输出其他任何内容

【现在开始】
请为上述 slots 写出高质量内容。`;
}

