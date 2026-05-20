import type {
  PlaybookSkillSummary,
  PlaybookSkillMeta,
  PlaybookSkillFile,
  PlaybookSkillTagEntry,
} from '../resources/playbookSkills.js';

export function formatPlaybookSkillsList(result: {
  skills: PlaybookSkillSummary[];
}): string {
  const skills = result.skills ?? [];
  if (skills.length === 0) return 'No playbook skills found.\n';

  const lines: string[] = [];
  for (const s of skills) {
    lines.push(`• ${s.username}/${s.name}`);
    if (s.description) lines.push(`  ${s.description}`);
    const tags = (s.tags ?? []).join(', ');
    if (tags) lines.push(`  tags: ${tags}`);
    if (s.updated_at) lines.push(`  updated: ${s.updated_at}`);
  }
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
