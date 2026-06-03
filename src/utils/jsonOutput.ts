/**
 * 将格式化 JSON 写入 stdout。
 */
export function outputJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

/**
 * 将 info 日志写入 stderr。
 */
export function logInfo(message: string): void {
  process.stderr.write(`[INFO] ${message}\n`);
}

/**
 * 将 warning 日志写入 stderr。
 */
export function logWarn(message: string): void {
  process.stderr.write(`[WARN] ${message}\n`);
}

/**
 * 将 error 日志写入 stderr。
 */
export function logError(message: string): void {
  process.stderr.write(`[ERROR] ${message}\n`);
}

/**
 * 返回已隐藏内联 --password 参数值的错误信息。
 */
export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/(--password\s+)(\S+)/gi, '$1******');
  }
  return String(error).replace(/(--password\s+)(\S+)/gi, '$1******');
}
