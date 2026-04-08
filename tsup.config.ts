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
  },
  {
    entry: { cli: 'src/cli/index.ts' },
    format: ['esm'],
    splitting: false,
    sourcemap: true,
    target: 'node18',
    banner: { js: '#!/usr/bin/env node' },
    define,
  },
  {
    entry: { browser: 'src/browser.ts' },
    format: ['iife'],
    globalName: 'AlvaToolkit',
    platform: 'browser',
    minify: true,
    sourcemap: true,
    dts: false,
    define,
  },
]);
