import { StructureContract } from '../../types';

/**
 * 预设指令定义
 */
export interface PresetInstruction {
  id: string;
  label: string;
  description: string;
  toStructureConstraints: (contract: StructureContract) => StructureContract;
}

/**
 * 预设指令集合
 */
export const PRESET_INSTRUCTIONS: Record<string, PresetInstruction> = {
  'strengthen-antagonist': {
    id: 'strengthen-antagonist',
    label: '强化反派',
    description: '增加反派出场频率，提升压迫感',
    toStructureConstraints: (contract: StructureContract) => {
      return {
        ...contract,
        mustHave: {
          ...contract.mustHave,
          // 增加冲突推进要求
          conflictProgress: {
            ...contract.mustHave.conflictProgress,
            pressureHint: (contract.mustHave.conflictProgress?.pressureHint || '') + 
              '【强化反派】本集必须出现明确的反派压迫场景，提升冲突强度。',
            pressureMultiplier: (contract.mustHave.conflictProgress?.pressureMultiplier || 1.0) * 1.2
          }
        }
      };
    }
  },
  'reveal-early': {
    id: 'reveal-early',
    label: '提前揭示真相',
    description: '将关键真相提前到本集或下集揭示',
    toStructureConstraints: (contract: StructureContract) => {
      return {
        ...contract,
        mustHave: {
          ...contract.mustHave,
          // 强化 Reveal 约束
          newReveal: {
            ...contract.mustHave.newReveal,
            required: true,
            pressureHint: '【提前揭示】本集必须揭示关键真相，不可拖延。使用"发现""证实""确认"等明确关键词。',
            priority: 'critical'
          }
        }
      };
    }
  },
  'increase-cost': {
    id: 'increase-cost',
    description: '提升主角面临的代价和风险',
    toStructureConstraints: (contract: StructureContract) => {
      return {
        ...contract,
        mustHave: {
          ...contract.mustHave,
          // 增加代价要求
          costPaid: {
            ...contract.mustHave.costPaid,
            required: true,
            pressureHint: '【加重代价】本集必须付出实质代价，不得轻描淡写。代价可以是失去、伤害、背叛等。',
            costLevel: 'high' as any
          }
        }
      };
    }
  }
};

/**
 * 应用用户指令到结构契约
 * 
 * @param contract - 原始结构契约
 * @param instructionId - 预设指令 ID
 * @returns StructureContract - 修改后的结构契约
 */
export function applyUserInstruction(
  contract: StructureContract,
  instructionId: string
): StructureContract {
  const preset = PRESET_INSTRUCTIONS[instructionId];
  if (!preset) {
    throw new Error(`Unknown instruction: ${instructionId}. Available: ${Object.keys(PRESET_INSTRUCTIONS).join(', ')}`);
  }

  console.log(`[InstructionMapper] Applying instruction: ${preset.label} (${instructionId})`);
  const modifiedContract = preset.toStructureConstraints(contract);
  console.log(`[InstructionMapper] Modified contract:`, JSON.stringify(modifiedContract, null, 2));

  return modifiedContract;
}

/**
 * 获取所有预设指令列表
 * 
 * @returns PresetInstruction[] - 预设指令数组
 */
export function getPresetInstructions(): Array<{ id: string; label: string; description: string }> {
  return Object.values(PRESET_INSTRUCTIONS).map(p => ({
    id: p.id,
    label: p.label,
    description: p.description
  }));
}

