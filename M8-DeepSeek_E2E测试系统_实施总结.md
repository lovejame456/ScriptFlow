# M8-DeepSeek E2E 测试系统实施总结

## 实施概述

本次实施完成了一个完整的 DeepSeek API 全链路 E2E 测试系统，包含真实 API 调用、性能监控、自动化验收和报告生成功能。

## 交付物清单

### 1. 新增文件

| 文件路径 | 说明 |
|---------|------|
| `lib/observability/timer.ts` | 轻量级计时工具，支持嵌套 span 和统计计算 |
| `scripts/test_deepseek_e2e.ts` | 核心 E2E 测试脚本，完整流程编排和报告生成 |
| `E2E_TEST_README.md` | 详细的使用文档和集成指南 |
| `reports/deepseek_e2e_report.example.md` | 示例报告（Markdown 格式） |
| `reports/.gitkeep` | 保留 reports 目录 |

### 2. 修改文件

| 文件路径 | 修改内容 |
|---------|----------|
| `lib/ai/episodeFlow.ts` | 添加 `MetricsOptions` 参数，在关键点埋点（seed/bible/outline/episode writer/save） |
| `api/index.ts` | 支持 metrics 透传 |
| `package.json` | 添加 `"test:deepseek:e2e": "tsx scripts/test_deepseek_e2e.ts"` |
| `.gitignore` | 添加 `reports` 目录 |

### 3. 删除文件

无

## 功能实现

### ✅ 已实现功能

#### 1. 真实 DeepSeek API 调用
- 完整执行 `createProjectSeed` → `buildBible` → `generateOutline` → `generateOneEpisode`
- 只测试 EP1-EP3（减少成本与时间）
- 环境变量支持：`DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`

#### 2. 性能指标采集
采集的耗时指标包括：
- `seed_time_ms` - Seed 生成耗时
- `bible_time_ms` - Bible 生成耗时
- `outline_time_ms` - Outline 生成耗时（分 item 统计）
- `ep_writer_time_ms` - Episode Writer 调用耗时
- `save_time_ms` - Episode 保存耗时
- `total_time_ms` - 全链路总耗时

#### 3. 自动化验收指标

##### A. 成功率
- ✅ EP1-EP3 每集必须产出可读 content
- ✅ 允许 DRAFT，但必须 content >= 200 字
- ✅ EP1 强依赖：FAILED/PAUSED 导致整体 FAIL

##### B. 内容质量
- ✅ EP1 Phase1: content.length >= 200
- ✅ COMPLETED: content.length >= 600
- ✅ qualityCheck 结果记录到报告

##### C. 状态一致性（P0）
- ✅ `batch.completed` 只包含 `COMPLETED` 状态
- ✅ 进度条计算验证
- ✅ DRAFT/FAILED 检测并 FAIL

##### D. 生成耗时指标
- ✅ EP1 Phase1 <= 60s
- ✅ 单集（EP2/3）<= 120s
- ✅ 全链路 <= 600s（10分钟）
- ✅ WARN（1x 阈值）/ FAIL（2x 阈值）自动判定

#### 4. 报告生成
- ✅ `reports/deepseek_e2e_report.json` - 机器可读
- ✅ `reports/deepseek_e2e_report.md` - 人类可读摘要
- ✅ 包含测试时间、项目ID、模型名
- ✅ 包含每集结果（status、contentLength、quality、aligner、耗时分解）
- ✅ 包含耗时指标表（每阶段 ms）
- ✅ 包含阈值判定（PASS/WARN/FAIL）
- ✅ 包含状态一致性检查结果
- ✅ 包含最终结论与建议

#### 5. 退出码支持
- ✅ PASS = 0
- ✅ FAIL/WARN = 1
- ✅ 可集成到 CI/CD

### 🎯 非功能性需求

#### 性能
- ✅ 埋点轻量，不影响正常运行
- ✅ 可开关：通过 `collectMetrics` 和 `timer` 参数控制
- ✅ 不侵入 UI，仅用于测试与日志

#### 可维护性
- ✅ 清晰的代码结构
- ✅ 完整的类型定义
- ✅ 详细的文档注释

#### 可扩展性
- ✅ 支持自定义阈值配置
- ✅ 支持自定义测试 prompt
- ✅ 支持增加更多监控指标

## 技术实现细节

### 1. Timer 工具 (`lib/observability/timer.ts`)

```typescript
// 创建计时器
const timer = createTimer('e2e_test');

// 开始 span
const span = timer.startSpan('some_operation', { meta: 'value' });

// 执行操作
await doSomething();

// 结束 span
const result = span.end();  // { name: 'some_operation', ms: 1234, meta: {...} }

// 获取统计
const stats = timer.getStats('some_operation');
// { count: 1, p50: 1234, p95: 1234, max: 1234, min: 1234, avg: 1234 }
```

