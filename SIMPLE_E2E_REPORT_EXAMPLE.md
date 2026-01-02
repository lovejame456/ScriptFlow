# E2E 测试修改交付报告

## 修改文件列表

### 【A】E2E 新增"用户体验 SLA"验收

1. **scripts/test_deepseek_e2e.ts**
   - 新增 `userExperienceSLA` 字段到 `TestReport` 接口
   - 新增 `firstReadableMs` 字段到 `EpisodeTestResult` 接口
   - 新增 `llm_ms`, `parse_ms`, `validate_ms`, `align_ms`, `save_ms` 字段到 metrics
   - 新增 SLA 判定逻辑（EP1 Phase1 > 60s = FAIL, EP2/3 > 120s = WARN）
   - 新增 `determineOverallStatus` 函数参数 `slaStatus`
   - 新增 Markdown 报告中的 SLA 章节输出

### 【B】修复 metrics span，使 writerTime / saveTime 不再为 0

1. **lib/ai/modelClients/deepseekClient.ts**
   - 新增 `MetricsOptions` 类型定义
   - 修改 `chat` 方法签名，增加可选的 `metricsOptions` 参数
   - 在 `chat` 方法中为 LLM 调用添加 `llm_call` span

2. **lib/ai/episodeFlow.ts**
   - 修改 `createProjectSeed` 函数，传递 `metricsOptions` 到 `deepseekClient.chat`
   - 修改 `generateEpisodeFast` 函数：
     - 为 LLM 调用传递 `{ collectMetrics, timer }` 参数
     - 为 JSON 解析添加 `json_parse` span
     - 为验证步骤添加 `validate` span
     - 移除旧的 `ep_writer_ep${episodeIndex}` 和 `save_ep${episodeIndex}` span 命名
     - 修改 metrics 返回逻辑，使用 `getAllSpans()` 获取所有 spans
   - 更新 `EpisodeMetrics` 接口定义

3. **lib/store/episodeRepo.ts**
   - 新增 `MetricsOptions` 类型定义
   - 修改 `save` 方法签名，增加可选的 `metricsOptions` 参数
   - 在 `save` 方法中添加 `save_episode` span

4. **lib/batch/batchRepo.ts**
   - 新增 `MetricsOptions` 类型定义
   - 修改 `save` 方法签名，增加可选的 `metricsOptions` 参数
   - 在 `save` 方法中添加 `save_batch` span

## 关键修改点说明

### 1. 用户体验 SLA 判定逻辑

```typescript
// EP1 Phase1 firstReadableMs > 60s → FAIL
const ep1SLA = evaluateTiming(
  ep1_phase1_firstReadableMs,
  CONFIG.THRESHOLDS.EP1_PHASE1_MAX_MS,  // 60000ms
  'EP1 Phase1 firstReadable'
);

// EP2/EP3 readableMs > 120s → WARN (FULL 模式下可 FAIL)
const ep2SLA = evaluateTiming(
  ep2_readableMs,
  CONFIG.THRESHOLDS.SINGLE_EPISODE_MAX_MS,  // 120000ms
  'EP2 readable'
);
```

### 2. LLM 调用 span 包裹

```typescript
// deepseekClient.ts
async chat(messages, opts, metricsOptions) {
  const span = metricsOptions?.timer?.startSpan('llm_call');
  try {
    const res = await fetch(url, ...);
    span?.end();
    return json.choices?.[0]?.message?.content ?? "";
  } catch (e) {
    span?.end();
    throw e;
  }
}
```

### 3. JSON 解析 span 包裹

```typescript
// episodeFlow.ts
const parseSpan = timer?.startSpan('json_parse');
if (raw && raw.trim().length > 0) {
  try {
    const cleaned = cleanJsonResponse(raw);
    const json = JSON.parse(cleaned);
    episodeObject = json;
  } catch (e) {
    console.warn(`JSON parse failed:`, e);
    parseError = e instanceof Error ? e : new Error(String(e));
  }
}
parseSpan?.end();
```

### 4. 验证步骤 span 包裹

```typescript
// episodeFlow.ts
const validateSpan = timer?.startSpan('validate');
const scaffoldResult = validateEpisode1Scaffold(episodeObject);
const qualityResult = qualityCheck(episodeObject, outline);
validateSpan?.end();
```

### 5. Save 操作 span 包裹

```typescript
// episodeRepo.ts
async save(projectId, episodeIndex, data, metricsOptions) {
  const span = metricsOptions?.timer?.startSpan('save_episode');
  // ... save logic ...
  span?.end();
}
```

## 示例 E2E 输出（包含 SLA + metrics）

