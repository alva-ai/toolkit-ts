import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { CliUsageError } from '../../src/error.js';
import { dispatch as dispatchTerminal } from '../../src/cli/index.js';
import { dispatch as dispatchEmbedded } from '../../src/cli/embeddedDispatch.js';
import { fakeV2, problem } from '../fakeV2.js';
import {
  ASSET,
  ASSET_2,
  REQUEST_ID,
  THESIS,
  VERSION,
  aPage,
  aThesis,
  aVersion,
} from '../contentV2.js';

// `alva thesis` end to end: CLI flags → the /api/v2 request → the printed
// JSON, which is the route's answer.

let fake: ReturnType<typeof fakeV2> | undefined;
afterEach(() => {
  fake?.restore();
  fake = undefined;
});

function client() {
  return new AlvaClient({ apiKey: 'key', baseUrl: 'https://api.test' });
}

const KEY = `"${REQUEST_ID}"`;
const RUNTIMES = [
  ['terminal', dispatchTerminal],
  ['embedded', dispatchEmbedded],
] as const;

for (const [name, dispatch] of RUNTIMES) {
  describe(`${name} thesis writes`, () => {
    it('creates with the v2 body, the request ID as key, and prints the Thesis', async () => {
      const created = aThesis();
      fake = fakeV2({ 'POST /theses': () => created });

      const result = await dispatch(client(), [
        'thesis',
        'create',
        '--visibility',
        'public',
        '--request-id',
        REQUEST_ID,
        '--body',
        'first\r\nsecond',
        '--entity-ids',
        ` ${ASSET}, ${ASSET_2}`,
        '--entity-stances',
        `[{"assetId":"${ASSET}","stance":"BEARISH"}]`,
        '--tickers',
        ' AAPL, NVDA ',
        '--images',
        '["https://cdn.example/a.png"]',
        '--track-return',
        'false',
      ]);

      expect(result).toEqual(created);
      expect(fake.calls).toHaveLength(1);
      expect(fake.calls[0].headers['Idempotency-Key']).toBe(KEY);
      expect(fake.calls[0].body).toEqual({
        title: '',
        body: 'first\r\nsecond',
        visibility: 'PUBLIC',
        assets: [{ assetId: ASSET, stance: 'BEARISH' }, { assetId: ASSET_2 }],
        media: [
          {
            type: 'IMAGE',
            coverUrl: 'https://cdn.example/a.png',
            url: 'https://cdn.example/a.png',
          },
        ],
        tickers: ['AAPL', 'NVDA'],
        trackReturn: false,
      });
    });

    it('creates with weights and a Signal setting', async () => {
      fake = fakeV2({ 'POST /theses': () => aThesis() });

      await dispatch(client(), [
        'thesis',
        'create',
        '--visibility',
        'private',
        '--request-id',
        REQUEST_ID,
        '--body',
        'NVDA 40%, short AMD 10%',
        '--entity-ids',
        `${ASSET},${ASSET_2}`,
        '--entity-stances',
        `[{"assetId":"${ASSET}","stance":"BULLISH","weight":"0.4"},{"assetId":"${ASSET_2}","stance":"BEARISH","weight":"0.1"}]`,
        '--signal-kinds',
        'macro, TECHNICALS',
        '--signal-min-importance',
        'notable',
      ]);
      expect(fake.calls[0].body).toMatchObject({
        assets: [
          { assetId: ASSET, stance: 'BULLISH', weight: '0.4' },
          { assetId: ASSET_2, stance: 'BEARISH', weight: '0.1' },
        ],
        signalPreferences: {
          kinds: ['MACRO', 'TECHNICALS'],
          minImportance: 'NOTABLE',
        },
      });

      // One flag keeps the other's default.
      await dispatch(client(), [
        'thesis',
        'create',
        '--visibility',
        'private',
        '--request-id',
        REQUEST_ID,
        '--body',
        'b',
        '--signal-min-importance',
        'major',
      ]);
      expect(fake.calls[1].body).toMatchObject({
        signalPreferences: {
          kinds: ['FUNDAMENTALS', 'MACRO', 'TECHNICALS', 'COMMENTARY'],
          minImportance: 'MAJOR',
        },
      });
    });

    it.each([
      [
        'a numeric weight',
        [
          '--entity-ids',
          ASSET,
          '--entity-stances',
          `[{"assetId":"${ASSET}","stance":"BULLISH","weight":0.4}]`,
        ],
      ],
      ['an unknown Signal kind', ['--signal-kinds', 'macro,rumors']],
      ['an empty Signal kind', ['--signal-kinds', 'macro,,technicals']],
      ['an unknown importance', ['--signal-min-importance', 'some']],
    ])('refuses %s before any request', async (_, flags) => {
      fake = fakeV2({});
      await expect(
        dispatch(client(), [
          'thesis',
          'create',
          '--visibility',
          'private',
          '--request-id',
          REQUEST_ID,
          '--body',
          'b',
          ...flags,
        ])
      ).rejects.toBeInstanceOf(CliUsageError);
      expect(fake.calls).toHaveLength(0);
    });

    it('reads the Signal setting and patches only what is given', async () => {
      const setting = { kinds: ['MACRO'], minImportance: 'ALL' };
      fake = fakeV2({
        [`GET /theses/${THESIS}/signal-preferences`]: () => setting,
        'GET /me/thesis-signal-preferences': () => setting,
        [`PATCH /theses/${THESIS}/signal-preferences`]: () => setting,
      });

      await expect(
        dispatch(client(), [
          'thesis',
          'signal-preferences',
          'get',
          '--id',
          THESIS,
        ])
      ).resolves.toEqual(setting);
      await dispatch(client(), ['thesis', 'signal-preferences', 'get']);
      await dispatch(client(), [
        'thesis',
        'signal-preferences',
        'set',
        '--id',
        THESIS,
        '--kinds',
        'macro,commentary',
      ]);
      expect(fake.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
        `GET /theses/${THESIS}/signal-preferences`,
        'GET /me/thesis-signal-preferences',
        `PATCH /theses/${THESIS}/signal-preferences`,
      ]);
      expect(fake.calls[2].body).toEqual({ kinds: ['MACRO', 'COMMENTARY'] });

      await expect(
        dispatch(client(), [
          'thesis',
          'signal-preferences',
          'set',
          '--id',
          THESIS,
        ])
      ).rejects.toThrow('needs --kinds or --min-importance');
      expect(fake.calls).toHaveLength(3);
    });

    it.each([
      [
        'a stance on an asset not in --entity-ids',
        [
          '--entity-ids',
          ASSET,
          '--entity-stances',
          `[{"assetId":"${ASSET_2}","stance":"BULLISH"}]`,
        ],
      ],
      [
        'a 0.x stance item',
        [
          '--entity-ids',
          ASSET,
          '--entity-stances',
          `[{"entity_id":"${ASSET}","stance":"bullish"}]`,
        ],
      ],
      [
        'two stances for one asset',
        [
          '--entity-ids',
          ASSET,
          '--entity-stances',
          `[{"assetId":"${ASSET}","stance":"BULLISH"},{"assetId":"${ASSET}","stance":"BEARISH"}]`,
        ],
      ],
      ['an empty entity ID', ['--entity-ids', `${ASSET},,${ASSET_2}`]],
      ['an empty ticker', ['--tickers', 'AAPL,,NVDA']],
      [
        'images on a private Thesis',
        [
          '--visibility',
          'private',
          '--images',
          '["https://cdn.example/a.png"]',
        ],
      ],
      ['an HTTP image', ['--images', '["http://cdn.example/a.png"]']],
      [
        'an image with credentials',
        ['--images', '["https://u:p@cdn.example/a.png"]'],
      ],
      [
        '21 images',
        [
          '--images',
          JSON.stringify(Array(21).fill('https://cdn.example/a.png')),
        ],
      ],
      ['a paid new Thesis', ['--visibility', 'paid']],
      ['a malformed --track-return', ['--track-return', 'off']],
    ])('refuses %s before any request', async (_case, extra) => {
      fake = fakeV2({});
      const visibility = extra.includes('--visibility')
        ? []
        : ['--visibility', 'public'];
      await expect(
        dispatch(client(), [
          'thesis',
          'create',
          ...visibility,
          '--request-id',
          REQUEST_ID,
          '--body',
          'view',
          ...extra,
        ])
      ).rejects.toBeInstanceOf(CliUsageError);
      expect(fake.calls).toHaveLength(0);
    });

    it('refuses create without --visibility before any request', async () => {
      fake = fakeV2({});
      await expect(
        dispatch(client(), [
          'thesis',
          'create',
          '--request-id',
          REQUEST_ID,
          '--body',
          'view',
        ])
      ).rejects.toThrow("--visibility is required for 'thesis create'");
      expect(fake.calls).toHaveLength(0);
    });

    it('updates in one write; omitted parts carry over and given ones replace', async () => {
      const published = aThesis(
        { visibility: 'PRIVATE' },
        { id: 'thesis_version_0b', number: 3 }
      );
      fake = fakeV2({ [`POST /theses/${THESIS}/updates`]: () => published });
      const media = [
        { type: 'IMAGE', coverUrl: 'https://cdn.example/a.png', url: null },
      ];

      const result = await dispatch(client(), [
        'thesis',
        'update',
        '--id',
        THESIS,
        '--request-id',
        REQUEST_ID,
        '--expected-author-version-id',
        VERSION,
        '--body',
        'Back in play',
        '--visibility',
        'private',
        '--medias',
        JSON.stringify(media),
        '--archived',
        'false',
        '--confirm-end-paid-renewals',
      ]);

      expect(result).toEqual(published);
      expect(fake.calls).toHaveLength(1);
      expect(fake.calls[0].headers['Idempotency-Key']).toBe(KEY);
      // No --title or --entity-ids: the edited Update's carry over.
      expect(fake.calls[0].body).toEqual({
        expectedVersionId: VERSION,
        body: 'Back in play',
        media,
        visibility: 'PRIVATE',
        confirmEndPaidRenewals: true,
        archived: false,
      });
    });

    it('prints the unchanged Thesis of an identical Update, and a conflict as an error', async () => {
      const current = aThesis();
      fake = fakeV2({
        [`POST /theses/${THESIS}/updates`]: [
          () => current,
          () => problem(409, 'CONFLICT'),
        ],
      });
      const argv = [
        'thesis',
        'update',
        '--id',
        THESIS,
        '--request-id',
        REQUEST_ID,
        '--expected-author-version-id',
        VERSION,
        '--body',
        'line one\r\nline two',
      ];

      await expect(dispatch(client(), argv)).resolves.toEqual(current);
      await expect(dispatch(client(), argv)).rejects.toMatchObject({
        status: 409,
        code: 'CONFLICT',
      });
      expect(fake.calls).toHaveLength(2);
    });

    it('refuses update --archived true and a missing body before any request', async () => {
      fake = fakeV2({});
      const base = [
        'thesis',
        'update',
        '--id',
        THESIS,
        '--request-id',
        REQUEST_ID,
        '--expected-author-version-id',
        VERSION,
      ];
      await expect(
        dispatch(client(), [...base, '--body', 'x', '--archived', 'true'])
      ).rejects.toThrow(/--archived only accepts false/);
      await expect(dispatch(client(), base)).rejects.toThrow(/exactly one/);
      await expect(
        dispatch(client(), [...base, '--body', 'x', '--medias', '{}'])
      ).rejects.toThrow(/--medias must be a JSON array/);
      expect(fake.calls).toHaveLength(0);
    });

    it('archives the current Update unless the Update is named', async () => {
      fake = fakeV2({
        [`GET /theses/${THESIS}`]: () => aThesis(),
        [`POST /theses/${THESIS}/archive`]: () => aThesis({ archived: true }),
      });
      const argv = [
        'thesis',
        'archive',
        '--id',
        THESIS,
        '--request-id',
        REQUEST_ID,
        '--note',
        'later',
      ];

      await expect(dispatch(client(), argv)).resolves.toMatchObject({
        archived: true,
      });
      await dispatch(client(), [
        ...argv,
        '--expected-author-version-id',
        'thesis_version_0c',
      ]);
      expect(fake.calls.map((c) => [c.method, c.path, c.body])).toEqual([
        ['GET', `/theses/${THESIS}`, undefined],
        [
          'POST',
          `/theses/${THESIS}/archive`,
          { expectedVersionId: VERSION, note: 'later' },
        ],
        [
          'POST',
          `/theses/${THESIS}/archive`,
          { expectedVersionId: 'thesis_version_0c', note: 'later' },
        ],
      ]);
      expect(fake.calls[1].headers['Idempotency-Key']).toBe(KEY);
    });

    it('sets visibility, stars, unstars and pauses research on their routes', async () => {
      const follow = { thesisId: THESIS, following: true, followerCount: 1 };
      fake = fakeV2({
        [`PATCH /theses/${THESIS}`]: () => aThesis({ visibility: 'PRIVATE' }),
        'POST /me/followed-theses': () => follow,
        [`DELETE /me/followed-theses/${THESIS}`]: () => ({
          ...follow,
          following: false,
          followerCount: 0,
        }),
        [`POST /theses/${THESIS}/research/pause`]: () => aThesis(),
      });

      await dispatch(client(), [
        'thesis',
        'set-visibility',
        '--id',
        THESIS,
        '--visibility',
        'Private',
      ]);
      await expect(
        dispatch(client(), ['thesis', 'star', '--id', THESIS])
      ).resolves.toEqual(follow);
      await dispatch(client(), ['thesis', 'unstar', '--id', THESIS]);
      await dispatch(client(), [
        'thesis',
        'set-signal-enabled',
        '--id',
        THESIS,
        '--enabled',
        'false',
      ]);
      expect(fake.calls.map((c) => [c.method, c.path, c.body])).toEqual([
        ['PATCH', `/theses/${THESIS}`, { visibility: 'PRIVATE' }],
        ['POST', '/me/followed-theses', { thesisId: THESIS }],
        ['DELETE', `/me/followed-theses/${THESIS}`, undefined],
        ['POST', `/theses/${THESIS}/research/pause`, undefined],
      ]);
      await expect(
        dispatch(client(), [
          'thesis',
          'set-visibility',
          '--id',
          THESIS,
          '--visibility',
          'paid',
        ])
      ).rejects.toBeInstanceOf(CliUsageError);
      // A Thesis patch always names its visibility.
      await expect(
        dispatch(client(), [
          'thesis',
          'set-visibility',
          '--id',
          THESIS,
          '--confirm-end-paid-renewals',
        ])
      ).rejects.toThrow("--visibility is required for 'thesis set-visibility'");
      expect(fake.calls).toHaveLength(4);
    });

    it.each([
      [[], {}],
      [['--mode', 'shorten'], { mode: 'SHORTEN' }],
      [['--mode', 'ENRICH'], { mode: 'ENRICH' }],
    ])('rewrites with %j', async (flags, mode) => {
      fake = fakeV2({ 'POST /thesis-rewrites': () => ({ body: 'new' }) });
      await expect(
        dispatch(client(), ['thesis', 'rewrite', '--body', 'draft', ...flags])
      ).resolves.toEqual({ body: 'new' });
      expect(fake.calls[0].body).toEqual({ body: 'draft', ...mode });
    });

    it.each(['', ' ', 'rewrite'])(
      'refuses rewrite mode %j before any request',
      async (mode) => {
        fake = fakeV2({});
        await expect(
          dispatch(client(), [
            'thesis',
            'rewrite',
            '--body',
            'draft',
            '--mode',
            mode,
          ])
        ).rejects.toThrow(/--mode must be one of reformat, shorten, enrich/);
        expect(fake.calls).toHaveLength(0);
      }
    );
  });

  describe(`${name} thesis reads`, () => {
    it('reads by ID, by number, and an Update by ID or by numbers', async () => {
      const thesis = aThesis();
      const version = aVersion({ number: 3 });
      fake = fakeV2({
        [`GET /theses/${THESIS}`]: () => thesis,
        'GET /theses/by-number/42': () => thesis,
        [`GET /thesis-versions/${VERSION}`]: () => version,
        'GET /theses/by-number/42/versions/3': () => version,
      });

      await expect(
        dispatch(client(), ['thesis', 'get', '--id', THESIS])
      ).resolves.toEqual(thesis);
      await expect(
        dispatch(client(), ['thesis', 'get', '--number', '42'])
      ).resolves.toEqual(thesis);
      await expect(
        dispatch(client(), [
          'thesis',
          'version',
          'get',
          '--author-version-id',
          VERSION,
        ])
      ).resolves.toEqual(version);
      await expect(
        dispatch(client(), [
          'thesis',
          'version',
          'get',
          '--number',
          '42',
          '--version',
          '3',
        ])
      ).resolves.toEqual(version);
      await expect(
        dispatch(client(), ['thesis', 'version', 'get', '--number', '42'])
      ).rejects.toThrow(/--author-version-id, or --number and --version/);
      await expect(
        dispatch(client(), ['thesis', 'get', '--number', '4.2'])
      ).rejects.toThrow(/--number must be a positive integer/);
      expect(fake.calls).toHaveLength(4);
    });

    it('maps --first, --cursor and --status onto the page queries', async () => {
      const page = aPage([aThesis()], 'next');
      fake = fakeV2({
        'GET /profiles': () =>
          aPage([
            {
              id: 'profile_0a',
              kind: 'PERSON',
              handle: 'ada',
              displayName: 'Ada',
              avatarUrl: null,
              followerCount: 0,
              viewerState: { following: null },
              xHandle: null,
            },
          ]),
        'GET /profiles/profile_0a/theses': () => page,
        [`GET /assets/${ASSET}/theses`]: () => page,
        [`GET /theses/${THESIS}/signals`]: () => aPage([]),
        [`GET /theses/${THESIS}/updates`]: () => aPage([aVersion()]),
        [`GET /theses/${THESIS}/related`]: () => aPage([]),
      });

      await expect(
        dispatch(client(), [
          'thesis',
          'list',
          '--person',
          'ada',
          '--status',
          'archived',
          '--first',
          '5',
          '--cursor',
          'p1',
        ])
      ).resolves.toEqual(page);
      await dispatch(client(), ['thesis', 'list', '--entity-id', ASSET]);
      await dispatch(client(), [
        'thesis',
        'signals',
        '--id',
        THESIS,
        '--first',
        '2',
      ]);
      await dispatch(client(), [
        'thesis',
        'version',
        'list',
        '--id',
        THESIS,
        '--cursor',
        'p2',
      ]);
      await dispatch(client(), ['thesis', 'related', '--id', THESIS]);
      expect(fake.calls.map((c) => `${c.path}?${c.query}`)).toEqual([
        '/profiles?query=ada&kind=PERSON&pageSize=50',
        '/profiles/profile_0a/theses?archived=true&pageSize=5&pageToken=p1',
        `/assets/${ASSET}/theses?`,
        `/theses/${THESIS}/signals?pageSize=2`,
        `/theses/${THESIS}/updates?pageToken=p2`,
        `/theses/${THESIS}/related?`,
      ]);
      await expect(
        dispatch(client(), [
          'thesis',
          'list',
          '--user',
          'ada',
          '--status',
          'old',
        ])
      ).rejects.toBeInstanceOf(CliUsageError);
      await expect(
        dispatch(client(), ['thesis', 'list', '--user', 'ada', '--first', '0'])
      ).rejects.toBeInstanceOf(CliUsageError);
      expect(fake.calls).toHaveLength(6);
    });

    it('prints RELATED_THESES_GENERATING as the error reason', async () => {
      fake = fakeV2({
        [`GET /theses/${THESIS}/related`]: () =>
          problem(503, 'UNAVAILABLE', { reason: 'RELATED_THESES_GENERATING' }),
      });
      await expect(
        dispatch(client(), ['thesis', 'related', '--id', THESIS])
      ).rejects.toMatchObject({ reason: 'RELATED_THESES_GENERATING' });
      expect(fake.calls).toHaveLength(1);
    });

    it('passes asset-candidates, return and watchpoints flags through', async () => {
      fake = fakeV2({
        'POST /thesis-asset-suggestions': () => ({
          mentions: [],
          selected: [],
          returnPreview: null,
        }),
        [`GET /theses/${THESIS}/return`]: () => ({
          tracking: 'ON',
          return: null,
        }),
        [`GET /theses/${THESIS}/watchpoints`]: () => ({
          versionId: null,
          watchpoints: [],
        }),
      });

      await dispatch(client(), [
        'thesis',
        'asset-candidates',
        '--text',
        'body',
        '--entity-ids',
        ASSET,
        '--thesis-id',
        THESIS,
        '--no-discovery',
      ]);
      await dispatch(client(), ['thesis', 'asset-candidates', '--text', 'b']);
      await dispatch(client(), [
        'thesis',
        'return',
        '--id',
        THESIS,
        '--detail',
      ]);
      await expect(
        dispatch(client(), ['thesis', 'watchpoints', '--id', THESIS])
      ).resolves.toEqual({ versionId: null, watchpoints: [] });
      expect(fake.calls.map((c) => c.body ?? `${c.query}`)).toEqual([
        {
          text: 'body',
          selectedAssetIds: [ASSET],
          thesisId: THESIS,
          discover: false,
        },
        { text: 'b', selectedAssetIds: [], discover: true },
        'detail=true',
        '',
      ]);
    });
  });
}

