import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { dispatch as terminal } from '../../src/cli/index.js';
import { dispatch as embedded } from '../../src/cli/embeddedDispatch.js';
import type { ListThesesParams } from '../../src/resources/thesisReads.js';
import {
  ASSET,
  MATERIAL,
  PLAYBOOK,
  THESIS,
  VERSION,
  problem,
  v2Fetch,
  wireProfile,
  wireThesis,
} from '../contentV2.js';

const ADA = 'profile_0ada';
const adaProfile = wireProfile({
  id: ADA,
  kind: 'PERSON',
  handle: 'ada',
  displayName: 'Ada',
  bio: 'Investor',
  followerCount: 1,
});
const adaMatch = {
  id: ADA,
  kind: 'PERSON',
  handle: 'ada',
  displayName: 'Ada',
  avatarUrl: null,
  followerCount: 1,
  viewerState: { following: null },
  xHandle: null,
};
const person = {
  __typename: 'Person',
  id: ADA,
  slug: 'ada',
  displayName: 'Ada',
  bio: 'Investor',
};
const entity = {
  __typename: 'Entity',
  id: ASSET,
  ticker: 'NVDA',
  name: 'NVIDIA',
  kind: 'STOCK',
  assetClass: 'US_STOCK',
  venue: { id: 'nasdaq', name: 'NASDAQ' },
};
const wireAsset = {
  id: ASSET,
  symbol: 'NVDA',
  name: 'NVIDIA',
  kind: 'STOCK',
  assetClass: 'US_STOCK',
  logo: null,
  venue: { code: 'nasdaq', name: 'NASDAQ', logo: null },
  quote: null,
};

function thesisBy(body = 'Original\r\n**view**') {
  return wireThesis(
    { author: adaProfile },
    {
      body,
      title: 'View',
      sources: [
        {
          title: 'Source',
          kind: 'WEB',
          contentKey: '34',
          url: 'https://example.com/source',
          publishedAt: null,
          locator: null,
        },
      ],
    }
  );
}

/** The publication summary of thesisBy(). */
function publication(body = 'Original\r\n**view**', itemKey = THESIS) {
  return {
    thesisId: THESIS,
    thesisNumber: 42,
    playbookId: PLAYBOOK,
    authorVersionId: VERSION,
    materialVersionId: MATERIAL,
    itemKey,
    title: 'View',
    body,
    publishedAtMs: Date.parse('2026-11-01T10:00:00.000Z'),
    changeKind: 'material',
    visibility: 'public',
    closed: false,
    archived: false,
    note: '',
    closingNote: '',
    researchPaused: false,
    entityIds: [ASSET],
    categoryIds: [],
    entityStances: [{ entityId: ASSET, stance: 'BULLISH' }],
    entities: [{ id: ASSET, ticker: 'NVDA', name: 'NVIDIA Corporation' }],
    publisher: {
      __typename: 'Person',
      id: ADA,
      slug: 'ada',
      displayName: 'Ada',
      avatarUrl: 'https://example.com/alice.png',
      bio: 'Investor',
      followersCount: 1,
      viewerState: { following: null },
    },
    medias: [],
    signalFeed: null,
    snapshotRelease: {
      versionId: VERSION,
      materialVersionId: MATERIAL,
      publishedAtMs: Date.parse('2026-11-01T10:00:00.000Z'),
      changeKind: 'material',
      sourceRefs: [
        {
          title: 'Source',
          sourceKind: 'WEB',
          sourceContentId: '34',
          publicUrl: 'https://example.com/source',
          sourceTimeMs: null,
          locator: '',
        },
      ],
    },
  };
}

const search = (items: unknown[], nextPageToken: string | null = null) => ({
  items,
  nextPageToken,
});

function client() {
  return new AlvaClient({ apiKey: 'test-key', baseUrl: 'https://api.test' });
}

afterEach(() => vi.unstubAllGlobals());

