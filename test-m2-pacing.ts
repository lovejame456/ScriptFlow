import { getPacingContext } from './lib/pacing/pacingEngine.ts';
import { Project } from './types.ts';

function createMockProject(templateId: string): Project {
  return {
    id: 'test-project',
    name: 'Test Project',
    genre: '都市异能',
    logline: 'Test logline',
    audience: 'General',
    totalEpisodes: 120,
    pacingTemplateId: templateId,
    bible: {
      canonRules: {
        worldSetting: 'Test world',
        coreRules: [],
        powerOrWealthSystem: 'Test system',
        forbiddenChanges: []
      },
      keyEvents: []
    },
    characters: [],
    episodes: [],
    storyMemory: {
      canonLayer: {
        worldRules: [],
        lockedEvents: [],
        deadCharacters: []
      },
      characterLayer: {
        states: {}
      },
      plotLayer: {
        lockedEvents: [],
        ongoingConflicts: [],
        foreshadowedEvents: []
      }
    },
    costStats: {
      estimatedTotalCost: 0,
      actualCost: 0
    },
    stability: 100,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function printPacingContext(templateId: string) {
  console.log('\n' + '='.repeat(80));
  console.log(`模板: ${templateId}`);
  console.log('='.repeat(80));

  const project = createMockProject(templateId);

  for (let i = 1; i <= 20; i++) {
    const pacingContext = getPacingContext(project, i);
    console.log(`EP${i.toString().padStart(2, '0')} | Act${pacingContext.actNumber} | ${pacingContext.actGoal.padEnd(20)} | ${pacingContext.kpi.progressType.padEnd(18)} | Hook: ${pacingContext.kpi.minHookStrength}`);
  }
}

console.log('M3-2 Pacing Engine 测试 - Act 分配与 PacingContext 正确性检查');
console.log('检查点：Act 的 range 是否符合模板定义，progressType 是否正确');

// 测试所有模板
printPacingContext('romance_ceo');
printPacingContext('revenge_rebirth');
printPacingContext('cultivation_fantasy');
printPacingContext('urban_concept');

console.log('\n' + '='.repeat(80));
console.log('测试完成！请人工核对以下内容：');
console.log('1. Act 的 range 是否符合模板定义');
console.log('2. progressType 是否符合预期规则');
console.log('='.repeat(80) + '\n');

