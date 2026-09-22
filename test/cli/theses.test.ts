import { describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { CliUsageError } from '../../src/error.js';
import { dispatch as dispatchTerminal } from '../../src/cli/index.js';
import { dispatch as dispatchEmbedded } from '../../src/cli/embeddedDispatch.js';

const REQUEST_ID = '123e4567-e89b-72d3-c456-426614174000';
const THESIS = {
  thesis: {
    id: '9223372036854775807',
    author_version_id: '9223372036854775806',
    material_version_id: '9223372036854775805',
    title: '',
    body: 'draft',
    entity_ids: [],
    visibility: 'public' as const,
    closed: false,
    closing_note: '',
    author_kind: 'user',
    author_ref: 'alice',
  },
  author: {
    id: '42',
    kind: 'user',
    display_name: 'Alice',
    avatar_url: 'https://example.com/alice.png',
    username: 'alice',
  },
  entities: [],
};
const SIGNALS = {
  research: { state: 'ready', pending_work: 0, read_complete: true },
  entries: [],
  next_cursor: '',
};

function client() {
  return new AlvaClient({ apiKey: 'key' });
}

function mockLifecycle(value: AlvaClient) {
  return {
    create: vi.spyOn(value.theses, 'create').mockResolvedValue(THESIS),
    get: vi.spyOn(value.theses, 'get').mockResolvedValue(THESIS),
    getVersion: vi.spyOn(value.theses, 'getVersion').mockResolvedValue(THESIS),
    signals: vi.spyOn(value.theses, 'signals').mockResolvedValue(SIGNALS),
    setVisibility: vi
      .spyOn(value.theses, 'setVisibility')
      .mockResolvedValue(THESIS),
    update: vi.spyOn(value.theses, 'update').mockResolvedValue(THESIS),
    close: vi.spyOn(value.theses, 'close').mockResolvedValue(THESIS),
    remove: vi.spyOn(value.theses, 'delete').mockResolvedValue({}),
    rewrite: vi
      .spyOn(value.theses, 'rewrite')
      .mockResolvedValue({ body: 'new' }),
  };
}

describe('thesis terminal dispatch', () => {
  it('dispatches all lifecycle operations without hidden rewrite or retries', async () => {
    const value = client();
    const calls = mockLifecycle(value);
    const localFiles = {
      readText: () => 'file\r\nbody',
      readBytes: () => new TextEncoder().encode('file\r\nbody'),
      writeBytes: () => undefined,
    };

    await dispatchTerminal(value, [
      'thesis',
      'create',
      '--request-id',
      REQUEST_ID,
      '--body',
      'first\r\nsecond',
      '--entity-ids',
      '9223372036854775807,42',
      '--tickers',
      ' AAPL,NVDA ',
    ]);
    await dispatchTerminal(value, ['thesis', 'get', '--id', THESIS.thesis.id]);
    await dispatchTerminal(value, [
      'thesis',
      'version',
      'get',
      '--id',
      THESIS.thesis.id,
      '--author-version-id',
      THESIS.thesis.author_version_id,
    ]);
    await dispatchTerminal(value, [
      'thesis',
      'signals',
      '--id',
      THESIS.thesis.id,
      '--first',
      '10',
      '--cursor',
      'after',
    ]);
    await dispatchTerminal(value, [
      'thesis',
      'set-visibility',
      '--id',
      THESIS.thesis.id,
      '--visibility',
      'private',
    ]);
    await dispatchTerminal(
      value,
      [
        'thesis',
        'update',
        '--id',
        THESIS.thesis.id,
        '--request-id',
        REQUEST_ID,
        '--expected-author-version-id',
        THESIS.thesis.author_version_id,
        '--body-file',
        '/tmp/thesis.md',
        '--visibility',
        'private',
        '--editorial',
      ],
      undefined,
      { localFiles }
    );
    await dispatchTerminal(value, [
      'thesis',
      'close',
      '--id',
      THESIS.thesis.id,
      '--expected-author-version-id',
      THESIS.thesis.author_version_id,
      '--note',
      'done',
    ]);
    await dispatchTerminal(value, [
      'thesis',
      'delete',
      '--id',
      THESIS.thesis.id,
    ]);
    await dispatchTerminal(
      value,
      ['thesis', 'rewrite', '--body-stdin'],
      undefined,
      {
        readStdinBytes: async () => new TextEncoder().encode('stdin\r\nbody'),
      }
    );

    expect(calls.create).toHaveBeenCalledWith({
      request_id: REQUEST_ID,
      body: 'first\r\nsecond',
      title: '',
      entity_ids: ['9223372036854775807', '42'],
      tickers: ['AAPL', 'NVDA'],
      visibility: 'public',
    });
    expect(calls.get).toHaveBeenCalledWith(THESIS.thesis.id);
    expect(calls.getVersion).toHaveBeenCalledWith(
      THESIS.thesis.id,
      THESIS.thesis.author_version_id
    );
    expect(calls.signals).toHaveBeenCalledWith(THESIS.thesis.id, {
      first: 10,
      cursor: 'after',
    });
    expect(calls.setVisibility).toHaveBeenCalledWith(THESIS.thesis.id, {
      visibility: 'private',
    });
    expect(calls.update).toHaveBeenCalledWith(THESIS.thesis.id, {
      request_id: REQUEST_ID,
      expected_author_version_id: THESIS.thesis.author_version_id,
      body: 'file\r\nbody',
      title: '',
      entity_ids: [],
      visibility: 'private',
      editorial: true,
    });
    expect(calls.close).toHaveBeenCalledWith(THESIS.thesis.id, {
      expected_author_version_id: THESIS.thesis.author_version_id,
      note: 'done',
    });
    expect(calls.remove).toHaveBeenCalledWith(THESIS.thesis.id);
    expect(calls.rewrite).toHaveBeenCalledWith({
      body: 'stdin\r\nbody',
      mode: 'reformat',
    });
    expect(calls.rewrite).toHaveBeenCalledTimes(1);
  });

  it('requires update visibility and one body transport before resource calls', async () => {
    const value = client();
    const calls = mockLifecycle(value);

    await expect(
      dispatchTerminal(value, [
        'thesis',
        'update',
        '--id',
        '1',
        '--request-id',
        REQUEST_ID,
        '--expected-author-version-id',
        '2',
        '--body',
        'draft',
      ])
    ).rejects.toBeInstanceOf(CliUsageError);
    await expect(
      dispatchTerminal(value, [
        'thesis',
        'create',
        '--request-id',
        REQUEST_ID,
        '--body',
        'draft',
        '--body-stdin',
      ])
    ).rejects.toThrow(/exactly one/);
    await expect(
      dispatchTerminal(value, [
        'thesis',
        'update',
        '--id',
        '1',
        '--request-id',
        REQUEST_ID,
        '--expected-author-version-id',
        '2',
        '--body',
        'draft',
        '--visibility',
        'private',
        '--tickers',
        'AAPL',
      ])
    ).rejects.toThrow(/--tickers is not supported for 'thesis update'/);
    expect(calls.update).not.toHaveBeenCalled();
    expect(calls.create).not.toHaveBeenCalled();
  });

  it('rejects missing or invalid set-visibility flags before resource calls', async () => {
    const value = client();
    const calls = mockLifecycle(value);

    await expect(
      dispatchTerminal(value, [
        'thesis',
        'set-visibility',
        '--visibility',
        'private',
      ])
    ).rejects.toBeInstanceOf(CliUsageError);
    await expect(
      dispatchTerminal(value, [
        'thesis',
        'set-visibility',
        '--id',
        THESIS.thesis.id,
      ])
    ).rejects.toBeInstanceOf(CliUsageError);
    await expect(
      dispatchTerminal(value, [
        'thesis',
        'set-visibility',
        '--id',
        THESIS.thesis.id,
        '--visibility',
        'paid',
      ])
    ).rejects.toBeInstanceOf(CliUsageError);
    expect(calls.setVisibility).not.toHaveBeenCalled();
  });

  it('rejects malformed UTF-8 file and stdin bytes without calling the resource', async () => {
    const value = client();
    const calls = mockLifecycle(value);
    const invalidBytes = new Uint8Array([0xc3, 0x28]);

    await expect(
      dispatchTerminal(
        value,
        [
          'thesis',
          'create',
          '--request-id',
          REQUEST_ID,
          '--body-file',
          '/tmp/invalid.md',
        ],
        undefined,
        {
          localFiles: {
            readText: () => 'unused',
            readBytes: () => invalidBytes,
            writeBytes: () => undefined,
          },
        }
      )
    ).rejects.toThrow(/--body-file must contain valid UTF-8/);
    await expect(
      dispatchTerminal(
        value,
        ['thesis', 'rewrite', '--body-stdin'],
        undefined,
        {
          readStdinBytes: async () => invalidBytes,
        }
      )
    ).rejects.toThrow(/--body-stdin must contain valid UTF-8/);
    expect(calls.create).not.toHaveBeenCalled();
    expect(calls.rewrite).not.toHaveBeenCalled();
  });

  it('preserves a UTF-8 BOM from a body file as a text code point', async () => {
    const value = client();
    const calls = mockLifecycle(value);

    await dispatchTerminal(
      value,
      [
        'thesis',
        'create',
        '--request-id',
        REQUEST_ID,
        '--body-file',
        '/tmp/bom.md',
      ],
      undefined,
      {
        localFiles: {
          readText: () => 'unused',
          readBytes: () =>
            new Uint8Array([0xef, 0xbb, 0xbf, 0x64, 0x72, 0x61, 0x66, 0x74]),
          writeBytes: () => undefined,
        },
      }
    );

    expect(calls.create).toHaveBeenCalledWith(
      expect.objectContaining({ body: '\ufeffdraft' })
    );
  });

  it('trims entity ID CSV tokens without changing body text and rejects empty tokens', async () => {
    const value = client();
    const calls = mockLifecycle(value);

    await dispatchTerminal(value, [
      'thesis',
      'create',
      '--request-id',
      REQUEST_ID,
      '--body',
      'first\r\nsecond',
      '--entity-ids',
      '123, 456',
    ]);

    expect(calls.create).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'first\r\nsecond',
        entity_ids: ['123', '456'],
      })
    );
    expect(calls.create.mock.calls[0]?.[0]).toHaveProperty(
      'tickers',
      undefined
    );

    await expect(
      dispatchTerminal(value, [
        'thesis',
        'create',
        '--request-id',
        REQUEST_ID,
        '--body',
        'first\r\nsecond',
        '--entity-ids',
        '123,,456',
      ])
    ).rejects.toThrow(/must not contain empty IDs/);
    expect(calls.create).toHaveBeenCalledTimes(1);
  });

  it('trims ticker CSV tokens and rejects empty tickers before create', async () => {
    const value = client();
    const calls = mockLifecycle(value);

    await dispatchTerminal(value, [
      'thesis',
      'create',
      '--request-id',
      REQUEST_ID,
      '--body',
      'view',
      '--tickers',
      ' AAPL, NVDA ',
    ]);
    expect(calls.create).toHaveBeenCalledWith(
      expect.objectContaining({ tickers: ['AAPL', 'NVDA'] })
    );

    await expect(
      dispatchTerminal(value, [
        'thesis',
        'create',
        '--request-id',
        REQUEST_ID,
        '--body',
        'view',
        '--tickers',
        'AAPL,,NVDA',
      ])
    ).rejects.toThrow(/must not contain empty tickers/);
    await expect(
      dispatchTerminal(value, [
        'thesis',
        'create',
        '--request-id',
        REQUEST_ID,
        '--body',
        'view',
        '--tickers',
        '',
      ])
    ).rejects.toThrow(/must not contain empty tickers/);
    expect(calls.create).toHaveBeenCalledTimes(1);
  });

  it('returns terminal help that documents replacement fields and ambiguity handling', async () => {
    const result = (await dispatchTerminal(client(), ['thesis', '--help'])) as {
      text: string;
    };
    expect(result.text).toContain('Replaces document fields');
    expect(result.text).toContain('response is ambiguous');
    expect(result.text).toContain('defaults --visibility to public');
    expect(result.text).toContain('--tickers <ticker,ticker>');
    expect(result.text).toContain('--mode reformat|shorten|enrich');
    expect(result.text).toContain('candidate only');
  });

  it.each(['reformat', 'shorten', 'enrich'] as const)(
    'dispatches terminal rewrite mode %s without automatic selection',
    async (mode) => {
      const value = client();
      const calls = mockLifecycle(value);

      await dispatchTerminal(value, [
        'thesis',
        'rewrite',
        '--body',
        'draft',
        '--mode',
        mode,
      ]);

      expect(calls.rewrite).toHaveBeenCalledWith({ body: 'draft', mode });
    }
  );

  it.each(['', ' ', 'rewrite'])(
    'rejects terminal rewrite mode %j before the resource call',
    async (mode) => {
      const value = client();
      const calls = mockLifecycle(value);

      await expect(
        dispatchTerminal(value, [
          'thesis',
          'rewrite',
          '--body',
          'draft',
          '--mode',
          mode,
        ])
      ).rejects.toThrow(/--mode must be reformat, shorten, or enrich/);
      expect(calls.rewrite).not.toHaveBeenCalled();
    }
  );
});

