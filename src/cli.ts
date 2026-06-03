#!/usr/bin/env node
import { Command } from 'commander';
import { ConsoleLogger } from './core/logger.js';
import { getSvnNotInstalledMessage, SvnError, SvnErrorType } from './core/svnError.js';
import { loadSvnConfig } from './config/svnConfig.js';
import { SvnClient } from './svn/svnClient.js';
import { hasConflict, hasLocalChanges } from './svn/svnParser.js';
import type { RetryOptions, SvnProjectConfig, SyncOptions } from './svn/svnTypes.js';
import { SvnProjectService } from './services/svnProjectService.js';
import { outputJson, safeErrorMessage } from './utils/jsonOutput.js';
import { resolvePlatformPath } from './utils/pathUtils.js';

/**
 * 所有 CLI 命令共享的选项。
 */
interface GlobalOptions {
  json?: boolean;
  quiet?: boolean;
}

/**
 * sync 命令接受的选项。
 */
interface SyncCliOptions extends GlobalOptions {
  dryRun?: boolean;
  revision?: string;
  noAuthCache?: boolean;
  ignoreExternals?: boolean;
  failOnLocalChanges?: boolean;
  retries?: string;
}

/**
 * svn-tool 可执行文件使用的 Commander 根程序。
 */
const program = new Command();

program
  .name('svn-tool')
  .description('Stable async SVN toolkit for large Unity resource projects.')
  .option('--json', 'output final JSON to stdout')
  .option('--quiet', 'reduce logs');

program
  .command('version')
  .description('check svn version')
  .action(async () => {
    const options = program.opts<GlobalOptions>();
    await handleCommand('version', undefined, options, async () => {
      const client = createClient(undefined, options);
      const version = await client.checkVersion();
      return {
        success: true,
        command: 'version',
        version,
        platform: process.platform
      };
    });
  });

program
  .command('sync [projectName]')
  .description('sync all projects or one project')
  .option('--dry-run', 'check only, do not checkout/update/cleanup')
  .option('--revision <rev>', 'sync to specified revision')
  .option('--no-auth-cache', 'pass --no-auth-cache to svn')
  .option('--ignore-externals', 'pass --ignore-externals to svn')
  .option('--fail-on-local-changes', 'fail when local status is not clean')
  .option('--retries <count>', 'retry count for retryable network/timeout errors')
  .action(async (projectName: string | undefined, commandOptions: SyncCliOptions) => {
    const options = mergeOptions(commandOptions);
    await handleCommand('sync', projectName, options, async () => {
      const config = await loadSvnConfig();
      const client = createClient(config.svnExecutable, options, true);
      const service = new SvnProjectService(client, {
        logger: new ConsoleLogger({ quiet: options.quiet })
      });
      const projects = selectProjects(config.projects, projectName);
      const syncOptions = toSyncOptions(options);
      const results = [];

      for (const project of projects) {
        results.push(await service.syncProject(project, syncOptions));
      }

      return projectName ? {
        command: 'sync',
        ...results[0]
      } : {
        success: true,
        command: 'sync',
        projects: results
      };
    });
  });

program
  .command('info <projectName>')
  .description('show svn info')
  .action(async (projectName: string) => {
    const options = program.opts<GlobalOptions>();
    await handleCommand('info', projectName, options, async () => {
      const config = await loadSvnConfig();
      const project = findProject(config.projects, projectName);
      const client = createClient(config.svnExecutable, options);
      const info = await client.info(resolvePlatformPath(project.localPath));
      return {
        success: true,
        command: 'info',
        project: project.name,
        info
      };
    });
  });

program
  .command('status <projectName>')
  .description('show svn status')
  .action(async (projectName: string) => {
    const options = program.opts<GlobalOptions>();
    await handleCommand('status', projectName, options, async () => {
      const config = await loadSvnConfig();
      const project = findProject(config.projects, projectName);
      const client = createClient(config.svnExecutable, options);
      const items = await client.status(resolvePlatformPath(project.localPath));
      return {
        success: true,
        command: 'status',
        project: project.name,
        items,
        hasConflict: hasConflict(items),
        hasLocalChanges: hasLocalChanges(items)
      };
    });
  });

program
  .command('cleanup <projectName>')
  .description('run svn cleanup')
  .action(async (projectName: string) => {
    const options = program.opts<GlobalOptions>();
    await handleCommand('cleanup', projectName, options, async () => {
      const config = await loadSvnConfig();
      const project = findProject(config.projects, projectName);
      const client = createClient(config.svnExecutable, options, true);
      const result = await client.cleanup(resolvePlatformPath(project.localPath));
      return {
        success: true,
        command: 'cleanup',
        project: project.name,
        durationMs: result.durationMs
      };
    });
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  process.exitCode = exitCodeForError(error);
  process.stderr.write(`${safeErrorMessage(error)}\n`);
});

