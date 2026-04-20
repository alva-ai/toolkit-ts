import { describe, it, expect, vi } from 'vitest';
import { SkillsResource } from '../../src/resources/skills.js';
import { AlvaClient } from '../../src/client.js';

function makeClient(): AlvaClient & {
  _request: ReturnType<typeof vi.fn>;
  _requireAuth: ReturnType<typeof vi.fn>;
} {
  const client = new AlvaClient({
    arraysBaseUrl: 'https://arrays.example',
  }) as AlvaClient & {
    _request: ReturnType<typeof vi.fn>;
    _requireAuth: ReturnType<typeof vi.fn>;
  };
  client._request = vi.fn().mockResolvedValue(undefined);
  client._requireAuth = vi.fn();
  return client;
}

describe('SkillsResource', () => {
  it('list() sends GET /api/v1/skills with noAuth and arrays baseUrl', async () => {
    const client = makeClient();
    const skills = new SkillsResource(client);
    await skills.list();
    expect(client._request).toHaveBeenCalledWith('GET', '/api/v1/skills', {
      baseUrl: 'https://arrays.example',
      noAuth: true,
    });
  });

  it('summary() URL-encodes name in path', async () => {
    const client = makeClient();
    const skills = new SkillsResource(client);
    await skills.summary({ name: 'foo/bar' });
    const call = client._request.mock.calls[0];
    expect(call[0]).toBe('GET');
    expect(call[1]).toBe('/api/v1/skills/foo%2Fbar');
  });

  it('summary() uses arrays baseUrl and noAuth', async () => {
    const client = makeClient();
    const skills = new SkillsResource(client);
    await skills.summary({ name: 'anything' });
    const call = client._request.mock.calls[0];
    expect(call[2]).toMatchObject({
      baseUrl: 'https://arrays.example',
      noAuth: true,
    });
  });

  it('endpoint() sends endpoint query param', async () => {
    const client = makeClient();
    const skills = new SkillsResource(client);
    await skills.endpoint({ name: 'x', path: 'company/list' });
    const call = client._request.mock.calls[0];
    expect(call[2]).toMatchObject({
      baseUrl: 'https://arrays.example',
      noAuth: true,
      query: { endpoint: 'company/list' },
    });
  });

  it('endpoint() URL-encodes name in path', async () => {
    const client = makeClient();
    const skills = new SkillsResource(client);
    await skills.endpoint({ name: 'foo/bar', path: 'p' });
    const call = client._request.mock.calls[0];
    expect(call[1]).toBe('/api/v1/skills/foo%2Fbar');
  });

  it('none of the three methods call _requireAuth', async () => {
    const client = makeClient();
    const skills = new SkillsResource(client);
    await skills.list();
    await skills.summary({ name: 'x' });
    await skills.endpoint({ name: 'x', path: 'p' });
    expect(client._requireAuth).not.toHaveBeenCalled();
  });
});
