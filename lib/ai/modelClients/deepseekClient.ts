export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type MetricsOptions = { collectMetrics?: boolean; timer?: any };

// 浏览器环境使用代理路径，Node.js 环境使用完整 URL
const isNodeEnv = typeof process !== 'undefined' && process.versions && process.versions.node;
const DEEPSEEK_BASE_URL = isNodeEnv ? "https://api.deepseek.com" : "/api/deepseek";

export class DeepSeekClient {
  private apiKey: string;

  constructor() {
    // 支持 Vite (import.meta.env) 和 Node.js (process.env)
    let apiKey: string | undefined;

    // @ts-ignore - Vite 会注入 import.meta.env
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEEPSEEK_API_KEY) {
      // @ts-ignore
      apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY;
    } else if (typeof process !== 'undefined' && process.env?.VITE_DEEPSEEK_API_KEY) {
      apiKey = process.env.VITE_DEEPSEEK_API_KEY;
    }

    if (!apiKey) {
      throw new Error("DEEPSEEK_API_KEY_MISSING: 请在 .env 文件中设置 VITE_DEEPSEEK_API_KEY");
    }
    this.apiKey = apiKey;
  }

  async chat(messages: ChatMessage[], opts?: { temperature?: number }, metricsOptions?: MetricsOptions) {
    if (!messages || messages.length === 0) {
      throw new Error("Input required: specify messages");
    }

    const span = metricsOptions?.timer?.startSpan('llm_call');

    const url = DEEPSEEK_BASE_URL + "/v1/chat/completions";
    console.log(`[DeepSeekClient] Calling API: ${url}`);
    console.log(`[DeepSeekClient] API Key (first 4 chars): ${this.apiKey.substring(0, 4)}***`);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages,
          temperature: opts?.temperature ?? 0.7,
        }),
      });

      console.log(`[DeepSeekClient] Response status: ${res.status} ${res.statusText}`);

      if (!res.ok) {
        const text = await res.text();
        console.error(`[DeepSeekClient] Error response:`, text);
        span?.end();
        throw new Error(`deepseek_error_${res.status}:${text}`);
      }

      const json = await res.json();
      span?.end();
      return json.choices?.[0]?.message?.content ?? "";
    } catch (e) {
      console.error("DeepSeek Call Failed", e);
      span?.end();
      throw e;
    }
  }
}

// 惰性初始化：仅在第一次使用时创建实例
let _instance: DeepSeekClient | null = null;

export const deepseekClient = {
  getInstance: () => {
    if (!_instance) {
      _instance = new DeepSeekClient();
    }
    return _instance;
  },
  chat: async (messages: ChatMessage[], opts?: { temperature?: number }, metricsOptions?: MetricsOptions) => {
    return deepseekClient.getInstance().chat(messages, opts, metricsOptions);
  }
};
