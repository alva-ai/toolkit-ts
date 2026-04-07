import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    target: 'node18',
  },
  {
    entry: { cli: 'src/cli/index.ts' },
    format: ['esm'],
    splitting: false,
    sourcemap: true,
    target: 'node18',
    banner: { js: '#!/usr/bin/env node' },
  },
  {
    entry: { browser: 'src/browser.ts' },
    format: ['iife'],
    globalName: 'AlvaToolkit',
    platform: 'browser',
    minify: true,
    sourcemap: true,
    dts: false,
  },
]);
