/**
 * Prompt 加载器
 *
 * 从 prompts/ 目录加载 Markdown 格式的 Prompt 文件
 */

export interface PromptConfig {
  category: 'planning' | 'execution' | 'validation';
  name: string;
}

/**
 * 加载 Prompt 文件内容
 *
 * @param config - Prompt 配置
 * @returns Prompt 文件的文本内容
 */
export async function loadPrompt(config: PromptConfig): Promise<string> {
  const { category, name } = config;

  // Node.js 环境：使用 fs 读取本地文件
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    // 动态导入 Node.js 模块，避免浏览器环境外部化错误
    const { fileURLToPath } = await import('url');
    const { readFileSync } = await import('fs');
    const { dirname, join } = await import('path');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const promptsDir = join(__dirname, '../../prompts');

    const filePath = join(promptsDir, category, `${name}.md`);
    try {
      const content = readFileSync(filePath, 'utf-8');
      return content.trim();
    } catch (error) {
      console.error(`[promptLoader] Error loading prompt from ${filePath}:`, error);
      throw error;
    }
  }

  // 浏览器环境：使用 fetch（相对路径会被 Vite 处理）
  const path = `/prompts/${category}/${name}.md`;

  try {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load prompt: ${path} (${response.status} ${response.statusText})`);
    }
    const content = await response.text();
    return content.trim();
  } catch (error) {
    console.error(`[promptLoader] Error loading prompt from ${path}:`, error);
    throw error;
  }
}

/**
 * 预加载常用 Prompt（可选优化）
 *
 * @returns 预加载的 Prompt 映射
 */
export async function preloadPrompts(): Promise<Record<string, string>> {
  const configs: PromptConfig[] = [
    { category: 'planning', name: 'seed' },
    { category: 'planning', name: 'bible' },
    { category: 'planning', name: 'bible_skeleton' },  // M10: Bible Skeleton prompt
    { category: 'planning', name: 'synopsis' },
    { category: 'planning', name: 'outline' },
    { category: 'planning', name: 'outline_skeleton' },  // M10: Outline Skeleton prompt
    { category: 'planning', name: 'genre_infer' },
    { category: 'planning', name: 'characters_profile' },
    { category: 'planning', name: 'story_overview' },
    { category: 'planning', name: 'structure_planner' },  // M16: Structure Planner prompt
    { category: 'execution', name: 'episode_writer_ep1' },
    { category: 'execution', name: 'episode_writer_ep2' },
    { category: 'execution', name: 'episode_writer_std' },
    { category: 'execution', name: 'episode_writer_rewrite_draft' },
    { category: 'execution', name: 'slot_writer' },  // M16: Slot Writer prompt
    { category: 'validation', name: 'script_aligner' },
    { category: 'validation', name: 'script_aligner_commercial' },
  ];

  const prompts: Record<string, string> = {};
  const loadingPromises = configs.map(async (config) => {
    const key = `${config.category}/${config.name}`;
    prompts[key] = await loadPrompt(config);
  });

  await Promise.all(loadingPromises);
  return prompts;
}

/**
 * 获取特定的 Prompt（带缓存）
 */
let promptCache: Record<string, string> | null = null;

export async function getCachedPrompt(config: PromptConfig): Promise<string> {
  const key = `${config.category}/${config.name}`;

  if (!promptCache) {
    promptCache = await preloadPrompts();
  }

  if (!promptCache[key]) {
    throw new Error(`Prompt not found in cache: ${key}`);
  }

  return promptCache[key];
}

