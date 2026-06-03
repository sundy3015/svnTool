import { describe, expect, it } from 'vitest';
import { sanitizeSvnArgs } from '../src/core/runSvn.js';

describe('svn command args', () => {
  it('documents revision and auth args without leaking passwords', () => {
    const args = ['update', '--non-interactive', '-r', '123', '--password', 'secret', '--ignore-externals'];
    expect(sanitizeSvnArgs(args)).toEqual(['update', '--non-interactive', '-r', '123', '--password', '******', '--ignore-externals']);
  });
});
