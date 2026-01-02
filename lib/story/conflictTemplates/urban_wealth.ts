import { ConflictTemplate } from '../../types';

export const urbanWealthTemplate: ConflictTemplate = {
  genre: "都市爽文/神豪逆袭",
  stages: [
    {
      stageIndex: 1,
      episodeRange: "1-10",
      mainAntagonistType: "低阶压迫者",
      conflictSource: "资源/金钱",
      pressureMethod: "羞辱/剥夺/控制",
      protagonistState: "被动承受",
      requiredPleasure: ["压制", "羞辱"],
      resolutionType: "小胜或忍耐"
    },
    {
      stageIndex: 2,
      episodeRange: "11-40",
      mainAntagonistType: "中阶对手",
      conflictSource: "利益/阶层",
      pressureMethod: "封锁/打压/操控",
      protagonistState: "被迫反击",
      requiredPleasure: ["反转", "打脸"],
      resolutionType: "阶段性胜利"
    },
    {
      stageIndex: 3,
      episodeRange: "41-90",
      mainAntagonistType: "高阶幕后",
      conflictSource: "体系/资本/根因",
      pressureMethod: "围剿/清洗/崩塌",
      protagonistState: "主动进攻",
      requiredPleasure: ["清算", "终极反转"],
      resolutionType: "彻底清算"
    }
  ]
};