describe('terminal thesis body transports', () => {
  function create(
    extra: string[],
    deps: Parameters<typeof dispatchTerminal>[3]
  ) {
    return dispatchTerminal(
      client(),
      [
        'thesis',
        'create',
        '--visibility',
        'private',
        '--request-id',
        REQUEST_ID,
        ...extra,
      ],
      undefined,
      deps
    );
  }

  it('sends file and stdin bytes as text, a BOM included', async () => {
    fake = fakeV2({
      'POST /theses': [() => aThesis(), () => aThesis()],
      'POST /thesis-rewrites': () => ({ body: 'new' }),
    });
    const bytes = (text: string) => new TextEncoder().encode(text);

    await create(['--body-file', '/tmp/bom.md'], {
      localFiles: {
        readText: () => 'unused',
        readBytes: () =>
          new Uint8Array([0xef, 0xbb, 0xbf, 0x64, 0x72, 0x61, 0x66, 0x74]),
        writeBytes: () => undefined,
      },
    });
    await create(['--body-stdin'], {
      readStdinBytes: async () => bytes('stdin\r\nbody'),
    });
    expect(fake.calls.map((c) => (c.body as { body: string }).body)).toEqual([
      '\ufeffdraft',
      'stdin\r\nbody',
    ]);
  });

  it('refuses malformed UTF-8 and two body sources before any request', async () => {
    fake = fakeV2({});
    const invalid = new Uint8Array([0xc3, 0x28]);
    await expect(
      create(['--body-file', '/tmp/x.md'], {
        localFiles: {
          readText: () => 'unused',
          readBytes: () => invalid,
          writeBytes: () => undefined,
        },
      })
    ).rejects.toThrow(/--body-file must contain valid UTF-8/);
    await expect(
      dispatchTerminal(
        client(),
        ['thesis', 'rewrite', '--body-stdin'],
        undefined,
        {
          readStdinBytes: async () => invalid,
        }
      )
    ).rejects.toThrow(/--body-stdin must contain valid UTF-8/);
    await expect(create(['--body', 'a', '--body-stdin'], {})).rejects.toThrow(
      /exactly one/
    );
    expect(fake.calls).toHaveLength(0);
  });

  it('embedded refuses file and stdin bodies', async () => {
    await expect(
      dispatchEmbedded(client(), [
        'thesis',
        'rewrite',
        '--body-file',
        '/tmp/t.md',
      ])
    ).rejects.toThrow(/--body-file is not supported/);
    await expect(
      dispatchEmbedded(client(), ['thesis', 'rewrite', '--body-stdin'])
    ).rejects.toThrow(/--body-stdin is not supported/);
  });
});

