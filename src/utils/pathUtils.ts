import path from 'node:path';
import { SvnError, SvnErrorType } from '../core/svnError.js';
import type { PlatformPath } from '../svn/svnTypes.js';

/**
 * 将字符串或平台特定 localPath 解析为绝对路径。
 */
export function resolvePlatformPath(localPath: PlatformPath): string {
  if (typeof localPath === 'string') {
    return path.resolve(localPath);
  }

  const platformPath = localPath[process.platform];
  if (!platformPath) {
    throw new SvnError(
      SvnErrorType.ConfigError,
      `当前平台 ${process.platform} 未配置 localPath，请在 svn.config.json 中添加对应平台路径。`
    );
  }

  return path.resolve(platformPath);
}
