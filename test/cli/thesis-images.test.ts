import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { dispatch as terminal } from '../../src/cli/index.js';
import { dispatch as embedded } from '../../src/cli/embeddedDispatch.js';

const requestId = '123e4567-e89b-42d3-a456-426614174000';
function fixture() {
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(init.body as string) : {};
    return new Response(JSON.stringify({ thesis: {
      id: '42', author_version_id: '43', material_version_id: '43',
      title: '', body: 'Original body', entity_ids: [], visibility: 'public',
      closed: false, archived: false, closing_note: '', author_kind: 'user', author_ref: 'alice',
      ...body,
    }}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetcher);
  return { client: new AlvaClient({ apiKey: 'fixture', baseUrl: 'https://api.test' }), fetcher };
}
function argv(images?: string, visibility = 'public') {
  return ['thesis', 'create', '--request-id', requestId, '--body', 'Original body',
    '--visibility', visibility, ...(images === undefined ? [] : ['--images', images])];
}
afterEach(() => vi.unstubAllGlobals());
for (const [name, dispatch] of [['terminal', terminal], ['embedded', embedded]] as const) {
  describe(`${name} Thesis images`, () => {
    it.each([1, 20])('preserves %i images and their order through the REST request and response', async (count) => {
      const { client, fetcher } = fixture();
      const images = Array.from({ length: count }, (_, i) => `https://cdn.example/${i}.png`);
      const result = await dispatch(client, argv(JSON.stringify(images)));
      const medias = images.map(url => ({ type: 'image', cover_url: url, url }));
      expect(JSON.parse(fetcher.mock.calls[0][1].body as string)).toMatchObject({
        request_id: requestId, body: 'Original body', visibility: 'public', medias,
      });
      expect(result).toMatchObject({ thesis: { medias } });
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
    it.each([
      ['too many', JSON.stringify(Array(21).fill('https://cdn.example/a.png')), 'public'],
      ['private', '["https://cdn.example/a.png"]', 'private'],
      ['ALFS path', '["/alva/home/alice/a.png"]', 'public'],
      ['HTTP URL', '["http://cdn.example/a.png"]', 'public'],
      ['credentials', '["https://user:password@cdn.example/a.png"]', 'public'],
      ['wrong shape', '{}', 'public'],
      ['malformed JSON', '[', 'public'],
    ])('rejects %s before making any request', async (_name, images, visibility) => {
      const { client, fetcher } = fixture();
      await expect(dispatch(client, argv(images, visibility))).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
    });
    it('preserves current mixed media through a text update', async () => {
      const { client, fetcher } = fixture();
      const medias = [
        { type: 'image', cover_url: 'https://cdn.example/a.png', url: 'https://cdn.example/a.png' },
        { type: 'video', cover_url: 'https://cdn.example/b.png', url: 'https://cdn.example/b.mp4' },
      ];
      const result = await dispatch(client, ['thesis', 'update', '--id', '42',
        '--request-id', requestId, '--expected-author-version-id', '43',
        '--body', 'Edited body', '--visibility', 'public', '--medias', JSON.stringify(medias)]);
      expect(JSON.parse(fetcher.mock.calls[0][1].body as string).medias).toEqual(medias);
      expect(result).toMatchObject({ thesis: { medias } });
    });
    it('keeps text-only private creation unchanged', async () => {
      const { client, fetcher } = fixture();
      await dispatch(client, argv(undefined, 'private'));
      expect(JSON.parse(fetcher.mock.calls[0][1].body as string)).not.toHaveProperty('medias');
    });
  });
}

describe('Thesis media readback', () => {
  it('keeps existing media types and order on GET', async () => {
    const { client, fetcher } = fixture();
    const medias = [
      { type: 'image', cover_url: 'https://cdn.example/a.png', url: 'https://cdn.example/a.png' },
      { type: 'video', cover_url: 'https://cdn.example/b.png', url: 'https://cdn.example/b.mp4' },
    ];
    fetcher.mockImplementationOnce(async () => new Response(JSON.stringify({
      thesis: {
        id: '42', author_version_id: '43', material_version_id: '43',
        title: '', body: 'Original body', entity_ids: [], visibility: 'public',
        closed: false, archived: false, closing_note: '', author_kind: 'user', author_ref: 'alice', medias,
      },
      author: { id: '1', kind: 'user', display_name: 'Alice', avatar_url: '', username: 'alice' },
      entities: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    expect(await client.theses.get('42')).toMatchObject({ thesis: { medias } });
  });
  it('rejects malformed media from the server rather than claiming success', async () => {
    const { client, fetcher } = fixture();
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementationOnce(async (url, init) => {
      const response = await original(url, init);
      const data = await response.json();
      data.thesis.medias = [{ type: 'image', cover_url: '/private/file.png' }];
      return new Response(JSON.stringify(data), { status: 200 });
    });
    await expect(client.theses.create({ request_id: requestId, body: 'Original body' }))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
