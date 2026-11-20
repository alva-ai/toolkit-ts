import { afterEach, describe, it, expect, vi } from 'vitest';
import { V1FsResource } from '../../src/v1/fs.js';
import { AlvaClient } from '../../src/client.js';
import { AlvaError } from '../../src/error.js';
import { runInNewContext } from 'node:vm';
import { fakeV2, problem } from '../fakeV2.js';
import { v2 } from '../v2Schema.js';

// client.v1.fs: a Playbook-scoped viewer (the Playbook runtime) or a
// keyless public read keeps /api/v1/fs; API-key clients are covered by the
// /api/v2 suite below.
function makeClient(
  pbsvToken?: string
): AlvaClient & { _request: ReturnType<typeof vi.fn> } {
  const client = new AlvaClient({ pbsvToken }) as AlvaClient & {
    _request: ReturnType<typeof vi.fn>;
  };
  client._request = vi.fn().mockResolvedValue({});
  return client;
}

describe('client.v1.fs with a Playbook-scoped viewer (/api/v1)', () => {
  describe('read', () => {
    it('sends GET /api/v1/fs/read with path', async () => {
      const client = makeClient('pbsv');
      const fs = new V1FsResource(client);
      await fs.read({ path: '~/data/f.json' });
      expect(client._request).toHaveBeenCalledWith('GET', '/api/v1/fs/read', {
        query: { path: '~/data/f.json', offset: undefined, size: undefined },
      });
    });

    it('passes offset and size params', async () => {
      const client = makeClient('pbsv');
      const fs = new V1FsResource(client);
      await fs.read({ path: '~/f', offset: 0, size: 100 });
      expect(client._request).toHaveBeenCalledWith('GET', '/api/v1/fs/read', {
        query: { path: '~/f', offset: 0, size: 100 },
      });
    });

    it('works without auth for public reads', async () => {
      const client = makeClient();
      const fs = new V1FsResource(client);
      await fs.read({ path: '/alva/home/alice/data.json' });
      expect(client._request).toHaveBeenCalledWith('GET', '/api/v1/fs/read', {
        query: {
          path: '/alva/home/alice/data.json',
          offset: undefined,
          size: undefined,
        },
      });
    });

    it('decodes ArrayBuffer containing JSON array', async () => {
      const client = makeClient('pbsv');
      const fs = new V1FsResource(client);
      const json = '[{"date":1,"close":100}]';
      client._request.mockResolvedValue(new TextEncoder().encode(json).buffer);
      const result = await fs.read({ path: '~/data.json' });
      expect(result).toEqual([{ date: 1, close: 100 }]);
    });

    it('decodes ArrayBuffer containing plain text', async () => {
      const client = makeClient('pbsv');
      const fs = new V1FsResource(client);
      const text = 'console.log("hi");';
      client._request.mockResolvedValue(new TextEncoder().encode(text).buffer);
      const result = await fs.read({ path: '~/script.js' });
      expect(result).toBe('console.log("hi");');
    });

    it('decodes text from an ArrayBuffer created in another realm', async () => {
      const client = makeClient('pbsv');
      const fs = new V1FsResource(client);
      const bytes = [...new TextEncoder().encode('<html>ok</html>')];
      const crossRealmBuffer = runInNewContext(
        `new Uint8Array(${JSON.stringify(bytes)}).buffer`
      );
      expect(crossRealmBuffer).not.toBeInstanceOf(ArrayBuffer);
      client._request.mockResolvedValue(crossRealmBuffer);

      const result = await fs.read({ path: '~/index.html' });

      expect(result).toBe('<html>ok</html>');
    });

    it('returns ArrayBuffer as-is for binary data', async () => {
      const client = makeClient('pbsv');
      const fs = new V1FsResource(client);
      const binary = new Uint8Array([0x00, 0xff, 0x80]).buffer;
      client._request.mockResolvedValue(binary);
      const result = await fs.read({ path: '~/image.bin' });
      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(new Uint8Array(result as ArrayBuffer)).toEqual(
        new Uint8Array([0x00, 0xff, 0x80])
      );
    });

    it('passes through non-ArrayBuffer values', async () => {
      const client = makeClient('pbsv');
      const fs = new V1FsResource(client);
      const obj = { some: 'object' };
      client._request.mockResolvedValue(obj);
      const result = await fs.read({ path: '~/data.json' });
      expect(result).toEqual({ some: 'object' });
    });

    it('decodes empty ArrayBuffer to empty string', async () => {
      const client = makeClient('pbsv');
      const fs = new V1FsResource(client);
      client._request.mockResolvedValue(new TextEncoder().encode('').buffer);
      const result = await fs.read({ path: '~/empty.txt' });
      expect(result).toBe('');
    });
  });

  describe('write', () => {
    it('sends POST /api/v1/fs/write with JSON body', async () => {
      const client = makeClient('pbsv');
      const fs = new V1FsResource(client);
      await fs.write({ path: '~/f', data: '{}' });
      expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/fs/write', {
        body: { path: '~/f', data: '{}', mkdir_parents: undefined },
      });
    });

    it('includes mkdir_parents option', async () => {
      const client = makeClient('pbsv');
      const fs = new V1FsResource(client);
      await fs.write({ path: '~/f', data: '{}', mkdir_parents: true });
      expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/fs/write', {
        body: { path: '~/f', data: '{}', mkdir_parents: true },
      });
    });

    it('maps append to the ALFS append write flag', async () => {
      const client = makeClient('pbsv');
      const fs = new V1FsResource(client);
      await fs.write({ path: '~/f', data: 'next', append: true });
      expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/fs/write', {
        body: {
          path: '~/f',
          data: 'next',
          mkdir_parents: undefined,
          flags: 1,
        },
      });
    });

    it('requires auth', async () => {
      const client = makeClient();
      const fs = new V1FsResource(client);
      await expect(fs.write({ path: '~/f', data: '{}' })).rejects.toThrow(
        AlvaError
      );
    });
  });

  describe('rawWrite', () => {
    it('sends POST with rawBody and path as query param', async () => {
      const client = makeClient('pbsv');
      const fsRes = new V1FsResource(client);
      const data = new Uint8Array([1, 2, 3]);
      await fsRes.rawWrite({ path: '~/f', body: data });
      expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/fs/write', {
        query: { path: '~/f', mkdir_parents: undefined },
        rawBody: data,
      });
    });

    it('passes mkdir_parents as query param', async () => {
      const client = makeClient('pbsv');
      const fsRes = new V1FsResource(client);
      await fsRes.rawWrite({
        path: '~/f',
        body: 'raw text',
        mkdir_parents: true,
      });
      expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/fs/write', {
        query: { path: '~/f', mkdir_parents: true },
        rawBody: 'raw text',
      });
    });

    it('maps append to the ALFS append query flag', async () => {
      const client = makeClient('pbsv');
      const fsRes = new V1FsResource(client);
      await fsRes.rawWrite({ path: '~/f', body: 'next', append: true });
      expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/fs/write', {
        query: { path: '~/f', mkdir_parents: undefined, flags: 1 },
        rawBody: 'next',
      });
    });

    it('requires auth', async () => {
      const client = makeClient();
      const fsRes = new V1FsResource(client);
      await expect(
        fsRes.rawWrite({ path: '~/f', body: 'data' })
      ).rejects.toThrow(AlvaError);
    });
  });

  describe('stat', () => {
    it('sends GET /api/v1/fs/stat with path', async () => {
      const client = makeClient('pbsv');
      const fs = new V1FsResource(client);
      await fs.stat({ path: '~/f' });
      expect(client._request).toHaveBeenCalledWith('GET', '/api/v1/fs/stat', {
        query: { path: '~/f' },
      });
    });
  });

  describe('readdir', () => {
    it('sends GET /api/v1/fs/readdir with recursive', async () => {
      const client = makeClient('pbsv');
      const fs = new V1FsResource(client);
      await fs.readdir({ path: '~/', recursive: true });
      expect(client._request).toHaveBeenCalledWith(
        'GET',
        '/api/v1/fs/readdir',
        { query: { path: '~/', recursive: true } }
      );
    });
  });

  describe('mkdir', () => {
    it('sends POST /api/v1/fs/mkdir', async () => {
      const client = makeClient('pbsv');
      const fs = new V1FsResource(client);
      await fs.mkdir({ path: '~/new' });
      expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/fs/mkdir', {
        body: { path: '~/new' },
      });
    });
  });

  describe('remove', () => {
    it('sends DELETE /api/v1/fs/remove with recursive', async () => {
      const client = makeClient('pbsv');
      const fs = new V1FsResource(client);
      await fs.remove({ path: '~/old', recursive: true });
      expect(client._request).toHaveBeenCalledWith(
        'DELETE',
        '/api/v1/fs/remove',
        { query: { path: '~/old', recursive: true } }
      );
    });
  });

  describe('rename', () => {
    it('sends POST /api/v1/fs/rename', async () => {
      const client = makeClient('pbsv');
      const fs = new V1FsResource(client);
      await fs.rename({ old_path: '~/a', new_path: '~/b' });
      expect(client._request).toHaveBeenCalledWith(
        'POST',
        '/api/v1/fs/rename',
        { body: { old_path: '~/a', new_path: '~/b' } }
      );
    });
  });

  describe('copy', () => {
    it('sends POST /api/v1/fs/copy', async () => {
      const client = makeClient('pbsv');
      const fs = new V1FsResource(client);
      await fs.copy({ src_path: '~/a', dst_path: '~/b' });
      expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/fs/copy', {
        body: { src_path: '~/a', dst_path: '~/b' },
      });
    });
  });

  describe('symlink', () => {
    it('sends POST /api/v1/fs/symlink', async () => {
      const client = makeClient('pbsv');
      const fs = new V1FsResource(client);
      await fs.symlink({ target_path: '~/target', link_path: '~/link' });
      expect(client._request).toHaveBeenCalledWith(
        'POST',
        '/api/v1/fs/symlink',
        { body: { target_path: '~/target', link_path: '~/link' } }
      );
    });
  });

  describe('readlink', () => {
    it('sends GET /api/v1/fs/readlink', async () => {
      const client = makeClient('pbsv');
      const fs = new V1FsResource(client);
      await fs.readlink({ path: '~/link' });
      expect(client._request).toHaveBeenCalledWith(
        'GET',
        '/api/v1/fs/readlink',
        { query: { path: '~/link' } }
      );
    });
  });

  describe('chmod', () => {
    it('sends POST /api/v1/fs/chmod', async () => {
      const client = makeClient('pbsv');
      const fs = new V1FsResource(client);
      await fs.chmod({ path: '~/file', mode: 420 });
      expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/fs/chmod', {
        body: { path: '~/file', mode: 420 },
      });
    });
  });

  describe('grant', () => {
    it('sends POST /api/v1/fs/grant', async () => {
      const client = makeClient('pbsv');
      const fs = new V1FsResource(client);
      await fs.grant({
        path: '~/',
        subject: 'special:user:*',
        permission: 'read',
      });
      expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/fs/grant', {
        body: {
          path: '~/',
          subject: 'special:user:*',
          permission: 'read',
        },
      });
    });
  });

  describe('revoke', () => {
    it('sends POST /api/v1/fs/revoke', async () => {
      const client = makeClient('pbsv');
      const fs = new V1FsResource(client);
      await fs.revoke({
        path: '~/',
        subject: 'special:user:*',
        permission: 'read',
      });
      expect(client._request).toHaveBeenCalledWith(
        'POST',
        '/api/v1/fs/revoke',
        {
          body: {
            path: '~/',
            subject: 'special:user:*',
            permission: 'read',
          },
        }
      );
    });
  });
});

