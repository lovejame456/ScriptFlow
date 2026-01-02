import { ConflictTemplate } from '../../types';

export const revengeRebirthTemplate: ConflictTemplate = {
  genre: "复仇/重生爽剧",
  stages: [
    {
      stageIndex: 1,
      episodeRange: "1-10",
      mainAntagonistType: "低阶压迫者",
      conflictSource: "情感/身份/尊严",
      pressureMethod: "羞辱/践踏/背叛",
      protagonistState: "被动承受",
      requiredPleasure: ["压制", "屈辱"],
      resolutionType: "小胜或忍耐"
    },
    {
      stageIndex: 2,
      episodeRange: "11-40",
      mainAntagonistType: "中阶对手",
      conflictSource: "利益/势力/秘密",
      pressureMethod: "设局/陷害/追杀",
      protagonistState: "被迫反击",
      requiredPleasure: ["反转", "复仇"],
      resolutionType: "阶段性胜利"
    },
    {
      stageIndex: 3,
      episodeRange: "41-90",
      mainAntagonistType: "高阶幕后",
      conflictSource: "命运/过往真相/终极背叛",
      pressureMethod: "全面围剿/终极清算",
      protagonistState: "主动进攻",
      requiredPleasure: ["清算", "因果闭环"],
      resolutionType: "彻底清算"
    }
  ]
};


