import { spawn } from 'node:child_process';
import { SvnError, SvnErrorType, parseSvnError } from './svnError.js';

/**
 * 控制单次 svn 进程如何启动、输出、捕获和取消。
 */
export interface RunSvnOptions {
  /** 传给 child_process.spawn 的工作目录。 */
  cwd?: string;
  /** SVN 可执行文件路径。默认使用 "svn"，交给系统从 PATH 中查找。 */
  svnExecutable?: string;
  /** 进程最大总运行时间，单位毫秒。0 或 undefined 表示不限制。 */
  totalTimeout?: number;
  /** 最大无输出时间，单位毫秒。0 或 undefined 表示不启用。 */
  idleTimeout?: number;
  /** stdout/stderr 各自最多保留的字节数。undefined 表示完整捕获。 */
  maxCaptureBytes?: number;
  /** 用于取消运行中 svn 进程的标准取消信号。 */
  signal?: AbortSignal;
  /** 收到 stdout 数据时实时写入 process.stdout。 */
  printStdout?: boolean;
  /** 收到 stderr 数据时实时写入 process.stderr。 */
  printStderr?: boolean;
  /** 每次收到 stdout 数据并按 UTF-8 解码后触发的回调。 */
  onStdout?: (data: string) => void;
  /** 每次收到 stderr 数据并按 UTF-8 解码后触发的回调。 */
  onStderr?: (data: string) => void;
  /** 可选的额外 stdout 输出流，接收原始 Buffer 数据。 */
  stdoutStream?: NodeJS.WritableStream;
  /** 可选的额外 stderr 输出流，接收原始 Buffer 数据。 */
  stderrStream?: NodeJS.WritableStream;
  /** 是否在隐藏敏感参数后把 svn 命令打印到 stderr。 */
  printCommand?: boolean;
}

/**
 * svn 进程成功执行后的结果，包含捕获输出和运行信息。
 */
export interface RunSvnResult {
  /** 捕获到的 stdout，可能已按 maxCaptureBytes 保留最近内容。 */
  stdout: string;
  /** 捕获到的 stderr，可能已按 maxCaptureBytes 保留最近内容。 */
  stderr: string;
  /** 进程退出码。成功结果始终为 0。 */
  code: number;
  /** 墙钟运行时间，单位毫秒。 */
  durationMs: number;
}

/**
 * 面向大型 checkout/update 日志的按字节滚动捕获缓冲区。
 */
class RollingBuffer {
  private chunks: Buffer[] = [];
  private size = 0;

  /**
   * 创建一个完整保留或只保留最近 maxBytes 字节的缓冲区。
   */
  public constructor(private readonly maxBytes?: number) {}

  /**
   * 追加数据块，并在超过捕获上限时裁剪最旧的字节。
   */
  public push(chunk: Buffer): void {
    this.chunks.push(chunk);
    this.size += chunk.length;

    if (!this.maxBytes || this.size <= this.maxBytes) {
      return;
    }

    while (this.size > this.maxBytes && this.chunks.length > 0) {
      const first = this.chunks[0];
      const extra = this.size - this.maxBytes;
      if (first.length <= extra) {
        this.chunks.shift();
        this.size -= first.length;
      } else {
        this.chunks[0] = first.subarray(extra);
        this.size -= extra;
      }
    }
  }

  /**
   * 将保留下来的字节按 UTF-8 解码，用于命令结果和错误信息。
   */
  public toString(): string {
    return Buffer.concat(this.chunks, this.size).toString('utf8');
  }
}

/**
 * 返回参数数组副本，并把 --password 后面的值替换为 ******。
 */
export function sanitizeSvnArgs(args: string[]): string[] {
  const sanitized = [...args];
  for (let index = 0; index < sanitized.length; index += 1) {
    if (sanitized[index] === '--password' && index + 1 < sanitized.length) {
      sanitized[index + 1] = '******';
      index += 1;
    }
  }
  return sanitized;
}

/**
 * 使用禁用 shell 的 child_process.spawn 异步运行 svn 命令。
 *
 * 非零退出码、启动失败、总超时、无输出超时和取消都会以 SvnError reject。
 * 该函数不会拼接 shell 命令字符串，因此能安全处理空格路径和非 ASCII 路径。
 */
