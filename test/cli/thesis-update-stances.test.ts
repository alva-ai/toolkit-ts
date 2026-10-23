import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { dispatch as terminal } from '../../src/cli/index.js';
import { dispatch as embedded } from '../../src/cli/embeddedDispatch.js';

const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000';
const original = {
  id: '33116',
  author_version_id: '133997',
  material_version_id: '133997',
  title: 'Semiconductors',
  body: 'Bearish on SMH',
  entity_ids: ['508176'],
  entity_stances: [{ entity_id: '508176', stance: 'bearish' as const }],
  visibility: 'private' as const,
  closed: false,
  closing_note: '',
  author_kind: 'user',
  author_ref: 'author',
};

function fixture() {
  const fetcher = vi
    .fn()
    .mockImplementation(async (_url: string, init: RequestInit) => {
      const payload = init.body ? JSON.parse(init.body as string) : {};
      return new Response(
        JSON.stringify({
          thesis: { ...original, ...payload, author_version_id: '133998' },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    });
  vi.stubGlobal('fetch', fetcher);
  return {
    client: new AlvaClient({ apiKey: 'fixture', baseUrl: 'https://api.test' }),
    fetcher,
  };
}

function argv(stances: string, ids = '508176') {
  return [
    'thesis',
    'update',
    '--id',
    '33116',
    '--request-id',
    REQUEST_ID,
    '--expected-author-version-id',
    '133997',
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
        const { client, fetcher } = fixture();
        const stances = [{ entity_id: '508176', stance }];
        const result = await dispatch(client, argv(JSON.stringify(stances)));
        expect(result).toMatchObject({ thesis: { entity_stances: stances } });
        expect(fetcher).toHaveBeenCalledTimes(1);
        const [url, init] = fetcher.mock.calls[0];
        expect(url).toBe('https://api.test/api/v1/theses/33116');
        expect(init.method).toBe('PUT');
        expect(JSON.parse(init.body)).toEqual({
          request_id: REQUEST_ID,
          expected_author_version_id: '133997',
          body: 'Edited body',
          title: 'Semiconductors',
          entity_ids: ['508176'],
          entity_stances: stances,
          visibility: 'private',
          editorial: false,
        });
      }
    );

    it('keeps directions keyed to the submitted entities after an asset change', async () => {
      const { client, fetcher } = fixture();
      const stances = [
        { entity_id: '42', stance: 'bullish' },
        { entity_id: '508176', stance: 'bearish' },
      ];
      await dispatch(client, argv(JSON.stringify(stances), '508176,42'));
      expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
        entity_ids: ['508176', '42'],
        entity_stances: stances,
      });
    });

    it.each([
      'not-json',
      '{}',
      '[{"entity_id":"42","stance":"bearish"}]',
      '[{"entity_id":"508176","stance":"mixed"}]',
      '[{"entity_id":"508176","stance":"bearish"},{"entity_id":"508176","stance":"bullish"}]',
      '[{"entity_id":508176,"stance":"bearish"}]',
    ])('rejects invalid bindings before HTTP: %s', async (stances) => {
      const { client, fetcher } = fixture();
      await expect(dispatch(client, argv(stances))).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('propagates a version conflict without retrying or removing directions', async () => {
      const { client, fetcher } = fixture();
      fetcher.mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'CONFLICT', message: 'version conflict' },
          }),
          { status: 409 }
        )
      );
      await expect(
        dispatch(client, argv(JSON.stringify(original.entity_stances)))
      ).rejects.toMatchObject({ status: 409 });
      expect(fetcher).toHaveBeenCalledTimes(1);
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
    const { client, fetcher } = fixture();
    await client.theses.update(original.id, {
      request_id: REQUEST_ID,
      expected_author_version_id: original.author_version_id,
      body: 'Edited body',
      title: original.title,
      entity_ids: original.entity_ids,
      entity_stances: original.entity_stances,
      visibility: original.visibility,
    });
    expect(JSON.parse(fetcher.mock.calls[0][1].body).entity_stances).toEqual(
      original.entity_stances
    );
  });
});
