import { ConflictTemplate } from '../../types';

export const urbanConceptTemplate: ConflictTemplate = {
  genre: "都市脑洞",
  stages: [
    {
      stageIndex: 1,
      episodeRange: "1-8",
      mainAntagonistType: "规则压迫",
      conflictSource: "能力失控与社会秩序",
      pressureMethod: "限制 / 监控",
      protagonistState: "被动承受",
      requiredPleasure: ["压制"],
      resolutionType: "小胜"
    },
    {
      stageIndex: 2,
      episodeRange: "9-30",
      mainAntagonistType: "制度对手",
      conflictSource: "资源垄断",
      pressureMethod: "封锁 / 操控",
      protagonistState: "被迫反击",
      requiredPleasure: ["反转", "打脸"],
      resolutionType: "阶段性胜利"
    },
    {
      stageIndex: 3,
      episodeRange: "31-80",
      mainAntagonistType: "体系根源",
      conflictSource: "能力代价",
      pressureMethod: "清洗 / 崩塌",
      protagonistState: "主动进攻",
      requiredPleasure: ["终极反转"],
      resolutionType: "彻底清算"
    }
  ]
};



