import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api/deepseek': {
          target: 'https://api.deepseek.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/deepseek/, '')
        }
      }
    },
    plugins: [react()],
    // 禁用 .env 文件加载，避免权限问题
    envPrefix: [],
    define: {
      'process.env.API_KEY': JSON.stringify(''),
      'process.env.GEMINI_API_KEY': JSON.stringify(''),
      // 临时方案：直接定义 API Key，绕过 .env 文件权限问题
      'import.meta.env.VITE_DEEPSEEK_API_KEY': JSON.stringify('sk-c4d4c10627974aa7a034eeb7e253c3f9')
    },
    optimizeDeps: {
      exclude: ['crypto', 'url', 'fs', 'path', 'node:fs', 'node:path', 'node:crypto', 'node:url']
    },
    build: {
      rollupOptions: {
        external: ['crypto', 'url', 'fs', 'path', 'node:fs', 'node:path', 'node:crypto', 'node:url']
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