describe('thesis help and removed commands', () => {
  const REMOVED = [
    [
      'thesis',
      'close',
      '--id',
      THESIS,
      '--expected-author-version-id',
      VERSION,
    ],
    ['thesis', 'delete', '--id', THESIS],
    [
      'thesis',
      'version',
      'delete',
      '--id',
      THESIS,
      '--author-version-id',
      VERSION,
      '--expected-author-version-id',
      VERSION,
    ],
    [
      'thesis',
      'version',
      'get',
      '--id',
      THESIS,
      '--author-version-id',
      VERSION,
    ],
  ];

  for (const [name, dispatch] of RUNTIMES) {
    it.each(REMOVED)(
      `${name} rejects %s %s before any request`,
      async (...argv) => {
        const value = client();
        const request = vi.spyOn(value, '_v2Request');
        await expect(dispatch(value, argv)).rejects.toBeInstanceOf(
          CliUsageError
        );
        expect(request).not.toHaveBeenCalled();
      }
    );

    it(`${name} help documents the v2 output, keys and inputs`, async () => {
      const { text } = (await dispatch(client(), ['thesis', '--help'])) as {
        text: string;
      };
      expect(text).toContain('nextPageToken');
      expect(text).toContain('"assetId":"asset_0abc","stance":"BEARISH"');
      expect(text).toContain('Idempotency-Key');
      expect(text).toContain('RELATED_THESES_GENERATING');
      expect(text).toContain('PAID_RENEWALS_END_CONFIRMATION_REQUIRED');
      expect(text).toContain(
        '--number <thesis-number> --version <update-number>'
      );
      expect(text).toContain('--mode reformat|shorten|enrich');
      expect(text).toContain('candidate only');
      expect(text).toMatch(/Create requires --visibility\s+public\|private/);
      expect(text).not.toContain('defaults --visibility');
      for (const line of text.split('\n')) {
        if (line.includes('alva thesis create ')) {
          expect(line).toContain('--visibility');
        }
      }
      const subcommands = text
        .slice(text.indexOf('Subcommands:'))
        .split('\n\n')[0];
      expect(subcommands).toMatch(/\basset-candidates\b/);
      expect(subcommands).toMatch(/\breturn\b/);
      expect(text).toMatch(/UNKNOWN is an answer, not\s+an error/);
      expect(text).toContain('/thesis/<number>');
      expect(text).not.toMatch(/\bclose\b|version delete|--editorial/);
      expect(text).not.toMatch(/nextCursor|entity_id|unchanged: true/);
    });
  }
});
