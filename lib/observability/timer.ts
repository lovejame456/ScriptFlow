/**
 * 轻量级计时工具
 * 用于E2E测试和性能监控
 */

export interface SpanMeta {
  [key: string]: any;
}

export interface SpanResult {
  name: string;
  ms: number;
  meta?: SpanMeta;
}

export interface SpanContext {
  name: string;
  startTime: number;
  meta?: SpanMeta;
  children: SpanContext[];
  parent?: SpanContext;
}

class Timer {
  private root: SpanContext;
  private current: SpanContext;

  constructor(rootName: string = 'root') {
    this.root = {
      name: rootName,
      startTime: Date.now(),
      children: []
    };
    this.current = this.root;
  }

  /**
   * 开始一个新的span
   * @param name span名称
   * @param meta 可选的元数据
   * @returns 包含end()方法的对象，调用end()结束计时
   */
  startSpan(name: string, meta?: SpanMeta): { end: () => SpanResult } {
    const span: SpanContext = {
      name,
      startTime: Date.now(),
      meta,
      children: [],
      parent: this.current
    };

    this.current.children.push(span);
    this.current = span;

    return {
      end: () => {
        const ms = Date.now() - span.startTime;
        
        // 返回到父级span
        if (span.parent) {
          this.current = span.parent;
        }

        return {
          name,
          ms,
          meta
        };
      }
    };
  }

  /**
   * 获取所有span的扁平化结果
   * @returns 所有span的结果数组
   */
  getAllSpans(): SpanResult[] {
    const results: SpanResult[] = [];

    const traverse = (ctx: SpanContext) => {
      const ms = Date.now() - ctx.startTime;
      results.push({
        name: ctx.name,
        ms,
        meta: ctx.meta
      });

      for (const child of ctx.children) {
        traverse(child);
      }
    };

    traverse(this.root);
    return results;
  }

  /**
   * 获取总耗时（从根span开始）
   * @returns 总毫秒数
   */
  getTotalTime(): number {
    return Date.now() - this.root.startTime;
  }

  /**
   * 获取特定名称的span
   * @param name span名称
   * @returns 匹配的span结果数组（可能有多个同名span）
   */
  getSpansByName(name: string): SpanResult[] {
    return this.getAllSpans().filter(span => span.name === name);
  }

  /**
   * 计算统计数据（p50, p95, max, min, avg）
   * @param name span名称
   * @returns 统计数据
   */
  getStats(name: string) {
    const spans = this.getSpansByName(name);
    if (spans.length === 0) {
      return { count: 0, p50: 0, p95: 0, max: 0, min: 0, avg: 0 };
    }

    const values = spans.map(s => s.ms).sort((a, b) => a - b);
    const count = values.length;
    
    return {
      count,
      p50: values[Math.floor(count * 0.5)],
      p95: values[Math.floor(count * 0.95)],
      max: values[count - 1],
      min: values[0],
      avg: values.reduce((sum, v) => sum + v, 0) / count
    };
  }
}

/**
 * 创建一个新的计时器实例
 * @param rootName 根span名称，默认为'root'
 * @returns Timer实例
 */
export function createTimer(rootName: string = 'root'): Timer {
  return new Timer(rootName);
}

/**
 * 便捷函数：同步执行并计时
 * @param name span名称
 * @param fn 要执行的函数
 * @param meta 可选元数据
 * @returns 包含结果和span的元组
 */
export async function measureAsync<T>(
  name: string,
  fn: () => Promise<T>,
  meta?: SpanMeta
): Promise<{ result: T; span: SpanResult }> {
  const timer = createTimer();
  const span = timer.startSpan(name, meta);
  
  try {
    const result = await fn();
    const spanResult = span.end();
    return { result, span: spanResult };
  } catch (error) {
    span.end();
    throw error;
  }
}

/**
 * 便捷函数：同步执行并计时
 * @param name span名称
 * @param fn 要执行的函数
 * @param meta 可选元数据
 * @returns 包含结果和span的元组
 */
export function measureSync<T>(
  name: string,
  fn: () => T,
  meta?: SpanMeta
): { result: T; span: SpanResult } {
  const timer = createTimer();
  const span = timer.startSpan(name, meta);
  
  try {
    const result = fn();
    const spanResult = span.end();
    return { result, span: spanResult };
  } catch (error) {
    span.end();
    throw error;
  }
}

export type { Timer };

