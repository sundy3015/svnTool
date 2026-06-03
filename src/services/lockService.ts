import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SvnError, SvnErrorType } from '../core/svnError.js';

/**
 * 简单文件锁服务，用于防止多个进程同时操作同一个 localPath。
 *
 * 锁文件默认放在操作系统临时目录下，位于 Unity/SVN 工作副本之外，
 * 因此不会污染项目资源。
 */
export class LockService {
  private readonly lockDir: string;

  /**
   * 使用指定锁目录或系统临时目录创建锁服务。
   */
  public constructor(lockDir = path.join(os.tmpdir(), 'svn-tool-locks')) {
    this.lockDir = lockDir;
  }

  /**
   * 为 localPath 获取锁，并返回异步释放函数。
   */
  public async acquire(localPath: string): Promise<() => Promise<void>> {
    await fs.mkdir(this.lockDir, { recursive: true });
    const lockPath = this.getLockPath(localPath);
    const payload = JSON.stringify({
      pid: process.pid,
      localPath,
      createdAt: new Date().toISOString()
    }, null, 2);

    let handle: fs.FileHandle | undefined;
    try {
      handle = await fs.open(lockPath, 'wx');
      await handle.writeFile(payload, 'utf8');
    } catch (error) {
      const cause = error as NodeJS.ErrnoException;
      if (cause.code === 'EEXIST') {
        throw new SvnError(SvnErrorType.ConfigError, `该项目正在被其他进程操作：${localPath}`);
      }
      throw error;
    } finally {
      await handle?.close();
    }

    return async () => {
      try {
        await fs.unlink(lockPath);
      } catch (error) {
        const cause = error as NodeJS.ErrnoException;
        if (cause.code !== 'ENOENT') {
          throw error;
        }
      }
    };
  }

  /**
   * 根据 localPath 生成稳定锁文件路径，避免把路径分隔符嵌入文件名。
   */
  private getLockPath(localPath: string): string {
    const hash = crypto.createHash('sha1').update(localPath).digest('hex');
    return path.join(this.lockDir, `${hash}.lock`);
  }
}
