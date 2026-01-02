# M9 - 用户体验 SLA 与 Metrics 修复实施总结

## 任务概述

本次实施一次性完成了两项核心任务：

**【A】E2E 新增"用户体验 SLA"验收（第一优先级）**
1. 在 E2E 报告中新增 userExperienceSLA 字段
2. 新增 SLA 判定规则
3. Seed/Bible/Outline 仅记录 p50/p95，不参与 FAIL

**【B】修复 metrics span，使 writerTime / saveTime 不再为 0**
1. 确保真实路径被 span 包裹
2. 输出明确指标（单位 ms）
3. 保证 span key 与 metrics key 完全一致

## 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `scripts/test_deepseek_e2e.ts` | 新增 SLA 判定逻辑、报告输出 |
| `lib/ai/modelClients/deepseekClient.ts` | 为 LLM 调用添加 `llm_call` span |
| `lib/ai/episodeFlow.ts` | 为 JSON 解析、验证添加 span |
| `lib/store/episodeRepo.ts` | 为 save 操作添加 `save_episode` span |
| `lib/batch/batchRepo.ts` | 为 save 操作添加 `save_batch` span |

## 关键技术点

### 1. SLA 判定规则

```typescript
// EP1 Phase1 firstReadableMs > 60s → FAIL
if (ep1SLA.status === 'FAIL') {
  slaStatus = 'FAIL';
}

// EP2/EP3 readableMs > 120s → WARN（FULL 模式下可 FAIL）
else if (ep2SLA.status === 'FAIL' || ep3SLA?.status === 'FAIL') {
  slaStatus = 'FAIL';
}
```

### 2. Metrics Span 架构

```
generateEpisodeFast_ep1 (整体)
├── llm_call          ← DeepSeek API 调用
├── json_parse        ← JSON 解析
├── validate          ← 质量检查
└── save_episode      ← EpisodeRepo.save
```

### 3. Span Key 命名规范

| 操作 | Span Name | Metrics Key |
|------|-----------|-------------|
| LLM 调用 | `llm_call` | `llm_ms` |
| JSON 解析 | `json_parse` | `parse_ms` |
| 质量验证 | `validate` | `validate_ms` |
| 对齐检查 | `aligner` | `align_ms` |
| 保存剧集 | `save_episode` | `save_ms` |
| 保存批次 | `save_batch` | - |

## 输出示例

### JSON 报告关键字段

```json
{
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
      "metrics": {
        "llm_ms": 42000,
        "parse_ms": 500,
        "validate_ms": 2000,
        "align_ms": 0,
        "save_ms": 15,
        "totalTime": 45000
      }
    }
  ]
}
```

### Markdown 报告新增章节

```markdown
## 用户体验 SLA

- **SLA 状态**: **PASS**
- **EP1 Phase1 firstReadable**: 45.00s (PASS (45.00s))
- **EP2 readable**: 52.00s (PASS (52.00s))
- **EP3 readable**: 55.00s (PASS (55.00s))
```

## 约束验证

✅ **不改变任何生成 prompt / agent 行为**
   - 仅添加了可观测性埋点（span）
   - 所有业务逻辑保持不变

✅ **不降低内容质量**
   - metricsOptions 参数完全可选
   - 不影响正常使用流程

✅ **不引入新依赖**
   - 使用现有的 `Timer` 工具类
   - 新增 `MetricsOptions` 类型定义

✅ **保持 PHASE1_ONLY / FULL_PIPELINE 行为一致**
   - `metricsOptions` 为可选参数
   - 不传递时行为与原版完全一致

## 测试建议

1. **运行 E2E 测试**
   ```bash
   DEEPSEEK_API_KEY=xxx DEEPSEEK_MODEL=deepseek-chat npm run test:e2e
   ```

2. **验证 SLA 判定**
   - 检查 JSON 报告中 `userExperienceSLA` 字段
   - 验证 EP1 > 60s 时判定为 FAIL
   - 验证 EP2/3 > 120s 时判定为 WARN

3. **验证 Metrics 输出**
   - 检查每集的 `metrics.llm_ms` > 0
   - 检查 `metrics.save_ms` > 0
   - 验证所有 span key 与 metrics key 一致

4. **验证报告输出**
   - 检查 Markdown 报告中包含"用户体验 SLA"章节
   - 验证状态显示正确（PASS/WARN/FAIL）

## 后续优化建议

1. **性能分析**
   - 基于 `llm_ms` 数据优化 Prompt 长度
   - 基于 `parse_ms` 数据优化 JSON 清洗逻辑

2. **SLA 调整**
   - 根据实际数据调整阈值
   - 考虑增加 P95/P99 监控

3. **可观测性扩展**
   - 添加更多细粒度的 span（如 prompt 构建）
   - 支持分布式追踪（如需要）

## 实施日期

2026-01-02

## 实施者

AI Assistant (基于用户需求)

