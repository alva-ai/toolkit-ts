import type {
  PersonalSkillDetail,
  PersonalSkillFile,
  PersonalSkillListResponse,
  SavePersonalSkillResponse,
  PersonalSkillSummary,
} from '../resources/personalSkills.js';

export function formatPersonalSkillsList(
  result: PersonalSkillListResponse
): string {
  const skills = result.skills ?? [];
  if (skills.length === 0) return 'No personal skills found.\n';
  const lines: string[] = [];
  for (const s of skills) {
    const state = s.enabled ? '' : ' [disabled]';
    lines.push(`• ${s.template_ref} (${s.slug}) — ${s.display_name}${state}`);
    if (s.description) lines.push(`  ${s.description}`);
    lines.push(
      `  rev: ${s.current_rev} | source: ${s.source_type} | updated: ${s.updated_at}`
    );
  }
  return lines.join('\n') + '\n';
}

export function formatPersonalSkillGet(detail: PersonalSkillDetail): string {
  const s = detail.skill;
  const lines: string[] = [
    `${s.template_ref} (${s.slug}) — ${s.display_name}`,
    s.description,
    `enabled:      ${s.enabled}`,
    `current_rev:  ${s.current_rev}`,
    `content_hash: ${s.content_hash}`,
    `source_type:  ${s.source_type}`,
    ...(s.source_ref ? [`source_ref:   ${s.source_ref}`] : []),
    `updated_at:   ${s.updated_at}`,
    '',
    'Files:',
  ];
  const files = detail.files ?? [];
  if (files.length === 0) {
    lines.push('  (no files)');
  } else {
    for (const f of files) {
      lines.push(`  ${f.path}  (${f.size_bytes} B)`);
    }
  }
  return lines.join('\n') + '\n';
}

export function formatPersonalSkillFile(file: PersonalSkillFile): string {
  return file.content;
}

export function formatPersonalSkillSave(res: SavePersonalSkillResponse): string {
  const verb = res.created ? 'Created' : 'Updated';
  const s = res.skill;
  return `${verb} ${s.template_ref} (${s.slug}) rev ${s.current_rev} — ${s.display_name}\n`;
}

export function formatPersonalSkillSummary(s: PersonalSkillSummary): string {
  const state = s.enabled ? 'enabled' : 'disabled';
  return `${s.template_ref} (${s.slug}) is now ${state} (rev ${s.current_rev})\n`;
}
