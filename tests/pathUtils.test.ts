import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SvnError, SvnErrorType } from '../src/core/svnError.js';
import { resolvePlatformPath } from '../src/utils/pathUtils.js';

describe('resolvePlatformPath', () => {
  it('resolves string path', () => {
    expect(resolvePlatformPath('abc')).toBe(path.resolve('abc'));
  });

  it('resolves current platform path', () => {
    expect(resolvePlatformPath({ [process.platform]: 'platform-path' })).toBe(path.resolve('platform-path'));
  });

  it('throws config error when platform path is missing', () => {
    expect(() => resolvePlatformPath({ aix: '/tmp/aix' })).toThrow(SvnError);
    try {
      resolvePlatformPath({ aix: '/tmp/aix' });
    } catch (error) {
      expect(error).toBeInstanceOf(SvnError);
      expect((error as SvnError).type).toBe(SvnErrorType.ConfigError);
    }
  });
});
