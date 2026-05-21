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
// With --apply, rewrites src/resources/skillTiers.ts to remove stale rows
// and append missing rows (defaulted to the pro tier — flagged with a
// TODO comment so a human reviewer must confirm).
//
// Doc API is public — no credentials required.
//
// Exit codes:
//   0  — registry is in sync
//   1  — drift detected; report printed to stdout (and file patched if --apply)
//   2  — internal error (network, parse)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '..', 'src', 'resources', 'skillTiers.ts');
const BASE = process.env.ARRAYS_ENDPOINT ?? 'https://data-tools.prd.space.id';
const REPORT_PATH =
  process.env.AUDIT_REPORT_PATH ?? '/tmp/skill-registry-audit.md';
const APPLY = process.argv.includes('--apply');

function parseLocalEntries(text) {
  // Tolerates an optional leading `// ...` comment line (e.g. the
  // `TODO(audit)` marker that --apply writes into auto-added blocks).
  const re =
    /\{\s*(?:\/\/[^\n]*\n\s*)*skill:\s*'([^']+)',\s*file:\s*'([^']+)',\s*method:\s*'([^']+)',\s*path:\s*'([^']+)',[^}]*\}/g;
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

async function endpointDocContent(skill, file) {
  const url = `${BASE}/api/v1/skills/${encodeURIComponent(skill)}?endpoint=${encodeURIComponent(file)}`;
  const { json } = await getJson(url);
  const doc = Array.isArray(json?.data) ? json.data[0] : null;
  return doc?.content ?? '';
}

