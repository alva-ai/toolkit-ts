import { describe, it, expect, vi } from 'vitest';
import { FsResource } from '../../src/resources/fs.js';
import { AlvaClient } from '../../src/client.js';
import { AlvaError } from '../../src/error.js';
import { runInNewContext } from 'node:vm';
import { encodeBase64 } from '../../src/base64.js';
import { v2Client } from '../helpers/v2Client.js';

// A Playbook-scoped viewer (the browser bundle, the Playbook runtime) keeps
// /api/v1/fs; API-key clients are covered by the /api/v2 suite below.
function makeClient(
  pbsvToken?: string
): AlvaClient & { _request: ReturnType<typeof vi.fn> } {
  const client = new AlvaClient({ pbsvToken }) as AlvaClient & {
    _request: ReturnType<typeof vi.fn>;
  };
  client._request = vi.fn().mockResolvedValue({});
  return client;
}

describe('FsResource with a Playbook-scoped viewer (/api/v1)', () => {
  describe('read', () => {
    it('sends GET /api/v1/fs/read with path', async () => {
      const client = makeClient('pbsv');
      const fs = new FsResource(client);
      await fs.read({ path: '~/data/f.json' });
      expect(client._request).toHaveBeenCalledWith('GET', '/api/v1/fs/read', {
        query: { path: '~/data/f.json', offset: undefined, size: undefined },
      });
    });

    it('passes offset and size params', async () => {
      const client = makeClient('pbsv');
      const fs = new FsResource(client);
      await fs.read({ path: '~/f', offset: 0, size: 100 });
      expect(client._request).toHaveBeenCalledWith('GET', '/api/v1/fs/read', {
        query: { path: '~/f', offset: 0, size: 100 },
      });
    });

    it('works without auth for public reads', async () => {
      const client = makeClient();
      const fs = new FsResource(client);
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
      const fs = new FsResource(client);
      const json = '[{"date":1,"close":100}]';
      client._request.mockResolvedValue(new TextEncoder().encode(json).buffer);
      const result = await fs.read({ path: '~/data.json' });
      expect(result).toEqual([{ date: 1, close: 100 }]);
    });

    it('decodes ArrayBuffer containing plain text', async () => {
      const client = makeClient('pbsv');
      const fs = new FsResource(client);
      const text = 'console.log("hi");';
      client._request.mockResolvedValue(new TextEncoder().encode(text).buffer);
      const result = await fs.read({ path: '~/script.js' });
      expect(result).toBe('console.log("hi");');
    });

    it('decodes text from an ArrayBuffer created in another realm', async () => {
      const client = makeClient('pbsv');
      const fs = new FsResource(client);
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
      const fs = new FsResource(client);
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
      const fs = new FsResource(client);
      const obj = { some: 'object' };
      client._request.mockResolvedValue(obj);
      const result = await fs.read({ path: '~/data.json' });
      expect(result).toEqual({ some: 'object' });
    });

    it('decodes empty ArrayBuffer to empty string', async () => {
      const client = makeClient('pbsv');
      const fs = new FsResource(client);
      client._request.mockResolvedValue(new TextEncoder().encode('').buffer);
      const result = await fs.read({ path: '~/empty.txt' });
      expect(result).toBe('');
    });
  });

  describe('write', () => {
    it('sends POST /api/v1/fs/write with JSON body', async () => {
      const client = makeClient('pbsv');
      const fs = new FsResource(client);
      await fs.write({ path: '~/f', data: '{}' });
      expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/fs/write', {
        body: { path: '~/f', data: '{}', mkdir_parents: undefined },
      });
    });

    it('includes mkdir_parents option', async () => {
      const client = makeClient('pbsv');
      const fs = new FsResource(client);
      await fs.write({ path: '~/f', data: '{}', mkdir_parents: true });
      expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/fs/write', {
        body: { path: '~/f', data: '{}', mkdir_parents: true },
      });
    });

    it('maps append to the ALFS append write flag', async () => {
      const client = makeClient('pbsv');
      const fs = new FsResource(client);
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
      const fs = new FsResource(client);
      await expect(fs.write({ path: '~/f', data: '{}' })).rejects.toThrow(
        AlvaError
      );
    });
  });

  describe('rawWrite', () => {
    it('sends POST with rawBody and path as query param', async () => {
      const client = makeClient('pbsv');
      const fsRes = new FsResource(client);
      const data = new Uint8Array([1, 2, 3]);
      await fsRes.rawWrite({ path: '~/f', body: data });
      expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/fs/write', {
        query: { path: '~/f', mkdir_parents: undefined },
        rawBody: data,
      });
    });

    it('passes mkdir_parents as query param', async () => {
      const client = makeClient('pbsv');
      const fsRes = new FsResource(client);
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
      const fsRes = new FsResource(client);
      await fsRes.rawWrite({ path: '~/f', body: 'next', append: true });
      expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/fs/write', {
        query: { path: '~/f', mkdir_parents: undefined, flags: 1 },
        rawBody: 'next',
      });
    });

    it('requires auth', async () => {
      const client = makeClient();
      const fsRes = new FsResource(client);
      await expect(
        fsRes.rawWrite({ path: '~/f', body: 'data' })
      ).rejects.toThrow(AlvaError);
    });
  });

  describe('stat', () => {
    it('sends GET /api/v1/fs/stat with path', async () => {
      const client = makeClient('pbsv');
      const fs = new FsResource(client);
      await fs.stat({ path: '~/f' });
      expect(client._request).toHaveBeenCalledWith('GET', '/api/v1/fs/stat', {
        query: { path: '~/f' },
      });
    });
  });

  describe('readdir', () => {
    it('sends GET /api/v1/fs/readdir with recursive', async () => {
      const client = makeClient('pbsv');
      const fs = new FsResource(client);
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
      const fs = new FsResource(client);
      await fs.mkdir({ path: '~/new' });
      expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/fs/mkdir', {
        body: { path: '~/new' },
      });
    });
  });

  describe('remove', () => {
    it('sends DELETE /api/v1/fs/remove with recursive', async () => {
      const client = makeClient('pbsv');
      const fs = new FsResource(client);
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
      const fs = new FsResource(client);
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
      const fs = new FsResource(client);
      await fs.copy({ src_path: '~/a', dst_path: '~/b' });
      expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/fs/copy', {
        body: { src_path: '~/a', dst_path: '~/b' },
      });
    });
  });

  describe('symlink', () => {
    it('sends POST /api/v1/fs/symlink', async () => {
      const client = makeClient('pbsv');
      const fs = new FsResource(client);
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
      const fs = new FsResource(client);
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
      const fs = new FsResource(client);
      await fs.chmod({ path: '~/file', mode: 420 });
      expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/fs/chmod', {
        body: { path: '~/file', mode: 420 },
      });
    });
  });

  describe('grant', () => {
    it('sends POST /api/v1/fs/grant', async () => {
      const client = makeClient('pbsv');
      const fs = new FsResource(client);
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
      const fs = new FsResource(client);
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
  const INFO = {
    name: 'f.json',
    sizeBytes: 12,
    mode: 420,
    isDirectory: false,
    updatedAt: '2026-11-19T10:00:01.500Z',
    meta: null,
  };
  const STAT = {
    name: 'f.json',
    size: 12,
    mode: 420,
    mod_time: Date.parse('2026-11-19T10:00:01Z') / 1000,
    is_dir: false,
    meta: null,
  };

  it('read parses UTF-8 JSON content and sends only the set options', async () => {
    const { client, v2 } = v2Client({
      'GET /fs/read': {
        path: '/alva/home/a/f.json',
        content: '[{"close":100}]',
        encoding: 'UTF8',
      },
    });
    expect(await client.fs.read({ path: '~/f.json', size: 100 })).toEqual([
      { close: 100 },
    ]);
    expect(v2).toHaveBeenCalledWith('GET', '/fs/read', {
      query: { path: '~/f.json', offset: undefined, size: 100 },
    });
  });

  it('read returns UTF-8 text that is not JSON unchanged', async () => {
    const { client } = v2Client({
      'GET /fs/read': { path: '/a', content: 'hello', encoding: 'UTF8' },
    });
    expect(await client.fs.read({ path: '/a' })).toBe('hello');
  });

  it('read returns BASE64 content as the decoded bytes', async () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x01]);
    const { client } = v2Client({
      'GET /fs/read': {
        path: '/a',
        content: encodeBase64(bytes),
        encoding: 'BASE64',
      },
    });
    const result = await client.fs.read({ path: '/a' });
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(result as ArrayBuffer)).toEqual(bytes);
  });

  it('a client without credentials keeps the public v1 read', async () => {
    const { client, v2, legacy } = v2Client({}, {});
    legacy.mockResolvedValue({ ok: true } as never);
    await client.fs.read({ path: '/alva/home/alice/data.json' });
    expect(legacy).toHaveBeenCalledWith(
      'GET',
      '/api/v1/fs/read',
      expect.anything()
    );
    expect(v2).not.toHaveBeenCalled();
  });

  it('write sends UTF8 content with explicit flags', async () => {
    const { client, v2 } = v2Client({ 'POST /fs/write': { bytesWritten: 5 } });
    expect(
      await client.fs.write({ path: '~/f', data: 'hello', append: true })
    ).toEqual({ bytes_written: 5 });
    expect(v2).toHaveBeenCalledWith('POST', '/fs/write', {
      body: {
        path: '~/f',
        content: 'hello',
        encoding: 'UTF8',
        mkdirParents: false,
        append: true,
      },
    });
  });

  it('rawWrite sends the body bytes as BASE64', async () => {
    const { client, v2 } = v2Client({ 'POST /fs/write': { bytesWritten: 3 } });
    await client.fs.rawWrite({
      path: '~/b.bin',
      body: new Uint8Array([0xff, 0x00, 0x7f]),
      mkdir_parents: true,
    });
    expect(v2.mock.calls[0][2]).toEqual({
      body: {
        path: '~/b.bin',
        content: '/wB/',
        encoding: 'BASE64',
        mkdirParents: true,
        append: false,
      },
    });
  });

  it('stat rebuilds the v1 file info, mod_time in Unix seconds', async () => {
    const { client } = v2Client({ 'GET /fs/stat': INFO });
    expect(await client.fs.stat({ path: '~/f.json' })).toEqual(STAT);
  });

  it('stat reports an unknown modification time as 0', async () => {
    const { client } = v2Client({
      'GET /fs/stat': {
        ...INFO,
        updatedAt: null,
        meta: { name: 'm', type: 'feed', content: { k: 'v' } },
      },
    });
    expect(await client.fs.stat({ path: '~/f.json' })).toMatchObject({
      mod_time: 0,
      meta: { name: 'm', type: 'feed', content: { k: 'v' } },
    });
  });

  it('readdir maps every entry like stat', async () => {
    const { client, v2 } = v2Client({ 'GET /fs/readdir': { entries: [INFO] } });
    expect(await client.fs.readdir({ path: '~/', recursive: true })).toEqual({
      entries: [STAT],
    });
    expect(v2).toHaveBeenCalledWith('GET', '/fs/readdir', {
      query: { path: '~/', recursive: true },
    });
  });

  it('readlink returns target_path', async () => {
    const { client } = v2Client({
      'GET /fs/readlink': { targetPath: '/alva/home/a/x' },
    });
    expect(await client.fs.readlink({ path: '~/l' })).toEqual({
      target_path: '/alva/home/a/x',
    });
  });

  it('changes POST camelCase bodies; remove is a POST with recursive', async () => {
    const { client, v2 } = v2Client({
      'POST /fs/mkdir': {},
      'POST /fs/remove': {},
      'POST /fs/rename': {},
      'POST /fs/copy': {},
      'POST /fs/symlink': {},
      'POST /fs/chmod': {},
      'POST /fs/grant': {},
      'POST /fs/revoke': {},
    });
    await client.fs.mkdir({ path: '~/d' });
    await client.fs.remove({ path: '~/d' });
    await client.fs.rename({ old_path: '~/a', new_path: '~/b' });
    await client.fs.copy({ src_path: '~/a', dst_path: '~/b' });
    await client.fs.symlink({ target_path: '~/a', link_path: '~/l' });
    await client.fs.chmod({ path: '~/a', mode: 0o644 });
    const grant = { path: '~/a', subject: 'public', permission: 'read' };
    await client.fs.grant(grant);
    await client.fs.revoke(grant);
    expect(v2.mock.calls.map(([, path, o]) => [path, o?.body])).toEqual([
      ['/fs/mkdir', { path: '~/d' }],
      ['/fs/remove', { path: '~/d', recursive: false }],
      ['/fs/rename', { oldPath: '~/a', newPath: '~/b' }],
      ['/fs/copy', { srcPath: '~/a', dstPath: '~/b' }],
      ['/fs/symlink', { targetPath: '~/a', linkPath: '~/l' }],
      ['/fs/chmod', { path: '~/a', mode: 0o644 }],
      ['/fs/grant', grant],
      ['/fs/revoke', grant],
    ]);
  });
});