describe('FsResource with an API key (/api/v2)', () => {
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  function client(config: Record<string, string> = { apiKey: 'key' }) {
    return new AlvaClient({ ...config, baseUrl: 'https://api.test' });
  }

  /** A fetch fake that keeps the raw request: fs/read and fs/write are not JSON. */
  function rawFetch(answer: () => Response) {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      void url;
      void init;
      return answer();
    });
    vi.stubGlobal('fetch', fetch);
    restore = () => vi.unstubAllGlobals();
    return fetch;
  }

  const INFO = v2('FileInfo', {
    name: 'f.json',
    sizeBytes: 12,
    mode: 420,
    isDirectory: false,
    updatedAt: '2026-11-19T10:00:01Z',
    contentType: 'application/json',
    meta: null,
  });

  it('read returns the raw bytes with their type, sending one Range', async () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x01]);
    const fetch = rawFetch(
      () =>
        new Response(bytes, {
          status: 206,
          headers: {
            'content-type': 'application/octet-stream',
            'content-range': 'bytes 0-3/10',
          },
        })
    );
    const file = await client().fs.read(
      { path: '~/b.bin' },
      { range: 'bytes=0-3' }
    );
    expect(new Uint8Array(file.data)).toEqual(bytes);
    expect(file).toMatchObject({
      contentType: 'application/octet-stream',
      contentRange: 'bytes 0-3/10',
    });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.test/api/v2/fs/read?path=%7E%2Fb.bin');
    expect((init?.headers as Record<string, string>).Range).toBe('bytes=0-3');
  });

  it('read of a whole file has no Content-Range', async () => {
    rawFetch(
      () =>
        new Response('[{"close":100}]', {
          headers: { 'content-type': 'application/json' },
        })
    );
    const file = await client().fs.read({ path: '~/feed/@last/1' });
    expect(new TextDecoder().decode(file.data)).toBe('[{"close":100}]');
    expect(file.contentRange).toBeNull();
  });

  it('read surfaces a range past the end as its problem', async () => {
    rawFetch(() =>
      problem(416, 'INVALID_ARGUMENT', { reason: 'RANGE_NOT_SATISFIABLE' })
    );
    await expect(
      client().fs.read({ path: '~/f' }, { range: 'bytes=99-' })
    ).rejects.toMatchObject({ status: 416, reason: 'RANGE_NOT_SATISFIABLE' });
  });

  it('a PBSV or viewer client is refused before sending (client.v1.fs)', async () => {
    const fetch = rawFetch(() => new Response(''));
    await expect(
      client({ pbsvToken: 'pbsv' }).fs.read({ path: '~/f' })
    ).rejects.toMatchObject({ code: 'CREDENTIAL_REQUIRED' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('write sends the raw bytes with the query options and a key', async () => {
    const fetch = rawFetch(() =>
      Response.json(v2('WriteResult', { bytesWritten: 3 }))
    );
    const bytes = new Uint8Array([0xff, 0x00, 0x7f]);
    expect(
      await client().fs.write(
        { path: '~/b.bin', mode: 'APPEND', mkdirParents: true },
        bytes,
        { idempotencyKey: 'write-1' }
      )
    ).toEqual({ bytesWritten: 3 });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(
      'https://api.test/api/v2/fs/write?path=%7E%2Fb.bin&mode=APPEND&mkdirParents=true'
    );
    expect(init?.body).toBe(bytes);
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/octet-stream',
      'Idempotency-Key': '"write-1"',
    });
  });

  it('write sends a string as text with the given type', async () => {
    const fetch = rawFetch(() =>
      Response.json(v2('WriteResult', { bytesWritten: 5 }))
    );
    await client().fs.write({ path: '~/f.txt' }, 'hello', {
      contentType: 'text/plain; charset=utf-8',
    });
    const [, init] = fetch.mock.calls[0];
    expect(init?.body).toBe('hello');
    expect(init?.headers).toMatchObject({
      'Content-Type': 'text/plain; charset=utf-8',
    });
  });

  it('stat, readdir and readlink return the FileInfo, listing and Symlink', async () => {
    const fake = fakeV2({
      'GET /fs/stat': () => INFO,
      'GET /fs/readdir': () => v2('DirectoryListing', { entries: [INFO] }),
      'GET /fs/readlink': () => v2('Symlink', { targetPath: '/alva/home/a/x' }),
    });
    restore = fake.restore;
    const c = client();
    expect(await c.fs.stat({ path: '~/f.json', noFollow: true })).toEqual(INFO);
    expect(await c.fs.readdir({ path: '~/', recursive: true })).toEqual({
      entries: [INFO],
    });
    expect(await c.fs.readlink({ path: '~/l' })).toEqual({
      targetPath: '/alva/home/a/x',
    });
    expect(fake.calls.map((call) => call.query.toString())).toEqual([
      'path=%7E%2Ff.json&noFollow=true',
      'path=%7E%2F&recursive=true',
      'path=%7E%2Fl',
    ]);
  });

  it('changes POST their request bodies to their own route', async () => {
    const fake = fakeV2(
      Object.fromEntries(
        [
          'mkdir',
          'remove',
          'rename',
          'copy',
          'symlink',
          'chmod',
          'grant',
          'revoke',
        ].map((op) => [`POST /fs/${op}`, () => ({})])
      )
    );
    restore = fake.restore;
    const c = client();
    await c.fs.mkdir({ path: '~/d' });
    await c.fs.remove({ path: '~/d', recursive: true });
    await c.fs.rename({ oldPath: '~/a', newPath: '~/b' });
    await c.fs.copy({ srcPath: '~/a', dstPath: '~/b' });
    await c.fs.symlink({ targetPath: '~/a', linkPath: '~/l' });
    await c.fs.chmod({ path: '~/a', mode: 0o644 });
    const grant = {
      path: '~/a',
      subject: 'special:user:*',
      permission: 'read',
    };
    await c.fs.grant(grant);
    await c.fs.revoke(grant);
    expect(fake.calls.map((call) => [call.path, call.body])).toEqual([
      ['/fs/mkdir', { path: '~/d' }],
      ['/fs/remove', { path: '~/d', recursive: true }],
      ['/fs/rename', { oldPath: '~/a', newPath: '~/b' }],
      ['/fs/copy', { srcPath: '~/a', dstPath: '~/b' }],
      ['/fs/symlink', { targetPath: '~/a', linkPath: '~/l' }],
      ['/fs/chmod', { path: '~/a', mode: 0o644 }],
      ['/fs/grant', grant],
      ['/fs/revoke', grant],
    ]);
  });
});