```json
{
  "testId": "test_1735804800000",
  "timestamp": "2026-01-02T10:00:00.000Z",
  "projectId": "proj_abc123",
  "model": "deepseek-chat",
  "overallStatus": "PASS",
  "duration": {
    "total": 245000,
    "seed": 15000,
    "bible": 18000,
    "outline": 22000,
    "episodes": [45000, 52000, 55000]
  },
  "userExperienceSLA": {
    "ep1_phase1_firstReadableMs": 45000,
    "ep2_readableMs": 52000,
    "ep3_readableMs": 55000,
    "slaStatus": "PASS",
    "slaDetails": {
      "ep1_status": "PASS (45.00s)",
      "ep2_status": "PASS (52.00s)",
      "ep3_status": "PASS (55.00s)"
    }
  },
  "episodeResults": [
    {
      "episodeIndex": 1,
      "status": "DRAFT",
      "contentLength": 800,
      "qualityPassed": true,
      "alignerPassed": true,
      "firstReadableMs": 45000,
      "metrics": {
        "writerTime": 45000,
        "saveTime": 15,
        "totalTime": 45000,
        "llm_ms": 42000,
        "parse_ms": 500,
        "validate_ms": 2000,
        "align_ms": 0,
        "save_ms": 15
      },
      "warnings": []
    },
    {
      "episodeIndex": 2,
      "status": "DRAFT",
      "contentLength": 750,
      "qualityPassed": true,
      "alignerPassed": true,
      "firstReadableMs": 52000,
      "metrics": {
        "writerTime": 52000,
        "saveTime": 12,
        "totalTime": 52000,
        "llm_ms": 48000,
        "parse_ms": 450,
        "validate_ms": 2800,
        "align_ms": 0,
        "save_ms": 12
      },
      "warnings": []
    },
    {
      "episodeIndex": 3,
      "status": "DRAFT",
      "contentLength": 780,
      "qualityPassed": true,
      "alignerPassed": true,
      "firstReadableMs": 55000,
      "metrics": {
        "writerTime": 55000,
        "saveTime": 18,
        "totalTime": 55000,
        "llm_ms": 51000,
        "parse_ms": 480,
        "validate_ms": 3000,
        "align_ms": 0,
        "save_ms": 18
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
  "thresholds": {
    "EP1_PHASE1_MAX_MS": 60000,
    "SINGLE_EPISODE_MAX_MS": 120000,
    "TOTAL_PIPELINE_MAX_MS": 600000,
    "WARN_MULTIPLIER": 1.0,
    "FAIL_MULTIPLIER": 2.0
  },
  "summary": {
    "totalEpisodes": 3,
    "successfulEpisodes": 3,
    "failedEpisodes": 0,
    "warnings": [],
    "testMode": "PHASE1_ONLY",
    "definition": "Phase1 快速可读性验收（DRAFT 合法）"
  },
  "recommendations": [
    "平均单集耗时: 50.67s",
    "最慢阶段: Outline (22.00s)，建议优化该阶段的 Prompt 或减少数据量"
  ]
}
```

## Markdown 报告示例

```markdown
# DeepSeek API E2E 测试报告

## 基本信息

- **测试ID**: test_1735804800000
- **测试时间**: 2026-01-02T10:00:00.000Z
- **项目ID**: proj_abc123
- **模型**: deepseek-chat
- **总体状态**: **PASS**

## 摘要

- **测试模式**: PHASE1_ONLY
- **测试说明**: Phase1 快速可读性验收（DRAFT 合法）
- **总集数**: 3
- **成功集数**: 3
- **失败集数**: 0
- **警告数**: 0
- **总耗时**: 245.00s

## 用户体验 SLA

- **SLA 状态**: **PASS**
- **EP1 Phase1 firstReadable**: 45.00s (PASS (45.00s))
- **EP2 readable**: 52.00s (PASS (52.00s))
- **EP3 readable**: 55.00s (PASS (55.00s))

## 耗时指标

| 阶段 | 耗时 (ms) | 耗时 (s) | 阈值 (s) | 状态 |
|------|----------|----------|----------|------|
| Seed | 15000 | 15.00 | 60.00 | ✅ PASS |
| Bible | 18000 | 18.00 | 60.00 | ✅ PASS |
| Outline | 22000 | 22.00 | 60.00 | ✅ PASS |
| EP1 | 45000 | 45.00 | 60.00 | ✅ PASS |
| EP2 | 52000 | 52.00 | 120.00 | ✅ PASS |
| EP3 | 55000 | 55.00 | 120.00 | ✅ PASS |
| 总计 | 245000 | 245.00 | 600.00 | ✅ PASS |

## 剧集详情

| 集数 | 状态 | 字数 | 质量检查 | Aligner | 耗时 (ms) |
|------|------|------|----------|---------|-----------|
| EP1 | ⏳ DRAFT ✅ (可读) | 800 | ✅ | ✅ | 45000 |
| EP2 | ⏳ DRAFT ✅ (可读) | 750 | ✅ | ✅ | 52000 |
| EP3 | ⏳ DRAFT ✅ (可读) | 780 | ✅ | ✅ | 55000 |

## 状态一致性

- **一致性检查**: ✅ PASS (Phase1 模式下跳过 batch.completed 检查)
- **已完成集数**: 0 (未纳入验收)
- **已完成索引**: 无

## 建议

- 平均单集耗时: 50.67s
- 最慢阶段: Outline (22.00s)，建议优化该阶段的 Prompt 或减少数据量
```

## 约束检查

✅ **不改变任何生成 prompt / agent 行为** - 仅添加了可观测性埋点
✅ **不降低内容质量** - 修改仅涉及监控，不改变生成逻辑
✅ **不引入新依赖** - 仅使用现有的 Timer 工具
✅ **保持 PHASE1_ONLY / FULL_PIPELINE 行为一致** - 新增的 metricsOptions 参数完全可选

