/**
 * 服务层和 CLI 适配层使用的最小日志接口。
 */
export interface Logger {
  /** 输出普通进度信息。 */
  info(message: string): void;
  /** 输出警告信息，不一定代表当前操作失败。 */
  warn(message: string): void;
  /** 输出错误信息。 */
  error(message: string): void;
  /** 在实现且启用时输出详细诊断信息。 */
  debug?(message: string): void;
}

/**
 * 将所有日志级别都写入 stderr 的控制台日志器。
 *
 * stdout 特意保留给机器可读的 JSON 输出。
 */
export class ConsoleLogger implements Logger {
  /**
   * 创建支持 quiet/debug 行为的日志器。
   */
  public constructor(private readonly options?: { quiet?: boolean; debug?: boolean }) {}

  /** quiet 模式未启用时输出 info 信息。 */
  public info(message: string): void {
    if (!this.options?.quiet) {
      process.stderr.write(`[INFO] ${message}\n`);
    }
  }

  /** quiet 模式未启用时输出 warn 信息。 */
  public warn(message: string): void {
    if (!this.options?.quiet) {
      process.stderr.write(`[WARN] ${message}\n`);
    }
  }

  /** 即使在 quiet 模式下也输出 error 信息。 */
  public error(message: string): void {
    process.stderr.write(`[ERROR] ${message}\n`);
  }

  /** 仅在 debug 启用且 quiet 关闭时输出 debug 信息。 */
  public debug(message: string): void {
    if (!this.options?.quiet && this.options?.debug) {
      process.stderr.write(`[DEBUG] ${message}\n`);
    }
  }
}
