import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { AlvaError } from '../../src/error.js';
import {
  ASSET,
  MATERIAL,
  PROFILE,
  REQUEST_ID,
  THESIS,
  VERSION,
  problem,
  v2Fetch,
  wireThesis,
  wireVersion,
  type V2Call,
} from '../contentV2.js';

// Thesis resource on /api/v2 (M20): the REST shape of 0.x rebuilt from the
// v2 Thesis, with D16 IDs.

const NEXT = 'thesis_version_0next';

/** The REST shape of wireThesis(). */
function restThesis(overrides: Record<string, unknown> = {}) {
  return {
    id: THESIS,
    number: 42,
    author_version_id: VERSION,
    author_version_number: 2,
    material_version_id: MATERIAL,
    title: 'Thesis',
    body: 'line one\r\nline two',
    entity_ids: [ASSET],
    entity_stances: [
      { entity_id: ASSET, stance: 'bullish', direction: 'bullish' },
    ],
    visibility: 'public',
    medias: [],
    closed: false,
    closing_note: '',
    author_kind: 'alva_user',
    author_ref: PROFILE,
    archived: false,
    note: '',
    ...overrides,
  };
}

function client() {
  return new AlvaClient({ apiKey: 'key', baseUrl: 'https://api.test' });
}

function wireSignal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'signal_088',
    thesisId: THESIS,
    versionId: VERSION,
    publishedAt: '2026-11-02T00:00:00.000Z',
    stance: 'SUPPORTS',
    statement: 'NVDA compounds',
    explanation: 'evidence',
    evidence: 'exact passage',
    informationKind: 'fact',
    source: {
      type: 'news',
      title: 'Source',
      url: 'https://example.test/a',
      publishedAt: '2024-09-08T15:56:40.000Z',
    },
    ...overrides,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('ThesesResource', () => {
  it('creates with one request keyed by request_id, preserving CRLF and IDs', async () => {
    const { calls } = v2Fetch({ 'POST /theses': wireThesis() });

    await expect(
      client().theses.create({
        request_id: REQUEST_ID,
        body: 'line one\r\nline two',
        title: 'Thesis',
        entity_ids: [ASSET],
        tickers: ['NVDA', 'AAPL'],
      })
    ).resolves.toEqual({ thesis: restThesis() });

    expect(calls).toHaveLength(1);
    expect(calls[0].headers['Idempotency-Key']).toBe(REQUEST_ID);
    expect(calls[0].body).toEqual({
      title: 'Thesis',
      body: 'line one\r\nline two',
      visibility: 'PUBLIC',
      assets: [{ assetId: ASSET, stance: 'UNKNOWN' }],
      tickers: ['NVDA', 'AAPL'],
    });
  });

  it('omits the optional tickers field when the caller does not supply it', async () => {
    const { calls } = v2Fetch({ 'POST /theses': wireThesis() });
    await client().theses.create({ request_id: REQUEST_ID, body: 'view' });
    expect(calls[0].body).not.toHaveProperty('tickers');
  });

  it('extracts asset candidates and sends the confirmed stance on creation', async () => {
    const { calls } = v2Fetch({
      'POST /thesis-asset-suggestions': {
        mentions: [
          {
            quote: '英伟达',
            ticker: 'NVDA',
            kind: 'STOCK',
            resolution: 'RESOLVED',
            stance: 'BEARISH',
            candidates: [
              {
                assetId: ASSET,
                symbol: 'NVDA',
                name: 'NVIDIA',
                kind: 'STOCK',
                assetClass: null,
                exchange: null,
                logoUrl: null,
              },
            ],
          },
          {
            quote: '平仓',
            ticker: 'AMD',
            kind: 'COMMODITY',
            resolution: 'UNRESOLVED',
            stance: 'NONE',
            candidates: [],
          },
        ],
        selected: [],
        returnPreview: null,
      },
      'POST /theses': wireThesis(),
    });
    const theses = client().theses;

    expect(await theses.assetCandidates('看跌英伟达')).toEqual({
      mentions: [
        {
          quote: '英伟达',
          ticker: 'NVDA',
          resolution: 'RESOLVED',
          stance: 'BEARISH',
          candidates: [
            { entityId: ASSET, ticker: 'NVDA', name: 'NVIDIA', kind: 'STOCK' },
          ],
        },
        {
          quote: '平仓',
          ticker: 'AMD',
          resolution: 'UNRESOLVED',
          stance: 'UNKNOWN',
          candidates: [],
        },
      ],
      returnPreview: null,
    });
    expect(calls[0].body).toEqual({
      text: '看跌英伟达',
      selectedAssetIds: [],
    });

    await theses.create({
      request_id: REQUEST_ID,
      body: '看跌英伟达',
      entity_ids: [ASSET],
      entity_stances: [{ entity_id: ASSET, stance: 'bearish' }],
    });
    expect((calls[1].body as { assets: unknown }).assets).toEqual([
      { assetId: ASSET, stance: 'BEARISH' },
    ]);
  });

  it('rejects a direction that is not tied to a supplied entity', async () => {
    const { fetcher } = v2Fetch({});
    await expect(
      client().theses.create({
        request_id: REQUEST_ID,
        body: '看跌英伟达',
        tickers: ['NVDA'],
        entity_stances: [{ entity_id: ASSET, stance: 'bearish' }],
      })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects an asset candidate without an ID', async () => {
    v2Fetch({
      'POST /thesis-asset-suggestions': {
        mentions: [
          {
            quote: 'NVDA',
            ticker: 'NVDA',
            resolution: 'RESOLVED',
            stance: 'BEARISH',
            candidates: [
              { assetId: '', symbol: 'NVDA', name: 'NVIDIA', kind: 'STOCK' },
            ],
          },
        ],
      },
    });
    await expect(client().theses.assetCandidates('NVDA')).rejects.toMatchObject(
      { code: 'INVALID_RESPONSE' }
    );
  });

  it('gets a Thesis with its author and instruments', async () => {
    v2Fetch({ [`GET /theses/${THESIS}`]: wireThesis() });
    expect(await client().theses.get(THESIS)).toEqual({
      thesis: restThesis(),
      author: {
        id: PROFILE,
        kind: 'user',
        display_name: 'Alice',
        avatar_url: 'https://example.com/alice.png',
        username: 'alice',
      },
      entities: [
        {
          id: ASSET,
          ticker: 'NVDA',
          name: 'NVIDIA Corporation',
          icon_url: 'https://example.com/nvda.svg',
          kind: 'STOCK',
        },
      ],
    });
  });

  it('reads NONE as an unknown stance with a none direction', async () => {
    v2Fetch({
      [`GET /theses/${THESIS}`]: wireThesis(
        {},
        {
          assets: [
            {
              assetId: ASSET,
              stance: 'NONE',
              symbol: null,
              name: null,
              logoUrl: null,
              kind: null,
            },
          ],
        }
      ),
    });
    const got = await client().theses.get(THESIS);
    expect(got.thesis.entity_stances).toEqual([
      { entity_id: ASSET, stance: 'unknown', direction: 'none' },
    ]);
    expect(got.entities).toEqual([
      { id: ASSET, ticker: '', name: '', icon_url: '', kind: '' },
    ]);
  });

  it('lists Signal history with the Thesis research state', async () => {
    const { calls } = v2Fetch({
      [`GET /theses/${THESIS}`]: wireThesis({
        research: {
          state: 'PARTIAL',
          status: 'READY',
          paused: false,
          pendingWork: 2,
          readComplete: false,
          lastAttemptAt: '2026-11-03T00:00:00.000Z',
          lastCompletedAt: null,
        },
      }),
      [`GET /theses/${THESIS}/signals`]: {
        items: [wireSignal({ id: 'signal_087', evidence: null }), wireSignal()],
        nextPageToken: 'next',
      },
    });

    const got = await client().theses.signals(THESIS, {
      first: 2,
      cursor: 'after',
    });

    const signals = calls.find((c) => c.path.endsWith('/signals'));
    expect(Object.fromEntries(signals!.query)).toEqual({
      pageSize: '2',
      pageToken: 'after',
    });
    const signal = {
      thesis_id: THESIS,
      author_version_id: VERSION,
      statement_snapshot: 'NVDA compounds',
      stance: 'supports',
      explanation: 'evidence',
      information_kind: 'fact',
      source: {
        title: 'Source',
        url: 'https://example.test/a',
        published_at_ms: 1725811000000,
      },
    };
    expect(got).toEqual({
      research: {
        state: 'partial',
        pending_work: 2,
        read_complete: false,
        last_attempt_ms: Date.parse('2026-11-03T00:00:00.000Z'),
      },
      entries: [
        {
          feed_entry_id: 'signal_087',
          cursor: '',
          signal: { id: 'signal_087', ...signal },
        },
        {
          feed_entry_id: 'signal_088',
          cursor: 'next',
          signal: {
            id: 'signal_088',
            ...signal,
            evidence_excerpt: {
              text: 'exact passage',
              omitted_before: false,
              omitted_after: false,
            },
          },
        },
      ],
      next_cursor: 'next',
    });
  });

  it('rejects a Signal response for another Thesis', async () => {
    v2Fetch({
      [`GET /theses/${THESIS}`]: wireThesis(),
      [`GET /theses/${THESIS}/signals`]: {
        items: [wireSignal({ thesisId: 'thesis_0other' })],
        nextPageToken: null,
      },
    });
    await expect(client().theses.signals(THESIS)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it.each([0, 51, 1.5])(
    'rejects invalid Signal page size %s before HTTP',
    async (first) => {
      const { fetcher } = v2Fetch({});
      await expect(
        client().theses.signals(THESIS, { first })
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it('gets one exact author version with the Thesis state, not the current version', async () => {
    const old = wireVersion({
      id: 'thesis_version_0old',
      number: 1,
      materialVersionId: 'thesis_version_0old',
      body: 'Old view',
      note: 'first',
    });
    v2Fetch({
      [`GET /theses/${THESIS}`]: wireThesis({ archived: true }),
      'GET /thesis-versions/thesis_version_0old': old,
    });

    expect(
      await client().theses.getVersion(THESIS, 'thesis_version_0old')
    ).toEqual({
      thesis: restThesis({
        author_version_id: 'thesis_version_0old',
        author_version_number: 1,
        material_version_id: 'thesis_version_0old',
        body: 'Old view',
        note: 'first',
        archived: true,
      }),
    });
  });

  it('rejects an exact-version response that does not match the requested version', async () => {
    v2Fetch({
      [`GET /theses/${THESIS}`]: wireThesis(),
      'GET /thesis-versions/thesis_version_0old': wireVersion(),
    });
    await expect(
      client().theses.getVersion(THESIS, 'thesis_version_0old')
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('accepts 100 entity IDs in a request and a response, and rejects 101 in a response', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `asset_0${i}`);
    const assets = (n: number) =>
      ids.slice(0, n).map((assetId) => ({
        assetId,
        stance: 'BEARISH',
        symbol: null,
        name: null,
        logoUrl: null,
        kind: null,
      }));
    const { calls } = v2Fetch({
      'POST /theses': wireThesis({}, { assets: assets(100) }),
      [`GET /theses/${THESIS}`]: wireThesis({}, { assets: assets(101) }),
    });
    const theses = client().theses;

    const created = await theses.create({
      request_id: REQUEST_ID,
      body: 'draft',
      entity_ids: ids.slice(0, 100),
      entity_stances: ids
        .slice(0, 100)
        .map((entity_id) => ({ entity_id, stance: 'bearish' as const })),
    });
    expect(created.thesis.entity_ids).toEqual(ids.slice(0, 100));
    expect((calls[0].body as { assets: unknown[] }).assets).toHaveLength(100);
    await expect(theses.get(THESIS)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('publishes an Update, changing visibility first only when it differs', async () => {
    const updated = wireThesis(
      { visibility: 'PRIVATE' },
      { id: NEXT, body: 'updated', assets: [] }
    );
    const { calls } = v2Fetch({
      [`GET /theses/${THESIS}`]: wireThesis(),
      [`PATCH /theses/${THESIS}`]: wireThesis({ visibility: 'PRIVATE' }),
      [`POST /theses/${THESIS}/updates`]: updated,
    });
    const theses = client().theses;
    const params = {
      request_id: REQUEST_ID,
      expected_author_version_id: VERSION,
      body: 'updated',
      visibility: 'private' as const,
      note: 'why',
      track_return: true,
    };

    const got = await theses.update(THESIS, params);
    await theses.update(THESIS, { ...params, visibility: 'public' });

    expect(got.thesis).toMatchObject({
      author_version_id: NEXT,
      visibility: 'private',
      body: 'updated',
    });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `GET /theses/${THESIS}`,
      `PATCH /theses/${THESIS}`,
      `POST /theses/${THESIS}/updates`,
      `GET /theses/${THESIS}`,
      `POST /theses/${THESIS}/updates`,
    ]);
    expect(calls[1].body).toEqual({ visibility: 'PRIVATE' });
    expect(calls[2].headers['Idempotency-Key']).toBe(REQUEST_ID);
    expect(calls[2].body).toEqual({
      expectedVersionId: VERSION,
      title: '',
      body: 'updated',
      assets: [],
      media: [],
      note: 'why',
      trackReturn: true,
    });
  });

  it('unarchives an archived Thesis, then publishes the Update from the new version', async () => {
    const unarchived = wireThesis({}, { id: 'thesis_version_0un' });
    const { calls } = v2Fetch({
      [`GET /theses/${THESIS}`]: wireThesis({ archived: true }),
      [`POST /theses/${THESIS}/unarchive`]: unarchived,
      [`POST /theses/${THESIS}/updates`]: (call: V2Call) =>
        wireThesis(
          {},
          {
            id: NEXT,
            body: (call.body as { body: string }).body,
          }
        ),
    });

    const got = await client().theses.update(THESIS, {
      request_id: REQUEST_ID,
      expected_author_version_id: VERSION,
      body: 'back again',
      entity_ids: [ASSET],
      visibility: 'public',
      archived: false,
      note: 'returning',
    });

    expect(got.thesis).toMatchObject({
      archived: false,
      author_version_id: NEXT,
      body: 'back again',
    });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `GET /theses/${THESIS}`,
      `POST /theses/${THESIS}/unarchive`,
      `POST /theses/${THESIS}/updates`,
    ]);
    expect(calls[1].body).toEqual({
      expectedVersionId: VERSION,
      note: 'returning',
    });
    // The Update is the write the caller's request ID names.
    expect(calls[1].headers['Idempotency-Key']).not.toBe(REQUEST_ID);
    expect(calls[2].headers['Idempotency-Key']).toBe(REQUEST_ID);
    expect(calls[2].body).toMatchObject({
      expectedVersionId: 'thesis_version_0un',
    });
  });

  it('does not unarchive a Thesis that is not archived', async () => {
    const { calls } = v2Fetch({
      [`GET /theses/${THESIS}`]: wireThesis(),
      [`POST /theses/${THESIS}/updates`]: wireThesis({}, { id: NEXT }),
    });
    await client().theses.update(THESIS, {
      request_id: REQUEST_ID,
      expected_author_version_id: VERSION,
      body: 'view',
      visibility: 'public',
      archived: false,
    });
    expect(calls.map((c) => c.path)).toEqual([
      `/theses/${THESIS}`,
      `/theses/${THESIS}/updates`,
    ]);
  });

  it('refuses archived: true on update before any request', async () => {
    const { fetcher } = v2Fetch({});
    await expect(
      client().theses.update(THESIS, {
        request_id: REQUEST_ID,
        expected_author_version_id: VERSION,
        body: 'view',
        visibility: 'public',
        archived: true,
      })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('archives from the current version with the note, keyed by request_id', async () => {
    const { calls } = v2Fetch({
      [`GET /theses/${THESIS}`]: wireThesis(),
      [`POST /theses/${THESIS}/archive`]: wireThesis({ archived: true }),
    });

    await expect(
      client().theses.setArchived(THESIS, {
        request_id: REQUEST_ID,
        archived: true,
        note: 'review later',
      })
    ).resolves.toEqual({ thesis: restThesis({ archived: true }) });
    expect(calls[1].headers['Idempotency-Key']).toBe(REQUEST_ID);
    expect(calls[1].body).toEqual({
      expectedVersionId: VERSION,
      note: 'review later',
    });
  });

  it('unarchives through its route, and keeps the no-op without a write', async () => {
    const { calls } = v2Fetch({
      [`GET /theses/${THESIS}`]: wireThesis({ archived: true }),
      [`POST /theses/${THESIS}/unarchive`]: wireThesis({}, { id: NEXT }),
    });
    const theses = client().theses;

    await expect(
      theses.setArchived(THESIS, { request_id: REQUEST_ID, archived: true })
    ).resolves.toEqual({ thesis: restThesis({ archived: true }) });
    expect(calls).toHaveLength(1);

    const got = await theses.setArchived(THESIS, {
      request_id: REQUEST_ID,
      archived: false,
    });
    expect(got.thesis).toMatchObject({
      archived: false,
      author_version_id: NEXT,
    });
    expect(calls[2].path).toBe(`/theses/${THESIS}/unarchive`);
  });

  it('rejects an archive response that did not apply the state', async () => {
    v2Fetch({
      [`GET /theses/${THESIS}`]: wireThesis(),
      [`POST /theses/${THESIS}/archive`]: wireThesis(),
    });
    await expect(
      client().theses.setArchived(THESIS, {
        request_id: REQUEST_ID,
        archived: true,
      })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('stars and unstars through the followed-Theses collection', async () => {
    const { calls } = v2Fetch({
      'POST /me/followed-theses': {
        thesisId: THESIS,
        followerCount: 17,
        following: true,
      },
      [`DELETE /me/followed-theses/${THESIS}`]: {
        thesisId: THESIS,
        followerCount: 16,
        following: false,
      },
    });
    const theses = client().theses;

    await expect(theses.setStarred(THESIS, true)).resolves.toEqual({
      thesis_id: THESIS,
      star_count: 17,
      is_starred: true,
    });
    await expect(theses.setStarred(THESIS, false)).resolves.toEqual({
      thesis_id: THESIS,
      star_count: 16,
      is_starred: false,
    });
    expect(calls[0].body).toEqual({ thesisId: THESIS });
    expect(calls[1].body).toBeUndefined();
  });

  it('rejects a star response that did not apply the state', async () => {
    v2Fetch({
      'POST /me/followed-theses': {
        thesisId: THESIS,
        followerCount: 17,
        following: false,
      },
    });
    await expect(
      client().theses.setStarred(THESIS, true)
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('pauses and resumes Signal research with authoritative state', async () => {
    const research = (paused: boolean) => ({
      research: {
        state: 'PAUSED',
        status: 'READY',
        paused,
        pendingWork: 0,
        readComplete: true,
        lastAttemptAt: null,
        lastCompletedAt: null,
      },
    });
    const { calls } = v2Fetch({
      [`POST /theses/${THESIS}/research/resume`]: wireThesis(research(false)),
      [`POST /theses/${THESIS}/research/pause`]: wireThesis(research(true)),
    });
    const theses = client().theses;

    await expect(theses.setSignalEnabled(THESIS, true)).resolves.toEqual({
      thesis_id: THESIS,
      author_version_id: VERSION,
      archived: false,
      research_paused: false,
      enabled: true,
    });
    await expect(theses.setSignalEnabled(THESIS, false)).resolves.toMatchObject(
      { research_paused: true, enabled: false }
    );
    expect(calls.map((c) => c.path)).toEqual([
      `/theses/${THESIS}/research/resume`,
      `/theses/${THESIS}/research/pause`,
    ]);
  });

  it('keeps the code and status of a problem', async () => {
    v2Fetch({
      [`POST /theses/${THESIS}/research/resume`]: problem(
        404,
        'NOT_FOUND',
        'no such Thesis'
      ),
    });
    await expect(
      client().theses.setSignalEnabled(THESIS, true)
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
      message: 'no such Thesis',
    });
  });

  it('rejects invalid visibility requests and mismatched responses', async () => {
    const { fetcher } = v2Fetch({});
    const theses = client().theses;

    await expect(
      theses.setVisibility('', { visibility: 'private' })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(
      theses.setVisibility(THESIS, { visibility: 'paid' as never })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(
      theses.setVisibility(THESIS, undefined as never)
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(fetcher).not.toHaveBeenCalled();

    const { calls } = v2Fetch({
      [`PATCH /theses/${THESIS}`]: wireThesis(),
      'PATCH /theses/thesis_0other': wireThesis({ visibility: 'PRIVATE' }),
    });
    await expect(
      theses.setVisibility(THESIS, { visibility: 'private' })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(calls[0].body).toEqual({ visibility: 'PRIVATE' });
    await expect(
      theses.setVisibility('thesis_0other', { visibility: 'private' })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('rejects a numeric response ID', async () => {
    v2Fetch({ [`GET /theses/${THESIS}`]: wireThesis({ id: 42 }) });
    await expect(client().theses.get(THESIS)).rejects.toMatchObject({
      name: 'AlvaError',
      code: 'INVALID_RESPONSE',
    });
  });

  it.each([
    ['Thesis', { number: '42' }, {}],
    ['version', {}, { number: 0 }],
  ])(
    'rejects a %s response without a positive number',
    async (_, thesis, version) => {
      v2Fetch({ [`GET /theses/${THESIS}`]: wireThesis(thesis, version) });
      await expect(client().theses.get(THESIS)).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
      });
    }
  );

  it.each([
    ['blank body', {}, { body: ' \r\n\t' }],
    ['oversize body', {}, { body: 'a'.repeat(65_537) }],
    ['NUL body', {}, { body: 'draft\0body' }],
    ['oversize title', {}, { title: 'a'.repeat(501) }],
    ['NUL title', {}, { title: 'thesis\0title' }],
    ['NUL closing note', { closingNote: 'done\0unsafe' }, {}],
    ['unknown visibility', { visibility: 'SECRET' }, {}],
  ])('rejects %s in a Thesis response', async (_name, thesis, version) => {
    v2Fetch({ [`GET /theses/${THESIS}`]: wireThesis(thesis, version) });
    await expect(client().theses.get(THESIS)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('does not retry a stable request ID after a backend error', async () => {
    const { fetcher } = v2Fetch({
      'POST /theses': problem(503, 'UNAVAILABLE', 'service unavailable'),
    });
    await expect(
      client().theses.create({ request_id: REQUEST_ID, body: 'draft' })
    ).rejects.toBeInstanceOf(AlvaError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['empty ID', { request_id: REQUEST_ID, body: 'draft', entity_ids: [''] }],
    [
      'padded ID',
      { request_id: REQUEST_ID, body: 'draft', entity_ids: [` ${ASSET}`] },
    ],
    [
      'numeric ID',
      { request_id: REQUEST_ID, body: 'draft', entity_ids: [42 as never] },
    ],
    [
      'more than 100 entity IDs',
      {
        request_id: REQUEST_ID,
        body: 'draft',
        entity_ids: Array.from({ length: 101 }, (_, i) => `asset_0${i}`),
      },
    ],
    [
      'nil request ID',
      { request_id: '00000000-0000-0000-0000-000000000000', body: 'draft' },
    ],
    ['blank body', { request_id: REQUEST_ID, body: ' \r\n\t' }],
    ['blank ticker', { request_id: REQUEST_ID, body: 'draft', tickers: [' '] }],
    [
      'ticker NUL',
      { request_id: REQUEST_ID, body: 'draft', tickers: ['A\0B'] },
    ],
    ['body NUL', { request_id: REQUEST_ID, body: 'draft\0body' }],
    ['title NUL', { request_id: REQUEST_ID, body: 'draft', title: 'a\0b' }],
    [
      'body over 65536 bytes',
      { request_id: REQUEST_ID, body: 'a'.repeat(65_537) },
    ],
    [
      'title over 500 bytes',
      { request_id: REQUEST_ID, body: 'draft', title: 'a'.repeat(501) },
    ],
    [
      'unsupported visibility',
      { request_id: REQUEST_ID, body: 'draft', visibility: 'paid' as never },
    ],
  ])('rejects %s before the HTTP boundary', async (_name, params) => {
    const { fetcher } = v2Fetch({});
    await expect(client().theses.create(params)).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(['', ' \r\n', 'a'.repeat(65_537)])(
    'rejects invalid rewrite output at the SDK boundary',
    async (body) => {
      v2Fetch({ 'POST /thesis-rewrites': { body } });
      await expect(
        client().theses.rewrite({ body: 'draft' })
      ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  );

  it.each(['reformat', 'shorten', 'enrich'] as const)(
    'sends canonical rewrite mode %s exactly once',
    async (mode) => {
      const { calls } = v2Fetch({
        'POST /thesis-rewrites': { body: 'candidate' },
      });
      await expect(
        client().theses.rewrite({ body: 'draft', mode })
      ).resolves.toEqual({ body: 'candidate' });
      expect(calls).toHaveLength(1);
      expect(calls[0].body).toEqual({
        body: 'draft',
        mode: mode.toUpperCase(),
      });
    }
  );

  it('sends REFORMAT when rewrite mode is omitted', async () => {
    const { calls } = v2Fetch({
      'POST /thesis-rewrites': { body: 'candidate' },
    });
    await client().theses.rewrite({ body: 'draft' });
    expect(calls[0].body).toEqual({ body: 'draft', mode: 'REFORMAT' });
  });

  it.each(['', ' ', 'rewrite', null])(
    'rejects invalid rewrite mode %j without an HTTP request',
    async (mode) => {
      const { fetcher } = v2Fetch({});
      await expect(
        client().theses.rewrite({ body: 'draft', mode: mode as never })
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
});

describe('Thesis return preview and switch (2026-11-16-thesis-agent-return-preview)', () => {
  it('asks for directions of known tickers without discovery and parses the preview', async () => {
    const { calls } = v2Fetch({
      'POST /thesis-asset-suggestions': {
        mentions: [],
        selected: [],
        returnPreview: {
          tracking: 'ON',
          askSwitch: false,
          stances: [{ assetId: ASSET, stance: 'BULLISH' }],
          keptAssetIds: [ASSET],
          lastLegRemoved: false,
        },
      },
    });
    const got = await client().theses.assetCandidates('平仓英伟达', {
      entityIds: [ASSET],
      thesisId: THESIS,
      discover: false,
    });
    expect(calls[0].body).toEqual({
      text: '平仓英伟达',
      selectedAssetIds: [ASSET],
      thesisId: THESIS,
      discover: false,
    });
    expect(got.returnPreview).toEqual({
      tracking: 'ON',
      askSwitch: false,
      directions: [{ entityId: ASSET, direction: 'BULLISH' }],
      keptEntityIds: [ASSET],
      lastLegRemoved: false,
    });
  });

  it('rejects an invalid preview', async () => {
    v2Fetch({
      'POST /thesis-asset-suggestions': {
        mentions: [],
        returnPreview: { tracking: 'MAYBE' },
      },
    });
    await expect(
      client().theses.assetCandidates('x', { discover: false })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('sends trackReturn and NONE only when given', async () => {
    const { calls } = v2Fetch({ 'POST /theses': wireThesis() });
    const theses = client().theses;
    await theses.create({
      request_id: REQUEST_ID,
      body: 'statement',
      entity_ids: [ASSET],
      entity_stances: [{ entity_id: ASSET, stance: 'none' }],
      track_return: false,
    });
    expect(calls[0].body).toMatchObject({
      trackReturn: false,
      assets: [{ assetId: ASSET, stance: 'NONE' }],
    });
    await theses.create({ request_id: REQUEST_ID, body: 'statement' });
    expect(calls[1].body).not.toHaveProperty('trackReturn');
  });

  const wireReturn = (update: Record<string, unknown> = {}) => ({
    tracking: 'ON',
    return: {
      live: true,
      value: 0.25,
      firstFillAt: '2026-11-01T00:00:00.001Z',
      pricedAt: null,
      stale: false,
      computedAt: '2026-11-01T00:00:00.003Z',
      updates: [
        {
          versionId: VERSION,
          publishedAt: '2026-11-01T00:00:00.001Z',
          startValue: 0,
          updateReturn: 0.25,
          positions: [
            {
              assetId: ASSET,
              symbol: 'NVDA',
              direction: 'BEARISH',
              startPrice: '216.38',
              startAt: '2026-11-01T00:00:00.001Z',
              endPrice: null,
              endAt: null,
              end: 'LATEST',
              positionReturn: 0.25,
              currency: 'USD',
            },
          ],
          ...update,
        },
      ],
    },
  });

  it('reads the Thesis return', async () => {
    const { calls } = v2Fetch({
      [`GET /theses/${THESIS}/return`]: wireReturn(),
    });
    const got = await client().theses.thesisReturn(THESIS, { detail: true });
    expect(calls[0].query.get('detail')).toBe('true');
    expect(got).toEqual({
      playbookId: THESIS,
      returnTracking: 'ON',
      thesisReturn: {
        live: true,
        value: 0.25,
        firstFillAtMs: Date.parse('2026-11-01T00:00:00.001Z'),
        pricedAtMs: null,
        stale: false,
        computedAtMs: Date.parse('2026-11-01T00:00:00.003Z'),
        updates: [
          {
            authorVersionId: VERSION,
            publishedAtMs: Date.parse('2026-11-01T00:00:00.001Z'),
            startValue: 0,
            updateReturn: 0.25,
            positions: [
              {
                entityId: ASSET,
                symbol: 'NVDA',
                direction: 'BEARISH',
                startPrice: 216.38,
                startAtMs: Date.parse('2026-11-01T00:00:00.001Z'),
                endPrice: null,
                endAtMs: null,
                end: 'LATEST',
                positionReturn: 0.25,
                currency: 'USD',
              },
            ],
          },
        ],
      },
    });
    await expect(client().theses.thesisReturn('')).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
  });

  it('reads an untracked return as null and rejects an Update without its publication time', async () => {
    v2Fetch({
      [`GET /theses/${THESIS}/return`]: { tracking: 'OFF', return: null },
      'GET /theses/thesis_0bad/return': wireReturn({ publishedAt: null }),
    });
    expect(await client().theses.thesisReturn(THESIS)).toEqual({
      playbookId: THESIS,
      returnTracking: 'OFF',
      thesisReturn: null,
    });
    await expect(
      client().theses.thesisReturn('thesis_0bad')
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('reads the current watchpoints of a Thesis, an unknown origin as unknown', async () => {
    v2Fetch({
      [`GET /theses/${THESIS}/watchpoints`]: {
        versionId: VERSION,
        watchpoints: [
          { label: 'W1', text: 'AI capex peaks', origin: 'STATED' },
          { label: 'W4', text: 'Export rules tighten', origin: 'INFERRED' },
          { label: 'W5', text: 'New', origin: 'UNKNOWN' },
        ],
      },
    });
    expect(await client().theses.watchpoints(THESIS)).toEqual({
      playbookId: THESIS,
      watchpoints: [
        { label: 'W1', text: 'AI capex peaks', origin: 'stated' },
        { label: 'W4', text: 'Export rules tighten', origin: 'inferred' },
        { label: 'W5', text: 'New', origin: 'unknown' },
      ],
    });
    await expect(client().theses.watchpoints('')).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
  });

  it('returns no watchpoints for a Thesis without any, NOT_FOUND for an unreadable one, and fails closed on a malformed entry', async () => {
    v2Fetch({
      [`GET /theses/${THESIS}/watchpoints`]: {
        versionId: null,
        watchpoints: [],
      },
      'GET /theses/thesis_0bad/watchpoints': {
        versionId: VERSION,
        watchpoints: [{ label: 'W1', text: '', origin: 'STATED' }],
      },
    });
    const theses = client().theses;
    expect(await theses.watchpoints(THESIS)).toEqual({
      playbookId: THESIS,
      watchpoints: [],
    });
    await expect(theses.watchpoints('thesis_0missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(theses.watchpoints('thesis_0bad')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});
