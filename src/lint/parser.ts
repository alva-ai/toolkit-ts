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

/**
 * Convert a byte offset in `html` to a 1-based line number.
 * Counts newline characters up to (but not including) the offset.
 */
function offsetToLine(html: string, offset: number): number {
  let line = 1;
  const end = Math.min(offset, html.length);
  for (let i = 0; i < end; i++) {
    if (html.charCodeAt(i) === 10) line++;
  }
  return line;
}

function parseStyleBlock(css: string, styleBlockStartLine: number): CssRule[] {
  const ast = csstree.parse(css, { positions: true });
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
      // css-tree line numbers are 1-based and relative to the CSS string.
      // Add the start-line of the CSS block (0-indexed offset) to get HTML-absolute lines.
      const cssRelativeLine = node.loc?.start.line ?? null;
      const sourceLine =
        cssRelativeLine !== null
          ? styleBlockStartLine + cssRelativeLine - 1
          : undefined;
      // Split comma-separated selectors so callers can match cleanly.
      for (const sel of selectorText.split(',').map((s) => s.trim())) {
        rules.push({ selectorText: sel, declarations, sourceLine });
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
    // el.range is [startOffset, endOffset] in bytes into rawHtml.
    const range = (el as unknown as { range?: [number, number] }).range;
    const line =
      range !== undefined ? offsetToLine(rawHtml, range[0]) : undefined;
    elements.push({
      elementKey: `el-${keyCounter++}`,
      tag,
      attrs,
      classes,
      declarations: parseInlineStyle(attrs.style),
      line,
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
    // Determine the HTML-absolute line where the style block's content starts.
    // We use the style element's own range start to find its line, then add 1
    // to approximate the first line of CSS content (the <style> tag line + 1).
    const styleRange = (styleEl as unknown as { range?: [number, number] })
      .range;
    const styleTagLine =
      styleRange !== undefined ? offsetToLine(rawHtml, styleRange[0]) : 1;
    // styleBlockStartLine: first line of the CSS string passed to css-tree.
    // css-tree line 1 corresponds to this HTML line.
    const styleBlockStartLine = styleTagLine + 1;
    cssRules.push(
      ...parseStyleBlock(styleEl.textContent ?? '', styleBlockStartLine)
    );
  }

  return { elements, cssRules, rawHtml };
}