export function runSvn(args: string[], options: RunSvnOptions = {}): Promise<RunSvnResult> {
  if (options.signal?.aborted) {
    return Promise.reject(new SvnError(SvnErrorType.Cancelled, 'SVN command cancelled before start.'));
  }

  const startedAt = Date.now();
  const command = options.svnExecutable ?? 'svn';
  const stdoutCapture = new RollingBuffer(options.maxCaptureBytes);
  const stderrCapture = new RollingBuffer(options.maxCaptureBytes);

  if (options.printCommand) {
    const printedCommand = [command, ...sanitizeSvnArgs(args)].join(' ');
    process.stderr.write(`[SVN] ${printedCommand}\n`);
  }

  return new Promise<RunSvnResult>((resolve, reject) => {
    let settled = false;
    let totalTimer: NodeJS.Timeout | undefined;
    let idleTimer: NodeJS.Timeout | undefined;

    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      windowsHide: process.platform === 'win32'
    });

    const cleanup = (): void => {
      if (totalTimer) {
        clearTimeout(totalTimer);
      }
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      options.signal?.removeEventListener('abort', onAbort);
    };

    const finishReject = (error: SvnError): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };

    const finishResolve = (result: RunSvnResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(result);
    };

    const killChild = (): void => {
      if (!child.killed) {
        child.kill();
      }
    };

    const onAbort = (): void => {
      killChild();
      finishReject(new SvnError(SvnErrorType.Cancelled, 'SVN command cancelled.'));
    };

    const resetIdleTimer = (): void => {
      if (!options.idleTimeout || options.idleTimeout <= 0) {
        return;
      }
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      idleTimer = setTimeout(() => {
        killChild();
        finishReject(new SvnError(SvnErrorType.Timeout, `SVN command idle timeout after ${options.idleTimeout}ms.`, {
          stdout: stdoutCapture.toString(),
          stderr: stderrCapture.toString()
        }));
      }, options.idleTimeout);
    };

    if (options.totalTimeout && options.totalTimeout > 0) {
      totalTimer = setTimeout(() => {
        killChild();
        finishReject(new SvnError(SvnErrorType.Timeout, `SVN command timeout after ${options.totalTimeout}ms.`, {
          stdout: stdoutCapture.toString(),
          stderr: stderrCapture.toString()
        }));
      }, options.totalTimeout);
    }

    resetIdleTimer();
    options.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutCapture.push(chunk);
      const text = chunk.toString('utf8');
      if (options.printStdout) {
        process.stdout.write(chunk);
      }
      options.stdoutStream?.write(chunk);
      options.onStdout?.(text);
      resetIdleTimer();
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrCapture.push(chunk);
      const text = chunk.toString('utf8');
      if (options.printStderr) {
        process.stderr.write(chunk);
      }
      options.stderrStream?.write(chunk);
      options.onStderr?.(text);
      resetIdleTimer();
    });

    child.on('error', (error: NodeJS.ErrnoException) => {
      const type = parseSvnError(`${error.code ?? ''} ${error.message}`);
      const message = type === SvnErrorType.NotInstalled ? 'SVN executable was not found.' : error.message;
      finishReject(new SvnError(type, message, {
        stdout: stdoutCapture.toString(),
        stderr: stderrCapture.toString(),
        cause: error
      }));
    });

    child.on('close', (code) => {
      if (settled) {
        return;
      }

      const stdout = stdoutCapture.toString();
      const stderr = stderrCapture.toString();
      const exitCode = code ?? 0;
      const durationMs = Date.now() - startedAt;

      if (exitCode !== 0) {
        const combined = `${stderr}\n${stdout}`;
        const type = parseSvnError(combined);
        finishReject(new SvnError(type, stderr.trim() || `SVN command failed with code ${exitCode}.`, {
          stdout,
          stderr,
          code: exitCode
        }));
        return;
      }

      finishResolve({
        stdout,
        stderr,
        code: exitCode,
        durationMs
      });
    });
  });
}
