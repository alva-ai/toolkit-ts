import type { Schema } from '../platformApi.js';
import type {
  PlaybookSkillMeta,
  PlaybookSkillSummary,
} from '../v1/playbookSkills.js';

export function formatPlaybookSkillsList(skills: Schema<'Skill'>[]): string {
  if (skills.length === 0) return 'No playbook skills found.\n';
  const lines: string[] = [];
  for (const s of skills) {
    lines.push(`• ${s.owner.handle}/${s.name}`);
    if (s.description) lines.push(`  ${s.description}`);
    if (s.tags.length > 0) lines.push(`  tags: ${s.tags.join(', ')}`);
    if (s.updatedAt) lines.push(`  updated: ${s.updatedAt}`);
  }
  return lines.join('\n') + '\n';
}

export function formatPlaybookSkillsTags(tags: { name: string }[]): string {
  if (tags.length === 0) return 'No tags.\n';
  return tags.map((t) => `• ${t.name}`).join('\n') + '\n';
}

export function formatPlaybookSkillGet(skill: Schema<'SkillDetail'>): string {
  const lines: string[] = [`${skill.owner.handle}/${skill.name}`];
  if (skill.description) lines.push(skill.description);
  lines.push(`tags:       ${skill.tags.join(', ') || '(none)'}`);
  lines.push(`id:         ${skill.id}`);
  lines.push(`updated at: ${skill.updatedAt ?? '(unknown)'}`);
  lines.push('', 'Files:');
  if (skill.files.length === 0) {
    lines.push('  (no files)');
  } else {
    for (const f of skill.files) lines.push(`  ${f.path}  (${f.sizeBytes} B)`);
  }
  return lines.join('\n') + '\n';
}

// Keyless Skillhub reads (client.v1.playbookSkills) answer with the 0.x shapes.

export function formatV1PlaybookSkillsList(result: {
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

export function formatV1PlaybookSkillGet(meta: PlaybookSkillMeta): string {
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
