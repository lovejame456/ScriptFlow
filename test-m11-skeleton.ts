/**
 * M11: Skeleton 质量增强测试
 * 验证 Bible 和 Outline Skeleton 的结构稳定性和语义约束
 */

import { buildBibleSkeleton, buildOutlineSkeleton, createProjectSeed } from './lib/ai/episodeFlow';
import { BibleSkeleton, OutlineSkeleton } from './types';

interface TestResult {
  name: string;
  passed: boolean;
  errors: string[];
  warnings: string[];
  data?: any;
}

async function testBibleSkeletonStructure(): Promise<TestResult> {
  console.log('\n=== 测试 Bible Skeleton 结构 ===');

  const result: TestResult = {
    name: 'BibleSkeleton 结构验证',
    passed: false,
    errors: [],
    warnings: []
  };

  try {
    // 创建测试项目
    const seed = await createProjectSeed(
      '一个现代修仙故事，主角从废柴到逆袭',
      '仙侠'
    );

    const project = {
      id: 'test-m11',
      name: seed.title || '测试项目',
      genre: seed.genre || '仙侠',
      seed: seed,
      totalEpisodes: 80,
      episodes: []
    };

    // 生成 Bible Skeleton
    const skeleton = await buildBibleSkeleton(project);
    result.data = skeleton;

    console.log('\n生成结果:');
    console.log('Logline:', skeleton.logline);
    console.log('角色数量:', skeleton.characterPoolLite.length);
    console.log('冲突层级:', skeleton.coreConflicts.map(c => c.level));
    console.log('禁止事项:', skeleton.forbidden);

    // 验证 logline 因果句式
    if (!skeleton.logline.includes('因为') || !skeleton.logline.includes('被迫') || !skeleton.logline.includes('从而')) {
      result.errors.push('logline 不包含完整的因果句式关键词（因为、被迫、从而）');
    } else {
      console.log('✓ Logline 因果句式验证通过');
    }

    // 验证 characterPoolLite.role 枚举值
    const validRoles = ['PROTAGONIST', 'ANTAGONIST', 'SUPPORT', 'PRESSURE'];
    for (const char of skeleton.characterPoolLite) {
      if (!validRoles.includes(char.role)) {
        result.errors.push(`角色 ${char.name} 的 role 值无效: ${char.role}`);
      }
      // 验证 goal ≠ flaw
      if (char.goal === char.flaw) {
        result.errors.push(`角色 ${char.name} 的 goal 和 flaw 语义重复`);
      }
      // 验证 relationship 指向另一角色
      if (!char.relationship.includes('与') || !char.relationship.includes('角色')) {
        result.warnings.push(`角色 ${char.name} 的 relationship 可能未明确指向另一角色: ${char.relationship}`);
      }
    }
    if (result.errors.filter(e => e.includes('role')).length === 0) {
      console.log('✓ characterPoolLite.role 枚举验证通过');
    }

    // 验证 coreConflicts 三层结构
    if (skeleton.coreConflicts.length !== 3) {
      result.errors.push(`coreConflicts 数量应为 3，实际为 ${skeleton.coreConflicts.length}`);
    } else {
      const expectedLevels = ['IMMEDIATE', 'MID_TERM', 'END_GAME'];
      for (let i = 0; i < 3; i++) {
        if (skeleton.coreConflicts[i].level !== expectedLevels[i]) {
          result.errors.push(`coreConflicts[${i}] level 顺序错误，应为 ${expectedLevels[i]}，实际为 ${skeleton.coreConflicts[i].level}`);
        }
      }
      if (result.errors.filter(e => e.includes('coreConflicts')).length === 0) {
        console.log('✓ coreConflicts 三层结构验证通过');
      }
    }

    // 验证 forbidden 硬约束
    for (let i = 0; i < skeleton.forbidden.length; i++) {
      if (!skeleton.forbidden[i].startsWith('禁止')) {
        result.errors.push(`forbidden[${i}] 必须以"禁止"开头: ${skeleton.forbidden[i]}`);
      }
    }
    if (result.errors.filter(e => e.includes('forbidden')).length === 0) {
      console.log('✓ forbidden 硬约束验证通过');
    }

    result.passed = result.errors.length === 0;

  } catch (error: any) {
    result.errors.push(`测试失败: ${error.message}`);
    console.error('错误:', error);
  }

  return result;
}

