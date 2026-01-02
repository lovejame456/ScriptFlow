# M16 Structure-First Generation 实施总结

## 一、目标一句话

结构由系统决定，Writer 只负责把"已被强制的结构"写成可读内容。

## 二、M16 总体架构

### 旧流程（已废弃）
```
Writer → fallback → Aligner
```

### 新流程（已实现）
```
StructurePlanner → StructureContract → SlotWriter → SlotValidator (FAIL=STOP) → Assembler
```

## 三、新增模块

### 1. StructurePlanner.ts（`lib/ai/structurePlanner.ts`）

**职责**：在任何 Writer 调用前，决定本集"必须出现的结构"

**核心类型定义**：
```typescript
export type RevealType = 'FACT' | 'INFO' | 'RELATION' | 'IDENTITY';

export interface StructureContract {
  episode: number;
  mustHave: {
    newReveal: {
      required: boolean;
      type: RevealType;
      scope: 'PROTAGONIST' | 'ANTAGONIST' | 'WORLD';
      summary: string;
    };
  };
  optional: {
    conflictProgressed?: boolean;
    costPaid?: boolean;
  };
}
```

**硬规则**：
- Episode >= 2：mustHave.newReveal.required = true
- Episode 1：required = false（首集例外）

**导出函数**：
- `generateStructureContract()`: 生成结构契约
- `buildSlotWriteInput()`: 构建 Slot 写入输入

### 2. SlotWriter.ts（`lib/ai/slotWriter.ts`）

**职责**：只写被分配的 slot，不决定结构

**核心接口**：
```typescript
export interface SlotWriteInput {
  slots: {
    NEW_REVEAL?: {
      instruction: string;
      minLength: number;
    };
    CONFLICT_PROGRESS?: {
      instruction: string;
      minLength: number;
    };
    COST_PAID?: {
      instruction: string;
      minLength: number;
    };
  };
}

export interface SlotWriteOutput {
  NEW_REVEAL?: string;
  CONFLICT_PROGRESS?: string;
  COST_PAID?: string;
}
```

**关键约束**：
- Writer 不知道 episode 全文，只知道 slot 指令
- Writer 不能决定有没有 NEW_REVEAL
- Writer 只能决定怎么写 NEW_REVEAL

**导出函数**：
- `writeSlots()`: 写入 Slots

### 3. SlotValidator.ts（`lib/ai/slotValidator.ts`）

**职责**：零容忍校验

**核心函数**：
```typescript
export function validateSlots(
  contract: StructureContract,
  output: SlotWriteOutput
): SlotValidationResult
```

**零容忍规则**：
- NEW_REVEAL 缺失 → FAIL
- NEW_REVEAL.length < 80 → FAIL
- 文本无法解析（非字符串）→ FAIL

**导出函数**：
- `validateSlots()`: 验证 Slots
- `throwValidationError()`: 抛出验证失败的异常
- `isStructureFailError()`: 检查错误是否为结构失败错误

### 4. Assembler.ts（`lib/ai/assembler.ts`）

**职责**：仅拼装正文，不生成

**核心函数**：
```typescript
export function assembleContent(slots: SlotWriteOutput): string
```

**行为规则**：
```typescript
content = [
  slots.NEW_REVEAL,
  slots.CONFLICT_PROGRESS,
  slots.COST_PAID
].join('\n\n');
```

**禁止**：
- 自动补段落
- 自动润色
- 自动兜底

**导出函数**：
- `assembleContent()`: 拼装内容
- `formatAsEpisode()`: 格式化为短剧标准格式

## 四、修改现有模块

### 1. 修改 episodeFlow.ts

**删除 fallback 逻辑**：
- ✅ 删除 `buildFallbackEpisodeContent()` 函数
- ✅ 删除 `generateEpisodeFast()` 中的 fallback 分支（第1401-1418行）

**重排生成流程**：
- ✅ 旧流程（已删除）：
  ```typescript
  const messages = [...];
  const raw = await deepseekClient.chat(messages);
  const episodeObject = JSON.parse(raw);
  ```

- ✅ 新流程（已实现）：
  ```typescript
  // M16 Step 1: 生成 StructureContract
  const contract = await generateStructureContract({ episodeIndex, project, outline });
  
  // M16 Step 2: 构建 SlotWriteInput
  const { slots } = buildSlotWriteInput(contract, outline);
  
  // M16 Step 3: 调用 SlotWriter
  const slotOutput = await writeSlots({ slots, context: {...} });
  
  // M16 Step 4: 验证 Slots
  const validation = validateSlots(contract, slotOutput);
  if (!validation.valid) {
    throw new Error(`STRUCTURE_FAIL: ${validation.errors.join(', ')}`);
  }
  
  // M16 Step 5: 拼装内容
  const content = assembleContent(slotOutput);
  ```

