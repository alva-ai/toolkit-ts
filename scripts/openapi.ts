// The /api/v2 contract (alva-gateway pkg/v2/api/openapi/openapi.json, served
// at GET /api/v2/openapi.json) and the types generated from it.
//
//   npm run openapi:sync -- <path-or-url>   copy the document into openapi/
//   npm run openapi:gen                     regenerate src/generated/platform-v2.ts
//
// test/openapi.test.ts runs generatePlatformTypes in memory and compares the
// result with the committed file.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import openapiTS, { astToString, COMMENT_HEADER } from 'openapi-typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const CONTRACT_PATH = path.join(root, 'openapi/alva-platform-v2.json');
export const TYPES_PATH = path.join(root, 'src/generated/platform-v2.ts');

/** The TypeScript source of the contract's types, as openapi:gen writes it. */
export async function generatePlatformTypes(): Promise<string> {
  const ast = await openapiTS(pathToFileURL(CONTRACT_PATH), { silent: true });
  return COMMENT_HEADER + astToString(ast);
}

async function readSource(source: string): Promise<string> {
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`GET ${source}: HTTP ${response.status}`);
    return response.text();
  }
  return fs.readFileSync(source, 'utf8');
}

/** Copies the document unchanged, after checking it is an OpenAPI 3.1 document. */
async function sync(source: string): Promise<void> {
  const text = await readSource(source);
  const doc = JSON.parse(text) as { openapi?: unknown; paths?: unknown };
  if (typeof doc.openapi !== 'string' || !doc.openapi.startsWith('3.1.')) {
    throw new Error(`${source} is not an OpenAPI 3.1 document`);
  }
  if (typeof doc.paths !== 'object' || doc.paths === null) {
    throw new Error(`${source} has no paths`);
  }
  fs.writeFileSync(CONTRACT_PATH, text);
  console.log(
    `openapi:sync: ${source} -> ${path.relative(root, CONTRACT_PATH)}`
  );
}

async function main(argv: string[]): Promise<void> {
  const [command, source] = argv;
  if (command === 'sync' && source) return sync(source);
  if (command === 'gen') {
    fs.mkdirSync(path.dirname(TYPES_PATH), { recursive: true });
    fs.writeFileSync(TYPES_PATH, await generatePlatformTypes());
    console.log(`openapi:gen: ${path.relative(root, TYPES_PATH)}`);
    return;
  }
  throw new Error('usage: openapi.ts sync <path-or-url> | gen');
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