async function testOutlineSkeletonStructure(): Promise<TestResult> {
  console.log('\n=== 测试 Outline Skeleton 结构 ===');

  const result: TestResult = {
    name: 'OutlineSkeleton 结构验证',
    passed: false,
    errors: [],
    warnings: []
  };

  try {
    // 创建测试项目
    const seed = await createProjectSeed(
      '一个现代修仙故事，主角从废柴到逆袭',
      '仙侠'
    );

    const project = {
      id: 'test-m11',
      name: seed.title || '测试项目',
      genre: seed.genre || '仙侠',
      seed: seed,
      totalEpisodes: 80,
      episodes: []
    };

    // 生成 Outline Skeleton
    const skeleton = await buildOutlineSkeleton(project);
    result.data = skeleton;

    console.log('\n生成结果:');
    console.log('幕数:', skeleton.acts.length);
    skeleton.acts.forEach((act, idx) => {
      console.log(`第${idx + 1}幕 beats 数量:`, act.beats.length);
      console.log(`  示例:`, act.beats[0]);
    });

    // 验证每幕的 beats 是否包含"导致"或"从而"
    let beatsWithoutChange = 0;
    for (const act of skeleton.acts) {
      for (const beat of act.beats) {
        if (!beat.includes('导致') && !beat.includes('从而')) {
          beatsWithoutChange++;
          result.errors.push(`beat 缺少"导致"或"从而"关键词: ${beat}`);
        }
      }
    }
    if (beatsWithoutChange === 0) {
      console.log('✓ 所有 beat 都包含局势变化关键词');
    }

    result.passed = result.errors.length === 0;

  } catch (error: any) {
    result.errors.push(`测试失败: ${error.message}`);
    console.error('错误:', error);
  }

  return result;
}

async function testStability(): Promise<TestResult> {
  console.log('\n=== 测试 Skeleton 结构稳定性 ===');

  const result: TestResult = {
    name: 'Skeleton 结构稳定性（3次运行）',
    passed: false,
    errors: [],
    warnings: []
  };

  try {
    // 创建测试项目
    const seed = await createProjectSeed(
      '一个现代修仙故事，主角从废柴到逆袭',
      '仙侠'
    );

    const project = {
      id: 'test-m11',
      name: seed.title || '测试项目',
      genre: seed.genre || '仙侠',
      seed: seed,
      totalEpisodes: 80,
      episodes: []
    };

    const skeletons: BibleSkeleton[] = [];
    const characterCounts: number[] = [];

    // 运行 3 次
    for (let i = 1; i <= 3; i++) {
      console.log(`\n第 ${i} 次生成...`);
      const skeleton = await buildBibleSkeleton(project);
      skeletons.push(skeleton);
      characterCounts.push(skeleton.characterPoolLite.length);

      // 每次都验证结构
      if (skeleton.coreConflicts.length !== 3) {
        result.errors.push(`第 ${i} 次: coreConflicts 数量不为 3`);
      }
    }

    // 检查角色数波动
    const maxCount = Math.max(...characterCounts);
    const minCount = Math.min(...characterCounts);
    const fluctuation = maxCount - minCount;

    if (fluctuation <= 1) {
      console.log(`\n✓ 角色数波动 ${fluctuation} (<=1)，稳定性良好`);
    } else {
      result.warnings.push(`角色数波动 ${fluctuation} (>1)，可能需要优化`);
    }

    // 检查 coreConflicts 结构一致性
    const levelSets = skeletons.map(s => s.coreConflicts.map(c => c.level).join(','));
    const levelsConsistent = levelSets.every(ls => ls === levelSets[0]);

    if (levelsConsistent) {
      console.log(`✓ coreConflicts 层级结构一致: ${levelSets[0]}`);
    } else {
      result.errors.push(`coreConflicts 层级结构不一致: ${levelSets.join('; ')}`);
    }

    result.passed = result.errors.length === 0;

  } catch (error: any) {
    result.errors.push(`测试失败: ${error.message}`);
    console.error('错误:', error);
  }

  return result;
}

async function runAllTests() {
  console.log('========================================');
  console.log('M11: Skeleton 质量增强测试');
  console.log('========================================');

  const results: TestResult[] = [];

  // 1. 测试 Bible Skeleton 结构
  results.push(await testBibleSkeletonStructure());

  // 2. 测试 Outline Skeleton 结构
  results.push(await testOutlineSkeletonStructure());

  // 3. 测试结构稳定性
  results.push(await testStability());

  // 输出总结
  console.log('\n========================================');
  console.log('测试总结');
  console.log('========================================\n');

  let totalPassed = 0;
  let totalFailed = 0;

  results.forEach(result => {
    const icon = result.passed ? '✓' : '✗';
    console.log(`${icon} ${result.name}`);
    if (result.errors.length > 0) {
      console.log('  错误:');
      result.errors.forEach(err => console.log(`    - ${err}`));
    }
    if (result.warnings.length > 0) {
      console.log('  警告:');
      result.warnings.forEach(warn => console.log(`    - ${warn}`));
    }
    if (result.passed) {
      totalPassed++;
    } else {
      totalFailed++;
    }
  });

  console.log('\n========================================');
  console.log(`总计: ${results.length} 个测试, ${totalPassed} 通过, ${totalFailed} 失败`);
  console.log('========================================');

  if (totalFailed === 0) {
    console.log('\n🎉 所有测试通过！M11 实施成功。');
  } else {
    console.log('\n⚠️  存在失败测试，需要修复。');
  }
}

// 运行所有测试
runAllTests().catch(console.error);

