import type { SvnInfo, SvnStatusItem } from './svnTypes.js';

/**
 * 将 svn info 的可读字段名映射为稳定的 camelCase API 字段。
 */
const infoKeyMap: Record<string, keyof SvnInfo> = {
  'Working Copy Root Path': 'workingCopyRootPath',
  URL: 'url',
  'Relative URL': 'relativeUrl',
  'Repository Root': 'repositoryRoot',
  'Repository UUID': 'repositoryUuid',
  Revision: 'revision',
  'Node Kind': 'nodeKind',
  Schedule: 'schedule',
  'Last Changed Author': 'lastChangedAuthor',
  'Last Changed Rev': 'lastChangedRev',
  'Last Changed Date': 'lastChangedDate'
};

/**
 * 将标准 `svn info` 文本输出解析为类型化对象。
 */
export function parseSvnInfo(stdout: string): SvnInfo {
  const info: SvnInfo = {};

  for (const line of stdout.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    const targetKey = infoKeyMap[key];
    if (!targetKey) {
      continue;
    }

    if (targetKey === 'revision' || targetKey === 'lastChangedRev') {
      const numericValue = Number.parseInt(value, 10);
      if (Number.isFinite(numericValue)) {
        info[targetKey] = numericValue;
      }
    } else {
      info[targetKey] = value;
    }
  }

  return info;
}

/**
 * 解析标准 `svn status` 文本输出。
 *
 * 第一个字符会作为主状态，原始行会保留下来用于诊断和 JSON 输出。
 */
export function parseSvnStatus(stdout: string): SvnStatusItem[] {
  return stdout
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const status = line[0] ?? ' ';
      const pathPart = line.length > 8 ? line.slice(8).trim() : line.slice(1).trim();
      return {
        status,
        path: pathPart,
        raw: line
      };
    });
}

/**
 * 任意状态项处于冲突状态时返回 true。
 */
export function hasConflict(items: SvnStatusItem[]): boolean {
  return items.some((item) => item.status === 'C');
}

/**
 * svn status 报告任意本地变更或未版本控制项时返回 true。
 */
export function hasLocalChanges(items: SvnStatusItem[]): boolean {
  return items.some((item) => item.status.trim().length > 0);
}
