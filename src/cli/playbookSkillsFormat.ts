import type {
  PlaybookSkillSummary,
  PlaybookSkillMeta,
  PlaybookSkillFile,
  PlaybookSkillTagEntry,
} from '../resources/playbookSkills.js';

function pad(s: string, w: number): string {
  return s + ' '.repeat(Math.max(0, w - s.length));
}

export function formatPlaybookSkillsList(result: {
  skills: PlaybookSkillSummary[];
}): string {
  const skills = result.skills ?? [];
  if (skills.length === 0) return 'No playbook skills found.\n';

  const rows = skills.map((s) => ({
    id: `${s.username}/${s.name}`,
    description: s.description ?? '',
    tags: (s.tags ?? []).join(','),
    updated_at: s.updated_at ?? '',
  }));

  const headers = ['USERNAME/NAME', 'DESCRIPTION', 'TAGS', 'UPDATED_AT'];
  const keys = ['id', 'description', 'tags', 'updated_at'] as const;
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[keys[i]].length))
  );

  const lines = [
    headers.map((h, i) => pad(h, widths[i])).join('  '),
    widths.map((w) => '-'.repeat(w)).join('  '),
    ...rows.map((r) => keys.map((k, i) => pad(r[k], widths[i])).join('  ')),
  ];
  return lines.join('\n') + '\n';
}

export function formatPlaybookSkillsTags(result: {
  tags: PlaybookSkillTagEntry[];
}): string {
  const tags = result.tags ?? [];
  if (tags.length === 0) return 'No tags.\n';
  return tags.map((t) => `• ${t.name}`).join('\n') + '\n';
}

export function formatPlaybookSkillGet(meta: PlaybookSkillMeta): string {
  const lines: string[] = [];
  lines.push(`${meta.username}/${meta.name}`);
  if (meta.description) lines.push(meta.description);
  lines.push(`tags:        ${(meta.tags ?? []).join(', ') || '(none)'}`);
  lines.push(`creator_uid: ${meta.creator_uid}`);
  lines.push(`updated_at:  ${meta.updated_at}`);
  lines.push('');
  lines.push('Files:');
  const files = meta.files ?? [];
  if (files.length === 0) {
    lines.push('  (no files)');
  } else {
    for (const f of files) {
      lines.push(`  ${f.path}  (${f.size_bytes} B)`);
    }
  }
  return lines.join('\n') + '\n';
}

export function formatPlaybookSkillFile(file: PlaybookSkillFile): string {
  return file.content;
}
