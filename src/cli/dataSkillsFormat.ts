import type { SkillSummary, SkillDoc } from '../resources/dataSkills.js';

export function formatSkillsList(payload: { skills: SkillSummary[] }): string {
  const skills = payload.skills ?? [];
  if (skills.length === 0) return '(no skills)\n';
  const lines: string[] = [`${skills.length} skill(s):`, ''];
  for (const s of skills) {
    const tag = s.metadata ? ` [${s.metadata.endpoint_count} endpoints]` : '';
    lines.push(`• ${s.name}${tag}`);
    if (s.description) lines.push(`    ${s.description}`);
    lines.push('');
  }
  return lines.join('\n');
}

function formatEndpointMetadataTable(
  endpoints: NonNullable<SkillDoc['endpoint_metadata']>
): string {
  if (endpoints.length === 0) return '';
  const rows = endpoints.map((endpoint) => ({
    method: endpoint.method,
    path: endpoint.path,
    file: endpoint.file,
  }));
  const headers = ['METHOD', 'PATH', 'FILE'];
  const keys = ['method', 'path', 'file'] as const;
  const widths = headers.map((header, index) =>
    Math.max(
      header.length,
      ...rows.map((row) => String(row[keys[index]]).length)
    )
  );
  const pad = (value: string, width: number) =>
    value + ' '.repeat(Math.max(0, width - value.length));
  return [
    headers.map((header, index) => pad(header, widths[index])).join('  '),
    widths.map((width) => '-'.repeat(width)).join('  '),
    ...rows.map((row) =>
      keys.map((key, index) => pad(String(row[key]), widths[index])).join('  ')
    ),
  ].join('\n');
}

function isEndpointMetadata(
  metadata: SkillDoc['metadata']
): metadata is NonNullable<SkillDoc['endpoint_metadata']>[number] {
  return (
    !!metadata &&
    typeof metadata === 'object' &&
    'path' in metadata &&
    'method' in metadata
  );
}

export function formatSkillSummary(doc: SkillDoc): string {
  const sections: string[] = [];
  sections.push(`# ${doc.name}`);
  if (doc.description) sections.push(doc.description);
  if (doc.metadata && !isEndpointMetadata(doc.metadata)) {
    sections.push(`(${doc.metadata.endpoint_count} endpoints)`);
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
    sections.push(
      [
        'Endpoint metadata:',
        `  ${doc.metadata.method} ${doc.metadata.path}`,
        `  file: ${doc.metadata.file}`,
      ].join('\n')
    );
  }
  sections.push('---');
  sections.push((doc.content ?? '').trimEnd());
  return sections.join('\n\n') + '\n';
}
