/**
 * 跨环境存储工具
 * 在浏览器环境使用 localStorage，在 Node.js 环境使用内存存储
 */

const isNodeEnv = typeof process !== 'undefined' && process.versions && process.versions.node;

// Node.js 环境内存存储
const inMemoryStorage: Record<string, string> = {};

const nodeLocalStorage = {
  getItem: (key: string): string | null => inMemoryStorage[key] || null,
  setItem: (key: string, value: string): void => {
    inMemoryStorage[key] = value;
  },
  removeItem: (key: string): void => {
    delete inMemoryStorage[key];
  },
  clear: (): void => {
    Object.keys(inMemoryStorage).forEach(key => {
      delete inMemoryStorage[key];
    });
  },
};

// 导出统一的存储接口
export const storage = isNodeEnv ? nodeLocalStorage : localStorage;

