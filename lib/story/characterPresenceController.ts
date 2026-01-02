/**
 * 角色出场权重控制器
 *
 * 职责：根据出场权重计划，控制每集角色的对白比例和功能定位
 * 目的：防止配角抢戏/主角消失/反派越权，确保爽点分布合理
 */

import { CharacterPresencePlan, CharacterPresenceRole, RoleType } from '../../types';

/**
 * 当前集数的出场约束
 */
export interface PresenceConstraint {
  dominantCharacter: string;           // 主导角色（通常是主角）
  allowedCharacters: string[];         // 允许出现的角色列表
  maxDialogueRatio: Record<string, number>;  // 最大对白比例（角色名 -> 比例 0-1）
  restrictedFunctions?: Record<string, string[]>;  // 限制角色的功能
}

/**
 * 根据出场权重计划获取当前集数的约束
 * @param plan 角色出场权重计划
 * @param episodeIndex 当前集数
 * @returns 出场约束对象
 */
export function getPresenceConstraint(
  plan: CharacterPresencePlan | undefined,
  episodeIndex: number
): PresenceConstraint {
  // 如果没有出场权重计划，返回默认值
  if (!plan || !plan.roles || plan.roles.length === 0) {
    return {
      dominantCharacter: '未指定',
      allowedCharacters: [],
      maxDialogueRatio: {}
    };
  }

  // 找到本集允许出现的角色
  const allowedCharacters = plan.roles
    .filter(role => isCharacterAllowed(role, episodeIndex, plan.totalEpisodes))
    .map(role => role.name);

  // 确定主导角色（权重最高的，通常是主角）
  const rolesInEpisode = plan.roles.filter(role =>
    isCharacterAllowed(role, episodeIndex, plan.totalEpisodes)
  );

  const dominantCharacter = rolesInEpisode.length > 0
    ? rolesInEpisode.reduce((prev, current) =>
        (prev.appearanceWeight > current.appearanceWeight ? prev : current)
      ).name
    : '未指定';

  // 构建对白比例约束
  const maxDialogueRatio: Record<string, number> = {};
  rolesInEpisode.forEach(role => {
    maxDialogueRatio[role.name] = role.appearanceWeight;
  });

  // 找出被限制功能的角色
  const restrictedFunctions: Record<string, string[]> = {};
  rolesInEpisode.forEach(role => {
    const restricted = role.mainFunctionEpisodes
      .filter(func => !isEpisodeInRange(func.episodeRange, episodeIndex))
      .map(func => func.function);

    if (restricted.length > 0) {
      restrictedFunctions[role.name] = restricted;
    }
  });

  return {
    dominantCharacter,
    allowedCharacters,
    maxDialogueRatio,
    restrictedFunctions
  };
}

/**
 * 判断角色是否在指定集数范围内允许出现
 */
function isCharacterAllowed(
  role: CharacterPresenceRole,
  episodeIndex: number,
  totalEpisodes: number
): boolean {
  // 如果该角色没有指定任何功能区间，则认为全剧都允许出现
  if (!role.mainFunctionEpisodes || role.mainFunctionEpisodes.length === 0) {
    return true;
  }

  // 检查是否在任何功能区间内
  return role.mainFunctionEpisodes.some(func =>
    isEpisodeInRange(func.episodeRange, episodeIndex)
  );
}

/**
 * 解析集数范围字符串并判断是否包含指定集数
 * @param rangeString 范围字符串，格式如 "1-10"
 * @param episodeIndex 指定集数
 * @returns 是否在范围内
 */
function isEpisodeInRange(rangeString: string, episodeIndex: number): boolean {
  const match = rangeString.match(/^(\d+)-(\d+)$/);
  if (!match) {
    return false;
  }

  const start = parseInt(match[1], 10);
  const end = parseInt(match[2], 10);

  return episodeIndex >= start && episodeIndex <= end;
}

/**
 * 验证生成的剧本是否符合出场权重约束
 * @param content 剧本内容
 * @param constraint 出场约束
 * @returns 验证结果
 */
