import { Project, RoleType } from '../../types';

export function buildBible(project: Project): string {
  // 世界观部分
  const worldSetting = project.bible.canonRules.worldSetting || '暂无设定';
  const coreRules = project.bible.canonRules.coreRules.length > 0
    ? project.bible.canonRules.coreRules.map(rule => `- ${rule}`).join('\n')
    : '- 暂无核心规则';
  const powerSystem = project.bible.canonRules.powerOrWealthSystem || '暂无设定';

  // 角色分组
  const protagonists = project.characters.filter(c => c.roleType === 'PROTAGONIST');
  const antagonists = project.characters.filter(c => c.roleType === 'ANTAGONIST');
  const supports = project.characters.filter(c => c.roleType === 'SUPPORT');

  const buildCharacterSection = (title: string, chars: any[]) => {
    if (chars.length === 0) return `## ${title}\n\n暂无角色\n`;

    const characterList = chars.map(char => `
### ${char.name}

- **性别**：${char.gender || '未知'}
- **年龄**：${char.ageRange || '未知'}
- **社会身份**：${char.socialIdentity || '未知'}
- **定位**：${char.roleType === 'PROTAGONIST' ? '主角' : char.roleType === 'ANTAGONIST' ? '反派' : '配角'}
- **性格**：${char.personality || '未知'}
- **核心动机**：${char.motivation || '未知'}
- **核心欲望**：${char.coreDesire || '未知'}
- **核心弱点**：${char.coreWeakness || '未知'}
- **与主角关系**：${char.relationshipToProtagonist || '未知'}
- **剧情功能**：${char.plotFunction || '未知'}
- **人物描述**：${char.description || '未知'}
`).join('\n');

    return `## ${title}\n\n${characterList}`;
  };

  const md = `# 世界观设定

## 世界背景

${worldSetting}

## 核心规则

${coreRules}

## 力量 / 财富体系

${powerSystem}

---

# 角色表

${buildCharacterSection('主角', protagonists)}

${buildCharacterSection('反派', antagonists)}

${buildCharacterSection('配角', supports)}

---

*本文档由 ScriptFlow 生成，包含世界观与角色设定。*
`;

  return md;
}



