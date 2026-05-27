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

  it('passes (legacy trust-the-link) when bundleCss is not resolved', () => {
    // Backwards compat: contract built without orchestrator never has bundleCss.
    const m = buildModel(
      parseHtml('<link rel="stylesheet" href="https://x.example/v1/full.css">'),
      CONTRACT_WITH_CANONICAL
    );
    expect(antiAliasingDeclarations(m, CONTRACT_WITH_CANONICAL)).toEqual([]);
  });

  it('still fails when canonical CSS is NOT linked and declarations are missing', () => {
    const m = buildModel(parseHtml('<body></body>'), CONTRACT_WITH_CANONICAL);
    expect(antiAliasingDeclarations(m, CONTRACT_WITH_CANONICAL)).toHaveLength(
      1
    );
  });
});

describe('anti-aliasing-declarations — bundle verification', () => {
  const ALL_THREE = [
    '-webkit-font-smoothing: antialiased',
    '-moz-osx-font-smoothing: grayscale',
    'text-rendering: optimizeLegibility',
  ];

  const CONTRACT_WITH_CANONICAL_AND_BUNDLE = (bundleCss: string): Contract => ({
    ...CONTRACT,
    global: {
      ...CONTRACT.global,
      antiAliasing: { requiredDeclarations: ALL_THREE },
      canonicalCssUrls: ['https://x.example/v1/full.css'],
    },
    bundleCss,
  });

  it('passes when canonical is linked AND bundle declares all required AA rules', () => {
    const bundle = `
      body {
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-rendering: optimizeLegibility;
      }
    `;
    const c = CONTRACT_WITH_CANONICAL_AND_BUNDLE(bundle);
    const m = buildModel(
      parseHtml('<link rel="stylesheet" href="https://x.example/v1/full.css">'),
      c
    );
    expect(antiAliasingDeclarations(m, c)).toEqual([]);
  });

  it('errors for each AA declaration the bundle is missing', () => {
    // Bundle ships only one of the three required declarations
    const bundle = `body { -webkit-font-smoothing: antialiased; }`;
    const c = CONTRACT_WITH_CANONICAL_AND_BUNDLE(bundle);
    const m = buildModel(
      parseHtml('<link rel="stylesheet" href="https://x.example/v1/full.css">'),
      c
    );
    const findings = antiAliasingDeclarations(m, c);
    expect(findings).toHaveLength(2);
    for (const f of findings) {
      expect(f.message).toMatch(/bundle/i);
      expect(f.message).toMatch(/drifted/i);
    }
    const missing = findings.map((f) => f.message);
    expect(missing.some((m) => m.includes('-moz-osx-font-smoothing'))).toBe(
      true
    );
    expect(missing.some((m) => m.includes('text-rendering'))).toBe(true);
  });

  it('accepts the declaration on any selector (not only body) — same lenience as inline', () => {
    const bundle = `
      .anywhere { -webkit-font-smoothing: antialiased; }
      html { -moz-osx-font-smoothing: grayscale; }
      .foo, .bar { text-rendering: optimizeLegibility; }
    `;
    const c = CONTRACT_WITH_CANONICAL_AND_BUNDLE(bundle);
    const m = buildModel(
      parseHtml('<link rel="stylesheet" href="https://x.example/v1/full.css">'),
      c
    );
    expect(antiAliasingDeclarations(m, c)).toEqual([]);
  });

  it('errors when bundle has the property with the wrong value', () => {
    const bundle = `body {
      -webkit-font-smoothing: subpixel-antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
    }`;
    const c = CONTRACT_WITH_CANONICAL_AND_BUNDLE(bundle);
    const m = buildModel(
      parseHtml('<link rel="stylesheet" href="https://x.example/v1/full.css">'),
      c
    );
    const findings = antiAliasingDeclarations(m, c);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('-webkit-font-smoothing');
  });
});
