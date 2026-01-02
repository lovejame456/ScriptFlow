// M5-1.2: 红果节奏偏好配置
// 定义红果平台专用的题材 × 节奏微调规则
// 注意：这是"红果风格层"，不是通用规则，不改 PacingEngine

/**
 * 红果节奏偏好配置
 * 根据不同题材提供红果编辑偏好的节奏要求
 */
export const hongguoPacingHints = {
  // Act1 阶段（前 10 集）的强制要求
  act1: {
    mustHave: [
      "至少一次明确冲突",
      "至少一次关系变化或立场变化",
    ],
    kpi: "前10集完成一次质变"
  },

  // 持续进行的节奏要求
  ongoing: {
    every5: "必须出现一次明确爽点（打脸/反转/收益）"
  },

  // 题材特有规则
  genreRules: {
    // 甜宠类：强调关系升级频率
    romance: {
      beforeEp10: {
        relationShifts: 2, // 前 10 集必须 2 次关系升级
        highlights: "强调情绪爽点、关系升级"
      }
    },

    // 复仇类：强调打脸密度
    revenge: {
      every5: {
        faceSlapRequired: true, // 每 5 集必须一次"明确打脸"
        highlights: "强调打脸密度、身份反转"
      }
    },

    // 修仙类：强调境界跃迁
    cultivation: {
      beforeAct2: {
        realmBreakRequired: true, // Act2 前必须完成第一次境界跃迁
        highlights: "强调境界跃迁、实力成长"
      }
    },

    // 都市脑洞：强调新变量
    urban: {
      every5: {
        newVariableRequired: true, // 每 5 集必须制造新变量
        highlights: "强调新变量、能力代价"
      }
    }
  }
};

/**
 * 根据题材获取红果偏好配置
 */
export function getHongguoPacingHints(genre: string) {
  // 归类题材到红果偏好规则
  const genreMap: Record<string, keyof typeof hongguoPacingHints.genreRules> = {
    '甜宠恋爱': 'romance',
    '豪门复仇': 'revenge',
    '古装重生': 'revenge',
    '玄幻修仙': 'cultivation',
    '都市异能': 'urban',
    '都市脑洞': 'urban',
    '战神赘婿': 'revenge'
  };

  const ruleKey = genreMap[genre] || 'romance'; // 默认用甜宠规则
  return {
    ...hongguoPacingHints,
    genreRule: hongguoPacingHints.genreRules[ruleKey]
  };
}