for (const [label, dispatch] of [
  ['SDK', null],
  ['terminal', terminal],
  ['embedded', embedded],
] as const) {
  describe(`${label} Thesis reads`, () => {
    it('resolves the author and preserves a large body and identities', async () => {
      const text = '观点\r\n**original**\n'.repeat(4000);
      const { calls } = v2Fetch({
        'GET /profiles': search([adaMatch]),
        [`GET /profiles/${ADA}/theses`]: search([thesisBy(text)]),
      });
      const c = client();
      const result = dispatch
        ? await dispatch(c, ['thesis', 'list', '--person', 'ada'])
        : await c.theses.list({ person: 'ada' });
      expect(result).toEqual({
        scope: person,
        edges: [
          {
            cursor: '',
            node: { playbookId: THESIS, publication: publication(text) },
          },
        ],
        nextCursor: null,
      });
      expect(calls.map((call) => call.path)).toEqual([
        '/profiles',
        `/profiles/${ADA}/theses`,
      ]);
      expect(Object.fromEntries(calls[0].query)).toEqual({
        query: 'ada',
        kind: 'PERSON',
        pageSize: '50',
      });
      expect(Object.fromEntries(calls[1].query)).toEqual({
        pageSize: '10',
        archived: 'false',
      });
    });
    it('forwards one Related continuation cursor', async () => {
      const { calls } = v2Fetch({
        [`GET /theses/${THESIS}/related`]: {
          items: [
            {
              id: THESIS,
              itemId: 'thesis:42:33',
              score: 0.72,
              thesis: thesisBy(),
            },
          ],
          nextPageToken: 'opaque:after',
        },
      });
      const c = client();
      const result = dispatch
        ? await dispatch(c, [
            'thesis',
            'related',
            '--id',
            THESIS,
            '--first',
            '50',
            '--cursor',
            'opaque:next',
          ])
        : await c.theses.related(THESIS, { first: 50, cursor: 'opaque:next' });
      expect(result).toEqual({
        state: 'READY',
        edges: [
          {
            cursor: 'opaque:after',
            node: {
              itemKey: 'thesis:42:33',
              score: 0.72,
              publication: publication(undefined, 'thesis:42:33'),
            },
          },
        ],
        nextCursor: 'opaque:after',
      });
      expect(Object.fromEntries(calls[0].query)).toEqual({
        pageSize: '50',
        pageToken: 'opaque:next',
      });
      expect(calls).toHaveLength(1);
    });
    it('rejects conflicting selectors and invalid pagination before requests', async () => {
      const { fetcher } = v2Fetch({});
      const c = client();
      await expect(
        dispatch
          ? dispatch(c, [
              'thesis',
              'list',
              '--person',
              'ada',
              '--ticker',
              'NVDA',
            ])
          : c.theses.list({ person: 'ada', ticker: 'NVDA' })
      ).rejects.toThrow('exactly one');
      await expect(
        dispatch
          ? dispatch(c, ['thesis', 'related', '--id', THESIS, '--first', '51'])
          : c.theses.related(THESIS, { first: 51 })
      ).rejects.toThrow('between 1 and 50');
      expect(fetcher).not.toHaveBeenCalled();
    });
  });
}

