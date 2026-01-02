// M5-1: 平台适配模块
// 定义平台类型、规则和校验结果

/**
 * 平台 ID 枚举
 */
export type PlatformId = 'hongguo' | 'fanqie' | 'kuaikan' | 'generic';

/**
 * 平台显示名称映射
 */
export const PLATFORM_NAMES: Record<PlatformId, string> = {
  hongguo: '红果短剧',
  fanqie: '番茄短剧',
  kuaikan: '快看',
  generic: '通用'
};

/**
 * 平台元数据
 */
export interface PlatformMetadata {
  id: PlatformId;
  name: string;
  recommended?: boolean; // 是否推荐
}

/**
 * 平台规则
 * 定义每个平台的字段限制和偏好
 */
export interface PlatformRules {
  // 字段长度限制
  nameMaxLength: number;
  loglineMaxLength: number;
  outlinePerEpisodeMax: number;

  // 必需文件
  requireEditorReport: boolean;
  requireBible: boolean;

  // 题材偏好
  allowedGenres: string[];
  preferredGenres?: string[];

  // 集数限制
  minEpisodes?: number;
  maxEpisodes?: number;
  recommendedEpisodeCount?: [number, number]; // 推荐集数范围

  // 导出配置
  exportStructure: {
    includeOverview: boolean;
    includeBible: boolean;
    includeOutline: boolean;
    includeEditorReport: boolean;
  };
}

/**
 * 平台校验结果
 */
export interface PlatformValidationResult {
  passed: boolean;
  errors: string[];    // 严重错误，阻断导出
  warnings: string[];  // 警告，提示但不阻断
}

/**
 * 导出模板生成函数签名
 */
export interface ExportTemplateBuilder {
  buildOverview(project: any): string;
  buildOutline(project: any): string;
  buildBible?(project: any): string;
}

/**
 * 平台配置
 * 包含规则、模板构建器和校验器
 */
export interface PlatformConfig {
  metadata: PlatformMetadata;
  rules: PlatformRules;
  validator: (project: any) => PlatformValidationResult;
  templateBuilder: ExportTemplateBuilder;
}





