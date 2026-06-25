import type {
  TrendingPlaybooksResponse,
  PlaybookDiscoveryItem,
} from '../resources/playbooks.js';

const MAX_DESC = 200;

function truncate(text: string, max = MAX_DESC): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

/** Build the absolute web URL for a discovery item lacking a server-sent one. */
function discoveryUrl(item: PlaybookDiscoveryItem, webOrigin: string): string {
  if (!item.owner_username || !item.name) return '';
  return `${webOrigin}/u/${item.owner_username}/playbooks/${item.name}`;
}

/** Pretty render of `playbooks trending` (search) results. */
export function formatTrendingPlaybooks(
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

/** Pretty render of one discovery item (`playbooks get --id/--ref`). */
export function formatPlaybook(
  item: PlaybookDiscoveryItem | null,
  webOrigin: string
): string {
  if (!item) return '(not found or not visible)\n';
  return discoveryItemLines(item, webOrigin).join('\n') + '\n';
}

/** Pretty render of a discovery item list (`playbooks get --ids` / `list`). */
export function formatPlaybookList(
  items: PlaybookDiscoveryItem[],
  webOrigin: string,
  opts: { hasNext?: boolean } = {}
): string {
  if (!items || items.length === 0) return '(no playbooks)\n';
  const lines: string[] = [`${items.length} playbook(s):`, ''];
  for (const item of items) lines.push(...discoveryItemLines(item, webOrigin));
  if (opts.hasNext) {
    lines.push('(more results — pass --cursor <cursor> to page)', '');
  }
  return lines.join('\n');
}

function discoveryItemLines(
  item: PlaybookDiscoveryItem,
  webOrigin: string
): string[] {
  const title = item.display_name || item.name || item.ref || item.id;
  const visibility = item.visibility ? `  [${item.visibility}]` : '';
  const out: string[] = [`• ${title}${visibility}`];
  const ref =
    item.ref ||
    (item.owner_username && item.name
      ? `${item.owner_username}/${item.name}`
      : '');
  if (ref) out.push(`    ${ref}`);
  const url = discoveryUrl(item, webOrigin);
  if (url) out.push(`    ${url}`);
  if (item.id) out.push(`    id: ${item.id}`);
  out.push('');
  return out;
}