/**
 * 创建按 human 或 JSON CLI 输出模式配置好的 SvnClient。
 */
function createClient(svnExecutable: string | undefined, options: GlobalOptions, streamSvnOutput = false): SvnClient {
  const jsonMode = options.json ?? false;
  return new SvnClient({
    svnExecutable,
    logger: new ConsoleLogger({ quiet: options.quiet }),
    runOptions: {
      printCommand: !options.quiet && !jsonMode,
      printStdout: streamSvnOutput && !jsonMode,
      printStderr: streamSvnOutput,
      stderrStream: jsonMode && streamSvnOutput ? process.stderr : undefined
    }
  });
}

/**
 * 包装命令动作，统一处理 JSON 输出、stderr 日志和退出码映射。
 */
async function handleCommand(
  command: string,
  project: string | undefined,
  options: GlobalOptions,
  action: () => Promise<Record<string, unknown>>
): Promise<void> {
  try {
    const result = await action();
    process.exitCode = 0;
    if (options.json) {
      outputJson(result);
    } else if (!options.quiet) {
      process.stderr.write(`${command} success\n`);
    } else if (command === 'version' && typeof result.version === 'string') {
      process.stdout.write(`${result.version}\n`);
    }
  } catch (error) {
    process.exitCode = exitCodeForError(error);
    const payload = {
      success: false,
      command,
      project,
      errorType: error instanceof SvnError ? error.type : SvnErrorType.Unknown,
      message: error instanceof SvnError && error.type === SvnErrorType.NotInstalled
        ? getSvnNotInstalledMessage()
        : safeErrorMessage(error)
    };

    if (options.json) {
      outputJson(payload);
    }

    process.stderr.write(`[ERROR] ${payload.message}\n`);
  }
}

/**
 * 合并根选项和子命令选项，因为 commander 会分开保存它们。
 */
function mergeOptions(commandOptions: SyncCliOptions): SyncCliOptions {
  const globalOptions = program.opts<GlobalOptions>();
  return {
    ...globalOptions,
    ...commandOptions
  };
}

/**
 * 将 CLI 原始字符串/布尔值转换为服务层同步选项。
 */
function toSyncOptions(options: SyncCliOptions): SyncOptions {
  const retry = parseRetry(options.retries);
  return {
    dryRun: options.dryRun,
    jsonMode: options.json,
    revision: options.revision,
    noAuthCache: options.noAuthCache,
    ignoreExternals: options.ignoreExternals,
    failOnLocalChanges: options.failOnLocalChanges,
    retry
  };
}

/**
 * 将 --retries 解析为同步操作使用的重试策略。
 */
function parseRetry(value: string | undefined): RetryOptions | undefined {
  if (value === undefined) {
    return undefined;
  }
  const retries = Number.parseInt(value, 10);
  if (!Number.isFinite(retries) || retries < 0) {
    throw new SvnError(SvnErrorType.ConfigError, '--retries 必须是大于等于 0 的整数。');
  }
  return {
    retries,
    delayMs: 3000,
    backoff: 2
  };
}

/**
 * 返回全部已配置项目，或返回指定的单个项目。
 */
function selectProjects(projects: SvnProjectConfig[], projectName?: string): SvnProjectConfig[] {
  if (!projectName) {
    return projects;
  }
  return [findProject(projects, projectName)];
}

/**
 * 按名称查找已配置项目，找不到时抛出配置错误。
 */
function findProject(projects: SvnProjectConfig[], projectName: string): SvnProjectConfig {
  const project = projects.find((item) => item.name === projectName);
  if (!project) {
    throw new SvnError(SvnErrorType.ConfigError, `未找到 SVN 项目配置：${projectName}`);
  }
  return project;
}

/**
 * 将类型化 SVN 错误映射为稳定的进程退出码。
 */
function exitCodeForError(error: unknown): number {
  if (!(error instanceof SvnError)) {
    return 1;
  }

  switch (error.type) {
    case SvnErrorType.ConfigError:
    case SvnErrorType.NotWorkingCopy:
      return 2;
    case SvnErrorType.NotInstalled:
      return 3;
    case SvnErrorType.Conflict:
      return 4;
    case SvnErrorType.Cancelled:
      return 130;
    default:
      return 1;
  }
}
