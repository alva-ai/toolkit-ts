import { describe, it, expect, vi } from 'vitest';
import { TemplatesResource } from '../../src/resources/templates.js';
import { AlvaClient } from '../../src/client.js';

function makeClient(): AlvaClient & {
  _request: ReturnType<typeof vi.fn>;
} {
  const client = new AlvaClient({ apiKey: 'test-key' }) as AlvaClient & {
    _request: ReturnType<typeof vi.fn>;
  };
  client._request = vi.fn();
  return client;
}

const summary = {
  username: 'alva',
  name: 'ai-digest',
  description: 'Push-first digest',
  categories: ['push', 'research'],
  creator_uid: 0,
  updated_at: '2026-05-01T00:00:00Z',
};

describe('TemplatesResource.list', () => {
  it('GET /api/v1/templates with empty query when no filters', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({ success: true, data: [summary] });
    const r = new TemplatesResource(client);
    await r.list();
    expect(client._request).toHaveBeenCalledWith('GET', '/api/v1/templates', {
      query: {},
    });
  });

  it('forwards --category and --username to the query', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({ success: true, data: [] });
    const r = new TemplatesResource(client);
    await r.list({ category: 'research', username: 'alva' });
    const call = client._request.mock.calls[0];
    expect(call[2]).toEqual({
      query: { category: 'research', username: 'alva' },
    });
  });

  it('omits empty filter strings from the query', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({ success: true, data: [] });
    const r = new TemplatesResource(client);
    await r.list({ category: '', username: 'alva' });
    expect(client._request.mock.calls[0][2]).toEqual({
      query: { username: 'alva' },
    });
  });

  it('unwraps data into { templates }', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({
      success: true,
      data: [summary, { ...summary, name: 'screener' }],
    });
    const r = new TemplatesResource(client);
    const out = await r.list();
    expect(out.templates).toHaveLength(2);
    expect(out.templates[0].name).toBe('ai-digest');
  });

  it('returns empty array when data is missing', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({ success: true });
    const r = new TemplatesResource(client);
    const out = await r.list();
    expect(out.templates).toEqual([]);
  });
});

describe('TemplatesResource.categories', () => {
  it('GET /api/v1/templates/categories', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({
      success: true,
      data: [{ name: 'push' }, { name: 'research' }],
    });
    const r = new TemplatesResource(client);
    const out = await r.categories();
    expect(client._request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/templates/categories'
    );
    expect(out.categories.map((c) => c.name)).toEqual(['push', 'research']);
  });

  it('returns empty array when data is missing', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({ success: true });
    const r = new TemplatesResource(client);
    const out = await r.categories();
    expect(out.categories).toEqual([]);
  });
});

describe('TemplatesResource.get', () => {
  it('GET /api/v1/templates/:username/:name', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({
      success: true,
      data: [
        {
          ...summary,
          files: [{ path: 'template.md', size_bytes: 5 }],
        },
      ],
    });
    const r = new TemplatesResource(client);
    const out = await r.get({ username: 'alva', name: 'ai-digest' });
    expect(client._request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/templates/alva/ai-digest'
    );
    expect(out.files[0].path).toBe('template.md');
    expect(out.files[0].size_bytes).toBe(5);
  });

  it('URL-encodes special characters in path', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({
      success: true,
      data: [{ ...summary, files: [] }],
    });
    const r = new TemplatesResource(client);
    await r.get({ username: 'a/b', name: 'c d' });
    expect(client._request.mock.calls[0][1]).toBe(
      '/api/v1/templates/a%2Fb/c%20d'
    );
  });

  it('throws on empty data', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({ success: true, data: [] });
    const r = new TemplatesResource(client);
    await expect(
      r.get({ username: 'alva', name: 'missing' })
    ).rejects.toThrow(/empty templates get response/);
  });
});

describe('TemplatesResource.files', () => {
  it('GET /api/v1/templates/:username/:name/files', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({
      success: true,
      data: [
        {
          username: 'alva',
          name: 'ai-digest',
          creator_uid: 0,
          updated_at: '2026-05-01T00:00:00Z',
          files: [{ path: 'template.md', content: 'hello' }],
        },
      ],
    });
    const r = new TemplatesResource(client);
    const out = await r.files({ username: 'alva', name: 'ai-digest' });
    expect(client._request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/templates/alva/ai-digest/files'
    );
    expect(out.files[0].content).toBe('hello');
  });

  it('throws on empty data', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({ success: true, data: [] });
    const r = new TemplatesResource(client);
    await expect(
      r.files({ username: 'alva', name: 'missing' })
    ).rejects.toThrow(/empty templates files response/);
  });
});

describe('TemplatesResource — auth', () => {
  it('does not call _requireAuth (read endpoints are public)', async () => {
    const client = makeClient() as AlvaClient & {
      _request: ReturnType<typeof vi.fn>;
      _requireAuth: ReturnType<typeof vi.fn>;
    };
    client._requireAuth = vi.fn();
    client._request.mockResolvedValue({
      success: true,
      data: [{ ...summary, files: [] }],
    });
    const r = new TemplatesResource(client);
    await r.list();
    await r.categories();
    await r.get({ username: 'alva', name: 'ai-digest' });
    await r.files({ username: 'alva', name: 'ai-digest' });
    expect(client._requireAuth).not.toHaveBeenCalled();
  });
});