export function validateEpisodeAgainstPresenceConstraint(
  content: string,
  constraint: PresenceConstraint
): { valid: boolean; warnings: string[]; errors: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. 检查是否有未授权的角色出现
  const allowedNames = new Set(constraint.allowedCharacters);
  const unauthorizedNames = findUnauthorizedCharacters(content, allowedNames);

  if (unauthorizedNames.length > 0) {
    errors.push(`剧本中出现了未授权的角色：${unauthorizedNames.join('、')}`);
  }

  // 2. 检查主导角色是否缺失
  if (constraint.dominantCharacter !== '未指定') {
    const dominantLines = countCharacterLines(content, constraint.dominantCharacter);

    if (dominantLines === 0) {
      errors.push(`主导角色"${constraint.dominantCharacter}"未出场或无对白`);
    } else {
      // 检查对白比例
      const totalLines = countTotalDialogueLines(content);
      const dominantRatio = dominantLines / totalLines;

      if (totalLines > 0 && dominantRatio < 0.4) {
        warnings.push(`主导角色"${constraint.dominantCharacter}"的对白比例过低（${(dominantRatio * 100).toFixed(1)}%）`);
      }
    }
  }

  // 3. 检查反派是否越权
  Object.keys(constraint.maxDialogueRatio).forEach(charName => {
    if (isAntagonist(charName, constraint)) {
      const lines = countCharacterLines(content, charName);
      const totalLines = countTotalDialogueLines(content);
      const ratio = totalLines > 0 ? lines / totalLines : 0;
      const maxRatio = constraint.maxDialogueRatio[charName];

      if (ratio > maxRatio + 0.1) {  // 允许10%的容差
        errors.push(`反派"${charName}"的对白比例超标（当前${(ratio * 100).toFixed(1)}%，最大${(maxRatio * 100).toFixed(1)}%）`);
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * 判断角色是否是反派
 */
function isAntagonist(charName: string, constraint: PresenceConstraint): boolean {
  // 这里需要从外部传入角色类型信息，暂时简化处理
  // 实际使用时应该从角色配置中判断
  return false;
}

/**
 * 从内容中找出未授权的角色
 */
function findUnauthorizedCharacters(
  content: string,
  allowedNames: Set<string>
): string[] {
  // 简单实现：提取可能的角色名
  const namePattern = /([\u4e00-\u9fa5]{2,4})(?=[，。！？、：；""''\s])/g;
  const matches = content.match(namePattern) || [];
  const unauthorized = new Set<string>();

  const commonWords = ['此时', '这时', '忽然', '突然', '此时此刻', '随后', '接着',
                     '一个人', '两个人', '众人', '大家', '这里', '那里', '这个', '那个'];

  matches.forEach(match => {
    if (!allowedNames.has(match) && !commonWords.includes(match)) {
      unauthorized.add(match);
    }
  });

  return Array.from(unauthorized);
}

/**
 * 统计指定角色的对白行数
 */
function countCharacterLines(content: string, charName: string): number {
  // 匹配模式：角色名 + 冒号/引号
  const patterns = [
    new RegExp(`${charName}：`, 'g'),
    new RegExp(`${charName}"`, 'g'),
    new RegExp(`${charName}"`, 'g'),
    new RegExp(`"([^"]*?)${charName}([^"]*?)"`, 'g'),
  ];

  let count = 0;
  patterns.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      count += matches.length;
    }
  });

  return count;
}

/**
 * 统计所有对白行数
 */
function countTotalDialogueLines(content: string): number {
  const dialoguePattern = /[\u4e00-\u9fa5]{2,4}[：""]/g;
  const matches = content.match(dialoguePattern);
  return matches ? matches.length : 0;
}

/**
 * 生成默认的角色出场权重计划
 * @param characters 角色数组
 * @param totalEpisodes 总集数
 * @returns 默认出场权重计划
 */
export function generateDefaultPresencePlan(
  characters: any[],
  totalEpisodes: number
): CharacterPresencePlan {
  const protagonist = characters.find((c: any) => c.roleType === 'PROTAGONIST');
  const antagonists = characters.filter((c: any) => c.roleType === 'ANTAGONIST');
  const supports = characters.filter((c: any) => c.roleType === 'SUPPORT');

  const roles: CharacterPresenceRole[] = [];

  // 主角：全剧出现，权重最高
  if (protagonist) {
    roles.push({
      name: protagonist.name,
      roleType: 'PROTAGONIST',
      appearanceWeight: 0.7,
      mainFunctionEpisodes: [{
        episodeRange: `1-${totalEpisodes}`,
        function: '施压'
      }]
    });
  }

  // 反派：分阶段出现，权重递减
  antagonists.forEach((ant: any, index: number) => {
    const tier = ant.tier || 'MID';
    const weight = tier === 'HIGH' ? 0.25 : tier === 'MID' ? 0.2 : 0.15;

    // 分配集数区间
    const stageIndex = antagonists.length - index;
    const startEpisode = Math.floor(totalEpisodes * (stageIndex - 1) / antagonists.length) + 1;
    const endEpisode = Math.floor(totalEpisodes * stageIndex / antagonists.length);

    roles.push({
      name: ant.name,
      roleType: 'ANTAGONIST',
      appearanceWeight: weight,
      mainFunctionEpisodes: [{
        episodeRange: `${startEpisode}-${endEpisode}`,
        function: index === 0 ? '清算对象' : '施压'
      }]
    });
  });

  // 配角：功能性出现，权重最低
  supports.forEach((sup: any) => {
    const randomStart = Math.floor(Math.random() * (totalEpisodes * 0.5)) + 1;
    const randomEnd = Math.min(randomStart + 20, totalEpisodes);

    roles.push({
      name: sup.name,
      roleType: 'SUPPORT',
      appearanceWeight: 0.1,
      mainFunctionEpisodes: [{
        episodeRange: `${randomStart}-${randomEnd}`,
        function: '反转触发'
      }]
    });
  });

  return {
    totalEpisodes,
    roles
  };
}

/**
 * 将出场约束转换为Prompt注入文本
 * @param constraint 出场约束
 * @returns Prompt注入文本
 */
export function buildPresenceConstraintPromptInjection(constraint: PresenceConstraint): string {
  let text = `\n【本集出场约束 - 不可违反】\n`;
  text += `════════════════════════════════════════════════════════════════\n`;
  text += `主导角色：${constraint.dominantCharacter}\n`;
  text += `允许角色：${constraint.allowedCharacters.join('、') || '未指定'}\n\n`;

  if (Object.keys(constraint.maxDialogueRatio).length > 0) {
    text += `对白比例上限：\n`;
    Object.entries(constraint.maxDialogueRatio).forEach(([char, ratio]) => {
      text += `  - ${char}: ${(ratio * 100).toFixed(0)}%\n`;
    });
    text += `\n`;
  }

  text += `【禁止事项】\n`;
  text += `❌ 禁止未授权角色出场或对白\n`;
  text += `❌ 禁止主导角色缺失核心行动\n`;
  text += `❌ 禁止配角抢夺情绪高潮\n`;
  text += `❌ 禁止反派在非其功能集数抢戏\n`;
  text += `════════════════════════════════════════════════════════════════\n\n`;

  return text;
}


