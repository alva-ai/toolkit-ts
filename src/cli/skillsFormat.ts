import type {
  SkillSummary,
  SkillDoc,
  SkillEndpointMetadata,
  SkillEndpointTier,
} from '../resources/skills.js';

const TIER_ORDER: SkillEndpointTier[] = [
  'public',
  'alternative',
  'unstructured',
];

function formatTierCounts(
  counts: Partial<Record<SkillEndpointTier, number>> | undefined
): string {
  if (!counts) return '';
  const parts: string[] = [];
  for (const tier of TIER_ORDER) {
    const n = counts[tier];
    if (n) parts.push(`${tier}=${n}`);
  }
  return parts.join(' ');
}

export function formatSkillsList(payload: { skills: SkillSummary[] }): string {
  const skills = payload.skills ?? [];
  if (skills.length === 0) return '(no skills)\n';
  const lines: string[] = [`${skills.length} skill(s):`, ''];
  for (const s of skills) {
    const meta = s.metadata;
    const tag = meta
      ? `[${meta.endpoint_count} endpoints${
          formatTierCounts(meta.endpoint_tier_counts)
            ? `; ${formatTierCounts(meta.endpoint_tier_counts)}`
            : ''
        }]`
      : '';
    lines.push(`• ${s.name}${tag ? ` ${tag}` : ''}`);
    if (s.description) lines.push(`    ${s.description}`);
    lines.push('');
  }
  return lines.join('\n');
}

function formatEndpointMetadataTable(
  endpoints: SkillEndpointMetadata[]
): string {
  if (endpoints.length === 0) return '';
  const rows = endpoints.map((e) => ({
    method: e.method,
    path: e.path,
    file: e.file,
    tier: e.tier,
    access: e.pro_required ? 'pro' : 'free',
  }));
  const headers = ['METHOD', 'PATH', 'FILE', 'TIER', 'ACCESS'];
  const widths = headers.map((h, i) => {
    const key = ['method', 'path', 'file', 'tier', 'access'][i] as keyof (typeof rows)[number];
    return Math.max(h.length, ...rows.map((r) => String(r[key]).length));
  });
  const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - s.length));
  const lines = [
    headers.map((h, i) => pad(h, widths[i])).join('  '),
    widths.map((w) => '-'.repeat(w)).join('  '),
    ...rows.map((r) =>
      [r.method, r.path, r.file, r.tier, r.access]
        .map((v, i) => pad(String(v), widths[i]))
        .join('  ')
    ),
  ];
  return lines.join('\n');
}

function formatSingleEndpointMetadata(
  meta: SkillEndpointMetadata | undefined
): string {
  if (!meta) return '';
  return [
    'Endpoint metadata:',
    `  ${meta.method} ${meta.path}`,
    `  file:   ${meta.file}`,
    `  tier:   ${meta.tier}`,
    `  access: ${meta.pro_required ? 'pro only' : 'free and pro'} (requires ${meta.required_subscription_tier})`,
  ].join('\n');
}

function isEndpointMetadata(
  m: SkillDoc['metadata']
): m is SkillEndpointMetadata {
  return !!m && typeof m === 'object' && 'path' in m && 'method' in m;
}

export function formatSkillSummary(doc: SkillDoc): string {
  const sections: string[] = [];
  sections.push(`# ${doc.name}`);
  if (doc.description) sections.push(doc.description);
  if (doc.metadata && !isEndpointMetadata(doc.metadata)) {
    const m = doc.metadata;
    const counts = formatTierCounts(m.endpoint_tier_counts);
    sections.push(
      `(${m.endpoint_count} endpoints${counts ? `; ${counts}` : ''})`
    );
  }
  sections.push('---');
  sections.push((doc.content ?? '').trimEnd());
  if (doc.endpoint_metadata && doc.endpoint_metadata.length > 0) {
    sections.push('---');
    sections.push(formatEndpointMetadataTable(doc.endpoint_metadata));
  }
  return sections.join('\n\n') + '\n';
}

export function formatSkillEndpoint(doc: SkillDoc): string {
  const sections: string[] = [];
  sections.push(`# ${doc.name}`);
  if (doc.description) sections.push(doc.description);
  if (isEndpointMetadata(doc.metadata)) {
    sections.push(formatSingleEndpointMetadata(doc.metadata));
  }
  sections.push('---');
  sections.push((doc.content ?? '').trimEnd());
  return sections.join('\n\n') + '\n';
}
