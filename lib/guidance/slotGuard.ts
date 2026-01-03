/**
 * Slot Guard - Slot 保护机制（S1）
 *
 * 职责：
 * - 提供安全的 slot 合并与保底机制
 * - 防止指令系统破坏必需的 slots
 * - 确保 CONFLICT_PROGRESS 等必需 slot 永远存在且为非空 string
 *
 * 原则：
 * - 指令只能增强，不能破坏必需 slot
 * - 失败优于兜底，但结构完整性必须有保证
 */

/**
 * Slots 类型定义
 */
export type Slots = Record<string, unknown>;

/**
 * 必需 slot 常量定义
 * 
 * 这些 slot 必须始终存在，否则会导致 SlotWriter 校验失败
 * 
 * 注意：如果未来有更多必需 slot（如 NEW_REVEAL / PROMISE_ADDRESS / STATE_UPDATE 等），
 * 可以在此添加
 */
const REQUIRED_SLOTS = [
  'CONFLICT_PROGRESS',
  // 如果有其他必需 slot，可在此添加：
  // 'NEW_REVEAL',
  // 'COST_PAID',
] as const;

/**
 * 将任意值转换为字符串
 * 
 * @param v - 待转换的值
 * @returns string | null - 转换后的字符串，失败则返回 null
 * 
 * 兼容性说明：
 * - 字符串：直接 trim 返回
 * - null/undefined：返回 null
 * - 对象/数组：使用 JSON.stringify 转换
 * - 其他类型：强制转换为字符串
 */
function normalizeToString(v: unknown): string | null {
  if (typeof v === 'string') {
    return v.trim();
  }
  
  if (v == null) {
    return null;
  }
  
  // 兼容某些模型返回对象 / 数组的情况
  try {
    const s = JSON.stringify(v);
    return typeof s === 'string' ? s.trim() : null;
  } catch {
    return null;
  }
}

/**
 * 安全合并 slots 对象
 * 
 * @param base - 基础 slots（通常来自原始 contract）
 * @param patch - 补丁 slots（来自指令或增强）
 * @returns Slots - 合并后的 slots
 * 
 * 合并规则：
 * - patch 的值会覆盖 base 的同名 slot
 * - 不修改 base 原对象，返回新对象
 * - 不进行类型检查，由 ensureRequiredSlots 负责校验
 */
export function mergeSlots(base: Slots, patch: Slots): Slots {
  return { ...base, ...patch };
}

/**
 * 确保必需 slot 存在且为非空 string
 * 
 * @param slots - 待检查的 slots 对象
 * @param fallback - 可选的兜底值（优先使用，而不是默认文案）
 * @returns Slots - 保证必需 slot 存在的 slots
 * 
 * 保底策略：
 * 1. 如果 slot 已存在且为非空 string，保持不变
 * 2. 如果 slot 不存在或无效，尝试使用 fallback 中的值
 * 3. 如果 fallback 也不可用，使用默认兜底文案
 * 
 * 注意：
 * - 这不是"放水"，只是"结构不被破坏"
 * - 默认文案不会影响剧情，但保证管线能跑
 * - fallback 优先使用旧值，保留之前的有效内容
 */
export function ensureRequiredSlots(slots: Slots, fallback?: Partial<Record<string, string>>): Slots {
  const out: Slots = { ...slots };

  for (const k of REQUIRED_SLOTS) {
    const s = normalizeToString(out[k]);
    
    // 如果 slot 已存在且有效，跳过
    if (s && s.length >= 1) {
      continue;
    }

    // 尝试使用 fallback 值（通常保留旧值）
    const fb = fallback?.[k];
    if (fb && fb.trim().length > 0) {
      out[k] = fb.trim();
      continue;
    }

    // 使用默认兜底文案（最小合法字符串）
    // 根据不同 slot 使用不同的默认文案
    if (k === 'CONFLICT_PROGRESS') {
      out[k] = '本集冲突推进：主角被迫做出选择，局势进一步恶化。';
    }
    // 如果有其他必需 slot，可在此添加对应的默认文案
    // else if (k === 'NEW_REVEAL') {
    //   out[k] = '本集揭示新信息：主角发现关键事实，处境发生改变。';
    // }
  }

  return out;
}

/**
 * 检查 slots 是否包含所有必需 slot
 * 
 * @param slots - 待检查的 slots 对象
 * @returns boolean - 是否包含所有必需 slot
 * 
 * 用途：
 * - 在 writeSlots 前预检查
 * - 提前发现问题，避免在 AI 调用后才发现
 */
export function hasRequiredSlots(slots: Slots): boolean {
  for (const k of REQUIRED_SLOTS) {
    const s = normalizeToString(slots[k]);
    if (!s || s.length < 1) {
      return false;
    }
  }
  return true;
}

/**
 * 获取缺失的必需 slot 列表
 * 
 * @param slots - 待检查的 slots 对象
 * @returns string[] - 缺失的必需 slot 名称列表
 * 
 * 用途：
 * - 调试时快速定位问题
 * - 提供友好的错误信息
 */
export function getMissingRequiredSlots(slots: Slots): string[] {
  const missing: string[] = [];
  
  for (const k of REQUIRED_SLOTS) {
    const s = normalizeToString(slots[k]);
    if (!s || s.length < 1) {
      missing.push(k);
    }
  }
  
  return missing;
}

/**
 * 从 SlotWriteInput 提取纯 slots 对象
 * 
 * @param slotWriteInput - SlotWriteInput 对象
 * @returns Slots - 纯 slots 对象
 * 
 * 兼容性说明：
 * - SlotWriteInput 可能是 { slots: { ... } } 或直接 { ... }
 * - 此函数统一提取内部的 slots 对象
 */
export function extractSlotsObject(slotWriteInput: any): Slots {
  if (!slotWriteInput || typeof slotWriteInput !== 'object') {
    return {};
  }

  // 标准格式：{ slots: { ... } }
  if (slotWriteInput.slots && typeof slotWriteInput.slots === 'object') {
    return slotWriteInput.slots;
  }

  // 直接格式：{ NEW_REVEAL: { ... }, CONFLICT_PROGRESS: { ... } }
  if (Object.keys(slotWriteInput).some(key => 
    ['NEW_REVEAL', 'CONFLICT_PROGRESS', 'COST_PAID'].includes(key)
  )) {
    return slotWriteInput;
  }

  return {};
}

