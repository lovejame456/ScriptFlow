/**
 * Slot Validator - Slot 验证器（M16）
 *
 * 职责：
 * - 零容忍校验 Slot 输出
 * - 任何一条触发即 FAIL
 * - 验证失败直接终止，不允许 fallback
 *
 * 原则：
 * - slot 缺失 = 失败（直接 FAIL）
 * - slot 不满足要求 = 失败（直接 FAIL）
 * - 失败优于兜底
 */

import { StructureContract, SlotWriteOutput } from './structurePlanner';
import { RevealType } from './structurePlanner';

/**
 * Slot 验证结果
 */
export interface SlotValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 验证 Slots（零容忍）
 * 
 * @param contract - 结构契约
 * @param output - Slot 写入输出
 * @returns SlotValidationResult - 验证结果
 * 
 * 零容忍规则：
 * - NEW_REVEAL 缺失 → FAIL
 * - NEW_REVEAL.length < 80 → FAIL
 * - 文本无法解析（非字符串）→ FAIL
 * 
 * 关键：这里 throw 的错误，不允许被 catch 成 fallback
 */
export function validateSlots(
  contract: StructureContract,
  output: SlotWriteOutput
): SlotValidationResult {
  
  console.log(`[SlotValidator] Validating slots for EP${contract.episode}`);
  const errors: string[] = [];

  // 1. 验证 New Reveal（如果 required）
  if (contract.mustHave.newReveal.required) {
    const revealSlot = output.NEW_REVEAL;
    const revealType = contract.mustHave.newReveal.type;
    const revealScope = contract.mustHave.newReveal.scope;

    console.log(`[SlotValidator] Validating NEW_REVEAL (required, type=${revealType}, scope=${revealScope})`);

    // 1.1 检查 NEW_REVEAL 是否存在
    if (!revealSlot) {
      errors.push(`STRUCTURE_FAIL: NEW_REVEAL slot is missing (required by contract)`);
      console.error(`[SlotValidator] NEW_REVEAL missing`);
    } else {
      // 1.2 检查 NEW_REVEAL 是否为字符串
      if (typeof revealSlot !== 'string') {
        errors.push(`STRUCTURE_FAIL: NEW_REVEAL is not a string (got ${typeof revealSlot})`);
        console.error(`[SlotValidator] NEW_REVEAL not a string`);
      } else {
        // 1.3 检查 NEW_REVEAL 长度
        if (revealSlot.length < 80) {
          errors.push(`STRUCTURE_FAIL: NEW_REVEAL length ${revealSlot.length} < 80 (required minimum)`);
          console.error(`[SlotValidator] NEW_REVEAL too short (${revealSlot.length} chars)`);
        } else {
          // 1.4 检查 NEW_REVEAL 是否为空或只有空白
          const trimmed = revealSlot.trim();
          if (trimmed.length === 0) {
            errors.push(`STRUCTURE_FAIL: NEW_REVEAL is empty or whitespace only`);
            console.error(`[SlotValidator] NEW_REVEAL empty`);
          } else if (trimmed.length < 80) {
            errors.push(`STRUCTURE_FAIL: NEW_REVEAL trimmed length ${trimmed.length} < 80 (required minimum)`);
            console.error(`[SlotValidator] NEW_REVEAL trimmed too short (${trimmed.length} chars)`);
          } else {
            console.log(`[SlotValidator] NEW_REVEAL passed (${revealSlot.length} chars)`);
          }
        }
      }
    }
  } else {
    console.log(`[SlotValidator] NEW_REVEAL not required, skipping validation`);
  }

  // 2. 验证 Conflict Progress（如果 optional 且存在）
  if (contract.optional.conflictProgressed) {
    const conflictSlot = output.CONFLICT_PROGRESS;

    if (!conflictSlot) {
      console.warn(`[SlotValidator] CONFLICT_PROGRESS slot is missing (optional, not an error)`);
    } else {
      if (typeof conflictSlot !== 'string') {
        errors.push(`STRUCTURE_FAIL: CONFLICT_PROGRESS is not a string (got ${typeof conflictSlot})`);
        console.error(`[SlotValidator] CONFLICT_PROGRESS not a string`);
      } else {
        const trimmed = conflictSlot.trim();
        if (trimmed.length === 0) {
          console.warn(`[SlotValidator] CONFLICT_PROGRESS is empty (optional, not an error)`);
        } else {
          console.log(`[SlotValidator] CONFLICT_PROGRESS passed (${conflictSlot.length} chars)`);
        }
      }
    }
  }

  // 3. 验证 Cost Paid（如果 optional 且存在）
  if (contract.optional.costPaid) {
    const costSlot = output.COST_PAID;

    if (!costSlot) {
      console.warn(`[SlotValidator] COST_PAID slot is missing (optional, not an error)`);
    } else {
      if (typeof costSlot !== 'string') {
        errors.push(`STRUCTURE_FAIL: COST_PAID is not a string (got ${typeof costSlot})`);
        console.error(`[SlotValidator] COST_PAID not a string`);
      } else {
        const trimmed = costSlot.trim();
        if (trimmed.length === 0) {
          console.warn(`[SlotValidator] COST_PAID is empty (optional, not an error)`);
        } else {
          console.log(`[SlotValidator] COST_PAID passed (${costSlot.length} chars)`);
        }
      }
    }
  }

  // 4. 检查是否有未知的 slots
  const validSlots = ['NEW_REVEAL', 'CONFLICT_PROGRESS', 'COST_PAID'];
  for (const key of Object.keys(output)) {
    if (!validSlots.includes(key)) {
      console.warn(`[SlotValidator] Unknown slot '${key}' found (not in contract)`);
    }
  }

  // 5. 判定验证结果
  const valid = errors.length === 0;

  if (valid) {
    console.log(`[SlotValidator] All slots validated successfully`);
  } else {
    console.error(`[SlotValidator] Validation failed:`, errors);
  }

  return {
    valid,
    errors
  };
}

/**
 * 抛出验证失败的异常
 * 
 * 这个函数用于在验证失败时抛出异常
 * 异常会被调用方捕获，但不允许被转换为 fallback
 * 
 * @param validation - 验证结果
 * @throws Error - 如果验证失败
 */
export function throwValidationError(validation: SlotValidationResult): never {
  if (validation.valid) {
    throw new Error('[SlotValidator] Cannot throw error: validation passed');
  }

  const errorMessage = validation.errors.join('; ');
  
  // 构建详细的错误信息
  const error = new Error(
    `STRUCTURE_FAIL: Slot validation failed. ${errorMessage}`
  );
  
  // 添加错误详情到 error 对象
  (error as any).validationErrors = validation.errors;
  (error as any).isStructureFail = true;

  console.error(`[SlotValidator] Throwing validation error:`, errorMessage);
  
  throw error;
}

/**
 * 检查错误是否为结构失败错误
 * 
 * @param error - 错误对象
 * @returns boolean - 是否为结构失败错误
 */
export function isStructureFailError(error: any): boolean {
  if (!error) return false;
  return error.isStructureFail === true || 
         error.message?.includes('STRUCTURE_FAIL') ||
         error.message?.includes('Slot validation failed');
}


