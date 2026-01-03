#!/usr/bin/env npx tsx
import { projectRepo } from '../lib/store/projectRepo';

async function main() {
  const projects = await projectRepo.getAll();
  console.log(`找到 ${projects.length} 个项目:\n`);
  
  projects.forEach(p => {
    console.log(`ID: ${p.id}`);
    console.log(`名称: ${p.name}`);
    console.log(`总集数: ${p.totalEpisodes}`);
    console.log(`已完成: ${p.episodes.filter((e: any) => e.status === 'COMPLETED').length}`);
    console.log(`更新时间: ${new Date(p.updatedAt).toLocaleString()}`);
    console.log('---');
  });
}

main();

