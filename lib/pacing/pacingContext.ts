export type ProgressType =
  | "RELATION_SHIFT"
  | "FACE_SLAP"
  | "REALM_BREAK"
  | "NEW_VARIABLE"
  | "CLASS_REVERSAL"
  | "GENERAL_ESCALATION";

export type HookStrength = "NORMAL" | "STRONG";

export interface PacingKPI {
  requireProgress: boolean;
  progressType: ProgressType;
  minHookStrength: HookStrength;
}

export interface PacingContext {
  templateId: string;
  episodeIndex: number;
  actNumber: number;
  actGoal: string;
  actRange: [number, number];
  hardRules: string[];
  kpi: PacingKPI;
  platformHints?: any; // 新增：平台特有提示（如红果编辑偏好）
  // M6-2: 仇恨链相关字段（可选）
  expectedAntagonistType?: string;      // 预期反派类型（如"低阶压迫者"）
  requiredPleasure?: string[];          // 必须产出的爽点类型（如["压制","羞辱"]）
  protagonistState?: string;            // 主角状态（如"被动承受"）
}

