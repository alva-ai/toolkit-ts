import { describe, it, expect } from 'vitest';
import {
  formatTrendingPlaybooks,
  formatPlaybook,
  formatPlaybookList,
} from '../../src/cli/playbooksFormat.js';
import type {
  TrendingPlaybookItem,
  PlaybookDiscoveryItem,
} from '../../src/resources/playbooks.js';

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

describe('formatTrendingPlaybooks', () => {
  it('renders title, ref, clickable url, description and tags', () => {
    const out = formatTrendingPlaybooks({
      playbooks: [trendingItem()],
      has_next: false,
    });
    expect(out).toContain('1 playbook(s):');
    expect(out).toContain('• MU Deep-Dive  ★ 3');
    expect(out).toContain('    lake/mu-deep-dive');
    expect(out).toContain('    https://alva.ai/u/lake/playbooks/mu-deep-dive');
    expect(out).toContain('    Single-stock deep analysis on Micron.');
    expect(out).toContain('    tags: mu, micron');
  });

  it('truncates long descriptions to keep the list scannable', () => {
    const long = 'x'.repeat(400);
    const out = formatTrendingPlaybooks({
      playbooks: [trendingItem({ description: long })],
      has_next: false,
    });
    expect(out).toContain('…');
    expect(out).not.toContain('x'.repeat(400));
  });

  it('omits the follow marker when follow_count is 0', () => {
    const out = formatTrendingPlaybooks({
      playbooks: [trendingItem({ follow_count: 0 })],
      has_next: false,
    });
    expect(out).toContain('• MU Deep-Dive\n');
    expect(out).not.toContain('★');
  });

  it('hints at pagination when more results exist', () => {
    const out = formatTrendingPlaybooks({
      playbooks: [trendingItem()],
      has_next: true,
    });
    expect(out).toContain('(more results');
  });

  it('handles an empty result set', () => {
    expect(formatTrendingPlaybooks({ playbooks: [], has_next: false })).toBe(
      '(no playbooks)\n'
    );
  });
});

function discoveryItem(
  over: Partial<PlaybookDiscoveryItem> = {}
): PlaybookDiscoveryItem {
  return {
    id: '6601',
    owner_username: 'lake',
    name: 'mu-deep-dive',
    display_name: 'MU Deep-Dive',
    visibility: 'public',
    ref: 'lake/mu-deep-dive',
    ...over,
  };
}

describe('formatPlaybook / formatPlaybookList', () => {
  it('builds the absolute url for a discovery item from the web origin', () => {
    const out = formatPlaybook(discoveryItem(), 'https://stg.alva.ai');
    expect(out).toContain('• MU Deep-Dive  [public]');
    expect(out).toContain('    lake/mu-deep-dive');
    expect(out).toContain(
      '    https://stg.alva.ai/u/lake/playbooks/mu-deep-dive'
    );
    expect(out).toContain('    id: 6601');
  });

  it('renders not-found for a null item', () => {
    expect(formatPlaybook(null, 'https://alva.ai')).toBe(
      '(not found or not visible)\n'
    );
  });

  it('renders a list with a pagination hint', () => {
    const out = formatPlaybookList([discoveryItem()], 'https://alva.ai', {
      hasNext: true,
    });
    expect(out).toContain('1 playbook(s):');
    expect(out).toContain('    https://alva.ai/u/lake/playbooks/mu-deep-dive');
    expect(out).toContain('(more results');
  });

  it('handles an empty list', () => {
    expect(formatPlaybookList([], 'https://alva.ai')).toBe('(no playbooks)\n');
  });
});
