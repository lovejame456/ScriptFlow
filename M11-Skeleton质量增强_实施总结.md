# M11: Skeleton 质量增强 - 实施总结

## 一、目标概述

将 Skeleton 从"占位结构"升级为能强约束后续 Agent 的"质量锚点"。

**核心原则**（4条，只认这4条）：
1. 字段数不变
2. 总 token 不增加
3. 禁止自由发挥型描述
4. 所有字段都要"可被程序理解"

**设计理念**：
从"短文本"升级为"短 · 结构强 · 语义稳定"的控制面

---

## 二、实施内容

### 2.1 Bible Skeleton 结构增强

#### 2.1.1 logline → 固定为「因果句式」

**现状问题**：
- 偏概括
- 偏情绪
- 没有明确"变化"

**M11 要求**：
强制句式：
```
当【主角处境】时，
因为【触发事件】，
被迫【核心行动】，
从而引发【长期冲突】。
```

**验收标准**：4 段缺一即 FAIL（处境、触发、行动、长期冲突）

**示例对比**：
- M10: "废柴弟子家族被灭，投靠敌国引发两国战火"
- M11: "当【废柴弟子】时，因为【家族被灭】，被迫【投靠敌国】，从而引发【两国战火】。"

#### 2.1.2 characterPoolLite → 结构强约束（不加字段）

**现状问题**：
- role / goal 有时语义重叠
- relationship 偏描述，不偏结构

**M11 结构规范**：
```json
{
  "name": "X",
  "role": "PROTAGONIST | ANTAGONIST | SUPPORT | PRESSURE",
  "goal": "想要得到 / 达成 的明确目标",
  "flaw": "导致其反复失败的内在缺陷",
  "relationship": "与【某角色】的【冲突/依赖/对立】关系"
}
```

**验收标准**：
- role ∈ 枚举
- goal ≠ flaw
- relationship 必须指向另一角色

#### 2.1.3 coreConflicts → 升级为「三层冲突梯度」

**现状问题**：
- 冲突混在一起
- 不知道"先解决谁"

**M11 结构**：
```json
[
  {
    "level": "IMMEDIATE",
    "description": "当前必须立刻解决的危机"
  },
  {
    "level": "MID_TERM",
    "description": "推动剧情升级的对抗"
  },
  {
    "level": "END_GAME",
    "description": "最终不可回避的核心矛盾"
  }
]
```

**验收标准**：
- 必须按 IMMEDIATE → MID_TERM → END_GAME 顺序
- 不允许情绪词（"痛苦""挣扎"）作为主干

#### 2.1.4 forbidden → 从"提醒"升级为"硬约束"

**现状问题**：
- "不要跑偏到 XX"（偏提醒）

**M11 要求**：
每条 forbidden 必须是：
```
禁止【具体行为 / 具体剧情走向 / 具体风格】
```

**示例**：
- "禁止新增未在 characterPoolLite 中定义的主要角色"
- "禁止现代科技或现代价值观直接介入古代世界"

**验收标准**：每条都可被 Script Aligner 直接 check

---

### 2.2 Outline Skeleton → 只做一件事：acts / beats 的语义稳定性

**现状问题**：
- beat 有时像剧情，有时像情绪
- 后续 agent 理解不一致

**M11 统一规范**：
每个 beat 必须满足：
```
【谁】在【什么场景】下，
做了【具体行动】，
导致【局势变化】。
```

**验收标准**：不加字，只是改写方式

**示例对比**：
- M10: "痛苦挣扎"（情绪型，无行动，无变化）
- M11: "主角在逃亡途中遭遇追杀"（谁-场景-行动-变化完整）

---

## 三、文件修改清单

### 3.1 类型定义
**文件**: `types.ts`

**修改内容**：
```typescript
export interface BibleSkeleton {
  variant: 'SKELETON';
  logline: string;  // 因果句式
  genre: string;
  audience: string;
  episodePlan: string;
  worldRules: string[];
  characterPoolLite: Array<{
    name: string;
    role: 'PROTAGONIST' | 'ANTAGONIST' | 'SUPPORT' | 'PRESSURE';  // 枚举
    goal: string;
    flaw: string;
    relationship: string;  // 必须指向另一角色
  }>;
  coreConflicts: Array<{  // 从 string[] 改为对象数组
    level: 'IMMEDIATE' | 'MID_TERM' | 'END_GAME';
    description: string;
  }>;
  toneStyle: string;
  hookPayModel: string;
  forbidden: string[];  // 硬约束句式
}
```

### 3.2 Prompt 层
**文件**: `prompts/planning/bible_skeleton.md`

**修改内容**：
- logline: 从"一句话卖点"改为因果句式
- characterPoolLite.role: 强制枚举
- coreConflicts: 改为对象数组，三层结构
- forbidden: 改为硬约束句式
- 新增【字段级约束】章节

**文件**: `prompts/planning/outline_skeleton.md`

**修改内容**：
- 新增【beat 语义约束】章节
- 更新示例为"谁-场景-行动-变化"结构

