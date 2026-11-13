import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { dispatch as terminal } from '../../src/cli/index.js';
import { dispatch as embedded } from '../../src/cli/embeddedDispatch.js';

const thesis = {
  id: '42',
  author_version_id: '41',
  material_version_id: '41',
  title: '',
  body: 'Previous view',
  entity_ids: [],
  visibility: 'private',
  closed: false,
  archived: false,
  closing_note: '',
  author_kind: 'user',
  author_ref: 'alice',
};
function fixture() {
  const fetcher = vi.fn(
    async () =>
      new Response(JSON.stringify({ thesis }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
  );
  vi.stubGlobal('fetch', fetcher);
  return {
    fetcher,
    client: new AlvaClient({ apiKey: 'test', baseUrl: 'https://example.test' }),
  };
}
afterEach(() => vi.unstubAllGlobals());
for (const [name, dispatch] of [
  ['terminal', terminal],
  ['embedded', embedded],
] as const) {
  describe(`${name} Thesis Updates`, () => {
    it('lists visible Updates with paging', async () => {
      const { client, fetcher } = fixture();
      fetcher.mockImplementation(
        async () =>
          new Response(
            JSON.stringify({ versions: [thesis], next_cursor: 'next' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
      );
      expect(
        await dispatch(client, [
          'thesis',
          'version',
          'list',
          '--id',
          '42',
          '--first',
          '1',
        ])
      ).toEqual({ versions: [thesis], next_cursor: 'next' });
      expect(String(fetcher.mock.calls[0]?.[0])).toContain('updates_only=true');
    });
  });
}
