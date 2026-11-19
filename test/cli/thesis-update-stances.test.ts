import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { dispatch as terminal } from '../../src/cli/index.js';
import { dispatch as embedded } from '../../src/cli/embeddedDispatch.js';
import {
  REQUEST_ID,
  THESIS,
  VERSION,
  problem,
  v2Fetch,
  wireThesis,
  type V2Call,
} from '../contentV2.js';

const SMH = 'asset_0smh';
const original = {
  id: THESIS,
  author_version_id: VERSION,
  title: 'Semiconductors',
  entity_ids: [SMH],
  entity_stances: [{ entity_id: SMH, stance: 'bearish' as const }],
  visibility: 'private' as const,
};
const current = wireThesis(
  { visibility: 'PRIVATE' },
  {
    title: 'Semiconductors',
    body: 'Bearish on SMH',
    assets: [
      {
        assetId: SMH,
        stance: 'BEARISH',
        symbol: 'SMH',
        name: 'VanEck Semiconductor ETF',
        logoUrl: null,
        kind: 'ETF',
      },
    ],
  }
);

/** The published Update stores the assets the request sent. */
function published(call: V2Call) {
  const body = call.body as {
    title: string;
    body: string;
    assets: { assetId: string; stance: string }[];
  };
  return wireThesis(
    { visibility: 'PRIVATE' },
    {
      id: 'thesis_version_0next',
      title: body.title,
      body: body.body,
      assets: body.assets.map((a) => ({
        ...a,
        symbol: null,
        name: null,
        logoUrl: null,
        kind: null,
      })),
    }
  );
}

function fixture() {
  const { fetcher, calls } = v2Fetch({
    [`GET /theses/${THESIS}`]: current,
    [`POST /theses/${THESIS}/updates`]: published,
  });
  return {
    client: new AlvaClient({ apiKey: 'fixture', baseUrl: 'https://api.test' }),
    fetcher,
    calls,
  };
}

function argv(stances: string, ids = SMH) {
  return [
    'thesis',
    'update',
    '--id',
    THESIS,
    '--request-id',
    REQUEST_ID,
    '--expected-author-version-id',
    VERSION,
    '--body',
    'Edited body',
    '--title',
    'Semiconductors',
    '--entity-ids',
    ids,
    '--entity-stances',
    stances,
    '--visibility',
    'private',
  ];
}

afterEach(() => vi.unstubAllGlobals());

for (const [name, dispatch] of [
  ['terminal', terminal],
  ['embedded', embedded],
] as const) {
  describe(`${name} thesis update directions`, () => {
    it.each(['bearish', 'bullish', 'unknown'] as const)(
      'sends explicit %s through to HTTP and readback',
      async (stance) => {
        const { client, calls } = fixture();
        const stances = [{ entity_id: SMH, stance }];
        const result = await dispatch(client, argv(JSON.stringify(stances)));
        expect(result).toMatchObject({
          thesis: { entity_stances: stances },
          unchanged: false,
        });
        expect(calls).toHaveLength(2);
        expect(calls[1].method).toBe('POST');
        expect(calls[1].path).toBe(`/theses/${THESIS}/updates`);
        expect(calls[1].headers['Idempotency-Key']).toBe(REQUEST_ID);
        expect(calls[1].body).toEqual({
          expectedVersionId: VERSION,
          body: 'Edited body',
          title: 'Semiconductors',
          assets: [{ assetId: SMH, stance: stance.toUpperCase() }],
          // No --medias: the Update clears them, as a full replacement.
          media: [],
        });
      }
    );

    it('keeps directions keyed to the submitted entities after an asset change', async () => {
      const { client, calls } = fixture();
      const stances = [
        { entity_id: 'asset_042', stance: 'bullish' },
        { entity_id: SMH, stance: 'bearish' },
      ];
      await dispatch(client, argv(JSON.stringify(stances), `${SMH},asset_042`));
      expect(calls[1].body).toMatchObject({
        assets: [
          { assetId: SMH, stance: 'BEARISH' },
          { assetId: 'asset_042', stance: 'BULLISH' },
        ],
      });
    });

    it.each([
      'not-json',
      '{}',
      '[{"entity_id":"asset_042","stance":"bearish"}]',
      `[{"entity_id":"${SMH}","stance":"mixed"}]`,
      `[{"entity_id":"${SMH}","stance":"bearish"},{"entity_id":"${SMH}","stance":"bullish"}]`,
      '[{"entity_id":508176,"stance":"bearish"}]',
    ])('rejects invalid bindings before HTTP: %s', async (stances) => {
      const { client, fetcher } = fixture();
      await expect(dispatch(client, argv(stances))).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('propagates a version conflict without retrying or removing directions', async () => {
      const client = new AlvaClient({
        apiKey: 'fixture',
        baseUrl: 'https://api.test',
      });
      const { calls } = v2Fetch({
        [`GET /theses/${THESIS}`]: current,
        [`POST /theses/${THESIS}/updates`]: problem(
          409,
          'CONFLICT',
          'version conflict'
        ),
      });
      await expect(
        dispatch(client, argv(JSON.stringify(original.entity_stances)))
      ).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });
      expect(calls).toHaveLength(2);
    });

    it('documents update direction replacement and preservation', async () => {
      const { client, fetcher } = fixture();
      const help = await dispatch(client, ['thesis', '--help']);
      expect(help).toMatchObject({ text: expect.stringContaining('update') });
      expect((help as { text: string }).text).toContain(
        'Only editing the body'
      );
      expect(fetcher).not.toHaveBeenCalled();
    });
  });
}

describe('SDK update direction serialization', () => {
  it('carries the read direction when only the body changes', async () => {
    const { client, calls } = fixture();
    await client.theses.update(original.id, {
      request_id: REQUEST_ID,
      expected_author_version_id: original.author_version_id,
      body: 'Edited body',
      title: original.title,
      entity_ids: original.entity_ids,
      entity_stances: original.entity_stances,
      visibility: original.visibility,
    });
    expect((calls[1].body as { assets: unknown }).assets).toEqual([
      { assetId: SMH, stance: 'BEARISH' },
    ]);
  });
});
