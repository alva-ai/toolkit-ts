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
    thesisId: '31',
    authorVersionId: '32',
    materialVersionId: '33',
    itemKey: 'thesis:31:33',
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
      id: '21',
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
function page(nodes: unknown[] = []) {
  const edges = nodes.map((node, i) => ({ cursor: `cursor:${i}`, node }));
  return {
    edges,
    pageInfo: {
      startCursor: edges[0]?.cursor ?? '',
      endCursor: edges.at(-1)?.cursor ?? '',
      hasNextPage: false,
      hasPreviousPage: false,
    },
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
function relatedData(state = 'READY') {
  return {
    node: {
      id,
      relatedTheses: {
        ...page(
          state === 'READY'
            ? [
                {
                  itemKey: 'thesis:31:33',
                  score: 0.72,
                  publication: publication(),
                },
              ]
            : []
        ),
        state,
        ready: state === 'READY',
        scanLimited: false,
        listId: 'list:1',
        pageCursor: '',
        nextCursor: null as string | null,
      },
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
        pageInfo: page([{}]).pageInfo,
      });
      expect(request).toHaveBeenCalledTimes(1);
      expect(body(request).variables).toEqual({
        slug: 'ada',
        input: { first: 10, status: 'ACTIVE' },
      });
      expect(request.mock.calls[0].slice(0, 2)).toEqual(['POST', '/query']);
      expect(body(request).query).not.toMatch(
        /mutation|pendingEvents|seenItemKeys|assetCandidates/
      );
    });
    it('uses internal ID and forwards one Related continuation cursor', async () => {
      const { client, request } = setup(relatedData());
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
      expect(result).toMatchObject({
        source: { playbookId: id, versionScope: 'CURRENT' },
        state: 'READY',
        edges: [
          {
            node: {
              score: 0.72,
              publication: {
                playbookId: id,
                thesisId: '31',
                authorVersionId: '32',
              },
            },
          },
        ],
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
  it.each([
    ['personId', 'PERSON', person],
    ['userId', 'USER', user],
  ] as const)('uses %s without searching', async (key, kind, scope) => {
    const { client, request } = setup(authorData(scope));
    expect((await client.theses.list({ [key]: scope.id })).scope).toEqual(
      scope
    );
    expect(body(request).variables).toMatchObject({
      profile: { kind, id: scope.id },
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('resolves a unique name then retrieves its exact slug', async () => {
    const { client, request } = setup({ people: page([person]) }, authorData());
    expect((await client.theses.list({ personName: 'Ada' })).scope).toEqual(
      person
    );
    expect(body(request).variables).toEqual({ query: 'Ada' });
    expect(body(request, 1).variables).toMatchObject({ slug: 'ada' });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('returns readable duplicate-name candidates without selecting one', async () => {
    const other = { ...person, id: '24', slug: 'ada-other', bio: 'Economist' };
    const { client, request } = setup({ people: page([person, other]) });
    await expect(
      client.theses.list({ personName: 'Ada' })
    ).rejects.toMatchObject({
      code: 'AMBIGUOUS_IDENTITY',
      details: { candidates: [person, other] },
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('does not accept a unique candidate on an incomplete search page', async () => {
    const results = page([person]);
    results.pageInfo.hasNextPage = true;
    const { client } = setup({ people: results });
    await expect(
      client.theses.list({ personName: 'Ada' })
    ).rejects.toMatchObject({ code: 'AMBIGUOUS_IDENTITY' });
  });
  it('resolves a unique ticker and fetches its exact entity', async () => {
    const { client, request } = setup(
      { market: { entities: page([entity]) } },
      { market: { scope: { ...entity, theses: page([publication()]) } } }
    );
    const result = await client.theses.list({ ticker: 'NVDA' });
    expect(result.scope).toEqual(entity);
    expect(result.edges[0].node.publication?.body).toBe('Original\r\n**view**');
    expect(body(request, 1).variables).toEqual({
      entity: { id: '23' },
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
      market: { entities: page([entity, crypto]) },
    });
    await expect(client.theses.list({ ticker: 'NVDA' })).rejects.toMatchObject({
      code: 'AMBIGUOUS_IDENTITY',
      details: { candidates: [entity, crypto] },
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('reads entity ID directly and preserves empty-page continuation', async () => {
    const empty = page();
    empty.pageInfo.hasNextPage = true;
    empty.pageInfo.endCursor = 'scan:next';
    const { client, request } = setup({
      market: { scope: { ...entity, theses: empty } },
    });
    expect(
      await client.theses.list({ entityId: '23', cursor: 'scan:prev' })
    ).toEqual({ scope: entity, ...empty });
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
      { people: page() },
      { scope: { ...person, theses: page() } }
    );
    await expect(
      client.theses.list({ personName: 'missing' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await client.theses.list({ person: 'ada' })).edges).toEqual([]);
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
      Object.assign(data.node.relatedTheses, page());
      const { client, request } = setup(data);
      expect(await client.theses.related(id)).toMatchObject({
        state,
        ready: state === 'READY',
        edges: [],
      });
      expect(body(request).variables).toEqual({
        id: `Playbook:${id}`,
        input: { first: 10 },
      });
      expect(request).toHaveBeenCalledTimes(1);
    }
  );
  it('preserves Related scan-limited empty pages', async () => {
    const data = relatedData();
    Object.assign(data.node.relatedTheses, {
      ...page(),
      scanLimited: true,
      nextCursor: 'next',
    });
    Object.assign(data.node.relatedTheses.pageInfo, {
      endCursor: 'scan:end',
      hasNextPage: true,
    });
    const { client } = setup(data);
    expect(await client.theses.related(id)).toMatchObject({
      edges: [],
      scanLimited: true,
      nextCursor: 'next',
      pageInfo: { hasNextPage: true },
    });
  });
  it('fails closed on errors with partial data, retaining permission errors', async () => {
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
  it.each([null, {}, { errors: {} }, { data: { scope: {} } }])(
    'rejects malformed response %o',
    async (response) => {
      const { client, request } = setup();
      request.mockResolvedValue(response);
      await expect(client.theses.list({ person: 'ada' })).rejects.toMatchObject(
        { code: 'GRAPHQL_INVALID_RESPONSE' }
      );
    }
  );
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
  it('rejects numeric IDs and cross-playbook publications', async () => {
    for (const pub of [
      { ...publication(), playbookId: Number(id) },
      { ...publication(), playbookId: '42' },
    ]) {
      const { client } = setup(authorData(person, pub));
      await expect(client.theses.list({ person: 'ada' })).rejects.toMatchObject(
        { code: 'GRAPHQL_INVALID_RESPONSE' }
      );
    }
  });
  it.each([
    {},
    { person: '' },
    { entityId: '0' },
    { userId: '9223372036854775808' },
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

describe('Thesis response identity boundaries', () => {
  it('rejects a different profile from an exact ID lookup', async () => {
    const { client } = setup(authorData(person));
    await expect(client.theses.list({ personId: '999' })).rejects.toMatchObject(
      { code: 'GRAPHQL_INVALID_RESPONSE' }
    );
  });
  it('rejects an unrelated asset publication', async () => {
    const { client } = setup({
      market: {
        scope: {
          ...entity,
          theses: page([{ ...publication(), entityIds: ['999'] }]),
        },
      },
    });
    await expect(client.theses.list({ entityId: '23' })).rejects.toMatchObject({
      code: 'GRAPHQL_INVALID_RESPONSE',
    });
  });
  it('rejects a mismatched author-version snapshot', async () => {
    const pub = publication();
    pub.snapshotRelease.versionId = '999';
    const { client } = setup(authorData(person, pub));
    await expect(client.theses.list({ person: 'ada' })).rejects.toMatchObject({
      code: 'GRAPHQL_INVALID_RESPONSE',
    });
  });
  it('keeps source absence distinct from a ready empty Related page', async () => {
    const { client } = setup({ node: null });
    await expect(client.theses.related(id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
  it('rejects inconsistent Related state and pagination', async () => {
    for (const override of [
      { state: 'GENERATING', ready: true },
      { nextCursor: 'next' },
    ]) {
      const data = relatedData();
      Object.assign(data.node.relatedTheses, override);
      const { client } = setup(data);
      await expect(client.theses.related(id)).rejects.toMatchObject({
        code: 'GRAPHQL_INVALID_RESPONSE',
      });
    }
  });
  it('rejects overfull and duplicate-cursor pages', async () => {
    for (const nodes of [
      Array(11).fill(publication()),
      [publication(), publication()],
    ]) {
      const data = page(nodes);
      if (nodes.length === 2) data.edges[1].cursor = data.edges[0].cursor;
      const { client } = setup({
        market: { scope: { ...entity, theses: data } },
      });
      await expect(
        client.theses.list({ entityId: '23' })
      ).rejects.toMatchObject({ code: 'GRAPHQL_INVALID_RESPONSE' });
    }
  });
});
