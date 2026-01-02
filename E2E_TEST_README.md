# DeepSeek API E2E 测试系统

## 功能概述

这个 E2E 测试系统用于验证 ScriptFlow 项目与 DeepSeek API 的全链路集成，包括：

- **真实 API 调用**：完整执行 Seed → Bible → Outline → Episodes 流程
- **性能监控**：采集每个阶段的耗时数据
- **自动化验收**：根据预设阈值自动判定 PASS/WARN/FAIL
- **报告生成**：输出 JSON 和 Markdown 格式的详细报告

## 快速开始

### 1. 环境配置

```bash
# 设置 DeepSeek API Key（必需）
export DEEPSEEK_API_KEY=your_api_key_here

# 可选：指定模型（默认为 deepseek-chat）
export DEEPSEEK_MODEL=deepseek-chat
```

### 2. 运行测试

```bash
# 执行完整 E2E 测试
npm run test:deepseek:e2e
```

### 3. 查看报告

测试完成后，报告将生成在 `reports/` 目录：

- `reports/deepseek_e2e_report.json` - 机器可读的 JSON 报告
- `reports/deepseek_e2e_report.md` - 人类可读的 Markdown 报告

## 验收指标

### A. 成功率

- **EP1-EP3 生成**：每集必须产出可读 content（非空、非只有概述）
- **允许 DRAFT**：但必须有 content（>=200 字）且状态/进度不冲突
- **EP1 强依赖**：如果 EP1 产生 FAILED 或 PAUSED，整体 FAIL

### B. 内容质量

- **EP1 Phase1 快速版本**：content.length >= 200
- **最终版本（COMPLETED）**：content.length >= 600
- **竖版剧本格式**：至少出现 2 次"【场景】/【时间】/【人物】"格式之一
- **qualityCheck**：结果记录到报告中（passed/issue codes）

### C. 状态一致性（P0）

- `batch.completed` 只能包含 `status === COMPLETED` 的 episodeIndex
- 进度条计算（completed/total）不能领先于 COMPLETED 数量
- 如果检测到 completed 里出现 DRAFT/FAILED，直接 FAIL

### D. 生成耗时指标

| 阶段 | 阈值 | 说明 |
|------|------|------|
| EP1 Phase1 | ≤ 60s | 快速可读版本 |
| 单集（EP2/3） | ≤ 120s | 完整生成流程 |
| 全链路 | ≤ 600s（10分钟） | Seed + Bible + Outline + EP1-3 |

- **WARN**：超出 1x 阈值
- **FAIL**：超出 2x 阈值

## 报告结构

### Markdown 报告示例

