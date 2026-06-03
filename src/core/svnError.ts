/**
 * 库和 CLI 退出码映射使用的标准化 SVN/工具错误类型。
 */
export enum SvnErrorType {
  NotInstalled = 'NotInstalled',
  AuthFailed = 'AuthFailed',
  WorkingCopyLocked = 'WorkingCopyLocked',
  Conflict = 'Conflict',
  NetworkError = 'NetworkError',
  NotWorkingCopy = 'NotWorkingCopy',
  CertificateError = 'CertificateError',
  Timeout = 'Timeout',
  Cancelled = 'Cancelled',
  ConfigError = 'ConfigError',
  Unknown = 'Unknown'
}

/**
 * SVN 操作抛出的错误。
 *
 * stdout/stderr/code 是可选的，因为部分失败发生在进程启动前，
 * 例如可执行文件不存在或启动前已取消。
 */
export class SvnError extends Error {
  public readonly type: SvnErrorType;
  public readonly stdout?: string;
  public readonly stderr?: string;
  public readonly code?: number;

  /**
   * 创建带类型的 SVN 错误，可附带进程输出信息。
   */
  public constructor(
    type: SvnErrorType,
    message: string,
    options?: { stdout?: string; stderr?: string; code?: number; cause?: unknown }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'SvnError';
    this.type = type;
    this.stdout = options?.stdout;
    this.stderr = options?.stderr;
    this.code = options?.code;
  }
}

/**
 * 识别常见 SVN、网络、超时和系统进程错误信息。
 */
export function parseSvnError(message: string): SvnErrorType {
  const text = message.toLowerCase();

  if (
    text.includes('enoent') ||
    text.includes('command not found') ||
    text.includes('not recognized') ||
    text.includes('no such file or directory') && text.includes('svn')
  ) {
    return SvnErrorType.NotInstalled;
  }

  if (text.includes('authentication failed') || text.includes('authorization failed')) {
    return SvnErrorType.AuthFailed;
  }

  if (text.includes('working copy locked') || text.includes('working copy') && text.includes('locked')) {
    return SvnErrorType.WorkingCopyLocked;
  }

  if (text.includes('conflict') || text.includes('conflicted')) {
    return SvnErrorType.Conflict;
  }

  if (text.includes('is not a working copy') || text.includes('not a working copy')) {
    return SvnErrorType.NotWorkingCopy;
  }

  if (
    text.includes('network error') ||
    text.includes('connection timed out') ||
    text.includes('connection reset') ||
    text.includes('connection refused') ||
    text.includes('could not connect') ||
    text.includes('temporarily unavailable') ||
    text.includes('e170013') ||
    text.includes('e175002')
  ) {
    return SvnErrorType.NetworkError;
  }

  if (text.includes('certificate verify failed') || text.includes('server certificate verification failed')) {
    return SvnErrorType.CertificateError;
  }

  if (text.includes('idle timeout') || text.includes('timeout') || text.includes('timed out')) {
    return SvnErrorType.Timeout;
  }

  if (text.includes('cancelled') || text.includes('canceled') || text.includes('aborted')) {
    return SvnErrorType.Cancelled;
  }

  return SvnErrorType.Unknown;
}

/**
 * 返回当前平台对应的 svn 未安装提示。
 */
export function getSvnNotInstalledMessage(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') {
    return '未检测到 svn 命令，请安装 Subversion 命令行工具，并确保 svn.exe 已加入 PATH。';
  }

  if (platform === 'darwin') {
    return '未检测到 svn 命令，请安装 Subversion 命令行工具，并确保 svn 可在终端中直接执行。可以通过 Xcode Command Line Tools 或 Homebrew 安装。';
  }

  return '未检测到 svn 命令，请安装 Subversion，并确保 svn 可在终端中直接执行。';
}

/**
 * 判断某个 SVN 错误是否适合自动重试。
 */
export function isRetryableSvnError(error: unknown): boolean {
  return error instanceof SvnError && (
    error.type === SvnErrorType.NetworkError ||
    error.type === SvnErrorType.Timeout
  );
}