describe('thesis embedded dispatch', () => {
  it('dispatches all lifecycle operations with literal bodies only', async () => {
    const value = client();
    const calls = mockLifecycle(value);

    await dispatchEmbedded(value, [
      'thesis',
      'create',
      '--request-id',
      REQUEST_ID,
      '--body',
      'embedded\r\nbody',
      '--tickers',
      'AAPL,NVDA',
    ]);
    await dispatchEmbedded(value, ['thesis', 'get', '--id', THESIS.thesis.id]);
    await dispatchEmbedded(value, [
      'thesis',
      'version',
      'get',
      '--id',
      THESIS.thesis.id,
      '--author-version-id',
      THESIS.thesis.author_version_id,
    ]);
    await dispatchEmbedded(value, [
      'thesis',
      'set-visibility',
      '--id',
      THESIS.thesis.id,
      '--visibility',
      'private',
    ]);
    await dispatchEmbedded(value, [
      'thesis',
      'update',
      '--id',
      THESIS.thesis.id,
      '--request-id',
      REQUEST_ID,
      '--expected-author-version-id',
      THESIS.thesis.author_version_id,
      '--body',
      'update',
      '--visibility',
      'private',
    ]);
    await dispatchEmbedded(value, [
      'thesis',
      'close',
      '--id',
      THESIS.thesis.id,
      '--expected-author-version-id',
      THESIS.thesis.author_version_id,
    ]);
    await dispatchEmbedded(value, [
      'thesis',
      'delete',
      '--id',
      THESIS.thesis.id,
    ]);
    await dispatchEmbedded(value, ['thesis', 'rewrite', '--body', 'rewrite']);

    expect(calls.create).toHaveBeenCalledWith({
      request_id: REQUEST_ID,
      body: 'embedded\r\nbody',
      title: '',
      entity_ids: [],
      tickers: ['AAPL', 'NVDA'],
      visibility: 'public',
    });
    expect(calls.setVisibility).toHaveBeenCalledWith(THESIS.thesis.id, {
      visibility: 'private',
    });
    expect(calls.update).toHaveBeenCalledWith(
      THESIS.thesis.id,
      expect.objectContaining({
        body: 'update',
        visibility: 'private',
        editorial: false,
      })
    );
    expect(calls.rewrite).toHaveBeenCalledWith({
      body: 'rewrite',
      mode: 'reformat',
    });
  });

  it('rejects unsupported body transports instead of inventing filesystem support', async () => {
    await expect(
      dispatchEmbedded(client(), [
        'thesis',
        'rewrite',
        '--body-file',
        '/tmp/thesis.md',
      ])
    ).rejects.toThrow(/--body-file is not supported/);
    await expect(
      dispatchEmbedded(client(), ['thesis', 'rewrite', '--body-stdin'])
    ).rejects.toThrow(/--body-stdin is not supported/);
  });

  it('returns embedded help with the no-retry and public-default contract', async () => {
    const result = (await dispatchEmbedded(client(), ['thesis', '--help'])) as {
      text: string;
    };
    expect(result.text).toContain('never creates request IDs or retries');
    expect(result.text).toContain('Create defaults --visibility to public');
    expect(result.text).toContain('changes current access without publishing');
    expect(result.text).toContain('never uses a request ID');
    expect(result.text).toContain('--mode reformat|shorten|enrich');
    expect(result.text).toContain('candidate only');
  });

  it.each(['reformat', 'shorten', 'enrich'] as const)(
    'dispatches embedded rewrite mode %s without automatic selection',
    async (mode) => {
      const value = client();
      const calls = mockLifecycle(value);

      await dispatchEmbedded(value, [
        'thesis',
        'rewrite',
        '--body',
        'draft',
        '--mode',
        mode,
      ]);

      expect(calls.rewrite).toHaveBeenCalledWith({ body: 'draft', mode });
    }
  );

  it.each(['', ' ', 'rewrite'])(
    'rejects embedded rewrite mode %j before the resource call',
    async (mode) => {
      const value = client();
      const calls = mockLifecycle(value);

      await expect(
        dispatchEmbedded(value, [
          'thesis',
          'rewrite',
          '--body',
          'draft',
          '--mode',
          mode,
        ])
      ).rejects.toThrow(/--mode must be reformat, shorten, or enrich/);
      expect(calls.rewrite).not.toHaveBeenCalled();
    }
  );
});
