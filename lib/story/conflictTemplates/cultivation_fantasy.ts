import { ConflictTemplate } from '../../types';

export const cultivationFantasyTemplate: ConflictTemplate = {
  genre: "修仙/穿越/玄幻",
  stages: [
    {
      stageIndex: 1,
      episodeRange: "1-10",
      mainAntagonistType: "低阶压迫者",
      conflictSource: "资源/境界/规则",
      pressureMethod: "羞辱/剥夺/打压",
      protagonistState: "被动承受",
      requiredPleasure: ["压制", "境界突破"],
      resolutionType: "小胜或忍耐"
    },
    {
      stageIndex: 2,
      episodeRange: "11-40",
      mainAntagonistType: "中阶对手",
      conflictSource: "势力/秘境/规则",
      pressureMethod: "封锁/追杀/碾压",
      protagonistState: "被迫反击",
      requiredPleasure: ["反转", "境遇提升"],
      resolutionType: "阶段性胜利"
    },
    {
      stageIndex: 3,
      episodeRange: "41-90",
      mainAntagonistType: "高阶幕后",
      conflictSource: "体系/天道/根因",
      pressureMethod: "围剿/清洗/终极对抗",
      protagonistState: "主动进攻",
      requiredPleasure: ["清算", "终极突破"],
      resolutionType: "彻底清算"
    }
  ]
};


