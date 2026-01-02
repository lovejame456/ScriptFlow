import { ConflictTemplate } from '../../types';

export const romanceCeoTemplate: ConflictTemplate = {
  genre: "甜宠/霸总",
  stages: [
    {
      stageIndex: 1,
      episodeRange: "1-10",
      mainAntagonistType: "低阶压迫者",
      conflictSource: "情感/身份/误会",
      pressureMethod: "羞辱/打压/控制",
      protagonistState: "被动承受",
      requiredPleasure: ["压制", "情感折磨"],
      resolutionType: "小胜或忍耐"
    },
    {
      stageIndex: 2,
      episodeRange: "11-40",
      mainAntagonistType: "中阶对手",
      conflictSource: "阶层/规则/利益",
      pressureMethod: "封锁/打压/操控",
      protagonistState: "被迫反击",
      requiredPleasure: ["反转", "打脸"],
      resolutionType: "阶段性胜利"
    },
    {
      stageIndex: 3,
      episodeRange: "41-90",
      mainAntagonistType: "高阶幕后",
      conflictSource: "体系/家族/阶级对立",
      pressureMethod: "围剿/清洗/全面打压",
      protagonistState: "主动进攻",
      requiredPleasure: ["清算", "终极反转"],
      resolutionType: "彻底清算"
    }
  ]
};



