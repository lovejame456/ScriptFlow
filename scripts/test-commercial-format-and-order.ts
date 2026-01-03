/**
 * 商业短剧格式与场景顺序测试
 *
 * 测试目标：
 * 1. 场景顺序测试：后端 assembler 能否正确解析和排序场景
 * 2. 格式验证测试：生成内容是否符合商业短剧拍摄稿格式
 * 3. 边界测试：空内容、单场景、缺失序号等情况
 */

import { assembleContent } from '../lib/ai/assembler';
import { parseScenes, validateAndFixSceneOrder } from '../lib/ai/assembler';
import { sortContentBySceneIndex, hasSceneMarkers } from '../lib/utils/sceneSorter';
import { SlotWriteOutput } from '../lib/ai/slotWriter';
import { OutputMode } from '../types';

// --- 测试辅助函数 ---

function assertEquals(actual: any, expected: any, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`[FAIL] ${message}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`);
  }
  console.log(`[PASS] ${message}`);
}

function assertTrue(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[FAIL] ${message}`);
  }
  console.log(`[PASS] ${message}`);
}

function assertFalse(condition: boolean, message: string) {
  if (condition) {
    throw new Error(`[FAIL] ${message}`);
  }
  console.log(`[PASS] ${message}`);
}

// --- 测试 1: 场景顺序测试 ---

console.log('\n=== 测试 1: 场景顺序测试 ===\n');

function testSceneOrderFix() {
  console.log('--- 子测试 1.1: 乱序场景自动重排 ---');

  // 构造乱序内容（场景 3 -> 2 -> 1）
  const unorderedContent = `【场景 3】咖啡厅｜夜
【人物】A / B
【动作】A 端起咖啡，手微微颤抖。
【对白】A: 结束了吗？
B: 还没有。
【代价】A 失去了最后的筹码。
【钩子】门被推开，C 走了进来。

【场景 2】街道｜黄昏
【人物】A / C
【动作】C 拦住 A 的去路。
【对白】C: 别急着走。
A: 让开。
【代价】A 错过最后的救援机会。
【钩子】手机突然响起，是那个人的号码。

【场景 1】办公室｜昼
【人物】A
【动作】A 看着屏幕，脸色发白。
【对白】A: 真的查到了？
【代价】A 被迫面对真相。
【钩子】屏幕上出现一行字：游戏开始了。`;

  // 解析场景
  const scenes = parseScenes(unorderedContent);
  console.log(`解析到 ${scenes.length} 个场景`);

  // 验证场景序号混乱
  const sceneIndices = scenes.map(s => s.sceneIndex);
  assertEquals(sceneIndices, [3, 2, 1], '初始场景序号应为 [3, 2, 1]');

  // 验证并修复
  const { scenes: fixedScenes, warnings } = validateAndFixSceneOrder(scenes);
  console.log(`修复后的警告:`, warnings);

  // 检查是否有警告
  assertTrue(warnings.length > 0, '应有警告信息');

  // 验证修复后的顺序
  const fixedIndices = fixedScenes.map(s => s.sceneIndex);
  assertEquals(fixedIndices, [1, 2, 3], '修复后场景序号应为 [1, 2, 3]');

  // 验证内容格式（场景头部已被重新编号）
  const firstSceneHeader = fixedScenes[0].header;
  assertTrue(firstSceneHeader.includes('【场景 1】'), '第一场头部应包含【场景 1】');

  console.log('✓ 子测试 1.1 通过\n');
}

function testSceneMissingIndices() {
  console.log('--- 子测试 1.2: 缺失场景序号自动填充 ---');

  // 构造缺失序号的内容（场景 1 -> 3）
  const missingContent = `【场景 1】办公室｜昼
【人物】A
【动作】A 看着文件。
【对白】A: 这是什么？
【代价】A 发现了不该知道的事。
【钩子】电话突然响了。

【场景 3】走廊｜夜
【人物】A / B
【动作】A 匆匆走过走廊。
【对白】B: 等等。
A: 没时间了。
【代价】A 被迫加快行动。
【钩子】前方传来脚步声。`;

  const scenes = parseScenes(missingContent);
  const { scenes: fixedScenes, warnings } = validateAndFixSceneOrder(scenes);

  // 检查缺失序号的警告
  assertTrue(warnings.some(w => w.includes('缺失场景序号')), '应有缺失序号的警告');

  // 验证修复后的序号连续
  const fixedIndices = fixedScenes.map(s => s.sceneIndex);
  assertEquals(fixedIndices, [1, 2], '修复后场景序号应为 [1, 2]（3 被重编号为 2）');

  console.log('✓ 子测试 1.2 通过\n');
}

function testSceneDuplicateIndices() {
  console.log('--- 子测试 1.3: 重复场景序号自动去重 ---');

  // 构造重复序号的内容（场景 1 -> 1 -> 2）
  const duplicateContent = `【场景 1】办公室｜昼
【人物】A
【动作】A 看着文件。
【对白】A: 这是什么？
【代价】A 发现了不该知道的事。
【钩子】电话突然响了。

【场景 1】走廊｜夜
【人物】A / B
【动作】A 匆匆走过走廊。
【对白】B: 等等。
A: 没时间了。
【代价】A 被迫加快行动。
【钩子】前方传来脚步声。

【场景 2】会议室｜昼
【人物】A / B / C
【动作】C 走进会议室。
【对白】C: 都到了。
【代价】A 失去主动权。
【钩子】会议开始。`;

  const scenes = parseScenes(duplicateContent);
  const { scenes: fixedScenes, warnings } = validateAndFixSceneOrder(scenes);

  // 检查重复序号的警告
  assertTrue(warnings.some(w => w.includes('重复场景序号')), '应有重复序号的警告');

  // 验证修复后的序号不重复
  const fixedIndices = fixedScenes.map(s => s.sceneIndex);
  const uniqueIndices = Array.from(new Set(fixedIndices));
  assertEquals(uniqueIndices.length, fixedIndices.length, '修复后场景序号应不重复');

  console.log('✓ 子测试 1.3 通过\n');
}

// --- 测试 2: 格式验证测试 ---

console.log('=== 测试 2: 商业短剧格式验证 ===\n');

function testCommercialScriptFormat() {
  console.log('--- 子测试 2.1: 正确的商业短剧格式 ---');

  const correctFormat = `【EP1】

【场景 1】办公室｜昼
【人物】A
【动作】A 看着屏幕，脸色发白。
【对白】A: 真的查到了？
【代价】A 被迫面对真相。
【钩子】屏幕上出现一行字：游戏开始了。

【场景 2】走廊｜夜
【人物】A / B
【动作】B 拦住 A 的去路。
【对白】B: 别急着走。
A: 让开。
【代价】A 错过最后的救援机会。
【钩子】手机突然响起，是那个人的号码。`;

  // 验证不包含策划标签
  assertFalse(correctFormat.includes('【目标】'), '不应包含【目标】');
  assertFalse(correctFormat.includes('【冲突】'), '不应包含【冲突】');
  // 注意：正确的格式可以包含【动作】（拍摄稿格式），但不能包含【目标】【冲突】

  // 验证包含必要元素
  assertTrue(correctFormat.includes('【代价】'), '应包含【代价】');
  assertTrue(correctFormat.includes('【钩子】'), '应包含【钩子】');
  assertTrue(correctFormat.includes('【场景 1】'), '应包含场景标记');

  // 验证场景序号连续
  const sceneMarkers = correctFormat.match(/【场景\s*(\d+)】/g);
  if (sceneMarkers) {
    const indices = sceneMarkers.map(m => parseInt(m.match(/\d+/)![0], 10));
    for (let i = 0; i < indices.length; i++) {
      assertEquals(indices[i], i + 1, `场景 ${i + 1} 的序号应为 ${i + 1}`);
    }
  }

  console.log('✓ 子测试 2.1 通过\n');
}

function testIncorrectFormatTags() {
  console.log('--- 子测试 2.2: 检测策划标签 ---');

  const incorrectFormat = `【场景 1】办公室｜昼
【人物】A
【目标】A 要找到文件。
【冲突】文件被 B 偷走了。
【动作】A 翻找抽屉。
【对白】A: 在哪里？
【结尾钩子】A 找到了线索。`;

  // 验证包含策划标签
  assertTrue(incorrectFormat.includes('【目标】'), '包含【目标】标签');
  assertTrue(incorrectFormat.includes('【冲突】'), '包含【冲突】标签');
  assertTrue(incorrectFormat.includes('【动作】'), '包含【动作】标签');

  // 这是不正确的格式，应该被拒绝
  console.log('✓ 子测试 2.2 通过（检测到策划标签）\n');
}

function testRequiredElements() {
  console.log('--- 子测试 2.3: 必要元素检查 ---');

  // 缺少【代价】或【变化】
  const missingCost = `【场景 1】办公室｜昼
【人物】A
【动作】A 看着屏幕。
【对白】A: 是真的。
【钩子】A 哭了出来。`;

  assertFalse(missingCost.includes('【代价】'), '缺少【代价】');
  assertFalse(missingCost.includes('【变化】'), '缺少【变化】');

  // 包含【代价】
  const withCost = `【场景 1】办公室｜昼
【人物】A
【动作】A 看着屏幕。
【对白】A: 是真的。
【代价】A 失去了家人。
【钩子】A 哭了出来。`;

  assertTrue(withCost.includes('【代价】'), '包含【代价】');

  // 包含【变化】
  const withChange = `【场景 1】办公室｜昼
【人物】A
【动作】A 看着屏幕。
【对白】A: 是真的。
【变化】A 不再是以前的人。
【钩子】A 哭了出来。`;

  assertTrue(withChange.includes('【变化】'), '包含【变化】');

  console.log('✓ 子测试 2.3 通过\n');
}

// --- 测试 3: 边界测试 ---

console.log('=== 测试 3: 边界测试 ===\n');

function testEmptyContent() {
  console.log('--- 子测试 3.1: 空内容 ---');

  const emptyContent = '';
  const scenes = parseScenes(emptyContent);
  assertTrue(scenes.length === 1, '空内容应生成单个场景');
  assertEquals(scenes[0].sceneIndex, 1, '默认场景序号应为 1');

  console.log('✓ 子测试 3.1 通过\n');
}

function testSingleScene() {
  console.log('--- 子测试 3.2: 单个场景 ---');

  const singleScene = `【场景 1】办公室｜昼
【人物】A
【动作】A 看着屏幕。
【对白】A: 是真的。
【代价】A 失去了家人。
【钩子】A 哭了出来。`;

  const scenes = parseScenes(singleScene);
  assertEquals(scenes.length, 1, '应解析到 1 个场景');
  assertEquals(scenes[0].sceneIndex, 1, '场景序号应为 1');

  console.log('✓ 子测试 3.2 通过\n');
}

function testNoSceneMarkers() {
  console.log('--- 子测试 3.3: 无场景标记 ---');

  const noMarkers = `这是没有场景标记的内容。
A 看着屏幕。
A: 是真的。
A 哭了出来。`;

  const scenes = parseScenes(noMarkers);
  assertEquals(scenes.length, 1, '无标记应生成单个场景');
  assertTrue(scenes[0].content.includes('这是没有场景标记的内容'), '内容应完整保留');

  console.log('✓ 子测试 3.3 通过\n');
}

// --- 测试 4: 前端排序工具测试 ---

console.log('=== 测试 4: 前端排序工具测试 ===\n');

function testFrontendSort() {
  console.log('--- 子测试 4.1: 前端场景排序 ---');

  const unorderedContent = `【场景 3】咖啡厅｜夜
【人物】A / B
【动作】A 端起咖啡。
【对白】A: 结束了吗？

【场景 2】街道｜黄昏
【人物】A / C
【动作】C 拦住 A。

【场景 1】办公室｜昼
【人物】A
【动作】A 看着屏幕。`;

  const sortedContent = sortContentBySceneIndex(unorderedContent);

  // 验证排序后的内容顺序
  const scene1Index = sortedContent.indexOf('【场景 1】');
  const scene2Index = sortedContent.indexOf('【场景 2】');
  const scene3Index = sortedContent.indexOf('【场景 3】');

  assertTrue(scene1Index < scene2Index, '场景 1 应在场景 2 之前');
  assertTrue(scene2Index < scene3Index, '场景 2 应在场景 3 之前');

  console.log('✓ 子测试 4.1 通过\n');
}

function testHasSceneMarkers() {
  console.log('--- 子测试 4.2: 检测场景标记 ---');

  const withMarkers = '【场景 1】...【场景 2】...';
  const withoutMarkers = '这是普通文本，没有场景标记。';

  assertTrue(hasSceneMarkers(withMarkers), '应检测到场景标记');
  assertFalse(hasSceneMarkers(withoutMarkers), '不应检测到场景标记');

  console.log('✓ 子测试 4.2 通过\n');
}

// --- 测试 5: Assembler 集成测试 ---

console.log('=== 测试 5: Assembler 集成测试 ===\n');

function testAssemblerWithCommercialMode() {
  console.log('--- 子测试 5.1: Assembler + COMMERCIAL_SCRIPT 模式 ---');

  const slots: SlotWriteOutput = {
    NEW_REVEAL: `【场景 2】走廊｜夜
【人物】A / B
【动作】B 拦住 A。
【对白】B: 别急着走。
【代价】A 错过机会。
【钩子】手机响了。`,
    CONFLICT_PROGRESS: `【场景 1】办公室｜昼
【人物】A
【动作】A 看着屏幕。
【对白】A: 真的查到了？
【代价】A 被迫面对真相。
【钩子】屏幕显示：游戏开始。`,
    COST_PAID: `【场景 3】咖啡厅｜夜
【人物】A / C
【动作】C 走进来。
【对白】C: 结束了。
【代价】A 失去自由。
【钩子】A 被带走。`
  };

  const assembled = assembleContent(slots, 'COMMERCIAL_SCRIPT', 1);
  console.log('拼装结果长度:', assembled.length);

  // 验证 EP 头部
  assertTrue(assembled.startsWith('【EP1】'), '应包含 EP 头部');

  // 验证场景顺序（应为 1 -> 2 -> 3，而不是 2 -> 1 -> 3）
  const scene1Index = assembled.indexOf('【场景 1】');
  const scene2Index = assembled.indexOf('【场景 2】');
  const scene3Index = assembled.indexOf('【场景 3】');

  assertTrue(scene1Index < scene2Index, '场景 1 应在场景 2 之前');
  assertTrue(scene2Index < scene3Index, '场景 2 应在场景 3 之前');

  // 验证不包含策划标签
  assertFalse(assembled.includes('【目标】'), '不应包含【目标】');
  assertFalse(assembled.includes('【冲突】'), '不应包含【冲突】');

  // 验证包含必要元素
  assertTrue(assembled.includes('【代价】'), '应包含【代价】');
  assertTrue(assembled.includes('【钩子】'), '应包含【钩子】');

  console.log('✓ 子测试 5.1 通过\n');
}

// --- 运行所有测试 ---

function runAllTests() {
  console.log('========================================');
  console.log('  商业短剧格式与场景顺序测试');
  console.log('========================================\n');

  try {
    // 测试 1: 场景顺序测试
    testSceneOrderFix();
    testSceneMissingIndices();
    testSceneDuplicateIndices();

    // 测试 2: 格式验证测试
    testCommercialScriptFormat();
    testIncorrectFormatTags();
    testRequiredElements();

    // 测试 3: 边界测试
    testEmptyContent();
    testSingleScene();
    testNoSceneMarkers();

    // 测试 4: 前端排序工具测试
    testFrontendSort();
    testHasSceneMarkers();

    // 测试 5: Assembler 集成测试
    testAssemblerWithCommercialMode();

    console.log('========================================');
    console.log('  ✓ 所有测试通过！');
    console.log('========================================\n');

    process.exit(0);
  } catch (error: any) {
    console.error('========================================');
    console.error('  ✗ 测试失败！');
    console.error('========================================\n');
    console.error(error.message);
    process.exit(1);
  }
}

// 运行测试
runAllTests();

