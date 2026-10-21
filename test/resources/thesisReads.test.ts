import { describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { dispatch as terminal } from '../../src/cli/index.js';
import { dispatch as embedded } from '../../src/cli/embeddedDispatch.js';
import type { ListThesesParams } from '../../src/resources/thesisReads.js';
const id = '9223372036854775807';
const person = {
  __typename: 'Person',
  id: '21',
  slug: 'ada',
  displayName: 'Ada',
  bio: 'Investor',
};
const user = {
  __typename: 'PublicUser',
  id: '22',
  username: 'ada-user',
  displayName: 'Ada',
  bio: 'Trader',
};
const entity = {
  __typename: 'Entity',
  id: '23',
  ticker: 'NVDA',
  name: 'NVIDIA',
  kind: 'STOCK',
  assetClass: 'US_STOCK_SPOT',
  venue: { id: 'nasdaq', name: 'NASDAQ' },
};
function publication(body = 'Original\r\n**view**') {
  return {
    playbookId: id,
    thesisId: id,
    authorVersionId: '32',
    materialVersionId: '33',
    itemKey: `thesis:${id}:33`,
    title: 'View',
    body,
    publishedAtMs: 1790000000000,
    changeKind: 'CREATE',
    visibility: 'PUBLIC',
    closed: false,
    archived: false,
    note: '',
    closingNote: '',
    researchPaused: false,
    entityIds: ['23'],
    categoryIds: [],
    entityStances: [{ entityId: '23', stance: 'BULLISH' }],
    entities: [{ id: '23', ticker: 'NVDA', name: 'NVIDIA' }],
    publisher: {
      __typename: 'Person',
      id: '21',
      slug: 'ada',
      displayName: 'Ada',
      avatarUrl: '',
      bio: 'Investor',
      followersCount: 1,
      viewerState: { following: null },
    },
    medias: [],
    signalFeed: null,
    snapshotRelease: {
      versionId: '32',
      materialVersionId: '33',
      publishedAtMs: 1790000000000,
      changeKind: 'CREATE',
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
function page(nodes: unknown[] = [], hasNextPage = false) {
  const edges = nodes.map((node, i) => ({ cursor: `cursor:${i}`, node }));
  return {
    edges,
    pageInfo: { endCursor: edges.at(-1)?.cursor ?? '', hasNextPage },
  };
}
function authorData(scope: object = person, pub: unknown = publication()) {
  return {
    scope: {
      ...scope,
      theses: page([{ id, latestRelease: { thesisPublication: pub } }]),
    },
  };
}
function relatedData(state = 'READY', nextCursor: string | null = null) {
  const nodes =
    state === 'READY'
      ? [
          {
            itemKey: `thesis:${id}:33`,
            score: 0.72,
            publication: publication(),
          },
        ]
      : [];
  return {
    node: {
      relatedTheses: { state, nextCursor, edges: page(nodes).edges },
    },
  };
}
function setup(...responses: unknown[]) {
  const client = new AlvaClient({ apiKey: 'test-key' });
  const request = vi.spyOn(client, '_request');
  for (const data of responses) request.mockResolvedValueOnce({ data });
  return { client, request };
}
function body(request: ReturnType<typeof setup>['request'], index = 0) {
  return request.mock.calls[index][2]?.body as {
    query: string;
    variables: Record<string, unknown>;
  };
}
for (const [label, dispatch] of [
  ['SDK', null],
  ['terminal', terminal],
  ['embedded', embedded],
] as const) {
  describe(`${label} Thesis reads`, () => {
    it('preserves a large author body and identities in one read', async () => {
      const text = '观点\r\n**original**\n'.repeat(4000);
      const { client, request } = setup(authorData(person, publication(text)));
      const result = dispatch
        ? await dispatch(client, ['thesis', 'list', '--person', 'ada'])
        : await client.theses.list({ person: 'ada' });
      expect(result).toEqual({
        scope: person,
        edges: [
          {
            cursor: 'cursor:0',
            node: { playbookId: id, publication: publication(text) },
          },
        ],
        nextCursor: null,
      });
      expect(request).toHaveBeenCalledTimes(1);
      expect(body(request).variables).toEqual({
        slug: 'ada',
        input: { first: 10 },
      });
      expect(request.mock.calls[0].slice(0, 2)).toEqual(['POST', '/query']);
      expect(body(request).query).not.toMatch(
        /mutation|pendingEvents|seenItemKeys|assetCandidates/
      );
    });
    it('uses internal ID and forwards one Related continuation cursor', async () => {
      const { client, request } = setup(relatedData('READY', 'opaque:after'));
      const result = dispatch
        ? await dispatch(client, [
            'thesis',
            'related',
            '--id',
            id,
            '--first',
            '50',
            '--cursor',
            'opaque:next',
          ])
        : await client.theses.related(id, { first: 50, cursor: 'opaque:next' });
      expect(result).toEqual({
        state: 'READY',
        edges: relatedData().node.relatedTheses.edges,
        nextCursor: 'opaque:after',
      });
      expect(body(request).variables).toEqual({
        id: `Playbook:${id}`,
        input: { first: 50, after: 'opaque:next' },
      });
      expect(request).toHaveBeenCalledTimes(1);
    });
    it('rejects conflicting selectors and invalid pagination before requests', async () => {
      const { client, request } = setup();
      await expect(
        dispatch
          ? dispatch(client, [
              'thesis',
              'list',
              '--person',
              'ada',
              '--ticker',
              'NVDA',
            ])
          : client.theses.list({ person: 'ada', ticker: 'NVDA' })
      ).rejects.toThrow('exactly one');
      await expect(
        dispatch
          ? dispatch(client, ['thesis', 'related', '--id', id, '--first', '51'])
          : client.theses.related(id, { first: 51 })
      ).rejects.toThrow('between 1 and 50');
      expect(request).not.toHaveBeenCalled();
    });
  });
}
describe('Thesis read contracts', () => {
  it('reads a username directly with ARCHIVED and cursor', async () => {
    const { client, request } = setup(authorData(user));
    expect(
      (
        await client.theses.list({
          user: 'ada-user',
          status: 'ARCHIVED',
          cursor: 'previous',
        })
      ).scope
    ).toEqual(user);
    expect(body(request).variables).toEqual({
      username: 'ada-user',
      input: { first: 10, after: 'previous', status: 'ARCHIVED' },
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('names the exact author selector on every publisher', async () => {
    const { client } = setup(authorData());
    const [edge] = (await client.theses.list({ person: 'ada' })).edges;
    expect(edge.node.publication?.publisher).toMatchObject({
      __typename: 'Person',
      slug: 'ada',
    });
  });
  it('resolves a unique name then retrieves its exact slug', async () => {
    const { client, request } = setup({ search: page([person]) }, authorData());
    expect((await client.theses.list({ personName: 'Ada' })).scope).toEqual(
      person
    );
    expect(body(request).variables).toEqual({ query: 'Ada' });
    expect(body(request, 1).variables).toMatchObject({ slug: 'ada' });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('returns readable duplicate-name candidates without selecting one', async () => {
    const other = { ...person, id: '24', slug: 'ada-other', bio: 'Economist' };
    const { client, request } = setup({ search: page([person, other]) });
    await expect(
      client.theses.list({ personName: 'Ada' })
    ).rejects.toMatchObject({
      code: 'AMBIGUOUS_IDENTITY',
      details: { candidates: [person, other] },
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('does not accept a unique candidate on an incomplete search page', async () => {
    const { client } = setup({ search: page([person], true) });
    await expect(
      client.theses.list({ personName: 'Ada' })
    ).rejects.toMatchObject({ code: 'AMBIGUOUS_IDENTITY' });
  });
  it('resolves a unique ticker and fetches its exact entity', async () => {
    const { client, request } = setup(
      { market: { search: page([entity]) } },
      { market: { scope: { ...entity, theses: page([publication()]) } } }
    );
    const result = await client.theses.list({ ticker: 'NVDA' });
    expect(result.scope).toEqual(entity);
    expect(result.edges[0].node).toEqual({
      playbookId: id,
      publication: publication(),
    });
    expect(body(request, 1).variables).toEqual({
      id: '23',
      input: { first: 10 },
    });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('preserves market and asset class for ambiguous tickers', async () => {
    const crypto = {
      ...entity,
      id: '24',
      kind: 'CRYPTO',
      assetClass: 'BINANCE_SPOT',
      venue: { id: 'binance', name: 'Binance' },
    };
    const { client, request } = setup({
      market: { search: page([entity, crypto]) },
    });
    await expect(client.theses.list({ ticker: 'NVDA' })).rejects.toMatchObject({
      code: 'AMBIGUOUS_IDENTITY',
      details: { candidates: [entity, crypto] },
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('continues through an empty page while nextCursor is set', async () => {
    const empty = page([], true);
    empty.pageInfo.endCursor = 'scan:next';
    const { client, request } = setup({
      market: { scope: { ...entity, theses: empty } },
    });
    expect(
      await client.theses.list({ entityId: '23', cursor: 'scan:prev' })
    ).toEqual({ scope: entity, edges: [], nextCursor: 'scan:next' });
    expect(body(request).variables).toEqual({
      id: '23',
      input: { first: 10, after: 'scan:prev' },
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each([{ person: 'missing' }, { user: 'missing' }])(
    'never fuzzy-fallbacks for %o',
    async (params) => {
      const { client, request } = setup({ scope: null });
      await expect(client.theses.list(params)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(request).toHaveBeenCalledTimes(1);
    }
  );
  it('distinguishes no name match from an empty thesis list', async () => {
    const { client } = setup(
      { search: page() },
      { scope: { ...person, theses: page() } }
    );
    await expect(
      client.theses.list({ personName: 'missing' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await client.theses.list({ person: 'ada' })).toEqual({
      scope: person,
      edges: [],
      nextCursor: null,
    });
  });
  it('preserves null publication without per-item fetches', async () => {
    const { client, request } = setup(authorData(person, null));
    expect((await client.theses.list({ person: 'ada' })).edges[0].node).toEqual(
      { playbookId: id, publication: null }
    );
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each(['GENERATING', 'FAILED', 'READY'])(
    'preserves empty %s without polling',
    async (state) => {
      const data = relatedData(state);
      data.node.relatedTheses.edges = [];
      const { client, request } = setup(data);
      expect(await client.theses.related(id)).toEqual({
        state,
        edges: [],
        nextCursor: null,
      });
      expect(body(request).variables).toEqual({
        id: `Playbook:${id}`,
        input: { first: 10 },
      });
      expect(request).toHaveBeenCalledTimes(1);
    }
  );
  it('keeps source absence distinct from a ready empty Related page', async () => {
    const { client } = setup({ node: null });
    await expect(client.theses.related(id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
  it('fails closed on errors with partial data', async () => {
    const { client, request } = setup();
    request.mockResolvedValue({
      data: authorData(),
      errors: [
        { message: 'permission denied', extensions: { code: 'FORBIDDEN' } },
      ],
    });
    await expect(client.theses.list({ person: 'ada' })).rejects.toMatchObject({
      code: 'GRAPHQL_ERROR',
      message: 'permission denied',
    });
    await expect(client.theses.related(id)).rejects.toMatchObject({
      code: 'GRAPHQL_ERROR',
    });
  });
  it.each([
    null,
    {},
    { errors: {} },
    { data: { scope: {} } },
    { data: { scope: { ...person, theses: { edges: [] } } } },
  ])('rejects malformed response %o', async (response) => {
    const { client, request } = setup();
    request.mockResolvedValue(response);
    await expect(client.theses.list({ person: 'ada' })).rejects.toMatchObject({
      code: 'GRAPHQL_INVALID_RESPONSE',
    });
  });
  it.each([
    'playbookId',
    'authorVersionId',
    'body',
    'publisher',
    'snapshotRelease',
  ])('rejects absent publication %s', async (field) => {
    const pub: Record<string, unknown> = publication();
    delete pub[field];
    const { client } = setup(authorData(person, pub));
    await expect(client.theses.list({ person: 'ada' })).rejects.toMatchObject({
      code: 'GRAPHQL_INVALID_RESPONSE',
    });
  });
  it('rejects a publisher without an author kind', async () => {
    const pub = publication();
    const publisher: Record<string, unknown> = { ...pub.publisher };
    delete publisher.__typename;
    const { client } = setup(authorData(person, { ...pub, publisher }));
    await expect(client.theses.list({ person: 'ada' })).rejects.toMatchObject({
      code: 'GRAPHQL_INVALID_RESPONSE',
    });
  });
  it.each([
    {},
    { person: '' },
    { personId: '21' },
    { entityId: '0' },
    { entityId: '9223372036854775808' },
    { ticker: 'NVDA', status: 'ARCHIVED' },
    { user: 'ada', first: 0 },
    { user: 'ada', first: 1.5 },
    { user: 'ada', first: null },
    { user: 'ada', cursor: '' },
  ])('rejects SDK parameters %o', async (params) => {
    const { client, request } = setup();
    await expect(
      client.theses.list(params as ListThesesParams)
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(request).not.toHaveBeenCalled();
  });
});

it('keeps ambiguity candidates visible through message-only embedded adapters', async () => {
  const other = { ...person, id: '24', slug: 'ada-other', bio: 'Economist' };
  const { client, request } = setup({ search: page([person, other]) });
  let message = '';
  try {
    await embedded(client, ['thesis', 'list', '--person-name', 'Ada']);
  } catch (error) {
    // sdk-monorepo's DispatchReply currently serializes only Error.message.
    message = error instanceof Error ? error.message : String(error);
  }
  expect(message).toContain('Choose an exact identity');
  const candidates = JSON.parse(message.split('Candidates: ')[1]);
  expect(candidates).toEqual([person, other]);
  expect(request).toHaveBeenCalledTimes(1);
});

it.each([
  ['NOT_FOUND', 404],
  ['PERMISSION_DENIED', 403],
  ['UNAUTHENTICATED', 401],
] as const)(
  'preserves canonical Gateway %s without fallback or retries',
  async (code, status) => {
    const { client, request } = setup();
    request.mockResolvedValue({
      data: { scope: null },
      errors: [{ message: 'Server diagnostic', extensions: { code } }],
    });
    await expect(
      client.theses.list({ person: 'missing' })
    ).rejects.toMatchObject({ code, status, message: 'Server diagnostic' });
    expect(request).toHaveBeenCalledTimes(1);
  }
);

it.each([['NOT_FOUND', 'INTERNAL'], ['toString']])(
  'keeps mixed/unknown error identities generic: %o',
  async (...codes) => {
    const { client, request } = setup();
    request.mockResolvedValue({
      data: authorData(),
      errors: codes.map((code) => ({
        message: 'Failure',
        extensions: { code },
      })),
    });
    await expect(client.theses.list({ person: 'ada' })).rejects.toMatchObject({
      code: 'GRAPHQL_ERROR',
      status: 400,
    });
  }
);
