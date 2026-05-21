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
