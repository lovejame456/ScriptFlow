/**
 * Antagonist Binder - 反派阶梯绑定（M16.3）
 *
 * 职责：
 * - 将 Reveal 绑定到反派升级/压迫升级/资源门槛升级
 * - 确保每集 Reveal 挂钩明确的压力变化
 * - 生成压力向量（PressureVector）和提示（hint）
 *
 * 原则：
 * - Reveal 必须挂钩压迫升级/反派升级/资源门槛升级之一
 * - 否则 StructurePlanner 不允许生成 required=true 的 Reveal summary
 * - Summary 必须包含：压力来源 + 明确变化 + 影响后续决策
 */

import { RevealType } from './revealScheduler';

/**
 * 压力向量类型
 */
export type PressureVector = 'POWER' | 'RESOURCE' | 'STATUS' | 'RELATION' | 'LIFE_THREAT';

/**
 * 反派压力绑定结果
 */
export interface AntagonistPressureBinding {
  pressure: PressureVector;
  hint: string;
}

/**
 * 根据集数和 Reveal 类型生成压力向量
 *
 * @param episode - 集数
 * @param revealType - Reveal 类型
 * @param revealScope - Reveal 作用域
 * @returns PressureVector - 压力向量
 */
function generatePressureVector(
  episode: number,
  revealType: RevealType,
  revealScope: 'PROTAGONIST' | 'ANTAGONIST' | 'WORLD'
): PressureVector {
  console.log(`[AntagonistBinder] Generating pressure vector for EP${episode}`);
  console.log(`[AntagonistBinder] Reveal type: ${revealType}, scope: ${revealScope}`);

  // 基础策略：根据 Reveal 类型和作用域生成压力向量
  let vector: PressureVector;

  switch (revealType) {
    case 'FACT':
      // FACT 类 Reveal 通常涉及世界观信息，可能带来 POWER 或 RESOURCE 压力
      if (revealScope === 'WORLD') {
        vector = 'POWER';  // 世界观事实往往带来力量格局变化
      } else {
        vector = 'RESOURCE';  // 角色事实往往涉及资源变化
      }
      break;

    case 'INFO':
      // INFO 类 Reveal 通常涉及信息差，可能带来 STATUS 或 RELATION 压力
      if (revealScope === 'ANTAGONIST') {
        vector = 'STATUS';  // 反派信息往往带来地位威胁
      } else {
        vector = 'RELATION';  // 角色信息往往影响关系
      }
      break;

    case 'RELATION':
      // RELATION 类 Reveal 直接带来关系压力
      vector = 'RELATION';
      break;

    case 'IDENTITY':
      // IDENTITY 类 Reveal 往往带来最高级别的压力
      if (episode >= 6) {
        vector = 'LIFE_THREAT';  // 后期身份揭秘可能威胁生命
      } else {
        vector = 'POWER';  // 前期身份揭秘通常带来力量变化
      }
      break;

    default:
      vector = 'STATUS';  // 默认
  }

  console.log(`[AntagonistBinder] Generated pressure vector: ${vector}`);
  return vector;
}

/**
 * 生成压力提示（Hint）
 *
 * @param pressure - 压力向量
 * @param episode - 集数
 * @param revealType - Reveal 类型
 * @returns string - 压力提示
 */
function generatePressureHint(
  pressure: PressureVector,
  episode: number,
  revealType: RevealType
): string {
  const hints: Record<PressureVector, string[]> = {
    'POWER': [
      '本 Reveal 必须明确展示力量的此消彼长，主角或反派的力量地位发生实质性变化。',
      '要求：使用具体的事件或能力展示，而非抽象描述。',
      '影响：后续决策必须考虑新的力量格局。'
    ],
    'RESOURCE': [
      '本 Reveal 必须涉及资源的获取、失去或重新分配。',
      '要求：明确指出资源类型（金钱、情报、物品、人脉等）。',
      '影响：后续行动必须受到资源状况的约束。'
    ],
    'STATUS': [
      '本 Reveal 必须导致角色社会地位或阶级的升降。',
      '要求：通过他人的反应、权力结构的变化来体现。',
      '影响：后续交互必须体现新的地位关系。'
    ],
    'RELATION': [
      '本 Reveal 必须改变角色间的关系格局（盟友变敌人，或相反）。',
      '要求：明确指出关系变化的原因和表现形式。',
      '影响：后续决策必须考虑新的关系网络。'
    ],
    'LIFE_THREAT': [
      '本 Reveal 必须带来直接的生存威胁。',
      '要求：明确威胁来源、紧迫程度和可能的后果。',
      '影响：后续行动必须以生存为优先考虑。'
    ]
  };

  const hint = hints[pressure].join('\n');
  console.log(`[AntagonistBinder] Generated pressure hint for ${pressure}`);

  return hint;
}

/**
 * 将 Reveal 绑定到反派压力
 *
 * @param args - 绑定参数
 * @returns AntagonistPressureBinding - 压力绑定结果
 */
export function bindRevealToAntagonistPressure(args: {
  episode: number;
  revealType: RevealType;
  revealScope: 'PROTAGONIST' | 'ANTAGONIST' | 'WORLD';
  project: any;
  outline: any;
}): AntagonistPressureBinding {
  const { episode, revealType, revealScope, project, outline } = args;

  console.log(`[AntagonistBinder] Binding reveal to antagonist pressure`);
  console.log(`[AntagonistBinder] Episode: ${episode}, Type: ${revealType}, Scope: ${revealScope}`);

  // 生成压力向量
  const pressure = generatePressureVector(episode, revealType, revealScope);

  // 生成压力提示
  const hint = generatePressureHint(pressure, episode, revealType);

  const binding: AntagonistPressureBinding = {
    pressure,
    hint
  };

  console.log(`[AntagonistBinder] Generated binding:`, binding);
  return binding;
}

/**
 * 验证 Reveal summary 是否符合压力绑定要求
 *
 * @param summary - Reveal summary
 * @param binding - 压力绑定
 * @returns { valid: boolean, error?: string } - 验证结果
 */
export function validateRevealAgainstBinding(
  summary: string,
  binding: AntagonistPressureBinding
): { valid: boolean; error?: string } {
  // 基础验证：summary 不能为空
  if (!summary || summary.trim().length === 0) {
    return { valid: false, error: 'Reveal summary cannot be empty' };
  }

  // 验证 summary 是否包含压力相关的关键词
  const pressureKeywords: Record<PressureVector, string[]> = {
    'POWER': ['力量', '能力', '实力', '压制', '碾压', '优势'],
    'RESOURCE': ['资源', '金钱', '情报', '物品', '人脉', '财富'],
    'STATUS': ['地位', '阶级', '身份', '等级', '权威', '影响力'],
    'RELATION': ['关系', '盟友', '敌人', '背叛', '决裂', '合作'],
    'LIFE_THREAT': ['生命', '生存', '威胁', '危险', '致命', '死亡']
  };

  const keywords = pressureKeywords[binding.pressure];
  const hasKeyword = keywords.some(keyword => summary.includes(keyword));

  if (!hasKeyword) {
    return {
      valid: false,
      error: `Reveal summary must contain keywords related to ${binding.pressure} pressure`
    };
  }

  return { valid: true };
}

