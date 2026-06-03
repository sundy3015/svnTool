import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { runSvn, sanitizeSvnArgs } from '../src/core/runSvn.js';
import { SvnError, SvnErrorType } from '../src/core/svnError.js';

const nodeExecutable = process.execPath;

describe('runSvn', () => {
  it('sanitizes password args', () => {
    expect(sanitizeSvnArgs(['checkout', 'url', 'path', '--username', 'abc', '--password', '123456'])).toEqual([
      'checkout',
      'url',
      'path',
      '--username',
      'abc',
      '--password',
      '******'
    ]);
  });

  it('resolves stdout stderr and duration', async () => {
    const result = await runSvn(['-e', "console.log('out'); console.error('err');"], {
      svnExecutable: nodeExecutable
    });

    expect(result.stdout).toContain('out');
    expect(result.stderr).toContain('err');
    expect(result.code).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('limits captured bytes', async () => {
    const result = await runSvn(['-e', "process.stdout.write('1234567890');"], {
      svnExecutable: nodeExecutable,
      maxCaptureBytes: 4
    });

    expect(result.stdout).toBe('7890');
  });

  it('rejects when aborted before start', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(runSvn(['-e', ''], {
      svnExecutable: nodeExecutable,
      signal: controller.signal
    })).rejects.toMatchObject({ type: SvnErrorType.Cancelled });
  });

  it('rejects when aborted during execution', async () => {
    const controller = new AbortController();
    const promise = runSvn(['-e', 'setTimeout(() => {}, 5000);'], {
      svnExecutable: nodeExecutable,
      signal: controller.signal
    });

    setTimeout(() => controller.abort(), 50);

    await expect(promise).rejects.toMatchObject({ type: SvnErrorType.Cancelled });
  });

  it('rejects on idle timeout', async () => {
    await expect(runSvn(['-e', 'setTimeout(() => {}, 5000);'], {
      svnExecutable: nodeExecutable,
      idleTimeout: 50
    })).rejects.toMatchObject({ type: SvnErrorType.Timeout });
  });

  it('writes to streams and callbacks', async () => {
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    const callbackChunks: string[] = [];

    await runSvn(['-e', "process.stdout.write('abc');"], {
      svnExecutable: nodeExecutable,
      stdoutStream: stream,
      onStdout: (data) => callbackChunks.push(data)
    });

    expect(Buffer.concat(chunks).toString('utf8')).toBe('abc');
    expect(callbackChunks.join('')).toBe('abc');
  });

  it('rejects non-zero code as SvnError', async () => {
    await expect(runSvn(['-e', "console.error('network error'); process.exit(2);"], {
      svnExecutable: nodeExecutable
    })).rejects.toBeInstanceOf(SvnError);
  });
});
