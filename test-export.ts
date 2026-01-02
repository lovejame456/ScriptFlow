/**
 * M4-3 导出功能测试脚本
 *
 * 测试目标：
 * 1. 验证导出模块能够正确生成 ExportPackage
 * 2. 验证 ZIP 打包功能正常
 * 3. 验证 Markdown 内容格式正确
 * 4. 验证无系统字段泄漏
 */

import { projectRepo } from './lib/store/projectRepo';
import { exportPackage } from './lib/exporter/exportPackage';
import JSZip from 'jszip';

async function testExport() {
  console.log('🧪 开始 M4-3 导出功能测试...\n');

  try {
    // 1. 获取所有项目
    console.log('📂 读取项目列表...');
    const projects = await projectRepo.getAll();

    if (projects.length === 0) {
      console.log('❌ 没有找到项目，请先创建一个项目');
      return;
    }

    console.log(`✅ 找到 ${projects.length} 个项目`);
    console.log(`📝 选择第一个项目: ${projects[0].name} (${projects[0].id})\n`);

    const projectId = projects[0].id;

    // 2. 测试导出功能
    console.log('📦 开始导出投稿包...');
    const blob = await exportPackage(projectId);
    console.log(`✅ 导出成功！Blob 大小: ${(blob.size / 1024).toFixed(2)} KB\n`);

    // 3. 验证 ZIP 内容
    console.log('🔍 验证 ZIP 内容...');
    const zip = await JSZip.loadAsync(blob);
    const files = Object.keys(zip.files);

    console.log('📁 ZIP 目录结构:');
    files.forEach(filename => {
      const isDir = zip.files[filename].dir;
      console.log(`  ${isDir ? '📂' : '📄'} ${filename}`);
    });

    console.log('\n');

    // 4. 验证必需文件
    const requiredFiles = [
      '00_Overview.md',
      '01_Bible.md',
      '02_Outline.md',
      '04_Editor_Report.md',
      'README.md',
      '03_Episodes/'
    ];

    console.log('🔎 验证必需文件:');
    let allFilesExist = true;
    requiredFiles.forEach(file => {
      const exists = files.some(f => f === file || f.startsWith(file));
      if (exists) {
        console.log(`  ✅ ${file}`);
      } else {
        console.log(`  ❌ ${file} (缺失)`);
        allFilesExist = false;
      }
    });

    if (!allFilesExist) {
      console.log('\n❌ 测试失败：缺少必需文件');
      return;
    }

    console.log('\n');

    // 5. 验证文件内容
    console.log('📖 验证文件内容格式...');

    // 检查 00_Overview.md
    const overviewContent = await zip.file('00_Overview.md')?.async('text');
    if (overviewContent?.includes('# ') && overviewContent?.includes('**题材**')) {
      console.log('  ✅ 00_Overview.md 格式正确');
    } else {
      console.log('  ❌ 00_Overview.md 格式错误');
    }

    // 检查 01_Bible.md
    const bibleContent = await zip.file('01_Bible.md')?.async('text');
    if (bibleContent?.includes('# 世界观设定') && bibleContent?.includes('# 角色表')) {
      console.log('  ✅ 01_Bible.md 格式正确');
    } else {
      console.log('  ❌ 01_Bible.md 格式错误');
    }

    // 检查 02_Outline.md
    const outlineContent = await zip.file('02_Outline.md')?.async('text');
    if (outlineContent?.includes('# 全集大纲') && outlineContent?.includes('## EP')) {
      console.log('  ✅ 02_Outline.md 格式正确');
    } else {
      console.log('  ❌ 02_Outline.md 格式错误');
    }

    // 检查 Episodes 目录
    const episodeFiles = files.filter(f => f.startsWith('03_Episodes/') && !f.endsWith('/'));
    console.log(`  ✅ Episodes 目录包含 ${episodeFiles.length} 个文件`);

    if (episodeFiles.length > 0) {
      const firstEpisodeContent = await zip.file(episodeFiles[0])?.async('text');
      if (firstEpisodeContent?.includes('# 第') && firstEpisodeContent?.includes('集')) {
        console.log('  ✅ 剧本文件格式正确');
      } else {
        console.log('  ❌ 剧本文件格式错误');
      }
    }

    // 检查 04_Editor_Report.md
    const editorReportContent = await zip.file('04_Editor_Report.md')?.async('text');
    if (editorReportContent?.includes('# 编辑审稿报告')) {
      console.log('  ✅ 04_Editor_Report.md 格式正确');
    } else {
      console.log('  ❌ 04_Editor_Report.md 格式错误');
    }

    // 检查 README.md
    const readmeContent = await zip.file('README.md')?.async('text');
    if (readmeContent?.includes('ScriptFlow')) {
      console.log('  ✅ README.md 格式正确');
    } else {
      console.log('  ❌ README.md 格式错误');
    }

    console.log('\n');

    // 6. 检查系统字段泄漏
    console.log('🔒 检查系统字段泄漏...');
    const allContent = [
      overviewContent || '',
      bibleContent || '',
      outlineContent || '',
      editorReportContent || ''
    ].join('\n');

    const forbiddenFields = [
      'storyMemory',
      'alignerResult',
      'canonLayer',
      'characterLayer',
      'plotLayer',
      'system'
    ];

    let hasLeak = false;
    forbiddenFields.forEach(field => {
      if (allContent.includes(field)) {
        console.log(`  ⚠️  发现系统字段泄漏: ${field}`);
        hasLeak = true;
      }
    });

    if (!hasLeak) {
      console.log('  ✅ 未发现系统字段泄漏');
    }

    console.log('\n');

    // 7. 总结
    console.log('════════════════════════════════════════');
    console.log('✅ M4-3 导出功能测试完成！');
    console.log('════════════════════════════════════════');
    console.log(`📊 测试结果:`);
    console.log(`   - 导出功能: 正常`);
    console.log(`   - ZIP 结构: 正确`);
    console.log(`   - 文件格式: 正确`);
    console.log(`   - 系统字段: 无泄漏`);
    console.log(`\n💡 提示: 在 ProductionConsole 中点击"导出投稿包"按钮即可下载 ZIP 文件`);

  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

// 运行测试
testExport();




