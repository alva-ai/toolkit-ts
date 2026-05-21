import { describe, it, expect } from 'vitest';
import { parseHtml } from '../../../src/lint/parser.js';
import { buildModel } from '../../../src/lint/model.js';
import { antiAliasingDeclarations } from '../../../src/lint/rules/anti-aliasing-declarations.js';
import type { Contract } from '../../../src/lint/types.js';

const CONTRACT: Contract = {
  version: 1,
  global: {
    requiredContainer: { selector: '.playbook-container', mustExist: true },
    scroll: { soleScrollContainer: ['body'] },
    typography: {
      fontFamilyRootMustInclude: 'Delight',
      fontWeightAllowed: [400, 500],
    },
    links: { anchorRequiredAttrs: ['target', 'rel'] },
    antiAliasing: {
      requiredDeclarations: [
        '-webkit-font-smoothing: antialiased',
        '-moz-osx-font-smoothing: grayscale',
        'text-rendering: optimizeLegibility',
      ],
    },
  },
  components: [],
};

const CONTRACT_NO_RULE: Contract = {
  version: 1,
  global: {
    requiredContainer: { selector: '.playbook-container', mustExist: true },
    scroll: { soleScrollContainer: ['body'] },
    typography: {
      fontFamilyRootMustInclude: 'Delight',
      fontWeightAllowed: [400, 500],
    },
    links: { anchorRequiredAttrs: ['target', 'rel'] },
  },
  components: [],
};

describe('anti-aliasing-declarations', () => {
  it('passes when all required declarations are present (any selector)', () => {
    const m = buildModel(
      parseHtml(`
        <style>
          body {
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }
          html {
            text-rendering: optimizeLegibility;
          }
        </style>
      `),
      CONTRACT
    );
    expect(antiAliasingDeclarations(m, CONTRACT)).toEqual([]);
  });

  it('errors once for each missing declaration', () => {
    const m = buildModel(
      parseHtml(`
        <style>
          body { -webkit-font-smoothing: antialiased; }
        </style>
      `),
      CONTRACT
    );
    const findings = antiAliasingDeclarations(m, CONTRACT);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.rule)).toEqual([
      'anti-aliasing-declarations',
      'anti-aliasing-declarations',
    ]);
  });

  it('no-op when contract has no anti-aliasing config', () => {
    const m = buildModel(parseHtml('<style></style>'), CONTRACT_NO_RULE);
    expect(antiAliasingDeclarations(m, CONTRACT_NO_RULE)).toEqual([]);
  });

  it('errors when declaration value differs', () => {
    const m = buildModel(
      parseHtml(`
        <style>
          body {
            -webkit-font-smoothing: subpixel-antialiased;
            -moz-osx-font-smoothing: grayscale;
            text-rendering: optimizeLegibility;
          }
        </style>
      `),
      CONTRACT
    );
    const findings = antiAliasingDeclarations(m, CONTRACT);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('-webkit-font-smoothing');
  });
});

describe('anti-aliasing-declarations — canonical CSS auto-pass', () => {
  const CONTRACT_WITH_CANONICAL: Contract = {
    ...CONTRACT,
    global: {
      ...CONTRACT.global,
      antiAliasing: {
        requiredDeclarations: ['-webkit-font-smoothing: antialiased'],
      },
      canonicalCssUrls: ['https://x.example/v1/full.css'],
    },
  };

  it('passes when canonical CSS is linked, even without the declarations inline', () => {
    const m = buildModel(
      parseHtml('<link rel="stylesheet" href="https://x.example/v1/full.css">'),
      CONTRACT_WITH_CANONICAL
    );
    expect(antiAliasingDeclarations(m, CONTRACT_WITH_CANONICAL)).toEqual([]);
  });

  it('still fails when canonical CSS is NOT linked and declarations are missing', () => {
    const m = buildModel(parseHtml('<body></body>'), CONTRACT_WITH_CANONICAL);
    expect(antiAliasingDeclarations(m, CONTRACT_WITH_CANONICAL)).toHaveLength(1);
  });
});
