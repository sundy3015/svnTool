# svn-tool

Stable async SVN toolkit and CLI for large Unity resource projects.

## Install from local package

```bash
npm install ./svn-tool-0.1.0.tgz
```

## Use as CLI

```bash
npx svn-tool version
npx svn-tool sync HotUpdateAssets --json
```

## Use as library

```ts
import { SvnClient } from 'svn-tool';

const client = new SvnClient();
const version = await client.checkVersion();
console.log(version);
```

Copy `dist/config/svn.config.example.json` or `src/config/svn.config.example.json` to `svn.config.json` before running project sync commands.
