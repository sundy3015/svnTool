import fs from 'node:fs/promises';
import path from 'node:path';
import { SvnError, SvnErrorType } from '../core/svnError.js';
import type { SvnProjectConfig, SvnToolConfig } from '../svn/svnTypes.js';

/**
 * 加载并校验 svn.config.json。
 *
 * 只有项目配置未显式提供 username/password 时，
 * 才会从 SVN_USERNAME/SVN_PASSWORD 环境变量补充。
 */
export async function loadSvnConfig(configPath = path.resolve(process.cwd(), 'svn.config.json')): Promise<SvnToolConfig> {
  let raw: string;
  try {
    raw = await fs.readFile(configPath, 'utf8');
  } catch (error) {
    const cause = error as NodeJS.ErrnoException;
    if (cause.code === 'ENOENT') {
      throw new SvnError(
        SvnErrorType.ConfigError,
        `未找到 svn.config.json，请复制 src/config/svn.config.example.json 到当前工作目录并按需修改。`,
        { cause }
      );
    }
    throw error;
  }

  const parsed = parseJsonObject(raw, configPath);
  const config = validateConfig(parsed);
  const envUsername = process.env.SVN_USERNAME;
  const envPassword = process.env.SVN_PASSWORD;

  return {
    svnExecutable: typeof config.svnExecutable === 'string' && config.svnExecutable.trim().length > 0
      ? config.svnExecutable
      : undefined,
    projects: config.projects.map((project) => ({
      ...project,
      username: project.username ?? envUsername,
      password: project.password ?? envPassword
    }))
  };
}

/**
 * 解析 JSON，并确保根节点是对象。
 */
function parseJsonObject(raw: string, configPath: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('root must be object');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new SvnError(SvnErrorType.ConfigError, `配置文件解析失败：${configPath}`, { cause: error });
  }
}

/**
 * 校验根配置结构，并规范化可选的 svnExecutable。
 */
function validateConfig(value: Record<string, unknown>): SvnToolConfig {
  const projectsValue = value.projects;
  if (!Array.isArray(projectsValue)) {
    throw new SvnError(SvnErrorType.ConfigError, 'svn.config.json 中 projects 必须是数组。');
  }

  const projects = projectsValue.map((project, index) => validateProject(project, index));
  return {
    svnExecutable: typeof value.svnExecutable === 'string' ? value.svnExecutable : undefined,
    projects
  };
}

/**
 * 校验配置文件中的单个项目条目。
 */
function validateProject(value: unknown, index: number): SvnProjectConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SvnError(SvnErrorType.ConfigError, `projects[${index}] 必须是对象。`);
  }

  const record = value as Record<string, unknown>;
  if (typeof record.name !== 'string' || record.name.trim().length === 0) {
    throw new SvnError(SvnErrorType.ConfigError, `projects[${index}].name 必须是非空字符串。`);
  }
  if (typeof record.repoUrl !== 'string' || record.repoUrl.trim().length === 0) {
    throw new SvnError(SvnErrorType.ConfigError, `projects[${index}].repoUrl 必须是非空字符串。`);
  }
  if (!isPlatformPath(record.localPath)) {
    throw new SvnError(SvnErrorType.ConfigError, `projects[${index}].localPath 配置无效。`);
  }

  return {
    name: record.name,
    repoUrl: record.repoUrl,
    localPath: record.localPath,
    username: typeof record.username === 'string' ? record.username : undefined,
    password: typeof record.password === 'string' ? record.password : undefined,
    revision: typeof record.revision === 'string' || typeof record.revision === 'number' ? record.revision : undefined,
    noAuthCache: typeof record.noAuthCache === 'boolean' ? record.noAuthCache : undefined,
    ignoreExternals: typeof record.ignoreExternals === 'boolean' ? record.ignoreExternals : undefined,
    failOnLocalChanges: typeof record.failOnLocalChanges === 'boolean' ? record.failOnLocalChanges : undefined,
    retry: isRetryOptions(record.retry) ? record.retry : undefined
  };
}

/**
 * 判断 localPath 是否符合 resolvePlatformPath 接受的类型。
 */
function isPlatformPath(value: unknown): value is SvnProjectConfig['localPath'] {
  if (typeof value === 'string') {
    return true;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return Object.values(value as Record<string, unknown>).every((item) => typeof item === 'string');
}

/**
 * 判断 JSON 配置中的 retry 是否为有效重试策略对象。
 */
function isRetryOptions(value: unknown): value is NonNullable<SvnProjectConfig['retry']> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.retries === 'number' && typeof record.delayMs === 'number' &&
    (record.backoff === undefined || typeof record.backoff === 'number');
}