### 2. 埋点集成 (`lib/ai/episodeFlow.ts`)

```typescript
// 函数签名增强
export async function generateEpisodeFast({
  projectId,
  episodeIndex,
  collectMetrics = false,
  timer
}: {
  projectId: string;
  episodeIndex: number;
  collectMetrics?: boolean;
  timer?: Timer;
}) {
  // ... 埋点代码
}
```

### 3. 测试流程 (`scripts/test_deepseek_e2e.ts`)

```typescript
// 配置
const CONFIG = {
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
  THRESHOLDS: {
    EP1_PHASE1_MAX_MS: 60000,
    SINGLE_EPISODE_MAX_MS: 120000,
    TOTAL_PIPELINE_MAX_MS: 600000,
  },
  QUALITY: {
    MIN_CONTENT_LENGTH_DRAFT: 200,
    MIN_CONTENT_LENGTH_COMPLETED: 600,
  },
};

// 执行测试
const report = await runE2ETest();

// 生成报告
fs.writeFileSync(CONFIG.JSON_REPORT, JSON.stringify(report, null, 2));
fs.writeFileSync(CONFIG.MD_REPORT, generateMarkdownReport(report));
```

## 如何运行

### 前置要求
1. Node.js >= 18
2. DeepSeek API Key

### 运行步骤

```bash
# 1. 设置环境变量
export DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 可选：指定模型（默认为 deepseek-chat）
export DEEPSEEK_MODEL=deepseek-chat

# 2. 运行测试
npm run test:deepseek:e2e

# 3. 查看报告
cat reports/deepseek_e2e_report.md
```

### 预期输出

```
================================================================================
DeepSeek API 全链路 E2E 测试
================================================================================
测试ID: test_1704038400000
时间: 2024-01-02T08:00:00.000Z
模型: deepseek-chat
项目ID: proj_e2e_1704038400000
目标集数: EP1-EP3
================================================================================

✓ API Key 已配置 (前4位: sk-x***)

【阶段 1/5】创建项目 Seed...
✓ Seed 创建成功: 测试项目
  - 题材: 都市脑洞
  - 集数: 3
  - 节奏模板: urban_concept

【阶段 2/5】构建 Bible...
✓ Bible 构建成功
  - 角色数: 5
  - 世界设定: 现代都市，商业竞争激烈...

【阶段 3/5】生成 Outline...
✓ Outline 生成成功
  - 生成集数: 3

【阶段 4/5】生成剧集...

  --- 生成 EP1 ---
✓ EP1 生成成功
  - 状态: DRAFT
  - 字数: 450
  - 质量检查: true
  - Aligner: true
  - 耗时: 3500ms

  --- 生成 EP2 ---
✓ EP2 生成成功
  - 状态: DRAFT
  - 字数: 620
  - 质量检查: true
  - Aligner: true
  - 耗时: 8100ms

  --- 生成 EP3 ---
✓ EP3 生成成功
  - 状态: DRAFT
  - 字数: 580
  - 质量检查: true
  - Aligner: true
  - 耗时: 7600ms

【阶段 5/5】验证数据一致性...
✓ 状态一致性: PASS

【指标判定】
  EP1 Phase1: 3500ms < 60000ms - PASS
  EP2: 8100ms < 120000ms - PASS
  EP3: 7600ms < 120000ms - PASS
  全链路: 45000ms < 600000ms - PASS

【内容质量判定】
  ✓ EP1: 字数 450 >= 200 (DRAFT)
  ✓ EP2: 字数 620 >= 200 (DRAFT)
  ✓ EP3: 字数 580 >= 200 (DRAFT)

【生成报告】
✓ JSON 报告: /Users/kenny/projects/scriptflow/reports/deepseek_e2e_report.json
✓ MD 报告: /Users/kenny/projects/scriptflow/reports/deepseek_e2e_report.md

【清理】
[Cleanup] Project proj_e2e_1704038400000 deleted

================================================================================
测试完成
================================================================================
总体状态: PASS
总耗时: 45.23s
成功集数: 3/3
警告数: 0
报告路径: /Users/kenny/projects/scriptflow/reports
================================================================================
```

## 示例报告

### Markdown 报告片段

参见 `reports/deepseek_e2e_report.example.md`

### JSON 报告结构

