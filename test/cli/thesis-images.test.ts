import { afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { dispatch as terminal } from '../../src/cli/index.js';
import { dispatch as embedded } from '../../src/cli/embeddedDispatch.js';
import {
  REQUEST_ID as requestId,
  THESIS,
  VERSION,
  v2Fetch,
  wireThesis,
  type V2Call,
} from '../contentV2.js';

/** A Thesis whose current version carries the media the request sent. */
function echo(call: V2Call) {
  const media = (call.body as { media?: unknown[] } | undefined)?.media ?? [];
  return wireThesis({}, { assets: [], media, body: 'Original body' });
}

function fixture() {
  const { fetcher, calls } = v2Fetch({
    'POST /theses': echo,
    [`GET /theses/${THESIS}`]: wireThesis({}, { assets: [] }),
    [`POST /theses/${THESIS}/updates`]: echo,
  });
  return {
    client: new AlvaClient({ apiKey: 'fixture', baseUrl: 'https://api.test' }),
    fetcher,
    calls,
  };
}
function argv(images?: string, visibility = 'public') {
  return [
    'thesis',
    'create',
    '--request-id',
    requestId,
    '--body',
    'Original body',
    '--visibility',
    visibility,
    ...(images === undefined ? [] : ['--images', images]),
  ];
}
function updateArgv(medias: unknown) {
  return [
    'thesis',
    'update',
    '--id',
    THESIS,
    '--request-id',
    requestId,
    '--expected-author-version-id',
    VERSION,
    '--body',
    'Edited body',
    '--visibility',
    'public',
    '--medias',
    JSON.stringify(medias),
  ];
}
afterEach(() => vi.unstubAllGlobals());
for (const [name, dispatch] of [
  ['terminal', terminal],
  ['embedded', embedded],
] as const) {
  describe(`${name} Thesis images`, () => {
    it.each([1, 20])(
      'preserves %i images and their order through the request and response',
      async (count) => {
        const { client, calls } = fixture();
        const images = Array.from(
          { length: count },
          (_, i) => `https://cdn.example/${i}.png`
        );
        const result = await dispatch(client, argv(JSON.stringify(images)));
        expect(calls).toHaveLength(1);
        expect(calls[0].headers['Idempotency-Key']).toBe(`"${requestId}"`);
        expect(calls[0].body).toMatchObject({
          body: 'Original body',
          visibility: 'PUBLIC',
          media: images.map((url) => ({ type: 'IMAGE', coverUrl: url, url })),
        });
        expect(result).toMatchObject({
          thesis: {
            medias: images.map((url) => ({
              type: 'image',
              cover_url: url,
              url,
            })),
          },
        });
      }
    );
    it.each([
      [
        'too many',
        JSON.stringify(Array(21).fill('https://cdn.example/a.png')),
        'public',
      ],
      ['private', '["https://cdn.example/a.png"]', 'private'],
      ['ALFS path', '["/alva/home/alice/a.png"]', 'public'],
      ['HTTP URL', '["http://cdn.example/a.png"]', 'public'],
      ['credentials', '["https://user:password@cdn.example/a.png"]', 'public'],
      ['wrong shape', '{}', 'public'],
      ['malformed JSON', '[', 'public'],
    ])(
      'rejects %s before making any request',
      async (_name, images, visibility) => {
        const { client, fetcher } = fixture();
        await expect(
          dispatch(client, argv(images, visibility))
        ).rejects.toThrow();
        expect(fetcher).not.toHaveBeenCalled();
      }
    );
    it('preserves current mixed media through a text update', async () => {
      const { client, calls } = fixture();
      const medias = [
        {
          type: 'image',
          cover_url: 'https://cdn.example/a.png',
          url: 'https://cdn.example/a.png',
        },
        {
          type: 'video',
          cover_url: 'https://cdn.example/b.png',
          url: 'https://cdn.example/b.mp4',
        },
      ];
      const result = await dispatch(client, updateArgv(medias));
      expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
        `GET /theses/${THESIS}`,
        `POST /theses/${THESIS}/updates`,
      ]);
      expect((calls[1].body as { media: unknown }).media).toEqual([
        {
          type: 'IMAGE',
          coverUrl: 'https://cdn.example/a.png',
          url: 'https://cdn.example/a.png',
        },
        {
          type: 'VIDEO',
          coverUrl: 'https://cdn.example/b.png',
          url: 'https://cdn.example/b.mp4',
        },
      ]);
      expect(result).toMatchObject({ thesis: { medias } });
    });
    it.each([
      [null],
      [{ type: 'unknown', cover_url: 'https://cdn.example/a.png' }],
      [{ type: 'image', cover_url: '/private/a.png' }],
      [{ type: 'video', cover_url: 'https://cdn.example/a.png', url: 42 }],
    ])('rejects malformed update media before sending: %j', async (item) => {
      const { client, fetcher } = fixture();
      await expect(dispatch(client, updateArgv([item]))).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
      expect(fetcher).not.toHaveBeenCalled();
    });
    it('keeps text-only private creation unchanged', async () => {
      const { client, calls } = fixture();
      await dispatch(client, argv(undefined, 'private'));
      expect(calls[0].body).toMatchObject({ visibility: 'PRIVATE' });
      expect(calls[0].body).not.toHaveProperty('media');
    });
  });
}

describe('Thesis media readback', () => {
  it('keeps existing media types and order on GET', async () => {
    const media = [
      {
        type: 'IMAGE',
        coverUrl: 'https://cdn.example/a.png',
        url: 'https://cdn.example/a.png',
      },
      { type: 'VIDEO', coverUrl: 'https://cdn.example/b.png', url: null },
    ];
    v2Fetch({ [`GET /theses/${THESIS}`]: wireThesis({}, { media }) });
    const client = new AlvaClient({
      apiKey: 'fixture',
      baseUrl: 'https://api.test',
    });
    expect(await client.theses.get(THESIS)).toMatchObject({
      thesis: {
        medias: [
          {
            type: 'image',
            cover_url: 'https://cdn.example/a.png',
            url: 'https://cdn.example/a.png',
          },
          { type: 'video', cover_url: 'https://cdn.example/b.png' },
        ],
      },
    });
  });
  it('rejects malformed media from the server rather than claiming success', async () => {
    const { fetcher } = v2Fetch({
      'POST /theses': wireThesis(
        {},
        { media: [{ type: 'IMAGE', coverUrl: '/private/file.png', url: null }] }
      ),
    });
    const client = new AlvaClient({
      apiKey: 'fixture',
      baseUrl: 'https://api.test',
    });
    await expect(
      client.theses.create({ request_id: requestId, body: 'Original body' })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
