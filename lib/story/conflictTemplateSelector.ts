/**
 * 题材 → 仇恨链模板自动选择器
 *
 * 职责：根据题材自动选择对应的仇恨链模板
 * 目的：一键实现题材 = 仇恨链 = 冲突节奏
 *
 * M6-2 前端适配：使用静态导入替代文件系统加载
 */

import { ConflictChain, ConflictTemplate } from '../../types';
import {
  urbanWealthTemplate,
  revengeRebirthTemplate,
  romanceCeoTemplate,
  cultivationFantasyTemplate,
  urbanConceptTemplate
} from './conflictTemplates';

/**
 * 根据题材选择仇恨链模板
 * @param genre 题材字符串
 * @returns 仇恨链模板（转换为 ConflictChain 格式）
 */
export function selectTemplate(genre: string): ConflictChain {
  console.log(`[ConflictTemplateSelector] Selecting template for genre: "${genre}"`);

  let selectedTemplate: ConflictTemplate;

  // 按规则匹配
  if (genre.includes("神豪") || genre.includes("都市") || genre.includes("金钱")) {
    selectedTemplate = urbanWealthTemplate;
    console.log(`[ConflictTemplateSelector] Matched: urban_wealth`);
  }
  else if (genre.includes("重生") || genre.includes("复仇")) {
    selectedTemplate = revengeRebirthTemplate;
    console.log(`[ConflictTemplateSelector] Matched: revenge_rebirth`);
  }
  else if (genre.includes("甜宠") || genre.includes("霸总")) {
    selectedTemplate = romanceCeoTemplate;
    console.log(`[ConflictTemplateSelector] Matched: romance_ceo`);
  }
  else if (genre.includes("修仙") || genre.includes("玄幻") || genre.includes("穿越")) {
    selectedTemplate = cultivationFantasyTemplate;
    console.log(`[ConflictTemplateSelector] Matched: cultivation_fantasy`);
  }
  else if (genre.includes("脑洞") || genre.includes("异能") || genre.includes("能力")) {
    selectedTemplate = urbanConceptTemplate;
    console.log(`[ConflictTemplateSelector] Matched: urban_concept`);
  }
  else {
    // 无法匹配，使用默认模板
    console.warn(`[ConflictTemplateSelector] Genre "${genre}" did not match any template, using default: urban_wealth`);
    selectedTemplate = urbanWealthTemplate;
  }

  // 转换 ConflictTemplate 为 ConflictChain 格式（保持向后兼容）
  return {
    stages: selectedTemplate.stages
  };
}

/**
 * 获取所有可用的模板列表（用于调试和验证）
 * @returns 模板列表
 */
export function getAvailableTemplates(): ConflictTemplate[] {
  return [
    urbanWealthTemplate,
    revengeRebirthTemplate,
    romanceCeoTemplate,
    cultivationFantasyTemplate,
    urbanConceptTemplate
  ];
}
