import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  CONTRACT_PATH,
  generatePlatformTypes,
  TYPES_PATH,
} from '../scripts/openapi.js';

// The /api/v2 contract (openapi/alva-platform-v2.json) against the generated
// types and every transport call site in src/.

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TRANSPORT = new Set(['_v2Request', '_v2Fetch', '_v2Pages']);
const METHODS = ['get', 'post', 'patch', 'delete'] as const;

interface CallSite {
  file: string;
  fn: string;
  /** The method, or `<source text>` when it is not a string literal. */
  method: string;
  /** The path with `{}` per v2Path value, or `<source text>`. */
  path: string;
}

function sourceText(node: ts.Node, source: ts.SourceFile): string {
  return `<${node.getText(source).replace(/\s+/g, ' ')}>`;
}

/**
 * The paths an argument may name, `{}` for each v2Path value: a string
 * literal, a v2Path template, or each branch of a conditional.
 */
function pathTemplates(node: ts.Expression, source: ts.SourceFile): string[] {
  if (ts.isParenthesizedExpression(node)) {
    return pathTemplates(node.expression, source);
  }
  if (ts.isConditionalExpression(node)) {
    return [
      ...pathTemplates(node.whenTrue, source),
      ...pathTemplates(node.whenFalse, source),
    ];
  }
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (
    ts.isTaggedTemplateExpression(node) &&
    ts.isIdentifier(node.tag) &&
    node.tag.text === 'v2Path'
  ) {
    const t = node.template;
    if (ts.isNoSubstitutionTemplateLiteral(t)) return [t.text];
    return [
      t.head.text + t.templateSpans.map((s) => `{}${s.literal.text}`).join(''),
    ];
  }
  return [sourceText(node, source)];
}

/** The _v2Request, _v2Fetch and _v2Pages calls of a file, except the transport's own (`this._v2…`). */
function callSites(file: string, text: string): CallSite[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const sites: CallSite[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      TRANSPORT.has(node.expression.name.text) &&
      node.expression.expression.kind !== ts.SyntaxKind.ThisKeyword
    ) {
      const fn = node.expression.name.text;
      const [first, second] = node.arguments;
      const pages = fn === '_v2Pages';
      const method = pages
        ? 'GET'
        : ts.isStringLiteralLike(first)
          ? first.text
          : sourceText(first, source);
      for (const p of pathTemplates(pages ? first : second, source)) {
        sites.push({ file, fn, method, path: p });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return sites;
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'generated' ? [] : sourceFiles(full);
    }
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

interface ContractOperation {
  responses: Record<string, { content?: Record<string, unknown> }>;
}

/** Operations by `METHOD /path`, with `{}` for each path parameter. */
function contractOperations(): Map<string, ContractOperation> {
  const doc = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8')) as {
    paths: Record<string, Partial<Record<string, ContractOperation>>>;
  };
  const ops = new Map<string, ContractOperation>();
  for (const [p, item] of Object.entries(doc.paths)) {
    for (const m of METHODS) {
      const op = item[m];
      if (op)
        ops.set(`${m.toUpperCase()} ${p.replace(/\{[^}]+\}/g, '{}')}`, op);
    }
  }
  return ops;
}

function answersJson(op: ContractOperation): boolean {
  return Object.entries(op.responses).some(
    ([status, r]) =>
      status.startsWith('2') && 'application/json' in (r.content ?? {})
  );
}

/** Why a call site does not match the contract, or undefined when it does. */
function mismatch(
  site: CallSite,
  ops: Map<string, ContractOperation>
): string | undefined {
  if (site.method.startsWith('<') || site.path.startsWith('<')) {
    return 'not literal';
  }
  const op = ops.get(`${site.method} ${site.path}`);
  if (!op) return 'no such operation';
  if (site.fn !== '_v2Fetch' && !answersJson(op)) {
    return 'not a JSON route: use _v2Fetch';
  }
  return undefined;
}

describe('the /api/v2 contract', () => {
  it('generates the committed types (npm run openapi:gen)', async () => {
    const generated = await generatePlatformTypes();
    const committed = fs.readFileSync(TYPES_PATH, 'utf8');
    expect(
      generated === committed,
      'src/generated/platform-v2.ts is stale: run npm run openapi:gen'
    ).toBe(true);
  });

  it('reads the method and path templates of each call site', () => {
    const text = [
      "client._v2Request<X>('POST', v2Path`/theses/${id}/updates`, { body });",
      'this.client._v2Pages(v2Path`/me/tasks`, { pageSize: 5 });',
      "c._v2Fetch('GET', '/fs/read', {});",
      "c._v2Request('POST', on ? v2Path`/a/${id}/pause` : (v2Path`/a/${id}/resume`));",
      'c._v2Request(method, `/fs/${op}`);',
      "this._v2Request('GET', path);",
    ].join('\n');

    expect(
      callSites('x.ts', text).map(({ fn, method, path }) => [fn, method, path])
    ).toEqual([
      ['_v2Request', 'POST', '/theses/{}/updates'],
      ['_v2Pages', 'GET', '/me/tasks'],
      ['_v2Fetch', 'GET', '/fs/read'],
      ['_v2Request', 'POST', '/a/{}/pause'],
      ['_v2Request', 'POST', '/a/{}/resume'],
      ['_v2Request', '<method>', '<`/fs/${op}`>'],
    ]);
  });

  it('has an operation for every call site in src/', () => {
    const ops = contractOperations();
    const sites = sourceFiles(path.join(ROOT, 'src')).flatMap((file) =>
      callSites(path.relative(ROOT, file), fs.readFileSync(file, 'utf8'))
    );
    expect(sites.length).toBeGreaterThan(0);

    const failing = sites.flatMap((site) => {
      const why = mismatch(site, ops);
      return why ? [`${site.file}: ${site.method} ${site.path} (${why})`] : [];
    });
    expect(failing.sort()).toEqual([]);
  });
});