async function listAllSkills() {
  const url = `${BASE}/api/v1/skills`;
  const { json } = await getJson(url);
  const arr = Array.isArray(json?.data) ? json.data : [];
  return arr.map((s) => s.name).filter(Boolean);
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

// Extract the canonical `METHOD /api/v1/...` for a missing file from its
// endpoint doc. Falls back to GET + path guessed from the skill summary table.
function extractMethodAndPath(endpointContent, fallbackPath) {
  // Match e.g. ``GET /api/v1/crypto/binance/spot/usdt/kline`` or
  // ``\nGET /api/v1/...`` near the top of the doc.
  const m = endpointContent.match(/\b(GET|POST)\s+(\/api\/v1\/[^\s`?\n]+)/);
  if (m) return { method: m[1], path: m[2] };
  if (fallbackPath) return { method: 'GET', path: fallbackPath };
  return null;
}

// Inside a skill's summary content, look up the relative path for a file
// (the `<path>` column of the endpoints table) and resolve it to a full
// /api/v1/... URL. Cheap fallback when the per-endpoint doc is empty.
function fallbackPathFromSummary(summary, file) {
  const re = new RegExp(
    `\\|\\s*(?:GET|POST)\\s*\\|\\s*\`?([^\`|]+?)\`?\\s*\\|\\s*\`?${file.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\`?\\s*\\|`,
    'i'
  );
  const m = summary.match(re);
  if (!m) return null;
  const rel = m[1].trim().replace(/^\/+/, '');
  // Heuristic: most paths nest under /api/v1/<segment>/...; if rel already
  // begins with crypto/stocks/... we just prepend /api/v1. If it's bare like
  // "kline" we need a per-skill prefix that we don't have here — return null.
  if (/^(crypto|stocks|polymarket|x|news)\b/.test(rel)) return `/api/v1/${rel}`;
  return null;
}

function buildBlock(entry) {
  // Defaults to pro tier — reviewers must verify via TODO.
  return [
    '  {',
    '    // TODO(audit): verify tier — auto-defaulted to pro',
    `    skill: '${entry.skill}',`,
    `    file: '${entry.file}',`,
    `    method: '${entry.method}',`,
    `    path: '${entry.path}',`,
    "    tier: 'alternative',",
    "    required_subscription_tier: 'pro',",
    "    access: 'pro_only',",
    '    pro_required: true,',
    '  },',
  ].join('\n');
}

function removeStaleBlocks(text, stale) {
  let out = text;
  for (const e of stale) {
    const re = new RegExp(
      `\\s*\\{\\s*(?:\\/\\/[^\\n]*\\n\\s*)*skill:\\s*'${e.skill}',\\s*file:\\s*'${e.file}',[^}]*pro_required:\\s*(?:true|false),?\\s*\\},?`,
      'g'
    );
    out = out.replace(re, '');
  }
  return out;
}

function appendNewBlocks(text, newEntries) {
  if (newEntries.length === 0) return text;
  // Insert before the closing "];" of SKILL_ENDPOINT_METADATA.
  const marker =
    /(const SKILL_ENDPOINT_METADATA: SkillEndpointMetadata\[\] = \[[\s\S]*?)(\n\];)/;
  const block = newEntries.map(buildBlock).join('\n');
  return text.replace(marker, `$1\n${block}$2`);
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

  // Enumerate the backend universe, not just skills that already appear
  // locally — a skill with zero local rows would otherwise be invisible.
  const backendSkills = await listAllSkills();
  const skills = [
    ...new Set([...backendSkills, ...entries.map((e) => e.skill)]),
  ];
  const missing = []; // { skill, file }
  const summaryBySkill = new Map();
  for (const skill of skills) {
    const content = await summaryContent(skill);
    summaryBySkill.set(skill, content);
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

  // Resolve canonical method/path for each missing file so --apply can write
  // a structurally valid entry. (Always done so the report can show paths.)
  const resolvedMissing = [];
  for (const m of missing) {
    const doc = await endpointDocContent(m.skill, m.file);
    const fallback = fallbackPathFromSummary(
      summaryBySkill.get(m.skill) ?? '',
      m.file
    );
    const mp = extractMethodAndPath(doc, fallback);
    if (!mp) {
      errs.push({ ...m, status: 'NO_PATH' });
      continue;
    }
    resolvedMissing.push({ ...m, method: mp.method, path: mp.path });
  }

  const ok =
    stale.length === 0 && resolvedMissing.length === 0 && errs.length === 0;
  const lines = [];
  lines.push(`# Skill registry audit — ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`- backend: \`${BASE}\``);
  lines.push(
    `- local entries audited: **${entries.length}** across **${skills.length}** skills`
  );
  lines.push(`- result: **${ok ? 'in sync' : 'DRIFT'}**`);
  if (APPLY) lines.push(`- mode: \`--apply\``);
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
  if (resolvedMissing.length > 0) {
    lines.push(
      `## Missing (${resolvedMissing.length}) — backend declares, no local row`
    );
    lines.push('');
    lines.push('| skill | file | method | path |');
    lines.push('|---|---|---|---|');
    for (const e of resolvedMissing)
      lines.push(
        `| \`${e.skill}\` | \`${e.file}\` | ${e.method} | \`${e.path}\` |`
      );
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
  } else if (APPLY) {
    lines.push('## Auto-patch');
    lines.push('');
    lines.push(
      'Rewrote `src/resources/skillTiers.ts`: removed stale rows; appended missing rows with `tier: alternative`, `required_subscription_tier: pro`, `access: pro_only`, `pro_required: true` and a `// TODO(audit)` comment. A reviewer must confirm the tier on each new row before merge.'
    );
    lines.push('');
  } else {
    lines.push('## How to fix');
    lines.push('');
    lines.push(
      'Re-run with `--apply` to rewrite `src/resources/skillTiers.ts` in place (stale rows removed, missing rows appended at pro tier with a TODO comment), then review the diff and commit.'
    );
    lines.push('');
  }
  const report = lines.join('\n');
  writeFileSync(REPORT_PATH, report);
  console.log(report);

  if (!ok && APPLY) {
    let patched = removeStaleBlocks(text, stale);
    patched = appendNewBlocks(patched, resolvedMissing);
    writeFileSync(SRC, patched);
    console.error(
      `applied: removed ${stale.length} stale, appended ${resolvedMissing.length} missing`
    );
  }
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error('FATAL:', e?.stack ?? e);
  process.exit(2);
});
