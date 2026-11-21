import { afterEach, describe, expect, it } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { fakeV2 } from '../fakeV2.js';
import { v2 } from '../v2Schema.js';
import { aPage, aThesis, aVersion } from '../contentV2.js';

// ForYouResource on /api/v2: pages come back as the routes answer them.

let fake: ReturnType<typeof fakeV2> | undefined;
afterEach(() => fake?.restore());

function client() {
  return new AlvaClient({ apiKey: 'key', baseUrl: 'https://api.test' });
}

const ENTRY = v2('FeedEntry', {
  id: 'feed_post_0a',
  automationId: 'automation_0a',
  majorVersion: 2,
  displayName: 'Macro',
  source: 'alva',
  eventAt: null,
  publishedAt: '2026-11-01T10:00:00Z',
  title: 'Rates',
  body: 'Cuts priced in',
  actions: [{ type: 'PRO_TRIAL', label: 'Try Pro', url: null, prompt: null }],
  card: null,
  tickers: [{ symbol: 'TLT' }],
  media: [],
  sources: [],
});

describe('ForYouResource', () => {
  it('list reads one page of entries, optionally of one feed', async () => {
    const page = aPage([ENTRY], 'next');
    fake = fakeV2({ 'GET /me/for-you-entries': () => page });

    await expect(
      client().forYou.list({
        pageSize: 20,
        pageToken: 'p1',
        automationId: 'automation_0a',
      })
    ).resolves.toEqual(page);
    expect(Object.fromEntries(fake.calls[0].query)).toEqual({
      pageSize: '20',
      pageToken: 'p1',
      automationId: 'automation_0a',
    });
  });

  it('theses keeps the recommended Update apart from the current Thesis', async () => {
    // The Thesis has moved on to Update 3; the item recommends Update 2.
    const current = aThesis({}, { id: 'thesis_version_0c', number: 3 });
    const page = aPage(
      [
        v2('ForYouItem', {
          itemId: 'item-1',
          kind: 'THESIS',
          version: aVersion(),
          thesis: current,
        }),
      ],
      null
    );
    fake = fakeV2({ 'GET /me/for-you': [() => page, () => page] });

    const result = await client().forYou.theses({ pageSize: 5 });
    expect(result).toEqual(page);
    expect(result.items[0].version.number).toBe(2);
    expect(result.items[0].thesis.currentVersion.number).toBe(3);
    expect(Object.fromEntries(fake.calls[0].query)).toEqual({
      pageSize: '5',
      ranking: 'THESIS_ONLY',
    });

    await client().forYou.theses({ ranking: 'MIXED', pageToken: 'p2' });
    expect(Object.fromEntries(fake.calls[1].query)).toEqual({
      ranking: 'MIXED',
      pageToken: 'p2',
    });
  });
});
