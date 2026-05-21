#!/usr/bin/env node
// Audit src/resources/skillTiers.ts against the live Arrays doc registry.
//
// For every (skill, file) row in the hardcoded SKILL_ENDPOINT_METADATA table:
//   - confirm the doc registry recognizes the file
//     (GET /api/v1/skills/<skill>?endpoint=<file>)
//
// For every skill referenced in the table:
//   - fetch its summary (GET /api/v1/skills/<skill>)
//   - parse the endpoints markdown table from .content
//   - flag any file declared on the backend but absent locally
//
// Doc API is public — no credentials required.
//
// Exit codes:
//   0  — registry is in sync
//   1  — drift detected; report printed to stdout
//   2  — internal error (network, parse)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '..', 'src', 'resources', 'skillTiers.ts');
const BASE = process.env.ARRAYS_ENDPOINT ?? 'https://data-tools.prd.space.id';
const REPORT_PATH =
  process.env.AUDIT_REPORT_PATH ?? '/tmp/skill-registry-audit.md';

function parseLocalEntries(text) {
  const re =
    /\{\s*skill:\s*'([^']+)',\s*file:\s*'([^']+)',\s*method:\s*'([^']+)',\s*path:\s*'([^']+)',[^}]*\}/g;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ skill: m[1], file: m[2], method: m[3], path: m[4] });
  }
  return out;
}

async function getJson(url) {
  const r = await fetch(url);
  const body = await r.text();
  let j;
  try {
    j = JSON.parse(body);
  } catch {
    return { status: r.status, json: null, raw: body };
  }
  return { status: r.status, json: j, raw: body };
}

async function endpointExists(skill, file) {
  const url = `${BASE}/api/v1/skills/${encodeURIComponent(skill)}?endpoint=${encodeURIComponent(file)}`;
  const { status, json } = await getJson(url);
  if (
    status === 200 &&
    json &&
    json.success !== false &&
    Array.isArray(json.data) &&
    json.data.length > 0
  )
    return 'OK';
  if (json && json.error && json.error.code === 'NOT_FOUND') return 'NOT_FOUND';
  return `ERR_${status}`;
}

async function summaryContent(skill) {
  const url = `${BASE}/api/v1/skills/${encodeURIComponent(skill)}`;
  const { json } = await getJson(url);
  const doc = Array.isArray(json?.data) ? json.data[0] : null;
  return doc?.content ?? '';
}

function extractBackendFiles(content) {
  const files = new Set();
  // Markdown table rows shaped: | GET | <path> | <file> | <desc> |
  const re =
    /\|\s*(?:GET|POST)\s*\|\s*[`]?[^`|]+[`]?\s*\|\s*[`]?([a-z0-9][a-z0-9\-]*)[`]?\s*\|/gi;
  let m;
  while ((m = re.exec(content)) !== null) files.add(m[1].trim());
  return files;
}

async function main() {
  const text = readFileSync(SRC, 'utf8');
  const entries = parseLocalEntries(text);
  if (entries.length === 0) {
    console.error(
      'FATAL: parsed 0 entries from skillTiers.ts — regex broken or file moved'
    );
    process.exit(2);
  }
  console.error(`parsed ${entries.length} local entries`);

  const stale = [];
  const errs = [];
  for (const e of entries) {
    const status = await endpointExists(e.skill, e.file);
    if (status === 'NOT_FOUND') stale.push(e);
    else if (status !== 'OK') errs.push({ ...e, status });
  }

  const skills = [...new Set(entries.map((e) => e.skill))];
  const missing = []; // { skill, file }
  for (const skill of skills) {
    const content = await summaryContent(skill);
    if (!content) {
      errs.push({ skill, file: null, status: 'NO_CONTENT' });
      continue;
    }
    const backendFiles = extractBackendFiles(content);
    const localFiles = new Set(
      entries.filter((e) => e.skill === skill).map((e) => e.file)
    );
    for (const f of backendFiles) {
      if (!localFiles.has(f)) missing.push({ skill, file: f });
    }
  }

  const ok = stale.length === 0 && missing.length === 0 && errs.length === 0;
  const lines = [];
  lines.push(`# Skill registry audit — ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`- backend: \`${BASE}\``);
  lines.push(
    `- local entries audited: **${entries.length}** across **${skills.length}** skills`
  );
  lines.push(`- result: **${ok ? 'in sync' : 'DRIFT'}**`);
  lines.push('');
  if (stale.length > 0) {
    lines.push(
      `## Stale (${stale.length}) — local row, backend returns NOT_FOUND`
    );
    lines.push('');
    lines.push('| skill | file | path |');
    lines.push('|---|---|---|');
    for (const e of stale)
      lines.push(`| \`${e.skill}\` | \`${e.file}\` | \`${e.path}\` |`);
    lines.push('');
  }
  if (missing.length > 0) {
    lines.push(
      `## Missing (${missing.length}) — backend declares, no local row`
    );
    lines.push('');
    lines.push('| skill | file |');
    lines.push('|---|---|');
    for (const e of missing) lines.push(`| \`${e.skill}\` | \`${e.file}\` |`);
    lines.push('');
  }
  if (errs.length > 0) {
    lines.push(`## Errors (${errs.length}) — unexpected status`);
    lines.push('');
    lines.push('| skill | file | status |');
    lines.push('|---|---|---|');
    for (const e of errs)
      lines.push(`| \`${e.skill}\` | \`${e.file ?? '-'}\` | ${e.status} |`);
    lines.push('');
  }
  if (ok) {
    lines.push(
      'No drift. Every local row resolves on the backend; every backend-declared file has a local row.'
    );
    lines.push('');
  } else {
    lines.push('## How to fix');
    lines.push('');
    lines.push('Edit `src/resources/skillTiers.ts`:');
    lines.push('- Remove rows under "Stale".');
    lines.push(
      '- Add rows under "Missing"; copy `method`, `path`, and tier fields from the skill\'s `data-skills summary` markdown.'
    );
    lines.push('- Re-run locally: `node scripts/audit-skill-registry.mjs`.');
    lines.push('');
  }
  const report = lines.join('\n');
  writeFileSync(REPORT_PATH, report);
  console.log(report);
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error('FATAL:', e?.stack ?? e);
  process.exit(2);
});