describe('Thesis read contracts', () => {
  it('reads a username exactly with ARCHIVED and cursor', async () => {
    const user = {
      ...adaMatch,
      id: 'profile_0user',
      kind: 'USER',
      handle: 'Ada-User',
    };
    const { calls } = v2Fetch({
      'GET /profiles': search([
        { ...user, id: 'profile_0near', handle: 'ada-user-2' },
        user,
      ]),
      'GET /profiles/profile_0user/theses': search([]),
    });
    expect(
      (
        await client().theses.list({
          user: 'ada-user',
          status: 'ARCHIVED',
          cursor: 'previous',
        })
      ).scope
    ).toEqual({
      __typename: 'PublicUser',
      id: 'profile_0user',
      username: 'Ada-User',
      displayName: 'Ada',
      bio: '',
    });
    expect(calls[0].query.get('kind')).toBe('USER');
    expect(Object.fromEntries(calls[1].query)).toEqual({
      pageSize: '10',
      pageToken: 'previous',
      archived: 'true',
    });
  });
  it('names the exact author selector on every publisher', async () => {
    v2Fetch({
      'GET /profiles': search([adaMatch]),
      [`GET /profiles/${ADA}/theses`]: search([thesisBy()]),
    });
    const [edge] = (await client().theses.list({ person: 'ada' })).edges;
    expect(edge.node.publication?.publisher).toMatchObject({
      __typename: 'Person',
      slug: 'ada',
    });
  });
  it('resolves a unique name to its profile', async () => {
    const { calls } = v2Fetch({
      'GET /profiles': search([adaMatch]),
      [`GET /profiles/${ADA}/theses`]: search([thesisBy()]),
    });
    expect((await client().theses.list({ personName: 'Ada' })).scope).toEqual(
      person
    );
    expect(calls[0].query.get('query')).toBe('Ada');
    expect(calls).toHaveLength(2);
  });
  it('returns readable duplicate-name candidates without selecting one', async () => {
    const other = { ...adaMatch, id: 'profile_0other', handle: 'ada-other' };
    const { calls } = v2Fetch({ 'GET /profiles': search([adaMatch, other]) });
    const candidates = [
      { __typename: 'Person', id: ADA, slug: 'ada', displayName: 'Ada' },
      {
        __typename: 'Person',
        id: 'profile_0other',
        slug: 'ada-other',
        displayName: 'Ada',
      },
    ];
    await expect(
      client().theses.list({ personName: 'Ada' })
    ).rejects.toMatchObject({
      code: 'AMBIGUOUS_IDENTITY',
      details: { candidates, more: false },
    });
    expect(calls).toHaveLength(1);
  });
  it('does not accept a unique candidate on an incomplete search page', async () => {
    v2Fetch({ 'GET /profiles': search([adaMatch], 'more') });
    await expect(
      client().theses.list({ personName: 'Ada' })
    ).rejects.toMatchObject({ code: 'AMBIGUOUS_IDENTITY' });
  });
  it('resolves a ticker to its asset and lists its Theses', async () => {
    const { calls } = v2Fetch({
      'GET /assets/by-symbol/BRK.B': { ...wireAsset, symbol: 'BRK.B' },
      [`GET /assets/${ASSET}/theses`]: search([thesisBy()]),
    });
    const result = await client().theses.list({ ticker: 'BRK.B' });
    expect(result.scope).toEqual({ ...entity, ticker: 'BRK.B' });
    expect(result.edges[0].node).toEqual({
      playbookId: THESIS,
      publication: publication(),
    });
    expect(calls).toHaveLength(2);
  });
  it('continues through an empty page while nextCursor is set', async () => {
    const { calls } = v2Fetch({
      [`GET /assets/${ASSET}`]: { ...wireAsset, venue: null, assetClass: null },
      [`GET /assets/${ASSET}/theses`]: search([], 'scan:next'),
    });
    expect(
      await client().theses.list({ entityId: ASSET, cursor: 'scan:prev' })
    ).toEqual({
      scope: { ...entity, venue: null, assetClass: '' },
      edges: [],
      nextCursor: 'scan:next',
    });
    expect(calls[1].query.get('pageToken')).toBe('scan:prev');
  });
  it.each([{ person: 'missing' }, { user: 'missing' }])(
    'never fuzzy-fallbacks for %o',
    async (params) => {
      const { calls } = v2Fetch({
        'GET /profiles': (call) =>
          search([
            {
              ...adaMatch,
              kind: call.query.get('kind'),
              handle: 'missing-not',
            },
          ]),
      });
      await expect(client().theses.list(params)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(calls).toHaveLength(1);
    }
  );
  it('distinguishes no name match from an empty thesis list', async () => {
    v2Fetch({
      'GET /profiles': (call) =>
        call.query.get('query') === 'missing' ? search([]) : search([adaMatch]),
      [`GET /profiles/${ADA}/theses`]: search([]),
    });
    await expect(
      client().theses.list({ personName: 'missing' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await client().theses.list({ person: 'ada' })).toEqual({
      scope: { ...person, bio: '' },
      edges: [],
      nextCursor: null,
    });
  });
  it('keeps a missing ticker NOT_FOUND', async () => {
    v2Fetch({
      'GET /assets/by-symbol/NOPE': problem(404, 'NOT_FOUND', 'no asset'),
    });
    await expect(
      client().theses.list({ ticker: 'NOPE' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
  it('reads a Related page that is being prepared as GENERATING without polling', async () => {
    const { calls } = v2Fetch({
      [`GET /theses/${THESIS}/related`]: problem(
        503,
        'UNAVAILABLE',
        'related Theses are being prepared; retry later',
        { reason: 'RELATED_THESES_GENERATING', retryAfter: 30 }
      ),
    });
    expect(await client().theses.related(THESIS)).toEqual({
      state: 'GENERATING',
      edges: [],
      nextCursor: null,
    });
    expect(calls).toHaveLength(1);
  });
  it('reads an empty Related page as READY and a missing source as NOT_FOUND', async () => {
    v2Fetch({
      [`GET /theses/${THESIS}/related`]: search([]),
      'GET /theses/thesis_0missing/related': problem(404, 'NOT_FOUND'),
    });
    expect(await client().theses.related(THESIS)).toEqual({
      state: 'READY',
      edges: [],
      nextCursor: null,
    });
    await expect(
      client().theses.related('thesis_0missing')
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it.each([null, {}, { items: {} }, { items: [], nextPageToken: '' }])(
    'rejects malformed page %o',
    async (page) => {
      v2Fetch({
        'GET /profiles': search([adaMatch]),
        [`GET /profiles/${ADA}/theses`]: page,
      });
      await expect(
        client().theses.list({ person: 'ada' })
      ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  );
  it.each(['id', 'playbookId', 'currentVersion', 'research', 'visibility'])(
    'rejects a listed Thesis without %s',
    async (field) => {
      const thesis: Record<string, unknown> = thesisBy();
      delete thesis[field];
      v2Fetch({
        'GET /profiles': search([adaMatch]),
        [`GET /profiles/${ADA}/theses`]: search([thesis]),
      });
      await expect(
        client().theses.list({ person: 'ada' })
      ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  );
  it('rejects a listed Thesis whose author cannot be read', async () => {
    v2Fetch({
      'GET /profiles': search([adaMatch]),
      [`GET /profiles/${ADA}/theses`]: search([wireThesis({ author: null })]),
    });
    await expect(client().theses.list({ person: 'ada' })).rejects.toMatchObject(
      {
        code: 'INVALID_RESPONSE',
      }
    );
  });
  it.each([
    {},
    { person: '' },
    { personId: '21' },
    { entityId: ' ' },
    { ticker: 'NVDA', status: 'ARCHIVED' },
    { user: 'ada', first: 0 },
    { user: 'ada', first: 1.5 },
    { user: 'ada', first: null },
    { user: 'ada', cursor: '' },
  ])('rejects SDK parameters %o', async (params) => {
    const { fetcher } = v2Fetch({});
    await expect(
      client().theses.list(params as ListThesesParams)
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

it('keeps ambiguity candidates visible through message-only embedded adapters', async () => {
  const other = { ...adaMatch, id: 'profile_0other', handle: 'ada-other' };
  const { calls } = v2Fetch({ 'GET /profiles': search([adaMatch, other]) });
  let message = '';
  try {
    await embedded(client(), ['thesis', 'list', '--person-name', 'Ada']);
  } catch (error) {
    // sdk-monorepo's DispatchReply currently serializes only Error.message.
    message = error instanceof Error ? error.message : String(error);
  }
  expect(message).toContain('Choose an exact identity');
  const candidates = JSON.parse(message.split('Candidates: ')[1]);
  expect(candidates.map((c: { id: string }) => c.id)).toEqual([
    ADA,
    'profile_0other',
  ]);
  expect(calls).toHaveLength(1);
});

it.each([
  ['NOT_FOUND', 404],
  ['PERMISSION_DENIED', 403],
  ['UNAUTHENTICATED', 401],
] as const)(
  'preserves the problem %s without fallback or retries',
  async (code, status) => {
    const { calls } = v2Fetch({
      'GET /profiles': problem(status, code, 'Server diagnostic'),
    });
    await expect(
      client().theses.list({ person: 'missing' })
    ).rejects.toMatchObject({ code, status, message: 'Server diagnostic' });
    expect(calls).toHaveLength(1);
  }
);
