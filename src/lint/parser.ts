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

let keyCounter = 0;

function walkElements(
  el: HTMLElement,
  out: InlineStyle[]
): void {
  if (el.tagName) {
    const tag = el.tagName.toLowerCase();
    const classAttr = el.getAttribute('class') ?? '';
    const classes = classAttr.split(/\s+/).filter(Boolean);
    const attrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(el.attributes)) attrs[k] = v as string;
    out.push({
      elementKey: `el-${keyCounter++}`,
      tag,
      attrs,
      classes,
      declarations: parseInlineStyle(attrs.style),
    });
  }
  for (const child of el.childNodes) {
    if (child instanceof HTMLElement) walkElements(child, out);
  }
}

export function parseHtml(rawHtml: string): DomModel {
  const root = parseHtmlTree(rawHtml, {
    lowerCaseTagName: true,
    comment: false,
    blockTextElements: { style: true, script: true },
  });
  const elements: InlineStyle[] = [];
  walkElements(root as unknown as HTMLElement, elements);

  const cssRules: CssRule[] = [];
  for (const styleEl of root.querySelectorAll('style')) {
    cssRules.push(...parseStyleBlock(styleEl.textContent ?? ''));
  }

  return { elements, cssRules, rawHtml };
}
