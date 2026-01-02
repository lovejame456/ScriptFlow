// 测试环境变量加载
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

console.log('[测试] process.env.VITE_DEEPSEEK_API_KEY:', process.env.VITE_DEEPSEEK_API_KEY ? '✓ 存在' : '✗ 不存在');
console.log('[测试] 值:', process.env.VITE_DEEPSEEK_API_KEY);
console.log('[测试] typeof process:', typeof process);
console.log('[测试] typeof process.env:', typeof process.env);