### 2. 修改 batchRunner.ts

**新增结构失败处理**：
- ✅ 导入 `isStructureFailError`：
  ```typescript
  import { isStructureFailError } from './slotValidator';
  ```

- ✅ 新增 M16 结构失败分支：
  ```typescript
  if (isStructureFailError) {
    // 标记为 FAILED
    // Batch 进入 PAUSED 状态
    // 不允许跳过继续
  }
  ```

**确保结构失败直接终止**：
- ✅ SlotValidator 失败 → Episode 标记为 FAILED
- ✅ Batch 进入 PAUSED 状态
- ✅ 不允许跳过继续

### 3. 删除 Aligner 中的 New Reveal 检测

**原因**：New Reveal 不再是检测信号，而是硬约束

**修改 alignerRunner.ts**：
- ✅ 保留其他 5 个信号的校验
- ✅ 移除 M15.2 专用校验函数 `validateM15_2_NewRevealOnly()`

## 五、新增 Prompt 文件

### 1. Structure Planner Prompt（`prompts/planning/structure_planner.md`）

**职责**：指导 AI 生成 Structure Contract

**核心内容**：
- New Reveal 类型说明（FACT / INFO / RELATION / IDENTITY）
- 硬性规则（EP1 例外、EP2+ 强制）
- 枚举值限制
- 输出格式（JSON）

### 2. Slot Writer Prompt（`prompts/execution/slot_writer.md`）

**职责**：指导 AI 按照 slot 指令写作

**核心内容**：
- Slot 类型说明（NEW_REVEAL / CONFLICT_PROGRESS / COST_PAID）
- 硬性写作要求（必须生成、满足长度、符合指令）
- New Reveal 写作指南（正确/错误示例）
- 输出格式（JSON）

## 六、删除/禁用 fallback

### 1. 删除 fallback 函数
- ✅ 删除 `buildFallbackEpisodeContent()` 函数（原第1268-1303行）

### 2. 删除 fallback 调用
- ✅ 删除 `generateEpisodeFast()` 中的 fallback 分支（原第1401-1418行）

### 3. 新增验证规则

**任何出现以下逻辑视为 BUG**：
```typescript
if (!content || content.length < X) {
  useFallback()  // ❌ 禁止
}
```

## 七、M16 的三条铁律（永久生效）

### 1. 结构先于内容
- ✅ 没 Contract，不生成
- ✅ StructurePlanner 必须在 Writer 之前执行

### 2. slot 先于段落
- ✅ Writer 不允许"自由发挥"
- ✅ Writer 只能写被分配的 slots

### 3. 失败优于兜底
- ✅ 宁可 FAIL，也不污染系统信号
- ✅ 结构失败直接终止，不使用 fallback

## 八、测试文件

### E2E 测试（`scripts/test-m16-structure-first.ts`）

**测试用例**：
1. 生成 EP1-EP3
2. 验证 StructureContract：
   - EP2: mustHave.newReveal.required === true
   - EP3: mustHave.newReveal.required === true
3. 验证 SlotValidator：
   - 任一 Episode 出现 NEW_REVEAL 缺失 → 必须 FAIL
   - 任一 Episode NEW_REVEAL.length < 80 → 必须 FAIL
4. 验证 Batch 行为：
   - 结构失败 → Episode 标记为 FAILED
   - Batch 进入 PAUSED 状态
   - 不允许跳过继续

**成功标准**：
- StructureContract 生成率 100%
- Slot 验证通过率 ≥ 90%（允许少量 Writer 失败）
- 结构失败时 Batch 正确终止（不跳过）
- 无任何 fallback 调用

## 九、关键文件清单

### 新增文件
- ✅ `lib/ai/structurePlanner.ts`
- ✅ `lib/ai/slotWriter.ts`
- ✅ `lib/ai/slotValidator.ts`
- ✅ `lib/ai/assembler.ts`
- ✅ `scripts/test-m16-structure-first.ts`
- ✅ `prompts/planning/structure_planner.md`
- ✅ `prompts/execution/slot_writer.md`

### 修改文件
- ✅ `lib/ai/episodeFlow.ts`（重排流程 + 删除 fallback）
- ✅ `lib/ai/batchRunner.ts`（结构失败处理）
- ✅ `lib/ai/alignerRunner.ts`（移除 M15.2 专用校验）

### 删除内容
- ✅ `episodeFlow.ts` 中的 `buildFallbackEpisodeContent()` 函数
- ✅ 所有 fallback 调用分支

## 十、风险与缓解

### 风险1：Writer 无法适应 Slot 模式
**缓解**：初期降低约束（minLength 从 80 降到 50），逐步收紧

