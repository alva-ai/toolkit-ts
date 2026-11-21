import type { Schema } from '../platformApi.js';
import { playbookUrl } from '../resources/playbooks.js';
import type {
  PlaybookDiscoveryItem,
  TrendingPlaybooksResponse,
} from '../v1/playbooks.js';

type Playbook = Schema<'Playbook'>;

const MAX_DESC = 200;

function truncate(text: string, max = MAX_DESC): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

/** Pretty render of a Playbook list (`playbooks trending`, `get --ids`, `list`). */
export function formatPlaybookList(
  items: Playbook[],
  webOrigin: string,
  opts: { hasNext?: boolean } = {}
): string {
  if (items.length === 0) return '(no playbooks)\n';
  const lines: string[] = [`${items.length} playbook(s):`, ''];
  for (const item of items) lines.push(...playbookLines(item, webOrigin));
  if (opts.hasNext) {
    lines.push('(more results — pass --cursor <nextPageToken> to page)', '');
  }
  return lines.join('\n');
}

/** Pretty render of one Playbook (`playbooks get --id/--ref`). */
export function formatPlaybook(
  item: Playbook | null,
  webOrigin: string
): string {
  if (!item) return '(not found)\n';
  return playbookLines(item, webOrigin).join('\n') + '\n';
}

function playbookLines(item: Playbook, webOrigin: string): string[] {
  const title = item.title || item.slug || item.id;
  const followed = item.followerCount ? `  ★ ${item.followerCount}` : '';
  const out: string[] = [
    `• ${title}  [${item.visibility.toLowerCase()}]${followed}`,
  ];
  if (item.owner?.handle) out.push(`    ${item.owner.handle}/${item.slug}`);
  const url = playbookUrl(item, webOrigin);
  if (url) out.push(`    ${url}`);
  if (item.description) out.push(`    ${truncate(item.description)}`);
  if (item.tags.length > 0) out.push(`    tags: ${item.tags.join(', ')}`);
  out.push(`    id: ${item.id}`, '');
  return out;
}

/**
 * Pretty render of the owner-scoped list (`playbooks mine`): the caller's
 * own Playbooks, drafts included, by title, slug and ID.
 */
export function formatOwnedPlaybookList(
  items: Playbook[],
  opts: { hasNext?: boolean; all?: boolean } = {}
): string {
  if (items.length === 0) return '(no playbooks)\n';
  const lines: string[] = [`${items.length} playbook(s):`, ''];
  for (const item of items) {
    const title = item.title || item.slug || item.id;
    lines.push(`• ${title}  [${item.visibility.toLowerCase()}]`);
    // The slug gets its own line only when the title is not the slug.
    if (item.slug && item.slug !== title) lines.push(`    ${item.slug}`);
    lines.push(`    id: ${item.id}`);
    lines.push('');
  }
  if (opts.hasNext && !opts.all) {
    lines.push(
      '(more results — pass --cursor <nextPageToken>, or --all for every page)',
      ''
    );
  }
  return lines.join('\n');
}

// Keyless discovery (client.v1.playbooks) answers with the 0.x shapes.

/** Pretty render of keyless `playbooks trending` results. */
export function formatV1TrendingPlaybooks(
  resp: TrendingPlaybooksResponse
): string {
  const items = resp.playbooks ?? [];
  if (items.length === 0) return '(no playbooks)\n';
  const lines: string[] = [`${items.length} playbook(s):`, ''];
  for (const p of items) {
    const title = p.display_name || p.name || p.ref;
    const followed = p.follow_count ? `  ★ ${p.follow_count}` : '';
    lines.push(`• ${title}${followed}`);
    if (p.ref) lines.push(`    ${p.ref}`);
    if (p.url) lines.push(`    ${p.url}`);
    if (p.description) lines.push(`    ${truncate(p.description)}`);
    if (p.tags && p.tags.length > 0)
      lines.push(`    tags: ${p.tags.join(', ')}`);
    lines.push('');
  }
  if (resp.has_next) {
    lines.push('(more results — pass --cursor <last item cursor> to page)', '');
  }
  return lines.join('\n');
}

/** Pretty render of one keyless discovery item. */
export function formatV1Playbook(
  item: PlaybookDiscoveryItem | null,
  webOrigin: string
): string {
  if (!item) return '(not found or not visible)\n';
  return v1ItemLines(item, webOrigin).join('\n') + '\n';
}

/** Pretty render of a keyless discovery item list. */
export function formatV1PlaybookList(
  items: PlaybookDiscoveryItem[],
  webOrigin: string,
  opts: { hasNext?: boolean } = {}
): string {
  if (!items || items.length === 0) return '(no playbooks)\n';
  const lines: string[] = [`${items.length} playbook(s):`, ''];
  for (const item of items) lines.push(...v1ItemLines(item, webOrigin));
  if (opts.hasNext) {
    lines.push('(more results — pass --cursor <cursor> to page)', '');
  }
  return lines.join('\n');
}

function v1ItemLines(item: PlaybookDiscoveryItem, webOrigin: string): string[] {
  const title = item.display_name || item.name || item.ref || item.id;
  const visibility = item.visibility ? `  [${item.visibility}]` : '';
  const out: string[] = [`• ${title}${visibility}`];
  const ref =
    item.ref ||
    (item.owner_username && item.name
      ? `${item.owner_username}/${item.name}`
      : '');
  if (ref) out.push(`    ${ref}`);
  if (item.owner_username && item.name) {
    out.push(
      `    ${webOrigin}/u/${item.owner_username}/playbooks/${item.name}`
    );
  }
  if (item.id) out.push(`    id: ${item.id}`);
  out.push('');
  return out;
}
