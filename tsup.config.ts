import { copyFile } from 'node:fs/promises';
import { defineConfig } from 'tsup';
import pkg from './package.json';

const define = { __VERSION__: JSON.stringify(pkg.version) };

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    target: 'node18',
    define,
    external: ['css-tree', 'yaml'],
    // 1.x has no browser entry: dist/browser.global.js stays the published
    // 0.36.0 bundle, so unversioned unpkg URLs in Playbook pages keep working.
    async onSuccess() {
      await copyFile('legacy/browser-0.36.global.js', 'dist/browser.global.js');
    },
  },
  {
    entry: { cli: 'src/cli/index.ts' },
    format: ['esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    target: 'node18',
    banner: { js: '#!/usr/bin/env node' },
    define,
    external: ['css-tree', 'yaml'],
  },
  {
    entry: { dispatch: 'src/cli/embeddedDispatch.ts' },
    format: ['esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    target: 'es2022',
    platform: 'browser',
    define,
    external: ['css-tree', 'yaml'],
  },
]);
