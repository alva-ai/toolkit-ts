// src/lint/parser.ts
import { parse as parseHtmlTree, HTMLElement } from 'node-html-parser';
import * as csstree from 'css-tree';
import type { DomModel, CssRule, InlineStyle } from './types.js';

function parseInlineStyle(str: string | undefined): Record<string, string> {
  if (!str) return {};
  const out: Record<string, string> = {};
  for (const part of str.split(';')) {
    const idx = part.indexOf(':');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

function parseStyleBlock(css: string): CssRule[] {
  const ast = csstree.parse(css);
  const rules: CssRule[] = [];
  csstree.walk(ast, (node) => {
    if (node.type === 'Rule') {
      const selectorText = csstree.generate(node.prelude);
      const declarations: Record<string, string> = {};
      node.block.children.forEach((decl) => {
        if (decl.type === 'Declaration') {
          declarations[decl.property] = csstree.generate(decl.value).trim();
        }
      });
      // Split comma-separated selectors so callers can match cleanly.
      for (const sel of selectorText.split(',').map((s) => s.trim())) {
        rules.push({ selectorText: sel, declarations });
      }
    }
  });
  return rules;
}

/**
 * Walk every element node in the parsed HTML tree in document order.
 * Used by parseHtml() AND model.ts to guarantee identical walk order
 * (so element-key alignment is preserved across the two passes).
 *
 * The optional `exit` callback fires after a node's children have been
 * visited — useful for stack-based subtree tracking.
 */
export function walkTree(
  rawHtml: string,
  visit: (el: HTMLElement, depth: number) => void,
  exit?: (el: HTMLElement, depth: number) => void
): void {
  const root = parseHtmlTree(rawHtml, {
    lowerCaseTagName: true,
    comment: false,
    blockTextElements: { style: true, script: true },
  });
  function rec(el: HTMLElement, depth: number): void {
    if (el.tagName) visit(el, depth);
    for (const child of el.childNodes) {
      if (child instanceof HTMLElement) rec(child, depth + 1);
    }
    if (el.tagName && exit) exit(el, depth);
  }
  rec(root as unknown as HTMLElement, 0);
}

export function parseHtml(rawHtml: string): DomModel {
  const elements: InlineStyle[] = [];
  let keyCounter = 0;
  walkTree(rawHtml, (el) => {
    const tag = el.tagName.toLowerCase();
    const classAttr = el.getAttribute('class') ?? '';
    const classes = classAttr.split(/\s+/).filter(Boolean);
    const attrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(el.attributes)) attrs[k] = v as string;
    elements.push({
      elementKey: `el-${keyCounter++}`,
      tag,
      attrs,
      classes,
      declarations: parseInlineStyle(attrs.style),
    });
  });

  // Re-parse for style extraction (separate concern; not in walkTree)
  const root = parseHtmlTree(rawHtml, {
    lowerCaseTagName: true,
    comment: false,
    blockTextElements: { style: true, script: true },
  });
  const cssRules: CssRule[] = [];
  for (const styleEl of root.querySelectorAll('style')) {
    cssRules.push(...parseStyleBlock(styleEl.textContent ?? ''));
  }

  return { elements, cssRules, rawHtml };
}
