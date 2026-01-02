// M5-1: 平台导出工具函数
// 根据平台 ID 路由到对应平台的模板

import { PlatformId, PlatformConfig } from '../../types/platform';
import { getPlatform } from '../../platforms';
import { Project } from '../../types';

/**
 * 根据平台 ID 生成项目概览
 */
export function buildOverviewForPlatform(project: Project, platformId: PlatformId = 'generic'): string {
  const platform = getPlatform(platformId);

  if (!platform) {
    console.warn(`Platform ${platformId} not found, using generic template`);
  }

  // 使用平台特定的模板，如果平台不存在则使用通用模板
  const template = platform?.templateBuilder;

  if (template && template.buildOverview) {
    return template.buildOverview(project);
  }

  // 如果平台没有自定义模板，使用原通用模板
  const { buildOverview } = require('./buildOverview');
  return buildOverview(project);
}

/**
 * 根据平台 ID 生成大纲
 */
export function buildOutlineForPlatform(project: Project, platformId: PlatformId = 'generic'): string {
  const platform = getPlatform(platformId);

  if (!platform) {
    console.warn(`Platform ${platformId} not found, using generic template`);
  }

  // 使用平台特定的模板，如果平台不存在则使用通用模板
  const template = platform?.templateBuilder;

  if (template && template.buildOutline) {
    return template.buildOutline(project);
  }

  // 如果平台没有自定义模板，使用原通用模板
  const { buildOutline } = require('./buildOutline');
  return buildOutline(project);
}

/**
 * 根据平台 ID 生成 Bible
 */
export function buildBibleForPlatform(project: Project, platformId: PlatformId = 'generic'): string {
  const platform = getPlatform(platformId);

  if (!platform) {
    console.warn(`Platform ${platformId} not found, using generic template`);
  }

  // 使用平台特定的模板，如果平台不存在则使用通用模板
  const template = platform?.templateBuilder;

  if (template && template.buildBible) {
    return template.buildBible(project);
  }

  // 如果平台没有自定义模板，使用原通用模板
  const { buildBible } = require('./buildBible');
  return buildBible(project);
}





