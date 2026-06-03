import { describe, expect, it } from 'vitest';
import { parseSvnError, SvnErrorType } from '../src/core/svnError.js';

describe('parseSvnError', () => {
  it.each([
    ['ENOENT spawn svn', SvnErrorType.NotInstalled],
    ['authentication failed', SvnErrorType.AuthFailed],
    ['working copy locked', SvnErrorType.WorkingCopyLocked],
    ['tree conflict', SvnErrorType.Conflict],
    ['network error: connection reset', SvnErrorType.NetworkError],
    ['idle timeout after 1000ms', SvnErrorType.Timeout],
    ['operation cancelled', SvnErrorType.Cancelled]
  ])('parses %s', (message, expected) => {
    expect(parseSvnError(message)).toBe(expected);
  });
});
