import { describe, expect, it } from 'vitest';
import { hasLocalChanges, parseSvnInfo, parseSvnStatus } from '../src/svn/svnParser.js';

describe('svnParser', () => {
  it('parses svn info output', () => {
    const info = parseSvnInfo([
      'Working Copy Root Path: /repo/project',
      'URL: https://svn.example.com/project/trunk',
      'Revision: 12345',
      'Last Changed Rev: 12340'
    ].join('\n'));

    expect(info.workingCopyRootPath).toBe('/repo/project');
    expect(info.url).toBe('https://svn.example.com/project/trunk');
    expect(info.revision).toBe(12345);
    expect(info.lastChangedRev).toBe(12340);
  });

  it('parses svn status output', () => {
    const items = parseSvnStatus([
      'M       Assets/a.txt',
      'A       Assets/b.txt',
      'D       Assets/c.txt',
      'C       Assets/conflict.prefab',
      '?       Temp/test.txt'
    ].join('\n'));

    expect(items.map((item) => item.status)).toEqual(['M', 'A', 'D', 'C', '?']);
    expect(items[0]).toEqual({
      status: 'M',
      path: 'Assets/a.txt',
      raw: 'M       Assets/a.txt'
    });
    expect(hasLocalChanges(items)).toBe(true);
  });
});
