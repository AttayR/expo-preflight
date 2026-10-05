import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;

export default defineConfig([
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    target: 'node18',
    clean: true,
    define: { __VERSION__: JSON.stringify(version) },
    banner: { js: '#!/usr/bin/env node' },
  },
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    target: 'node18',
    dts: true,
  },
]);
