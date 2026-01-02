// M5-1: 平台模块入口
// 管理所有平台的注册和访问

import { PlatformId, PlatformConfig, ExportTemplateBuilder } from '../types/platform';

// 导入各个平台的配置
import hongguo from './hongguo';
import fanqie from './fanqie';
import kuaikan from './kuaikan';
import { buildOverview, buildBible, buildOutline } from '../lib/exporter';

// 通用平台配置（使用原有的构建函数）
const genericConfig: PlatformConfig = {
  metadata: {
    id: 'generic',
    name: '通用'
  },
  rules: {
    nameMaxLength: 50,
    loglineMaxLength: 100,
    outlinePerEpisodeMax: 200,
    requireEditorReport: true,
    requireBible: true,
    allowedGenres: [],
    exportStructure: {
      includeOverview: true,
      includeBible: true,
      includeOutline: true,
      includeEditorReport: true
    }
  },
  validator: (project: any) => ({
    passed: true,
    errors: [],
    warnings: []
  }),
  templateBuilder: {
    buildOverview,
    buildOutline,
    buildBible
  }
};

const platformConfigs: Record<PlatformId, PlatformConfig> = {
  hongguo: hongguo,
  fanqie: fanqie,
  kuaikan: kuaikan,
  generic: genericConfig
};

/**
 * 获取平台配置
 */
export function getPlatform(platformId: PlatformId): PlatformConfig | undefined {
  return platformConfigs[platformId];
}

/**
 * 获取所有平台列表
 */
export function getAllPlatforms(): PlatformConfig[] {
  return Object.values(platformConfigs);
}

/**
 * 获取推荐平台
 */
export function getRecommendedPlatforms(): PlatformConfig[] {
  return Object.values(platformConfigs).filter(p => p.metadata.recommended);
}

/**
 * 验证平台 ID 是否有效
 */
export function isValidPlatform(platformId: string): platformId is PlatformId {
  return Object.keys(platformConfigs).includes(platformId);
}

export default platformConfigs;

