/**
 * Structure Playbook Generator - 结构打法卡生成器（M14.3）
 *
 * 功能：
 * - 将 Pattern Discovery 结果转化为人类可读的"结构打法卡"
 * - 供策划/编剧/产品决策使用
 *
 * 原则：
 * - 不影响生成、不修改 prompt、不参与生成决策
 * - 仅生成人类可读的结构建议
 */

import { PatternDiscoveryResult, StructurePlaybook, StructurePlaybooksResult, QualityPattern } from '../../types';

/**
 * 信号显示名称映射
 */
const SIGNAL_DISPLAY_NAME: Record<string, string> = {
  conflictProgressed: 'Conflict Progressed',
  costPaid: 'Cost Paid',
  factReused: 'Fact Reused',
  newReveal: 'New Reveal',
  promiseAddressed: 'Promise Addressed',
  stateCoherent: 'State Coherent'
};

/**
 * 信号到规则的映射
 */
const SIGNAL_RULES: Record<string, { rule: string; pitfall: string }> = {
  conflictProgressed: {
    rule: '本集必须推进至少一个冲突层级',
    pitfall: '只有推进，没有冲突实际变化 → 无效推进'
  },
  costPaid: {
    rule: '为目标必须付出可感知的代价',
    pitfall: '代价太小或无关紧要 → 观众无共鸣'
  },
  newReveal: {
    rule: '引入不可逆的新信息',
    pitfall: '信息变化不影响后续剧情 → 无效揭示'
  },
  factReused: {
    rule: '复用 1-2 个历史细节',
    pitfall: '只有推进，无连续性 → 世界观割裂'
  },
  promiseAddressed: {
    rule: '从历史 promise 中选 1 条进行回应',
    pitfall: '只埋不收 → 失信于观众'
  },
  stateCoherent: {
    rule: '确保所有状态/事实变更一致',
    pitfall: '状态冲突 → 逻辑漏洞'
  }
};

/**
 * 生成结构打法卡
 *
 * @param patternDiscoveryResult - 模式发现结果（M14.2）
 * @returns StructurePlaybooksResult - 结构打法卡生成结果
 */
export function generateStructurePlaybooks(
  patternDiscoveryResult: PatternDiscoveryResult
): StructurePlaybooksResult {
  const { highQualityPatterns, missingSignalsWarnings } = patternDiscoveryResult;

  // 1. 选择 Top 2-3 个高质量模式
  const topPatterns = selectTopPatterns(highQualityPatterns, 3);

  // 2. 生成质量型打法卡
  const qualityPlaybooks = topPatterns.map(pattern => generateQualityPlaybook(pattern));

  // 3. 生成修复型打法卡（如果有缺失信号）
  const fixPlaybooks = generateFixPlaybooks(missingSignalsWarnings);

  // 4. 合并所有打法卡，限制为 2-4 张
  const allPlaybooks = [...qualityPlaybooks, ...fixPlaybooks].slice(0, 4);

  // 5. 生成摘要
  const summary = generateSummary(allPlaybooks, topPatterns.length, missingSignalsWarnings.length);

  return {
    playbooks: allPlaybooks,
    summary
  };
}

/**
 * 选择 Top N 个高质量模式
 *
 * 优先级：高质量覆盖率 > 出现次数
 */
function selectTopPatterns(patterns: QualityPattern[], maxCount: number): QualityPattern[] {
  if (patterns.length === 0) {
    return [];
  }

  // 按高质量覆盖率降序，然后按出现次数降序
  const sortedPatterns = [...patterns].sort((a, b) => {
    if (b.highQualityCoverage !== a.highQualityCoverage) {
      return b.highQualityCoverage - a.highQualityCoverage;
    }
    return b.occurrenceCount - a.occurrenceCount;
  });

  return sortedPatterns.slice(0, maxCount);
}

/**
 * 基于高质量模式生成质量型打法卡
 */
function generateQualityPlaybook(pattern: QualityPattern): StructurePlaybook {
  const signalNames = pattern.patternKey.split('+');
  const playbookType: 'quality' | 'fix' = 'quality';

  // 生成标题
  const title = generatePlaybookTitle(signalNames, playbookType);

  // 确定适用集数范围
  const applicableEpisodes = determineApplicableEpisodes(signalNames);

  // 生成核心规则
  const coreRules = generateCoreRules(signalNames);

  // 生成常见风险
  const commonPitfalls = generateCommonPitfalls(signalNames);

  return {
    title,
    applicableEpisodes,
    coreRules,
    commonPitfalls,
    basedOnPatterns: [pattern.patternKey],
    playbookType
  };
}

/**
 * 基于缺失信号生成修复型打法卡
 */
function generateFixPlaybooks(
  warnings: PatternDiscoveryResult['missingSignalsWarnings']
): StructurePlaybook[] {
  if (warnings.length === 0) {
    return [];
  }

  // 选择缺失率最高的 1 个信号
  const topWarning = warnings[0];
  const signalName = topWarning.signalName;

  // 生成核心规则（至少2条）
  const coreRules = [
    SIGNAL_RULES[signalName]?.rule || `确保 ${SIGNAL_DISPLAY_NAME[signalName]} 信号命中`,
    `在低质量集中重点强化 ${SIGNAL_DISPLAY_NAME[signalName]}`
  ];

  // 生成常见风险（至少2条）
  const commonPitfalls = [
    SIGNAL_RULES[signalName]?.pitfall || `${SIGNAL_DISPLAY_NAME[signalName]} 信号缺失导致质量下降`,
    `忽视此信号将导致整体质量下降`
  ];

  // 生成修复型打法卡
  const playbook: StructurePlaybook = {
    title: `修复型打法：${SIGNAL_DISPLAY_NAME[signalName]}`,
    applicableEpisodes: 'EP1–EP10',  // 修复型打法适用于全集
    coreRules,
    commonPitfalls,
    basedOnSignals: [signalName],
    playbookType: 'fix'
  };

  return [playbook];
}