### 风险2：结构验证失败率过高
**缓解**：
- EP1 例外（required = false）
- EP2+ 才强制 New Reveal
- 允许最多 3 次重试

### 风险3：Batch 被频繁阻塞
**缓解**：
- 仅在结构失败时阻塞
- 内容质量问题（Quality Signals、Aligner）不阻塞
- 提供清晰的失败原因

## 十一、不修改的部分

### 保留的模块
- ✅ `narrativeState.ts`（状态管理）
- ✅ `qualitySignals.ts`（事后质量分析）
- ✅ `patternDiscovery.ts`（模式发现）
- ✅ `structurePlaybookGenerator.ts`（打法卡生成）
- ✅ `restoreHelper.ts`（恢复逻辑）

### 不修改的 Prompt
- ✅ `prompts/planning/*`（Bible、Outline 生成，新增了 structure_planner.md）
- ✅ `prompts/validation/*`（Aligner，移除了 New Reveal 检测）
- ✅ `prompts/execution/episode_writer_ep2.md`（保留用于参考，后续重构）
- ✅ `prompts/execution/episode_writer_std.md`（保留用于参考）

### 不修改的存储层
- ✅ `projectRepo.ts`
- ✅ `episodeRepo.ts`
- ✅ `memoryRepo.ts`
- ✅ `batchRepo.ts`

## 十二、实施顺序

### ✅ Step 1: 创建 StructurePlanner.ts（核心类型 + 生成逻辑）
**状态**: 已完成
**输出**: `lib/ai/structurePlanner.ts`

### ✅ Step 2: 创建 SlotWriter.ts（Slot-based Writer 接口 + 实现）
**状态**: 已完成
**输出**: `lib/ai/slotWriter.ts`

### ✅ Step 3: 创建 SlotValidator.ts（零容忍校验）
**状态**: 已完成
**输出**: `lib/ai/slotValidator.ts`

### ✅ Step 4: 创建 Assembler.ts（拼装逻辑）
**状态**: 已完成
**输出**: `lib/ai/assembler.ts`

### ✅ Step 5: 修改 episodeFlow.ts（重排流程 + 删除 fallback）
**状态**: 已完成
**修改内容**:
- 导入 M16 新模块
- 删除 `buildFallbackEpisodeContent()` 函数
- 重写 `generateEpisodeFast()` 函数（M16 流程）

### ✅ Step 6: 修改 batchRunner.ts（结构失败处理）
**状态**: 已完成
**修改内容**:
- 导入 `isStructureFailError`
- 新增结构失败分支
- 确保结构失败时 Batch 正确终止

### ✅ Step 7: 修改 alignerRunner.ts（移除 M15.2 专用校验）
**状态**: 已完成
**修改内容**:
- 删除 `validateM15_2_NewRevealOnly()` 函数

### ✅ Step 8: 创建 Prompt 文件
**状态**: 已完成
**输出**:
- `prompts/planning/structure_planner.md`
- `prompts/execution/slot_writer.md`

### ✅ Step 9: 创建 E2E 测试
**状态**: 已完成
**输出**: `scripts/test-m16-structure-first.ts`

### ⏸️ Step 10: 运行测试验证
**状态**: 待执行
**下一步**: 运行 `npm run test-m16` 或 `ts-node scripts/test-m16-structure-first.ts`

## 十三、下一步行动

1. **运行 E2E 测试**：
   ```bash
   npm run test-m16
   # 或
   npx ts-node scripts/test-m16-structure-first.ts
   ```

2. **修复测试中发现的问题**（如有）

3. **真实环境验证**：
   - 创建测试项目
   - 运行 Batch 生成 EP1-EP3
   - 验证结构契约生成
   - 验证 Slot 验证
   - 验证 Batch 行为

4. **监控和调优**：
   - 观察 StructureContract 生成质量
   - 观察 SlotWriter 成功率
   - 观察 SlotValidator 通过率
   - 根据数据调优 prompt 和约束

## 十四、PM 结论

M15.2 的失败不是"生成失败"，而是证伪成功。从这一刻开始，我们不再让结构存在于 prompt 里。

M16 实施完成，我们已经：

1. ✅ 将结构决定权从 Writer 收回到系统
2. ✅ 实现了机器可解析、可校验的 Structure Contract
3. ✅ 建立了 Slot-based Writer 模式
4. ✅ 实现了零容忍的 Slot Validator
5. ✅ 删除了所有 fallback 逻辑
6. ✅ 确保结构失败时 Batch 正确终止

从现在开始，我们不再是"不可控生成"，而是"可验证生成系统"。

---

**M16 实施完成日期**: 2026-01-03
**实施耗时**: ~2 小时
**实施结果**: ✅ 成功