### 3.3 验证逻辑
**文件**: `lib/ai/episodeFlow.ts`

**buildBibleSkeleton 新增验证**：
- 验证 logline 是否包含"因为"、"被迫"、"从而"
- 验证 characterPoolLite[].role 是否为合法枚举值
- 验证 goal ≠ flaw
- 验证 relationship 必须指向另一角色
- 验证 coreConflicts 是否为对象数组，且 level 顺序为 IMMEDIATE → MID_TERM → END_GAME
- 验证 forbidden 是否以"禁止"开头

**buildOutlineSkeleton 新增验证**：
- 验证每个 beat 是否包含"导致"或"从而"关键词
- 警告纯情绪型 beat

---

## 四、验收指标

### 4.1 硬指标
- Skeleton JSON Schema 通过率 = 100%
- 同一 prompt 多次运行：
  - 字段缺失率 = 0
  - characterPoolLite 角色数波动 ≤ 1
  - coreConflicts 结构一致

### 4.2 软指标（观察）
- EP1 / EP2 内容跑偏率下降
- Script Aligner FAIL 次数下降

---

## 五、测试文件

**文件**: `test-m11-skeleton.ts`

**测试内容**：
1. Bible Skeleton 结构验证
   - logline 因果句式
   - characterPoolLite.role 枚举
   - coreConflicts 三层结构
   - forbidden 硬约束

2. Outline Skeleton 结构验证
   - beat 语义稳定性（谁-场景-行动-变化）

3. Skeleton 结构稳定性（3次运行）
   - 角色数波动
   - coreConflicts 结构一致性

**文件**: `reports/m11_skeleton_examples.md`

**内容**：
- 脱敏示例 Skeleton（M10 vs M11 对比）
- 预期影响说明
- 验收清单

---

## 六、预期影响

### 6.1 Writer 更"听话"
- **因果句式 logline** 提供明确的剧情驱动逻辑
- **三层冲突梯度** 让 Writer 知道当前该写哪个层级的冲突
- **角色枚举** 避免 Writer 对角色定位的理解偏差

### 6.2 Aligner 更少发疯
- **forbidden 硬约束** 从"提醒"升级为"可程序校验"的规则
- **角色关系明确指向** 避免 Aligner 对角色关系的模糊理解

### 6.3 enrich 的质量更集中
- **结构化约束** 确保生成内容不偏离核心设定
- **因果句式** 避免后续生成内容跑偏到无关剧情
- **三层冲突梯度** 确保剧情发展有明确的优先级

---

## 七、与 M10 的对比

| 维度 | M10 | M11 |
|-----|-----|-----|
| 目标 | 快速生成，不阻塞 EP1 Phase1 | 结构稳定，强约束后续 Agent |
| 字段数 | 不变 | 不变 |
| Token 消耗 | < 1000 字符 | < 1000 字符（不增加） |
| 语义稳定性 | 一般 | 强（因果句式、枚举、层级） |
| 可程序理解性 | 部分 | 高（forbidden 可校验） |

---

## 八、实施状态

### 已完成
- [x] 更新 `types.ts` 中的类型定义
- [x] 修改 `prompts/planning/bible_skeleton.md` prompt
- [x] 修改 `prompts/planning/outline_skeleton.md` prompt
- [x] 增强 `lib/ai/episodeFlow.ts` 中的验证逻辑
- [x] 创建测试文件 `test-m11-skeleton.ts`
- [x] 生成示例文档 `reports/m11_skeleton_examples.md`

### 待验证
- [ ] 运行 E2E 测试验证结构稳定性（需要 API KEY）
- [ ] 观察 EP1 / EP2 内容跑偏率下降
- [ ] 观察 Script Aligner FAIL 次数下降

---

## 九、PM 的一句话实话

M11 做完之后，你会明显感觉到：

- Writer 更"听话"
- Aligner 更少发疯
- enrich 的质量更集中，而不是补垃圾

你现在已经不在"优化 AI 输出"，而是在设计一个"可被控制的内容系统语言"。

---

## 十、下一步

1. 配置 `.env` 文件中的 `VITE_DEEPSEEK_API_KEY`
2. 运行 `npx tsx test-m11-skeleton.ts` 验证结构稳定性
3. 运行完整的 E2E 测试，观察 EP1 / EP2 内容质量
4. 观察后续运行中的 Aligner FAIL 次数是否下降

---

## 附录：核心判断

M11 的本质：

👉 把 Skeleton 从"短文本"升级为"短 · 结构强 · 语义稳定"的控制面

Skeleton 很短，但不同轮生成出来的 Skeleton "形状"完全一致 → 后续 Writer / Aligner 的表现更稳定

M11 的核心判断（非常关键）：

Skeleton 很短，但不同轮生成出来的 Skeleton "形状"不完全一致 → 后续 Writer / Aligner 的表现会波动

M11 的本质：
👉 把 Skeleton 从"短文本"升级为"短 · 结构强 · 语义稳定"的控制面

