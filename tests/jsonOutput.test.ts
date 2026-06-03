import { describe, expect, it, vi } from 'vitest';
import { logError, logInfo, logWarn, outputJson } from '../src/utils/jsonOutput.js';

describe('jsonOutput', () => {
  it('writes json to stdout only', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    outputJson({ success: true });

    expect(stdout).toHaveBeenCalledWith('{\n  "success": true\n}\n');
    expect(stderr).not.toHaveBeenCalled();
    stdout.mockRestore();
    stderr.mockRestore();
  });

  it('writes logs to stderr only', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    logInfo('a');
    logWarn('b');
    logError('c');

    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledTimes(3);
    stdout.mockRestore();
    stderr.mockRestore();
  });
});
