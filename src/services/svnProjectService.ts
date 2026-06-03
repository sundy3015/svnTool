import fs from 'node:fs/promises';
import type { Logger } from '../core/logger.js';
import { SvnError, SvnErrorType, isRetryableSvnError } from '../core/svnError.js';
import { hasConflict, hasLocalChanges } from '../svn/svnParser.js';
import { SvnClient } from '../svn/svnClient.js';
import type { RetryOptions, SvnCommandOptions, SvnProjectConfig, SyncOptions, SyncProjectResult } from '../svn/svnTypes.js';
import { resolvePlatformPath } from '../utils/pathUtils.js';
import { LockService } from './lockService.js';

/**
 * 协调整个项目级 SVN 安全同步流程。
 *
 * 该服务负责判断 checkout/update、变更前检查 status、拦截冲突、
 * 重试可恢复错误，并用工具级锁保护每个 localPath。
 */
export class SvnProjectService {
  private readonly lockService: LockService;

  /**
   * 使用 SvnClient 以及可选日志器/锁服务创建项目同步服务。
   */
  public constructor(
    private readonly svnClient: SvnClient,
    private readonly options: { logger?: Logger; lockService?: LockService } = {}
  ) {
    this.lockService = options.lockService ?? new LockService();
  }

  /**
   * 同步一个已配置的项目。
   *
   * dry-run 模式只执行检查，不会运行 checkout/update/cleanup。
   */
  public async syncProject(project: SvnProjectConfig, options: SyncOptions = {}): Promise<SyncProjectResult> {
    const startedAt = Date.now();
    const localPath = resolvePlatformPath(project.localPath);
    const commandOptions = this.getCommandOptions(project, options);
    const release = await this.lockService.acquire(localPath);

    try {
      this.options.logger?.info(`checking ${project.name}: ${localPath}`);
      const exists = await pathExists(localPath);

      if (!exists) {
        if (options.dryRun) {
          this.options.logger?.info(`[dry-run] checkout ${project.name}`);
          return this.result(project, localPath, startedAt, { checkedOut: true, dryRun: true });
        }

        this.options.logger?.info(`checkout ${project.name}`);
        await this.withRetry(() => this.svnClient.checkout(project.repoUrl, localPath, commandOptions), this.getRetryOptions(project, options));
        const info = await this.svnClient.info(localPath);
        return this.result(project, localPath, startedAt, { checkedOut: true, revision: info.revision });
      }

      const isWorkingCopy = await this.svnClient.isWorkingCopy(localPath);
      if (!isWorkingCopy) {
        throw new SvnError(
          SvnErrorType.NotWorkingCopy,
          '目录已存在，但不是 SVN 工作副本，请删除该目录或重新选择路径。'
        );
      }

      this.options.logger?.info(`status ${project.name}`);
      const statusItems = await this.svnClient.status(localPath);
      if (hasConflict(statusItems)) {
        throw new SvnError(SvnErrorType.Conflict, '检测到 SVN 冲突，请先解决冲突后再同步。');
      }

      const failOnLocalChanges = options.failOnLocalChanges ?? project.failOnLocalChanges ?? false;
      if (failOnLocalChanges && hasLocalChanges(statusItems)) {
        throw new SvnError(SvnErrorType.Conflict, '检测到本地修改，已根据 failOnLocalChanges 阻止同步。');
      }

      if (options.dryRun) {
        this.options.logger?.info(`[dry-run] update ${project.name}`);
        const info = await this.svnClient.info(localPath);
        return this.result(project, localPath, startedAt, { updated: true, dryRun: true, revision: info.revision });
      }

      this.options.logger?.info(`update ${project.name}`);
      await this.updateWithCleanupRetry(localPath, commandOptions, this.getRetryOptions(project, options));
      this.options.logger?.info(`info ${project.name}`);
      const info = await this.svnClient.info(localPath);
      return this.result(project, localPath, startedAt, { updated: true, revision: info.revision });
    } finally {
      await release();
    }
  }

  /**
   * 执行 update，并处理 working-copy-locked 的特殊恢复流程。
   */
  private async updateWithCleanupRetry(localPath: string, options: SvnCommandOptions, retry?: RetryOptions): Promise<void> {
    try {
      await this.withRetry(() => this.svnClient.update(localPath, options), retry);
    } catch (error) {
      if (error instanceof SvnError && error.type === SvnErrorType.WorkingCopyLocked) {
        this.options.logger?.warn('working copy locked, running svn cleanup then retry update once.');
        await this.svnClient.cleanup(localPath);
        await this.svnClient.update(localPath, options);
        return;
      }
      throw error;
    }
  }

  /**
   * 仅在抛出的错误可恢复时重试操作。
   */
  private async withRetry<T>(operation: () => Promise<T>, retry?: RetryOptions): Promise<T> {
    const retries = Math.max(0, retry?.retries ?? 0);
    const delayMs = Math.max(0, retry?.delayMs ?? 3000);
    const backoff = retry?.backoff ?? 1;
    let attempt = 0;
    let currentDelay = delayMs;

    while (true) {
      try {
        return await operation();
      } catch (error) {
        if (attempt >= retries || !isRetryableSvnError(error)) {
          throw error;
        }
        attempt += 1;
        this.options.logger?.warn(`SVN 可恢复错误，${currentDelay}ms 后重试第 ${attempt} 次。`);
        await sleep(currentDelay);
        currentDelay = Math.floor(currentDelay * backoff);
      }
    }
  }

  /**
   * 合并项目级命令设置和运行时同步覆盖项。
   */
  private getCommandOptions(project: SvnProjectConfig, options: SyncOptions): SvnCommandOptions {
    return {
      username: project.username,
      password: project.password,
      revision: options.revision ?? project.revision,
      noAuthCache: options.noAuthCache ?? project.noAuthCache,
      ignoreExternals: options.ignoreExternals ?? project.ignoreExternals
    };
  }

  /**
   * 选择当前同步操作实际使用的重试策略。
   */
  private getRetryOptions(project: SvnProjectConfig, options: SyncOptions): RetryOptions | undefined {
    return options.retry ?? project.retry;
  }

  /**
   * 创建库调用方和 CLI JSON 输出共用的稳定同步结果对象。
   */
  private result(
    project: SvnProjectConfig,
    localPath: string,
    startedAt: number,
    details: { revision?: number; checkedOut?: boolean; updated?: boolean; dryRun?: boolean }
  ): SyncProjectResult {
    return {
      success: true,
      project: project.name,
      repoUrl: project.repoUrl,
      localPath,
      revision: details.revision,
      checkedOut: details.checkedOut ?? false,
      updated: details.updated ?? false,
      dryRun: details.dryRun ?? false,
      durationMs: Date.now() - startedAt
    };
  }
}

/**
 * 检查文件系统路径是否存在，不需要列目录。
 */
async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    const cause = error as NodeJS.ErrnoException;
    if (cause.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/**
 * 在 delayMs 后 resolve，用于重试退避。
 */
function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
