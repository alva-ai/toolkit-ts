import { afterEach, describe, expect, it } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { AlvaError } from '../../src/error.js';
import { fakeV2, problem } from '../fakeV2.js';
import { v2 } from '../v2Schema.js';
import {
  ASSET,
  ASSET_2,
  PROFILE,
  REQUEST_ID,
  THESIS,
  VERSION,
  aPage,
  aProfile,
  aThesis,
  aVersion,
} from '../contentV2.js';

// ThesesResource on /api/v2: the routes' JSON is the result, unmapped.

let fake: ReturnType<typeof fakeV2> | undefined;
afterEach(() => fake?.restore());

function client() {
  return new AlvaClient({ apiKey: 'key', baseUrl: 'https://api.test' });
}

const UUID =
  /^"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"$/;

describe('ThesesResource reads', () => {
  it('returns a Thesis by ID and by number as the route answers', async () => {
    const thesis = aThesis({ visibility: 'PAID', author: null });
    fake = fakeV2({
      [`GET /theses/${THESIS}`]: () => thesis,
      'GET /theses/by-number/42': () => thesis,
    });

    await expect(client().theses.get(THESIS)).resolves.toEqual(thesis);
    await expect(client().theses.getByNumber(42)).resolves.toEqual(thesis);
  });

  it('returns an Update by ID and by the Thesis and Update numbers', async () => {
    const version = aVersion({ number: 3, note: 'why' });
    fake = fakeV2({
      [`GET /thesis-versions/${VERSION}`]: () => version,
      'GET /theses/by-number/42/versions/3': () => version,
    });

    await expect(client().theses.getVersion(VERSION)).resolves.toEqual(version);
    await expect(client().theses.getVersionByNumber(42, 3)).resolves.toEqual(
      version
    );
    expect(fake.calls.map((c) => c.path)).toEqual([
      `/thesis-versions/${VERSION}`,
      '/theses/by-number/42/versions/3',
    ]);
  });

  it('passes page queries through and returns the pages as they are', async () => {
    const updates = aPage([aVersion()], 'next');
    const signals = aPage(
      [
        v2('Signal', {
          id: 'signal_0a',
          thesisId: THESIS,
          versionId: VERSION,
          statement: 'Demand holds',
          stance: 'SUPPORTS',
          explanation: 'Orders grew',
          informationKind: 'NEWS',
          evidence: null,
          publishedAt: '2026-11-02T10:00:00Z',
          source: {
            title: 'Orders',
            type: 'NEWS',
            url: null,
            publishedAt: null,
          },
        }),
      ],
      null
    );
    fake = fakeV2({
      [`GET /theses/${THESIS}/updates`]: () => updates,
      [`GET /theses/${THESIS}/signals`]: () => signals,
    });

    await expect(
      client().theses.listUpdates(THESIS, { pageSize: 1, pageToken: 'p1' })
    ).resolves.toEqual(updates);
    await expect(client().theses.signals(THESIS)).resolves.toEqual(signals);
    expect(Object.fromEntries(fake.calls[0].query)).toEqual({
      pageSize: '1',
      pageToken: 'p1',
    });
    expect([...fake.calls[1].query]).toEqual([]);
  });

  it('throws RELATED_THESES_GENERATING once, without retrying or a mapped state', async () => {
    const related = aPage([
      v2('RelatedThesis', {
        id: THESIS,
        itemId: 'item-1',
        score: '0.82',
        thesis: aThesis(),
      }),
    ]);
    fake = fakeV2({
      [`GET /theses/${THESIS}/related`]: [
        () => related,
        () =>
          problem(503, 'UNAVAILABLE', { reason: 'RELATED_THESES_GENERATING' }),
      ],
    });

    await expect(client().theses.related(THESIS)).resolves.toEqual(related);
    const err = await client()
      .theses.related(THESIS, { pageSize: 5 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AlvaError);
    expect(err).toMatchObject({
      status: 503,
      code: 'UNAVAILABLE',
      reason: 'RELATED_THESES_GENERATING',
    });
    expect(fake.calls).toHaveLength(2);
  });

  it('reads the return with its detail flag and the watchpoints', async () => {
    // The detail return: each position's target share and the allocation.
    const info = v2('ThesisReturnInfo', {
      tracking: 'ON',
      return: {
        live: true,
        value: '0.03',
        firstFillAt: '2026-11-01T14:30:00Z',
        pricedAt: '2026-11-24T21:00:00Z',
        stale: false,
        computedAt: '2026-11-24T21:00:00Z',
        updates: [
          {
            versionId: VERSION,
            publishedAt: '2026-11-01T10:00:00Z',
            startValue: '0',
            updateReturn: '0.03',
            positions: [
              {
                assetId: ASSET,
                symbol: 'NVDA',
                direction: 'BULLISH',
                startPrice: '100',
                startAt: '2026-11-01T14:30:00Z',
                endPrice: '107.5',
                endAt: '2026-11-24T21:00:00Z',
                end: 'LATEST',
                positionReturn: '0.075',
                currency: 'USD',
                weight: '0.4',
              },
            ],
          },
        ],
        allocation: {
          holdings: [
            {
              assetId: ASSET,
              symbol: 'NVDA',
              direction: 'BULLISH',
              weight: '0.4',
            },
          ],
          cash: '0.6',
        },
      },
    });
    const watchpoints = v2('ThesisWatchpoints', {
      versionId: VERSION,
      watchpoints: [{ label: 'W1', text: 'Margins', origin: 'STATED' }],
    });
    fake = fakeV2({
      [`GET /theses/${THESIS}/return`]: () => info,
      [`GET /theses/${THESIS}/watchpoints`]: () => watchpoints,
    });

    await expect(
      client().theses.thesisReturn(THESIS, { detail: true })
    ).resolves.toEqual(info);
    await expect(client().theses.watchpoints(THESIS)).resolves.toEqual(
      watchpoints
    );
    expect(fake.calls[0].query.get('detail')).toBe('true');
  });
});

describe('ThesesResource.list', () => {
  it('lists an exact username with the archived filter', async () => {
    const page = aPage([aThesis()], 'next');
    fake = fakeV2({
      'GET /profiles': () =>
        aPage([aProfile({ id: 'profile_0b', handle: 'alicex' }), aProfile()]),
      [`GET /profiles/${PROFILE}/theses`]: () => page,
    });

    await expect(
      client().theses.list({
        user: 'Alice',
        archived: true,
        pageSize: 5,
        pageToken: 'p1',
      })
    ).resolves.toEqual(page);
    expect(Object.fromEntries(fake.calls[0].query)).toEqual({
      query: 'Alice',
      kind: 'USER',
      pageSize: '50',
    });
    expect(Object.fromEntries(fake.calls[1].query)).toEqual({
      archived: 'true',
      pageSize: '5',
      pageToken: 'p1',
    });
  });

  it('resolves a person name only to a unique match', async () => {
    const ada = aProfile({ kind: 'PERSON', handle: 'ada', displayName: 'Ada' });
    fake = fakeV2({
      'GET /profiles': [
        () => aPage([ada]),
        () =>
          aPage([
            ada,
            aProfile({ id: 'profile_0b', kind: 'PERSON', handle: 'ada2' }),
          ]),
        () => aPage([]),
      ],
      [`GET /profiles/${PROFILE}/theses`]: () => aPage([]),
    });

    await expect(client().theses.list({ personName: 'Ada' })).resolves.toEqual(
      aPage([])
    );
    expect(fake.calls[0].query.get('kind')).toBe('PERSON');

    const ambiguous = await client()
      .theses.list({ personName: 'Ada' })
      .catch((e: unknown) => e);
    expect(ambiguous).toMatchObject({
      code: 'AMBIGUOUS_IDENTITY',
      details: {
        candidates: [
          { id: PROFILE, handle: 'ada', displayName: 'Ada' },
          { id: 'profile_0b', handle: 'ada2', displayName: 'Alice' },
        ],
        more: false,
      },
    });
    expect((ambiguous as Error).message).toContain('"handle":"ada2"');

    await expect(
      client().theses.list({ personName: 'Nobody' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    // Only the first name was listed.
    expect(fake.calls.map((c) => c.path)).toEqual([
      '/profiles',
      `/profiles/${PROFILE}/theses`,
      '/profiles',
      '/profiles',
    ]);
  });

  it('lists an asset by symbol or by ID', async () => {
    const asset = v2('Asset', {
      id: ASSET,
      symbol: 'NVDA',
      name: 'NVIDIA Corporation',
      kind: 'STOCK',
      assetClass: null,
      categories: ['US_STOCK'],
      logo: null,
      quote: null,
      venue: null,
    });
    const page = aPage([aThesis()]);
    fake = fakeV2({
      'GET /assets/by-symbol/BRK.B': () => asset,
      [`GET /assets/${ASSET}/theses`]: () => page,
      [`GET /assets/${ASSET_2}/theses`]: () => page,
    });

    await expect(
      client().theses.list({ ticker: 'BRK.B', pageSize: 3 })
    ).resolves.toEqual(page);
    await expect(client().theses.list({ assetId: ASSET_2 })).resolves.toEqual(
      page
    );
    expect(fake.calls.map((c) => `${c.path}?${c.query}`)).toEqual([
      '/assets/by-symbol/BRK.B?',
      `/assets/${ASSET}/theses?pageSize=3`,
      `/assets/${ASSET_2}/theses?`,
    ]);
  });

  it.each([
    {},
    { user: 'ada', person: 'ada' },
    { ticker: 'NVDA', archived: true },
  ])('refuses %j before any request', async (params) => {
    fake = fakeV2({});
    await expect(client().theses.list(params)).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
      status: 400,
    });
    expect(fake.calls).toHaveLength(0);
  });
});

describe('ThesesResource writes', () => {
  it('creates a Thesis with the request ID as its Idempotency-Key', async () => {
    const created = aThesis();
    fake = fakeV2({ 'POST /theses': () => created });
    const body = {
      title: '',
      body: 'line one\r\nline two',
      assets: [{ assetId: ASSET, stance: 'BEARISH' as const }],
      tickers: ['AMD'],
      trackReturn: false,
    };

    await expect(
      client().theses.create(body, { idempotencyKey: REQUEST_ID })
    ).resolves.toEqual(created);
    expect(fake.calls[0].body).toEqual(body);
    expect(fake.calls[0].headers['Idempotency-Key']).toBe(`"${REQUEST_ID}"`);
  });

  it('publishes an Update, its visibility and its unarchive in one write', async () => {
    const published = aThesis(
      { visibility: 'PRIVATE' },
      { id: 'thesis_version_0b', number: 3 }
    );
    fake = fakeV2({ [`POST /theses/${THESIS}/updates`]: () => published });
    const update = {
      expectedVersionId: VERSION,
      body: 'Back in play',
      visibility: 'PRIVATE' as const,
      archived: false,
    };

    await expect(
      client().theses.update(THESIS, update, { idempotencyKey: REQUEST_ID })
    ).resolves.toEqual(published);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].body).toEqual(update);
    expect(fake.calls[0].headers['Idempotency-Key']).toBe(`"${REQUEST_ID}"`);
  });

  it('archives and unarchives the Update it names', async () => {
    fake = fakeV2({
      [`POST /theses/${THESIS}/archive`]: () => aThesis({ archived: true }),
      [`POST /theses/${THESIS}/unarchive`]: () => aThesis(),
    });

    await client().theses.archive(
      THESIS,
      { expectedVersionId: VERSION, note: 'later' },
      { idempotencyKey: REQUEST_ID }
    );
    await client().theses.unarchive(THESIS, { expectedVersionId: VERSION });
    expect(fake.calls.map((c) => [c.path, c.body])).toEqual([
      [
        `/theses/${THESIS}/archive`,
        { expectedVersionId: VERSION, note: 'later' },
      ],
      [`/theses/${THESIS}/unarchive`, { expectedVersionId: VERSION }],
    ]);
    expect(fake.calls[0].headers['Idempotency-Key']).toBe(`"${REQUEST_ID}"`);
    expect(fake.calls[1].headers['Idempotency-Key']).toMatch(UUID);
  });

  it('changes the visibility with a merge patch and surfaces the renewal reason', async () => {
    fake = fakeV2({
      [`PATCH /theses/${THESIS}`]: [
        () =>
          problem(409, 'CONFLICT', {
            reason: 'PAID_RENEWALS_END_CONFIRMATION_REQUIRED',
          }),
        () => aThesis(),
      ],
    });

    await expect(
      client().theses.setVisibility(THESIS, { visibility: 'PUBLIC' })
    ).rejects.toMatchObject({
      status: 409,
      reason: 'PAID_RENEWALS_END_CONFIRMATION_REQUIRED',
    });
    await client().theses.setVisibility(THESIS, {
      visibility: 'PUBLIC',
      confirmEndPaidRenewals: true,
    });
    expect(fake.calls[1].body).toEqual({
      visibility: 'PUBLIC',
      confirmEndPaidRenewals: true,
    });
    expect(fake.calls[1].headers['Content-Type']).toBe(
      'application/merge-patch+json'
    );
  });

  it('stars and unstars through the followed-Theses collection', async () => {
    const follow = (following: boolean) =>
      v2('ThesisFollow', { thesisId: THESIS, following, followerCount: 4 });
    fake = fakeV2({
      'POST /me/followed-theses': () => follow(true),
      [`DELETE /me/followed-theses/${THESIS}`]: () => follow(false),
    });

    await expect(client().theses.setStarred(THESIS, true)).resolves.toEqual(
      follow(true)
    );
    await expect(client().theses.setStarred(THESIS, false)).resolves.toEqual(
      follow(false)
    );
    expect(fake.calls[0].body).toEqual({ thesisId: THESIS });
    expect(fake.calls[1].body).toBeUndefined();
  });

  it('reads and patches the Signal setting', async () => {
    const setting = v2('SignalPreferences', {
      kinds: ['MACRO'],
      minImportance: 'MAJOR',
    });
    fake = fakeV2({
      [`GET /theses/${THESIS}/signal-preferences`]: () => setting,
      'GET /me/thesis-signal-preferences': () => setting,
      [`PATCH /theses/${THESIS}/signal-preferences`]: () => setting,
    });

    await expect(client().theses.signalPreferences(THESIS)).resolves.toEqual(
      setting
    );
    await expect(client().theses.lastSignalPreferences()).resolves.toEqual(
      setting
    );
    await expect(
      client().theses.updateSignalPreferences(THESIS, {
        minImportance: 'MAJOR',
      })
    ).resolves.toEqual(setting);
    expect(fake.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `GET /theses/${THESIS}/signal-preferences`,
      'GET /me/thesis-signal-preferences',
      `PATCH /theses/${THESIS}/signal-preferences`,
    ]);
    expect(fake.calls[2].body).toEqual({ minImportance: 'MAJOR' });
  });

  it('pauses and resumes Signal research', async () => {
    fake = fakeV2({
      [`POST /theses/${THESIS}/research/pause`]: () => aThesis(),
      [`POST /theses/${THESIS}/research/resume`]: () => aThesis(),
    });

    await client().theses.setSignalEnabled(THESIS, false);
    await client().theses.setSignalEnabled(THESIS, true);
    expect(fake.calls.map((c) => c.path)).toEqual([
      `/theses/${THESIS}/research/pause`,
      `/theses/${THESIS}/research/resume`,
    ]);
  });

  it('sends asset suggestions and rewrites as given, each with a key', async () => {
    const suggestions = v2('AssetSuggestions', {
      mentions: [
        {
          quote: 'NVIDIA',
          ticker: 'NVDA',
          kind: 'STOCK',
          resolution: 'RESOLVED',
          stance: 'NONE',
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
      ],
      selected: [{ assetId: ASSET, stance: 'NONE' }],
      returnPreview: {
        tracking: 'UNSET',
        askSwitch: true,
        stances: [{ assetId: ASSET, stance: 'NONE' }],
        keptAssetIds: [],
        lastLegRemoved: false,
      },
    });
    fake = fakeV2({
      'POST /thesis-asset-suggestions': () => suggestions,
      'POST /thesis-rewrites': () => v2('Rewrite', { body: 'shorter' }),
    });
    const input = {
      text: 'NVIDIA',
      selectedAssetIds: [ASSET],
      thesisId: THESIS,
      discover: false,
    };

    await expect(client().theses.assetCandidates(input)).resolves.toEqual(
      suggestions
    );
    await expect(
      client().theses.rewrite({ body: 'long', mode: 'SHORTEN' })
    ).resolves.toEqual({ body: 'shorter' });
    expect(fake.calls.map((c) => c.body)).toEqual([
      input,
      { body: 'long', mode: 'SHORTEN' },
    ]);
    for (const call of fake.calls) {
      expect(call.headers['Idempotency-Key']).toMatch(UUID);
    }
  });
});
