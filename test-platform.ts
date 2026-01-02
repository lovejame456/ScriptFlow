// M5-1: 平台功能测试
// 验证平台模块的基本功能

import { PlatformId, PLATFORM_NAMES, getPlatform, getAllPlatforms, isValidPlatform } from './types/platform';
import { validateForPlatform } from './platforms/hongguo/validator';

// 测试 1: 平台类型定义
console.log('=== 测试 1: 平台类型定义 ===');
const validPlatforms: PlatformId[] = ['hongguo', 'fanqie', 'kuaikan', 'generic'];
validPlatforms.forEach(p => {
  console.log(`✓ 平台 ID "${p}" 有效: ${isValidPlatform(p)}`);
  console.log(`  名称: ${PLATFORM_NAMES[p]}`);
});

// 测试 2: 平台配置获取
console.log('\n=== 测试 2: 平台配置获取 ===');
const allPlatforms = getAllPlatforms();
allPlatforms.forEach(p => {
  console.log(`✓ ${p.metadata.name}:`);
  console.log(`  ID: ${p.metadata.id}`);
  console.log(`  推荐: ${p.metadata.recommended ? '是' : '否'}`);
  console.log(`  项目名最大长度: ${p.rules.nameMaxLength}`);
  console.log(`  卖点最大长度: ${p.rules.loglineMaxLength}`);
  console.log(`  推荐集数: ${p.rules.recommendedEpisodeCount?.join('-') || '无限制'}`);
});

// 测试 3: 校验器
console.log('\n=== 测试 3: 红果校验器 ===');
const testProject1 = {
  name: '测试项目',
  genre: '甜宠恋爱',
  logline: '这是一个测试卖点',
  totalEpisodes: 80,
  episodes: [],
  bible: {
    canonRules: {
      worldSetting: '测试',
      coreRules: [],
      powerOrWealthSystem: '',
      forbiddenChanges: []
    },
    keyEvents: []
  }
};

const result1 = validateForPlatform(testProject1);
console.log(`✓ 校验通过: ${result1.passed}`);
console.log(`  错误数: ${result1.errors.length}`);
console.log(`  警告数: ${result1.warnings.length}`);

// 测试 4: 集数超限警告
console.log('\n=== 测试 4: 集数超限警告 ===');
const testProject2 = { ...testProject1, totalEpisodes: 200 };
const result2 = validateForPlatform(testProject2);
console.log(`✓ 校验通过: ${result2.passed}`);
console.log(`  警告: ${result2.warnings.join(', ')}`);

// 测试 5: 题材不推荐
console.log('\n=== 测试 5: 题材不推荐 ===');
const testProject3 = { ...testProject1, genre: '悬疑惊悚' as any };
const result3 = validateForPlatform(testProject3);
console.log(`✓ 校验通过: ${result3.passed}`);
console.log(`  警告: ${result3.warnings.join(', ')}`);

// 测试 6: 项目名超限
console.log('\n=== 测试 6: 项目名超限 ===');
const testProject4 = { ...testProject1, name: '这是一个非常非常长的项目名称肯定超过了红果的限制' };
const result4 = validateForPlatform(testProject4);
console.log(`✓ 校验通过: ${result4.passed}`);
console.log(`  错误: ${result4.errors.join(', ')}`);

console.log('\n=== 所有测试完成 ===');