```markdown
# DeepSeek API E2E 测试报告

## 基本信息

- **测试ID**: test_1704038400000
- **测试时间**: 2024-01-02T08:00:00.000Z
- **项目ID**: proj_e2e_1704038400000
- **模型**: deepseek-chat
- **总体状态**: **PASS**

## 摘要

- **总集数**: 3
- **成功集数**: 3
- **失败集数**: 0
- **警告数**: 0
- **总耗时**: 45.23s

## 耗时指标

| 阶段 | 耗时 (ms) | 耗时 (s) | 阈值 (s) | 状态 |
|------|----------|----------|----------|------|
| Seed | 5000 | 5.00 | 60.00 | ✅ PASS |
| Bible | 12000 | 12.00 | 60.00 | ✅ PASS |
| Outline | 8000 | 8.00 | 60.00 | ✅ PASS |
| EP1 | 3500 | 3.50 | 60.00 | ✅ PASS |
| EP2 | 8000 | 8.00 | 120.00 | ✅ PASS |
| EP3 | 8730 | 8.73 | 120.00 | ✅ PASS |
| 总计 | 45230 | 45.23 | 600.00 | ✅ PASS |

## 剧集详情

| 集数 | 状态 | 字数 | 质量检查 | Aligner | 耗时 (ms) |
|------|------|------|----------|---------|-----------|
| EP1 | ✅ COMPLETED | 850 | ✅ | ✅ | 3500 |
| EP2 | ✅ DRAFT | 720 | ✅ | ✅ | 8000 |
| EP3 | ✅ DRAFT | 780 | ✅ | ✅ | 8730 |

## 建议

- 最慢阶段: Bible (12.00s)，建议优化该阶段的 Prompt 或减少数据量
- 平均单集耗时: 6.74s
```

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
    "seed": 5000,
    "bible": 12000,
    "outline": 8000,
    "episodes": [3500, 8000, 8730]
  },
  "episodeResults": [...],
  "batchConsistency": {...},
  "summary": {...},
  "recommendations": [...]
}
```

## 自定义配置

可以在 `scripts/test_deepseek_e2e.ts` 中修改配置：

```typescript
const CONFIG = {
  // 测试配置
  TEST_USER_PROMPT: '一个现代都市剧，主角是白手起家的CEO',
  TOTAL_EPISODES: 3,  // 只测试 EP1-EP3
  
  // 耗时阈值（毫秒）
  THRESHOLDS: {
    EP1_PHASE1_MAX_MS: 60000,        // EP1 Phase1 必须在 60 秒内
    SINGLE_EPISODE_MAX_MS: 120000,   // 单集（EP2/3）在 120 秒内
    TOTAL_PIPELINE_MAX_MS: 600000,   // 全链路在 10 分钟内
    
    // 警告阈值（1x）
    WARN_MULTIPLIER: 1.0,
    // 失败阈值（2x）
    FAIL_MULTIPLIER: 2.0,
  },
  
  // 质量阈值
  QUALITY: {
    MIN_CONTENT_LENGTH_DRAFT: 200,    // DRAFT 最小字数
    MIN_CONTENT_LENGTH_COMPLETED: 600,  // COMPLETED 最小字数
    MIN_SCENE_COUNT: 2,               // 竖版剧本格式最少场景标记数
  },
};
```

## 故障排查

### 错误：DEEPSEEK_API_KEY 环境变量未设置

```bash
# 确保设置了环境变量
export DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 错误：API 调用失败

1. 检查 API Key 是否有效
2. 检查网络连接
3. 检查 DeepSeek 服务状态

### 错误：EP1 生成失败

EP1 是强依赖，如果失败会导致整体测试失败。检查：

1. DeepSeek API 是否正常工作
2. Seed 和 Bible 是否成功生成
3. Outline 是否包含 EP1

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

## 技术实现

### 核心组件

1. **lib/observability/timer.ts** - 轻量级计时工具
   - `createTimer()` - 创建计时器实例
   - `timer.startSpan()` - 开始计时
   - `span.end()` - 结束计时
   - `timer.getAllSpans()` - 获取所有 span

2. **lib/ai/episodeFlow.ts** - 埋点集成
   - 支持 `MetricsOptions` 参数
   - 在关键点添加计时埋点
   - 不影响正常运行

3. **scripts/test_deepseek_e2e.ts** - 测试脚本
   - 完整流程编排
   - 数据一致性校验
   - 报告生成

### 埋点覆盖范围

| 阶段 | 埋点位置 |
|------|----------|
| Seed | `createProjectSeed()` |
| Bible | `buildBible()` |
| Outline | `generateOutline()` + 每个 outline item |
| Episodes | `generateEpisodeFast()` - writer 调用, 保存操作 |

## 注意事项

1. **真实 API 调用**：测试会真实消耗 DeepSeek API 配额
2. **耗时波动**：API 响应时间可能因网络和服务器负载波动
3. **清理机制**：测试完成后会自动清理临时项目
4. **报告保留**：测试报告会保留在 `reports/` 目录（已加入 .gitignore）

## 扩展建议

1. **增加更多指标**：如内存使用、token 消耗等
2. **并行测试**：测试多个不同的 prompt 场景
3. **历史对比**：保存历史报告，对比性能趋势
4. **告警机制**：集成到监控系统，自动触发告警