```json
{
  "testId": "test_1704038400000",
  "timestamp": "2024-01-02T08:00:00.000Z",
  "projectId": "proj_e2e_1704038400000",
  "model": "deepseek-chat",
  "overallStatus": "PASS",
  "duration": {
    "total": 45230,
    "seed": 5234,
    "bible": 12456,
    "outline": 8234,
    "episodes": [3567, 8123, 7616]
  },
  "episodeResults": [
    {
      "episodeIndex": 1,
      "status": "DRAFT",
      "contentLength": 450,
      "qualityPassed": true,
      "alignerPassed": true,
      "metrics": {
        "writerTime": 3200,
        "saveTime": 100,
        "totalTime": 3567
      },
      "warnings": []
    }
  ],
  "batchConsistency": {
    "passed": true,
    "issues": [],
    "details": {
      "totalEpisodes": 3,
      "completedCount": 0,
      "completedIndexes": [],
      "inconsistentIndexes": []
    }
  },
  "summary": {
    "totalEpisodes": 3,
    "successfulEpisodes": 3,
    "failedEpisodes": 0,
    "warnings": []
  },
  "recommendations": [
    "最慢阶段: Bible (12.46s)，建议优化该阶段的 Prompt 或减少数据量",
    "平均单集耗时: 6.44s"
  ]
}
```

## 集成到 CI/CD

### GitHub Actions 示例

```yaml
name: E2E Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run E2E test
        env:
          DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
        run: npm run test:deepseek:e2e
      
      - name: Upload reports
        uses: actions/upload-artifact@v3
        with:
          name: test-reports
          path: reports/
```

## 已知限制

1. **API 配额消耗**：每次测试真实消耗 DeepSeek API 配额
2. **耗时波动**：API 响应时间受网络和服务器负载影响
3. **仅测试前 3 集**：为节省成本，不测试完整剧集
4. **依赖外部服务**：测试依赖 DeepSeek API 可用性

## 扩展建议

### 短期（1-2 周）
1. 增加更多监控指标（内存使用、token 消耗）
2. 支持并行测试多个场景
3. 添加测试结果历史对比

### 中期（1-2 月）
1. 集成到监控系统（Grafana、Prometheus）
2. 实现自动告警机制
3. 增加更多测试场景（不同题材、不同集数）

### 长期（3-6 月）
1. 性能回归测试自动化
2. A/B 测试支持（对比不同 Prompt 版本）
3. 压力测试（并发生成）

## 验收确认

### ✅ 必须实现的功能

- [x] 真实调用 DeepSeek：complete createProjectSeed → buildBible → generateOutline(EP1-EP3) → generateOneEpisode(EP1-EP3)
- [x] 采集每一步耗时：seed/bible/outline_item/episode_writer/quality/aligner/save/total
- [x] 输出两份报告：reports/deepseek_e2e_report.json（机器可读）、reports/deepseek_e2e_report.md（人类可读摘要）
- [x] 验收指标包含"生成时间"并自动判定 PASS/FAIL

### ✅ 验收指标

- [x] A. 成功率：EP1-EP3 生成成功，EP1 强依赖
- [x] B. 内容质量：最小可交付标准
- [x] C. 状态一致性（P0）：batch.completed 验证
- [x] D. 生成耗时指标：阈值判定

### ✅ 实现方式

- [x] 1) 轻量的计时工具：lib/observability/timer.ts
- [x] 2) 在 episodeFlow / taskRunner 的关键点打点：最小埋点
- [x] 3) 真实 E2E 测试脚本：scripts/test_deepseek_e2e.ts
- [x] 4) npm script：test:deepseek:e2e
- [x] 5) 报告格式：包含所有必需内容

### ✅ 强约束

- [x] 必须真实调用 DeepSeek（不得 stub / mock）
- [x] 不得大改业务逻辑，不得重构核心流程
- [x] 埋点与测试必须可开关（默认不影响正常运行）
- [x] 代码必须通过 lint/tsc

### ✅ 交付物

- [x] 新增/修改的文件列表
- [x] 如何运行：export DEEPSEEK_API_KEY=... && npm run test:deepseek:e2e
- [x] 一段示例输出（MD 报告片段）

## 总结

本次实施成功交付了一个完整的 E2E 测试系统，满足了所有验收指标和强约束。系统具有以下特点：

1. **完整性**：覆盖了从 Seed 到 Episodes 的完整流程
2. **准确性**：真实 API 调用，无 mock
3. **可观测性**：详细的性能指标和质量指标
4. **易用性**：简单的命令行界面，清晰的报告
5. **可扩展性**：模块化设计，易于添加新功能

系统已经可以用于日常的质量保证和性能监控，为项目的持续改进提供了数据支持。

