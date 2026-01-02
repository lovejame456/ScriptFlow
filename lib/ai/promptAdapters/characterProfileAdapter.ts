/**
 * 角色事实块适配器
 *
 * 职责：将角色池中的每个角色转换为"不可被模型修改的角色事实块"
 * 目的：防止AI在生成剧本时新增/修改/合并角色，确保叙事稳定性
 */

import { Character, CharacterBackground, PersonalityDetail, CoreMotivationDetail, CoreWeaknessDetail, RelationToProtagonistDetail, CommercialFunctionDetail } from '../../../types';

/**
 * 生成单个角色的事实块文本
 */
function generateCharacterFactBlock(character: Character): string {
  const roleTypeLabel = character.roleType === 'PROTAGONIST' ? '主角' :
                       character.roleType === 'ANTAGONIST' ? '反派' : '配角';

  let block = `【角色事实块 - ${character.name} - 不可修改】\n`;
  block += `姓名：${character.name}\n`;
  block += `性别：${character.gender}\n`;
  block += `年龄：${character.ageRange}\n`;
  block += `社会身份：${character.socialIdentity}\n`;
  block += `阵营：${roleTypeLabel}\n`;

  // 优先使用详细结构，否则回退到简单字段
  const background = character.background;
  if (background) {
    block += `\n【人物背景】\n`;
    block += `出身环境：${background.origin}\n`;
    block += `关键经历：${background.keyExperience.join('、')}\n`;
    block += `人生阶段：${background.lifeStage}\n`;
  } else if (character.description) {
    block += `\n【人物背景】\n`;
    block += `${character.description}\n`;
  }

  const personality = character.personalityDetail;
  if (personality) {
    block += `\n【性格与行为模式】\n`;
    block += `对外呈现：${personality.external}\n`;
    block += `内在性格：${personality.internal}\n`;
    block += `决策习惯：${personality.decisionPattern}\n`;
  } else if (character.personality) {
    block += `\n【性格与行为模式】\n`;
    block += `${character.personality}\n`;
  }

  const motivation = character.coreMotivationDetail;
  if (motivation) {
    block += `\n【核心动机】\n`;
    block += `最想要：${motivation.desire}\n`;
    block += `最害怕失去：${motivation.fear}\n`;
    block += `愿意付出：${motivation.price}\n`;
  } else if (character.motivation || character.coreDesire) {
    block += `\n【核心动机】\n`;
    block += `动机：${character.motivation || character.coreDesire}\n`;
  }

  const weakness = character.coreWeaknessDetail;
  if (weakness) {
    block += `\n【核心弱点】\n`;
    block += `致命缺陷：${weakness.fatalFlaw}\n`;
    block += `软肋：${weakness.storyTrigger}\n`;
  } else if (character.coreWeakness) {
    block += `\n【核心弱点】\n`;
    block += `${character.coreWeakness}\n`;
  }

  const relation = character.relationToProtagonistDetail;
  if (relation) {
    block += `\n【与主角关系】\n`;
    block += `关系来源：${relation.origin}\n`;
    block += `当前冲突：${relation.currentConflict}\n`;
    block += `冲突升级：${relation.escalationTrend}\n`;
  } else if (character.relationshipToProtagonist) {
    block += `\n【与主角关系】\n`;
    block += `${character.relationshipToProtagonist}\n`;
  }

  const functionDetail = character.commercialFunctionDetail;
  if (functionDetail) {
    block += `\n【商业功能定位】\n`;
    block += `剧情功能：${functionDetail.storyFunction}\n`;
    block += `爽点类型：${functionDetail.pleasureType.join('、')}\n`;
  } else if (character.plotFunction) {
    block += `\n【商业功能定位】\n`;
    block += `${character.plotFunction}\n`;
  }

  block += `\n【禁止事项】\n`;
  block += `❌ 禁止新增该角色\n`;
  block += `❌ 禁止修改该角色的姓名、性别、年龄、社会身份\n`;
  block += `❌ 禁止将该角色与其他角色合并职能\n`;
  block += `❌ 禁止改变该角色的核心性格和动机\n`;

  return block;
}

/**
 * 将所有角色转换为角色事实块数组
 * @param characters 角色数组
 * @returns 角色事实块文本数组
 */
export function buildCharacterFactBlocks(characters: Character[]): string[] {
  if (!characters || characters.length === 0) {
    return [];
  }

  // 按角色类型排序：主角 -> 反派 -> 配角
  const sorted = [...characters].sort((a, b) => {
    const order = { 'PROTAGONIST': 0, 'ANTAGONIST': 1, 'SUPPORT': 2 };
    return (order[a.roleType] || 99) - (order[b.roleType] || 99);
  });

  return sorted.map(char => generateCharacterFactBlock(char));
}

/**
 * 生成完整的角色事实块区块（用于注入到 Prompt）
 * @param characters 角色数组
 * @returns 完整的 Prompt 注入文本
 */
export function buildCharacterFactsPromptInjection(characters: Character[]): string {
  const blocks = buildCharacterFactBlocks(characters);

  if (blocks.length === 0) {
    return '';
  }

  let injection = `════════════════════════════════════════════════════════════════\n`;
  injection += `【角色事实块 - 不可修改】\n`;
  injection += `════════════════════════════════════════════════════════════════\n`;
  injection += `以下角色定义是【不可修改的事实】，你必须严格遵守：\n\n`;
  injection += `✅ 你可以：描写角色的行为、对话、情绪变化\n`;
  injection += `❌ 你禁止：新增角色、修改核心字段、合并角色、改变动机\n\n`;
  injection += `════════════════════════════════════════════════════════════════\n\n`;

  blocks.forEach((block, index) => {
    injection += block + '\n\n';
    if (index < blocks.length - 1) {
      injection += `─────────────────────────────────────────────────────────────\n\n`;
    }
  });

  injection += `════════════════════════════════════════════════════════════════\n`;

  return injection;
}

/**
 * 从角色事实块中提取角色名称列表（用于校验）
 * @param characters 角色数组
 * @returns 角色名称集合
 */
export function getCharacterNames(characters: Character[]): Set<string> {
  return new Set(characters.map(c => c.name));
}

/**
 * 验证生成的剧本是否包含未授权的角色
 * @param content 生成的剧本内容
 * @param allowedNames 允许的角色名称集合
 * @returns 是否包含未授权角色
 */
export function hasUnauthorizedCharacters(content: string, allowedNames: Set<string>): boolean {
  // 简单的正则匹配（实际使用时可能需要更复杂的NLP）
  // 这里仅作为基础实现
  const namePattern = /([\u4e00-\u9fa5]{2,4})(?=[，。！？、：；""''\s])/g;
  const matches = content.match(namePattern) || [];

  for (const match of matches) {
    if (!allowedNames.has(match)) {
      // 排除一些常见词汇
      const commonWords = ['此时', '这时', '忽然', '突然', '此时此刻', '随后', '接着'];
      if (!commonWords.includes(match)) {
        return true;
      }
    }
  }

  return false;
}


