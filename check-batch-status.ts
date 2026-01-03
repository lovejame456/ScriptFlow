import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config({ path: join(__dirname, '.env.local') });

import { batchRepo } from './lib/batch/batchRepo';
import { projectRepo } from './lib/store/projectRepo';

async function main() {
  console.log('Checking batch status...');
  
  const projects = await projectRepo.getAll();
  console.log('Total projects:', projects.length);
  
  if (projects.length > 0) {
    const projectId = projects[0].id;
    console.log('Project ID:', projectId);
    console.log('Project name:', projects[0].name);
    
    const batch = batchRepo.get(projectId);
    if (batch) {
      console.log('\nBatch status:', batch.status);
      console.log('Current episode:', batch.currentEpisode);
      console.log('End episode:', batch.endEpisode);
      console.log('Completed episodes:', batch.completed.length);
      console.log('Completed list:', batch.completed);
    } else {
      console.log('No batch found for project');
    }
  }
}

main().catch(console.error);

