import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config({ path: join(__dirname, '.env.local') });

import { projectRepo } from './lib/store/projectRepo';

async function main() {
  const projects = await projectRepo.getAll();
  console.log('Projects:', projects.length);
  projects.forEach(p => {
    console.log(`  - ${p.name} (${p.id}) - Episodes: ${p.episodes.length}`);
    const degraded = p.episodes.filter((e: any) => e.status === 'DEGRADED').length;
    const completed = p.episodes.filter((e: any) => e.status === 'COMPLETED').length;
    const draft = p.episodes.filter((e: any) => e.status === 'DRAFT').length;
    console.log(`    DEGRADED: ${degraded}, COMPLETED: ${completed}, DRAFT: ${draft}`);
    console.log('\n    EP1-10 Status:');
    p.episodes.slice(0, 10).forEach((ep: any, i: number) => {
      console.log(`    EP${i+1}: ${ep.status}${ep.metadata?.alignerResults ? ` (aligner: ${ep.metadata.alignerResults[0]?.severity || 'N/A'})` : ''}`);
    });
  });
}

main().catch(console.error);

