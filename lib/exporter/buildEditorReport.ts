import { EpisodeAttemptLog } from '../../types';

export function buildEditorReport(projectId: string, project: any): string {
  // 读取 localStorage 中的 attempt logs
  const STORAGE_KEY_ATTEMPTS = (projectId: string) => `scriptflow_attempts_${projectId}`;
  let logs: EpisodeAttemptLog[] = [];
  
  try {
    const data = localStorage.getItem(STORAGE_KEY_ATTEMPTS(projectId));
    logs = data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Failed to load attempt logs:', e);
    logs = [];
  }

  // 统计严重性
  const passCount = logs.filter(log => log.alignerResult?.severity === 'PASS').length;
  const warnCount = logs.filter(log => log.alignerResult?.severity === 'WARN').length;
  const failCount = logs.filter(log => log.alignerResult?.severity === 'FAIL').length;

  // 收集所有 WARN 和 FAIL 的集数
  const warnings = logs.filter(log => log.alignerResult?.severity === 'WARN');
  const failures = logs.filter(log => log.alignerResult?.severity === 'FAIL');

  // 构建 WARN 汇总
  const warnSection = warnings.length > 0 ? warnings.map(log => {
    const issues = log.alignerResult?.issues?.map(issue =>
      `  - \`${issue.code}\`: ${issue.message}`
    ).join('\n') || '';

    return `- **EP${log.episodeIndex}** (Attempt ${log.attempt})
${issues}`;
  }).join('\n') : '- 无警告';

  // 构建 FAIL 汇总
  const failSection = failures.length > 0 ? failures.map(log => {
    const issues = log.alignerResult?.issues?.map(issue =>
      `  - \`${issue.code}\`: ${issue.message}`
    ).join('\n') || '';

    return `- **EP${log.episodeIndex}** (Attempt ${log.attempt})
${issues}`;
  }).join('\n') : '- 无失败';

  // 收集所有编辑建议
  const allNotes: string[] = [];
  logs.forEach(log => {
    if (log.alignerResult?.editorNotes) {
      log.alignerResult.editorNotes.forEach(note => {
        allNotes.push(`- EP${log.episodeIndex}: ${note}`);
      });
    }
  });

  const editorNotes = allNotes.length > 0 ? allNotes.join('\n') : '- 无编辑建议';

  const md = `# 编辑审稿报告

## 项目信息

- **项目名称**：${project.name}
- **总集数**：${project.totalEpisodes}
- **审稿时间**：${new Date().toLocaleString('zh-CN')}

## 总体情况

- **PASS 集数**：${passCount}
- **WARN 集数**：${warnCount}
- **FAIL 集数**：${failCount}
- **总审稿数**：${logs.length}

## WARN 汇总

${warnSection}

## FAIL 汇总

${failSection}

## 编辑建议

${editorNotes}

---

## 说明

本报告由 ScriptFlow 的 AI 编辑审稿系统生成。

- **PASS**：达到商业短剧最低可发行标准
- **WARN**：存在问题，但不影响继续生成
- **FAIL**：未达到最低可发行标准，需要重新生成

---

*本文档由 ScriptFlow 生成，用于展示编辑审稿结果。*
`;

  return md;
}

