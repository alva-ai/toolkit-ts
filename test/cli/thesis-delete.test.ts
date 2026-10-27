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
  describe(`${name} Thesis deletion`, () => {
    it('deletes exactly the selected version with an expected-current guard', async () => {
      const { client, fetcher } = fixture();
      const result = await dispatch(client, [
        'thesis',
        'version',
        'delete',
        '--id',
        '42',
        '--author-version-id',
        '43',
        '--expected-author-version-id',
        '44',
      ]);
      expect(result).toEqual({ thesis });
      const [url, init] = fetcher.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(String(url)).toBe(
        'https://example.test/api/v1/theses/42/versions/43?expected_author_version_id=44'
      );
      expect(init.method).toBe('DELETE');
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
    it('rejects missing version guard before a request', async () => {
      const { client, fetcher } = fixture();
      await expect(
        dispatch(client, [
          'thesis',
          'version',
          'delete',
          '--id',
          '42',
          '--author-version-id',
          '43',
        ])
      ).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
    });
    it('does not fall back to whole deletion on an unsupported server', async () => {
      const { client, fetcher } = fixture();
      fetcher.mockImplementation(
        async () =>
          new Response(
            JSON.stringify({ code: 'UNIMPLEMENTED', message: 'unavailable' }),
            { status: 501, headers: { 'Content-Type': 'application/json' } }
          )
      );
      await expect(
        dispatch(client, [
          'thesis',
          'version',
          'delete',
          '--id',
          '42',
          '--author-version-id',
          '43',
          '--expected-author-version-id',
          '44',
        ])
      ).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
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
