import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';

// Per-Thesis positions (alva-backend docs/changelogs/2026-11-23-thesis-weights.md
// B5, B9, B10, F5).
const REQUEST_ID = '123e4567-e89b-72d3-c456-426614174000';
const MAX_ID = '9223372036854775807';
const NVDA = '745337';
const AMD = '745338';

function thesisWith(stances: Array<Record<string, unknown>>, archived = false) {
  return {
    thesis: {
      id: MAX_ID,
      author_version_id: '9223372036854775806',
      material_version_id: '9223372036854775805',
      title: 'Thesis',
      body: 'body',
      entity_ids: [NVDA, AMD],
      entity_stances: stances,
      visibility: 'public',
      closed: false,
      archived,
      closing_note: '',
      author_kind: 'user',
      author_ref: 'alice',
    },
  };
}

function client() {
  return new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
    _request: ReturnType<typeof vi.fn>;
  };
}

const weighted = [
  { entity_id: NVDA, stance: 'bullish', direction: 'bullish', weight: 0.4 },
  { entity_id: AMD, stance: 'bearish', direction: 'bearish', weight: 0.25 },
];

describe('Thesis weights', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends weights and reads them back', async () => {
    const c = client();
    c._request = vi.fn().mockResolvedValueOnce(thesisWith(weighted));
    const got = await c.theses.create({
      request_id: REQUEST_ID,
      body: 'body',
      entity_ids: [NVDA, AMD],
      entity_stances: [
        { entity_id: NVDA, stance: 'bullish', weight: 0.4 },
        { entity_id: AMD, stance: 'bearish', weight: 0.25 },
      ],
    });
    const [, , init] = c._request.mock.calls[0] as [
      string,
      string,
      { body: Record<string, unknown> },
    ];
    expect(init.body.entity_stances).toEqual([
      { entity_id: NVDA, stance: 'bullish', weight: 0.4 },
      { entity_id: AMD, stance: 'bearish', weight: 0.25 },
    ]);
    expect(got.thesis.entity_stances?.map((s) => s.weight)).toEqual([
      0.4, 0.25,
    ]);
  });

  it('rejects an invalid weight before sending', async () => {
    for (const stance of [
      { entity_id: NVDA, stance: 'bullish', weight: 0 },
      { entity_id: NVDA, stance: 'bullish', weight: 1.5 },
      { entity_id: NVDA, stance: 'bullish', weight: 0.12345 },
      { entity_id: NVDA, stance: 'none', weight: 0.4 },
    ]) {
      const c = client();
      c._request = vi.fn();
      await expect(
        c.theses.create({
          request_id: REQUEST_ID,
          body: 'body',
          entity_ids: [NVDA],
          // @ts-expect-error -- invalid input on purpose
          entity_stances: [stance],
        })
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
      expect(c._request).not.toHaveBeenCalled();
    }
  });

  it('fails loudly when the server drops the weights (F5)', async () => {
    const c = client();
    c._request = vi.fn().mockResolvedValueOnce(
      thesisWith([
        { entity_id: NVDA, stance: 'bullish', direction: 'bullish' },
        { entity_id: AMD, stance: 'bearish', direction: 'bearish' },
      ])
    );
    await expect(
      c.theses.update(MAX_ID, {
        request_id: REQUEST_ID,
        expected_author_version_id: '9223372036854775806',
        body: 'body',
        entity_ids: [NVDA, AMD],
        entity_stances: [
          { entity_id: NVDA, stance: 'bullish', weight: 0.4 },
          { entity_id: AMD, stance: 'bearish', weight: 0.25 },
        ],
        visibility: 'public',
      })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('keeps the weights when archiving and unarchiving', async () => {
    const c = client();
    const current = {
      ...thesisWith(weighted, true),
      author: {
        id: '42',
        kind: 'user',
        display_name: 'A',
        avatar_url: '',
        username: 'a',
      },
      entities: [NVDA, AMD].map((id) => ({
        id,
        ticker: 'T',
        name: 'N',
        icon_url: '',
        kind: 'STOCK',
      })),
    };
    c._request = vi
      .fn()
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(thesisWith(weighted, false));
    await c.theses.setArchived(MAX_ID, {
      request_id: REQUEST_ID,
      archived: false,
    });
    const [, , init] = c._request.mock.calls[1] as [
      string,
      string,
      { body: Record<string, unknown> },
    ];
    expect(init.body.entity_stances).toEqual([
      { entity_id: NVDA, stance: 'bullish', weight: 0.4 },
      { entity_id: AMD, stance: 'bearish', weight: 0.25 },
    ]);
  });

  it('reads the allocation and position weights of the detail return', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: () =>
        Promise.resolve({
          data: {
            node: {
              latestRelease: {
                thesisPublication: {
                  returnTracking: 'ON',
                  thesisReturn: {
                    live: true,
                    value: 0.1,
                    firstFillAtMs: 1,
                    pricedAtMs: 2,
                    stale: false,
                    computedAtMs: 3,
                    updates: [
                      {
                        authorVersionId: '1',
                        publishedAtMs: 1,
                        startValue: 0,
                        updateReturn: 0.1,
                        positions: [
                          {
                            entityId: NVDA,
                            symbol: 'NVDA',
                            direction: 'BULLISH',
                            startPrice: 100,
                            startAtMs: 1,
                            endPrice: 125,
                            endAtMs: 2,
                            end: 'LATEST',
                            positionReturn: 0.25,
                            currency: 'USD',
                            weight: 0.4,
                          },
                        ],
                      },
                    ],
                    allocation: {
                      holdings: [
                        {
                          entityId: NVDA,
                          symbol: 'NVDA',
                          direction: 'BULLISH',
                          weight: 0.4,
                        },
                      ],
                      cash: 0.6,
                    },
                  },
                },
              },
            },
          },
        }),
    });
    globalThis.fetch = fetch;
    const got = await new AlvaClient({ apiKey: 'key' }).theses.thesisReturn(
      '9451',
      { detail: true }
    );
    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).query).toContain(
      'allocation { holdings { entityId symbol direction weight } cash }'
    );
    expect(got.thesisReturn?.allocation).toEqual({
      holdings: [
        { entityId: NVDA, symbol: 'NVDA', direction: 'BULLISH', weight: 0.4 },
      ],
      cash: 0.6,
    });
    expect(got.thesisReturn?.updates[0]?.positions[0]?.weight).toBe(0.4);
  });
});
