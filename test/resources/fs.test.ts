import { describe, it, expect, vi } from 'vitest';
import { FsResource } from '../../src/resources/fs.js';
import { AlvaClient } from '../../src/client.js';
import { AlvaError } from '../../src/error.js';

function makeClient(
  apiKey?: string
): AlvaClient & { _request: ReturnType<typeof vi.fn> } {
  const client = new AlvaClient({ apiKey }) as AlvaClient & {
    _request: ReturnType<typeof vi.fn>;
  };
  client._request = vi.fn().mockResolvedValue({});
  return client;
}

describe('FsResource', () => {
  describe('read', () => {
    it('sends GET /api/v1/fs/read with path', async () => {
      const client = makeClient('key');
      const fs = new FsResource(client);
      await fs.read({ path: '~/data/f.json' });
      expect(client._request).toHaveBeenCalledWith('GET', '/api/v1/fs/read', {
        query: { path: '~/data/f.json', offset: undefined, size: undefined },
      });
    });

    it('passes offset and size params', async () => {
      const client = makeClient('key');
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
      const client = makeClient('key');
      const fs = new FsResource(client);
      const json = '[{"date":1,"close":100}]';
      client._request.mockResolvedValue(new TextEncoder().encode(json).buffer);
      const result = await fs.read({ path: '~/data.json' });
      expect(result).toEqual([{ date: 1, close: 100 }]);
    });

    it('decodes ArrayBuffer containing plain text', async () => {
      const client = makeClient('key');
      const fs = new FsResource(client);
      const text = 'console.log("hi");';
      client._request.mockResolvedValue(new TextEncoder().encode(text).buffer);
      const result = await fs.read({ path: '~/script.js' });
      expect(result).toBe('console.log("hi");');
    });

    it('returns ArrayBuffer as-is for binary data', async () => {
      const client = makeClient('key');
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
      const client = makeClient('key');
      const fs = new FsResource(client);
      const obj = { some: 'object' };
      client._request.mockResolvedValue(obj);
      const result = await fs.read({ path: '~/data.json' });
      expect(result).toEqual({ some: 'object' });
    });

    it('decodes empty ArrayBuffer to empty string', async () => {
      const client = makeClient('key');
      const fs = new FsResource(client);
      client._request.mockResolvedValue(new TextEncoder().encode('').buffer);
      const result = await fs.read({ path: '~/empty.txt' });
      expect(result).toBe('');
    });
  });

  describe('write', () => {
    it('sends POST /api/v1/fs/write with JSON body', async () => {
      const client = makeClient('key');
      const fs = new FsResource(client);
      await fs.write({ path: '~/f', data: '{}' });
      expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/fs/write', {
        body: { path: '~/f', data: '{}', mkdir_parents: undefined },
      });
    });

    it('includes mkdir_parents option', async () => {
      const client = makeClient('key');
      const fs = new FsResource(client);
      await fs.write({ path: '~/f', data: '{}', mkdir_parents: true });
      expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/fs/write', {
        body: { path: '~/f', data: '{}', mkdir_parents: true },
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
      const client = makeClient('key');
      const fsRes = new FsResource(client);
      const data = new Uint8Array([1, 2, 3]);
      await fsRes.rawWrite({ path: '~/f', body: data });
      expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/fs/write', {
        query: { path: '~/f', mkdir_parents: undefined },
        rawBody: data,
      });
    });

    it('passes mkdir_parents as query param', async () => {
      const client = makeClient('key');
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
      const client = makeClient('key');
      const fs = new FsResource(client);
      await fs.stat({ path: '~/f' });
      expect(client._request).toHaveBeenCalledWith('GET', '/api/v1/fs/stat', {
        query: { path: '~/f' },
      });
    });
  });

  describe('readdir', () => {
    it('sends GET /api/v1/fs/readdir with recursive', async () => {
      const client = makeClient('key');
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
      const client = makeClient('key');
      const fs = new FsResource(client);
      await fs.mkdir({ path: '~/new' });
      expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/fs/mkdir', {
        body: { path: '~/new' },
      });
    });
  });

  describe('remove', () => {
    it('sends DELETE /api/v1/fs/remove with recursive', async () => {
      const client = makeClient('key');
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
      const client = makeClient('key');
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
      const client = makeClient('key');
      const fs = new FsResource(client);
      await fs.copy({ src_path: '~/a', dst_path: '~/b' });
      expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/fs/copy', {
        body: { src_path: '~/a', dst_path: '~/b' },
      });
    });
  });

  describe('symlink', () => {
    it('sends POST /api/v1/fs/symlink', async () => {
      const client = makeClient('key');
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
      const client = makeClient('key');
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
      const client = makeClient('key');
      const fs = new FsResource(client);
      await fs.chmod({ path: '~/file', mode: 420 });
      expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/fs/chmod', {
        body: { path: '~/file', mode: 420 },
      });
    });
  });

  describe('grant', () => {
    it('sends POST /api/v1/fs/grant', async () => {
      const client = makeClient('key');
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
      const client = makeClient('key');
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
