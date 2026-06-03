import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const assets = [
  {
    from: 'src/config/svn.config.example.json',
    to: 'dist/config/svn.config.example.json'
  }
];

for (const asset of assets) {
  const target = resolve(asset.to);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(asset.from), target);
}
