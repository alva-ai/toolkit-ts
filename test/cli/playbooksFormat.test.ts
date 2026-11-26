import { describe, it, expect } from 'vitest';
import {
  formatOwnedPlaybookList,
  formatPlaybook,
  formatPlaybookList,
  formatV1Playbook,
  formatV1PlaybookList,
  formatV1TrendingPlaybooks,
} from '../../src/cli/playbooksFormat.js';
import type { TrendingPlaybookItem } from '../../src/v1/playbooks.js';
import { aPlaybook } from '../contentV2.js';

const ORIGIN = 'https://alva.ai';

const MU = aPlaybook({
  id: 'playbook_0m7',
  slug: 'mu-deep-dive',
  title: 'MU Deep-Dive',
  description: 'Single-stock deep analysis on Micron.',
  tags: ['mu', 'micron'],
  followerCount: 3,
  owner: { id: null, handle: 'lake', displayName: null, avatarUrl: null },
});

describe('formatPlaybookList (the /api/v2 Playbook)', () => {
  it('renders title, visibility, ref, clickable url, description, tags and ID', () => {
    const out = formatPlaybookList([MU], ORIGIN);
    expect(out).toBe(
      [
        '1 playbook(s):',
        '',
        '• MU Deep-Dive  [public]  ★ 3',
        '    lake/mu-deep-dive',
        '    https://alva.ai/u/lake/playbooks/mu-deep-dive',
        '    Single-stock deep analysis on Micron.',
        '    tags: mu, micron',
        '    id: playbook_0m7',
        '',
      ].join('\n')
    );
  });

  it('truncates long descriptions, omits an empty follow count and a missing owner', () => {
    const out = formatPlaybookList(
      [
        aPlaybook({
          description: 'x'.repeat(400),
          followerCount: 0,
          owner: null,
        }),
      ],
      ORIGIN
    );
    expect(out).toContain('…');
    expect(out).not.toContain('x'.repeat(400));
    expect(out).toContain('• Scanner  [public]\n');
    expect(out).not.toContain('https://');
  });

  it('hints at the next page and handles an empty list', () => {
    expect(formatPlaybookList([MU], ORIGIN, { hasNext: true })).toContain(
      '--cursor <nextPageToken>'
    );
    expect(formatPlaybookList([], ORIGIN)).toBe('(no playbooks)\n');
  });

  it('renders one Playbook or not found', () => {
    expect(formatPlaybook(MU, 'https://stg.alva.ai')).toContain(
      'https://stg.alva.ai/u/lake/playbooks/mu-deep-dive'
    );
    expect(formatPlaybook(null, ORIGIN)).toBe('(not found)\n');
  });
});

describe('formatOwnedPlaybookList', () => {
  it('renders title, visibility, slug and ID of my Playbooks', () => {
    const out = formatOwnedPlaybookList([
      aPlaybook({ visibility: 'PRIVATE' }),
      aPlaybook({ id: 'playbook_0d', title: '', slug: 'draft-one' }),
    ]);
    expect(out).toContain(
      '• Scanner  [private]\n    scanner\n    id: playbook_0abc'
    );
    // The slug is the title: it is not printed twice.
    expect(out).toContain('• draft-one  [public]\n    id: playbook_0d');
  });

  it('hints at --all only when it was not used', () => {
    expect(formatOwnedPlaybookList([MU], { hasNext: true })).toContain(
      '--all for every page'
    );
    expect(
      formatOwnedPlaybookList([MU], { hasNext: true, all: true })
    ).not.toContain('more results');
  });
});

function trendingItem(
  over: Partial<TrendingPlaybookItem> = {}
): TrendingPlaybookItem {
  return {
    id: '6601',
    ref: 'lake/mu-deep-dive',
    username: 'lake',
    name: 'mu-deep-dive',
    display_name: 'MU Deep-Dive',
    description: 'Single-stock deep analysis on Micron.',
    tags: ['mu', 'micron'],
    follow_count: 3,
    url_path: '/u/lake/playbooks/mu-deep-dive',
    url: 'https://alva.ai/u/lake/playbooks/mu-deep-dive',
    cursor: 'abc',
    ...over,
  };
}

describe('keyless formatters (the /api/v1 0.x shapes)', () => {
  it('renders trending items with their ref and url', () => {
    const out = formatV1TrendingPlaybooks({
      playbooks: [trendingItem()],
      has_next: true,
    });
    expect(out).toContain('• MU Deep-Dive  ★ 3');
    expect(out).toContain('    lake/mu-deep-dive');
    expect(out).toContain('    https://alva.ai/u/lake/playbooks/mu-deep-dive');
    expect(out).toContain('(more results');
  });

  it('renders discovery items and not found', () => {
    const item = {
      id: '6601',
      owner_username: 'lake',
      name: 'mu-deep-dive',
      display_name: 'MU Deep-Dive',
      visibility: 'public',
    };
    expect(formatV1PlaybookList([item], ORIGIN)).toContain(
      'https://alva.ai/u/lake/playbooks/mu-deep-dive'
    );
    expect(formatV1Playbook(null, ORIGIN)).toBe('(not found or not visible)\n');
  });
});
