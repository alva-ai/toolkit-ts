import { describe, it, expect } from 'vitest';
import { parseHtml } from '../../../src/lint/parser.js';
import { buildModel } from '../../../src/lint/model.js';
import { requiredStylesheet } from '../../../src/lint/rules/required-stylesheet.js';
import type { Contract } from '../../../src/lint/types.js';

const CDN_URL =
  'https://alva-ai-static.b-cdn.net/design-system/design-tokens.css';

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
    requiredStylesheets: [{ url: CDN_URL }],
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

describe('required-stylesheet', () => {
  it('passes when the required <link rel="stylesheet"> is present', () => {
    const m = buildModel(
      parseHtml(
        `<html><head><link rel="stylesheet" href="${CDN_URL}" /></head><body></body></html>`
      ),
      CONTRACT
    );
    expect(requiredStylesheet(m, CONTRACT)).toEqual([]);
  });

  it('errors when the stylesheet link is missing', () => {
    const m = buildModel(
      parseHtml('<html><head></head><body></body></html>'),
      CONTRACT
    );
    const findings = requiredStylesheet(m, CONTRACT);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe('required-stylesheet');
    expect(findings[0]!.message).toContain(CDN_URL);
  });

  it('errors when <link> exists but rel is not stylesheet', () => {
    const m = buildModel(
      parseHtml(
        `<html><head><link rel="preload" href="${CDN_URL}" /></head><body></body></html>`
      ),
      CONTRACT
    );
    expect(requiredStylesheet(m, CONTRACT)).toHaveLength(1);
  });

  it('no-op when contract has no required-stylesheets', () => {
    const m = buildModel(
      parseHtml('<html><head></head><body></body></html>'),
      CONTRACT_NO_RULE
    );
    expect(requiredStylesheet(m, CONTRACT_NO_RULE)).toEqual([]);
  });
});
