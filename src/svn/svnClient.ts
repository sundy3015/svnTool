import type { Logger } from '../core/logger.js';
import { runSvn, type RunSvnOptions, type RunSvnResult } from '../core/runSvn.js';
import { SvnError, SvnErrorType } from '../core/svnError.js';
import { parseSvnInfo, parseSvnStatus } from './svnParser.js';
import type { SvnAuthOptions, SvnCommandOptions, SvnInfo, SvnStatusItem } from './svnTypes.js';

const QUICK_TIMEOUT = {
  totalTimeout: 30 * 1000,
  idleTimeout: 10 * 1000
};

const NORMAL_TIMEOUT = {
  totalTimeout: 5 * 60 * 1000,
  idleTimeout: 60 * 1000
};

const LONG_RUNNING_TIMEOUT = {
  totalTimeout: 0,
  idleTimeout: 10 * 60 * 1000,
  maxCaptureBytes: 1024 * 1024
};

/**
 * SvnClient 的构造选项。
 */
export interface SvnClientOptions {
  /** 可选的 svn 可执行文件路径。默认 "svn"。 */
  svnExecutable?: string;
  /** 可选日志器，用于输出调试信息。 */
  logger?: Logger;
  /** 转发给 runSvn 的进程输出控制选项。 */
  runOptions?: Pick<RunSvnOptions, 'printCommand' | 'printStdout' | 'printStderr' | 'stdoutStream' | 'stderrStream'>;
}

/**
 * 高层异步 SVN 客户端。
 *
 * 该类负责构造命令参数和解析输出。所有进程执行仍统一经过 runSvn，
 * 从而保持超时、取消、输出捕获和密码脱敏行为一致。
 */
export class SvnClient {
  private readonly svnExecutable?: string;
  private readonly logger?: Logger;
  private readonly runOptions?: SvnClientOptions['runOptions'];

  /**
   * 创建绑定可选可执行文件和日志器的 SVN 客户端。
   */
  public constructor(options: SvnClientOptions = {}) {
    this.svnExecutable = options.svnExecutable && options.svnExecutable.trim().length > 0
      ? options.svnExecutable
      : undefined;
    this.logger = options.logger;
    this.runOptions = options.runOptions;
  }

  /**
   * 执行 `svn --version --quiet` 并返回版本字符串。
   */
  public async checkVersion(): Promise<string> {
    const result = await this.run(['--version', '--quiet'], QUICK_TIMEOUT);
    return result.stdout.trim();
  }

  /**
   * 使用长任务默认超时配置，将 repoUrl checkout 到 localPath。
   */
  public async checkout(repoUrl: string, localPath: string, options: SvnCommandOptions = {}): Promise<RunSvnResult> {
    const args = ['checkout', repoUrl, localPath, '--non-interactive'];
    this.appendRevisionArgs(args, options.revision);
    this.appendCommonArgs(args, options);
    return this.run(args, LONG_RUNNING_TIMEOUT);
  }

  /**
   * 将 cwd 设置为 localPath，对已有工作副本执行 svn update。
   */
  public async update(localPath: string, options: SvnCommandOptions = {}): Promise<RunSvnResult> {
    const args = ['update', '--non-interactive'];
    this.appendRevisionArgs(args, options.revision);
    this.appendCommonArgs(args, options);
    return this.run(args, { ...LONG_RUNNING_TIMEOUT, cwd: localPath });
  }

  /**
   * 从工作副本读取并解析 `svn info`。
   */
  public async info(localPath: string): Promise<SvnInfo> {
    const result = await this.run(['info'], { ...QUICK_TIMEOUT, cwd: localPath });
    return parseSvnInfo(result.stdout);
  }

  /**
   * 从工作副本读取并解析 `svn status`。
   */
  public async status(localPath: string): Promise<SvnStatusItem[]> {
    const result = await this.run(['status'], { ...NORMAL_TIMEOUT, cwd: localPath });
    return parseSvnStatus(result.stdout);
  }

  /**
   * 使用长任务默认超时配置，在工作副本中执行 `svn cleanup`。
   */
  public async cleanup(localPath: string): Promise<RunSvnResult> {
    return this.run(['cleanup'], { ...LONG_RUNNING_TIMEOUT, cwd: localPath });
  }

  /**
   * 返回原始 `svn log` 输出，并限制条目数量。
   */
  public async log(localPath: string, limit = 10): Promise<string> {
    const result = await this.run(['log', '--limit', String(limit)], { ...NORMAL_TIMEOUT, cwd: localPath });
    return result.stdout;
  }

  /**
   * 通过 `svn info` 判断 localPath 是否为 SVN 工作副本。
   */
  public async isWorkingCopy(localPath: string): Promise<boolean> {
    try {
      await this.info(localPath);
      return true;
    } catch (error) {
      if (error instanceof SvnError && error.type === SvnErrorType.NotWorkingCopy) {
        return false;
      }
      return false;
    }
  }

  /**
   * 通过共享的 runSvn 进程封装执行 SVN 命令。
   */
  private async run(args: string[], options: RunSvnOptions): Promise<RunSvnResult> {
    this.logger?.debug?.(`svn ${args.join(' ')}`);
    return runSvn(args, {
      ...this.runOptions,
      ...options,
      svnExecutable: this.svnExecutable
    });
  }

  /**
   * 请求固定版本时追加 `-r <revision>`。
   */
  private appendRevisionArgs(args: string[], revision?: number | string): void {
    if (revision !== undefined && String(revision).trim().length > 0) {
      args.push('-r', String(revision));
    }
  }

  /**
   * 追加 checkout/update 共用的认证和行为参数。
   */
  private appendCommonArgs(args: string[], options: SvnAuthOptions & { ignoreExternals?: boolean }): void {
    if (options.username) {
      args.push('--username', options.username);
    }

    if (options.password) {
      // 通过 --password 传参可能让密码暴露在系统进程参数中，优先使用 SVN 凭证缓存或 CI 密钥。
      args.push('--password', options.password);
    }

    if (options.noAuthCache) {
      args.push('--no-auth-cache');
    }

    if (options.ignoreExternals) {
      args.push('--ignore-externals');
    }
  }
}
