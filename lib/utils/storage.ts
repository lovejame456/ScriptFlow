/**
 * 跨环境存储工具
 * 在浏览器环境使用 localStorage，在 Node.js 环境使用内存存储
 */

const isNodeEnv = typeof process !== 'undefined' && process.versions && process.versions.node;

// Node.js 环境内存存储
const inMemoryStorage: Record<string, string> = {};

const nodeLocalStorage = {
  getItem: (key: string) => inMemoryStorage[key] || null,
  setItem: (key: string, value: string) => {
    inMemoryStorage[key] = value;
  },
  removeItem: (key: string) => {
    delete inMemoryStorage[key];
  },
  clear: () => {
    Object.keys(inMemoryStorage).forEach(key => {
      delete inMemoryStorage[key];
    });
  },
};

// 在 Node.js 环境挂载模拟 localStorage
if (isNodeEnv && !globalThis.localStorage) {
  (globalThis as any).localStorage = nodeLocalStorage;
}

// 导出统一的存储接口
export const storage = isNodeEnv ? nodeLocalStorage : globalThis.localStorage;
export const localStorage = isNodeEnv ? nodeLocalStorage : globalThis.localStorage;
