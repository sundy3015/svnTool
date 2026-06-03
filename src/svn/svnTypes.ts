/**
 * 用于平台特定本地路径的 Node 平台标识。
 */
export type PlatformName = NodeJS.Platform;

/**
 * 本地路径配置。字符串会在所有平台使用；对象会按 process.platform 选择路径。
 */
export type PlatformPath = string | Partial<Record<NodeJS.Platform, string>>;

/**
 * 追加到 SVN 命令中的可选认证参数。
 */
export interface SvnAuthOptions {
  /** SVN 用户名。CI 中优先使用环境变量或凭证缓存。 */
  username?: string;
  /** SVN 密码。尽量避免写入配置文件。 */
  password?: string;
  /** 为 true 时向 svn 传递 --no-auth-cache。 */
  noAuthCache?: boolean;
}

/**
 * 可恢复网络/超时错误的重试策略。
 */
export interface RetryOptions {
  /** 首次失败后的重试次数。 */
  retries: number;
  /** 第一次重试前的等待时间，单位毫秒。 */
  delayMs: number;
  /** 每次重试后应用到等待时间上的倍率。默认 1。 */
  backoff?: number;
}

/**
 * svn.config.json 中的单个 SVN 资源项目配置。
 */
export interface SvnProjectConfig {
  /** CLI 命令使用的唯一项目名。 */
  name: string;
  /** 远端 SVN 仓库 URL。 */
  repoUrl: string;
  /** 本地 checkout/update 路径，可按平台配置。 */
  localPath: PlatformPath;
  /** 项目级用户名覆盖。 */
  username?: string;
  /** 项目级密码覆盖。优先考虑 SVN_PASSWORD 或凭证缓存。 */
  password?: string;
  /** checkout/update 的目标版本。undefined 表示 HEAD。 */
  revision?: number | string;
  /** 为该项目传递 --no-auth-cache。 */
  noAuthCache?: boolean;
  /** 为该项目传递 --ignore-externals。 */
  ignoreExternals?: boolean;
  /** svn status 存在任意本地变更时让同步失败。 */
  failOnLocalChanges?: boolean;
  /** 可恢复同步失败的重试策略。 */
  retry?: RetryOptions;
}

/**
 * 从 svn.config.json 读取的工具根配置。
 */
export interface SvnToolConfig {
  /** 可选的 svn 可执行文件路径。默认 "svn"。 */
  svnExecutable?: string;
  /** 工具管理的项目列表。 */
  projects: SvnProjectConfig[];
}

/**
 * 构造 checkout/update 命令参数时使用的选项。
 */
export interface SvnCommandOptions extends SvnAuthOptions {
  /** checkout/update 的目标版本。undefined 表示 HEAD。 */
  revision?: number | string;
  /** 为 true 时向 svn 传递 --ignore-externals。 */
  ignoreExternals?: boolean;
}

/**
 * 从 svn info 输出解析出的字段。
 */
export interface SvnInfo {
  workingCopyRootPath?: string;
  url?: string;
  relativeUrl?: string;
  repositoryRoot?: string;
  repositoryUuid?: string;
  revision?: number;
  nodeKind?: string;
  schedule?: string;
  lastChangedAuthor?: string;
  lastChangedRev?: number;
  lastChangedDate?: string;
}

/**
 * 从 svn status 输出解析出的一行状态。
 */
export interface SvnStatusItem {
  /** SVN 主状态字符，例如 M、A、D、C 或 ?。 */
  status: string;
  /** 从状态行中解析出的文件或目录路径。 */
  path: string;
  /** 未修改的原始状态行。 */
  raw: string;
}

/**
 * 单次同步操作的运行时选项，通常来自 CLI 参数。
 */
export interface SyncOptions {
  /** 只检查并报告计划动作，不执行 checkout/update/cleanup。 */
  dryRun?: boolean;
  /** 表示调用方正在生成 JSON 输出。 */
  jsonMode?: boolean;
  /** 运行时版本覆盖。 */
  revision?: number | string;
  /** 运行时 --no-auth-cache 覆盖。 */
  noAuthCache?: boolean;
  /** 运行时 --ignore-externals 覆盖。 */
  ignoreExternals?: boolean;
  /** 运行时本地变更策略覆盖。 */
  failOnLocalChanges?: boolean;
  /** 运行时重试策略覆盖。 */
  retry?: RetryOptions;
}

/**
 * 同时面向库调用方和 CLI JSON 输出的稳定同步结果。
 */
export interface SyncProjectResult {
  /** 同步完成或 dry-run 成功完成时为 true。 */
  success: boolean;
  /** 配置中的项目名。 */
  project: string;
  /** 被同步的仓库 URL。 */
  repoUrl: string;
  /** 解析后的本地绝对路径。 */
  localPath: string;
  /** 可获取时的最终工作副本版本。 */
  revision?: number;
  /** 已执行或将执行 checkout 时为 true。 */
  checkedOut?: boolean;
  /** 已执行或将执行 update 时为 true。 */
  updated?: boolean;
  /** 未执行任何会修改状态的 SVN 操作时为 true。 */
  dryRun?: boolean;
  /** 总同步耗时，单位毫秒。 */
  durationMs: number;
}