/**
 * 生成打法卡标题
 */
function generatePlaybookTitle(signalNames: string[], playbookType: 'quality' | 'fix'): string {
  if (playbookType === 'fix') {
    return '修复型打法';
  }

  const displayNames = signalNames.map(name => SIGNAL_DISPLAY_NAME[name]);

  if (signalNames.length === 2) {
    return `【结构打法】：${displayNames[0]} + ${displayNames[1]}`;
  } else if (signalNames.length === 3) {
    return `【结构打法】：${displayNames[0]} + ${displayNames[1]} + ${displayNames[2]}`;
  }

  return `【结构打法】：${displayNames.join(' + ')}`;
}

/**
 * 确定适用集数范围
 */
function determineApplicableEpisodes(signalNames: string[]): string {
  // 根据信号组合推断适用集数范围
  const hasPromiseAddressed = signalNames.includes('promiseAddressed');
  const hasFactReused = signalNames.includes('factReused');

  if (hasPromiseAddressed && hasFactReused) {
    // 需要历史数据的组合适用于中后期
    return 'EP3–EP10';
  } else if (hasPromiseAddressed) {
    // 承诺回收适用于中后期
    return 'EP3–EP8';
  } else if (hasFactReused) {
    // 事实复用适用于中前期
    return 'EP2–EP6';
  } else {
    // 其他组合适用于全流程
    return 'EP1–EP10';
  }
}

/**
 * 生成核心规则
 */
function generateCoreRules(signalNames: string[]): string[] {
  const rules: string[] = [];

  for (const signalName of signalNames) {
    const ruleInfo = SIGNAL_RULES[signalName];
    if (ruleInfo) {
      rules.push(ruleInfo.rule);
    }
  }

  // 确保至少有 2 条规则
  while (rules.length < 2 && rules.length < signalNames.length) {
    rules.push('保持结构性连贯性');
  }

  // 限制为最多 4 条规则
  return rules.slice(0, 4);
}

/**
 * 生成常见风险
 */
function generateCommonPitfalls(signalNames: string[]): string[] {
  const pitfalls: string[] = [];

  for (const signalName of signalNames) {
    const ruleInfo = SIGNAL_RULES[signalName];
    if (ruleInfo) {
      pitfalls.push(ruleInfo.pitfall);
    }
  }

  // 确保至少有 2 条风险
  while (pitfalls.length < 2 && pitfalls.length < signalNames.length) {
    pitfalls.push('缺乏结构性变化 → 观众疲劳');
  }

  // 限制为最多 3 条风险
  return pitfalls.slice(0, 3);
}

/**
 * 生成摘要
 */
function generateSummary(
  playbooks: StructurePlaybook[],
  qualityPatternCount: number,
  missingSignalCount: number
): string {
  const parts: string[] = [];

  // 质量型打法卡数量
  const qualityCount = playbooks.filter(p => p.playbookType === 'quality').length;
  if (qualityCount > 0) {
    parts.push(`基于 ${qualityPatternCount} 个高质量模式生成 ${qualityCount} 张质量型打法卡`);
  }

  // 修复型打法卡数量
  const fixCount = playbooks.filter(p => p.playbookType === 'fix').length;
  if (fixCount > 0) {
    parts.push(`针对 ${missingSignalCount} 个缺失信号生成 ${fixCount} 张修复型打法卡`);
  }

  // 总数
  parts.push(`共生成 ${playbooks.length} 张结构打法卡`);

  return parts.join('，');
}

/**
 * 格式化打法卡为 Markdown
 */
export function formatPlaybooksAsMarkdown(playbooks: StructurePlaybook[]): string {
  if (playbooks.length === 0) {
    return '暂无结构打法卡数据';
  }

  const lines: string[] = [];

  for (let i = 0; i < playbooks.length; i++) {
    const playbook = playbooks[i];
    const playbookTypeLabel = playbook.playbookType === 'fix' ? '（修复型）' : '';
    const cleanTitle = playbook.title.replace('【结构打法】：', '');

    lines.push(`\n【结构打法 #${i + 1}${playbookTypeLabel}】：${cleanTitle}】`);
    lines.push(`适用场景：${playbook.applicableEpisodes}`);
    lines.push('核心结构：');

    for (const rule of playbook.coreRules) {
      lines.push(`- ${rule}`);
    }

    lines.push('常见风险：');

    for (const pitfall of playbook.commonPitfalls) {
      lines.push(`- ${pitfall}`);
    }

    if (playbook.basedOnPatterns && playbook.basedOnPatterns.length > 0) {
      lines.push(`基于模式：${playbook.basedOnPatterns.join(', ')}`);
    }

    if (playbook.basedOnSignals && playbook.basedOnSignals.length > 0) {
      lines.push(`修复目标：${playbook.basedOnSignals.map(s => SIGNAL_DISPLAY_NAME[s]).join(', ')}`);
    }
  }

  return lines.join('\n');
}

/**
 * 格式化打法卡为 JSON
 */
export function formatPlaybooksAsJSON(playbooks: StructurePlaybook[]): string {
  return JSON.stringify(playbooks, null, 2);
}

