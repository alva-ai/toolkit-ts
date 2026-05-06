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
  client._request = vi.fn().mockResolvedValue({
    success: true,
    data: [{ name: 'x', description: '', content: '' }],
    request_id: 'x',
  });
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

  it('endpoint() sends endpoint query param from file arg', async () => {
    const client = makeClient();
    const skills = new SkillsResource(client);
    await skills.endpoint({ name: 'x', file: 'company-list' });
    const call = client._request.mock.calls[0];
    expect(call[2]).toMatchObject({
      baseUrl: 'https://arrays.example',
      noAuth: true,
      query: { endpoint: 'company-list' },
    });
  });

  it('endpoint() URL-encodes name in path', async () => {
    const client = makeClient();
    const skills = new SkillsResource(client);
    await skills.endpoint({ name: 'foo/bar', file: 'p' });
    const call = client._request.mock.calls[0];
    expect(call[1]).toBe('/api/v1/skills/foo%2Fbar');
  });

  it('none of the three methods call _requireAuth', async () => {
    const client = makeClient();
    const skills = new SkillsResource(client);
    client._request.mockResolvedValue({
      success: true,
      data: [{ name: 'x', description: '', content: '' }],
    });
    await skills.list();
    await skills.summary({ name: 'x' });
    await skills.endpoint({ name: 'x', file: 'p' });
    expect(client._requireAuth).not.toHaveBeenCalled();
  });

  it('list() unwraps data into { skills }', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({
      success: true,
      data: [
        { name: 'a', description: 'A' },
        { name: 'b', description: 'B' },
      ],
    });
    const skills = new SkillsResource(client);
    const result = await skills.list();
    expect(result).toEqual({
      skills: [
        { name: 'a', description: 'A' },
        { name: 'b', description: 'B' },
      ],
    });
  });

  it('list() attaches endpoint tier counts for known Arrays skills', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({
      success: true,
      data: [
        {
          name: 'arrays-data-api-polymarket',
          description: 'Prediction markets',
        },
      ],
    });
    const skills = new SkillsResource(client);
    const result = await skills.list();
    expect(result.skills[0]).toEqual(
      expect.objectContaining({
        metadata: {
          endpoint_count: 18,
          endpoint_tier_counts: { alternative: 18 },
        },
        endpoint_tier_counts: { alternative: 18 },
      })
    );
  });

  it('summary() returns the single SkillDoc from data[0]', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({
      success: true,
      data: [{ name: 'x', description: 'D', content: 'C' }],
    });
    const skills = new SkillsResource(client);
    const result = await skills.summary({ name: 'x' });
    expect(result).toEqual({ name: 'x', description: 'D', content: 'C' });
  });

  it('summary() attaches endpoint tier metadata for known Arrays skills', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({
      success: true,
      data: [
        {
          name: 'arrays-data-api-stock-screener',
          description: 'D',
          content: 'C',
        },
      ],
    });
    const skills = new SkillsResource(client);
    const result = await skills.summary({
      name: 'arrays-data-api-stock-screener',
    });
    expect(result.endpoint_metadata).toContainEqual(
      expect.objectContaining({
        file: 'basic-info-screener',
        method: 'GET',
        path: '/api/v1/stocks/screener/basic-info/{sub}',
        tier: 'public',
        required_subscription_tier: 'free',
        pro_required: false,
      })
    );
    expect(result.metadata).toEqual({
      endpoint_count: 6,
      endpoint_tier_counts: { public: 6 },
    });
  });

  it('summary() throws on empty data', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({ success: true, data: [] });
    const skills = new SkillsResource(client);
    await expect(skills.summary({ name: 'x' })).rejects.toThrow(
      /empty skills summary/
    );
  });

  it('endpoint() returns the single SkillDoc from data[0]', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({
      success: true,
      data: [{ name: 'p', description: 'D', content: 'C' }],
    });
    const skills = new SkillsResource(client);
    const result = await skills.endpoint({ name: 'x', file: 'p' });
    expect(result).toEqual({ name: 'p', description: 'D', content: 'C' });
  });

  it('endpoint() attaches tier metadata for known endpoint files', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({
      success: true,
      data: [{ name: 'market-news', description: 'D', content: 'C' }],
    });
    const skills = new SkillsResource(client);
    const result = await skills.endpoint({
      name: 'arrays-data-api-news',
      file: 'market-news',
    });
    expect(result.metadata).toEqual(
      expect.objectContaining({
        file: 'market-news',
        method: 'GET',
        path: '/api/v1/stocks/market-news',
        tier: 'unstructured',
        required_subscription_tier: 'pro',
        access: 'pro_only',
        pro_required: true,
      })
    );
  });

  it('endpoint() throws on empty data', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({ success: true, data: [] });
    const skills = new SkillsResource(client);
    await expect(skills.endpoint({ name: 'x', file: 'p' })).rejects.toThrow(
      /empty skills endpoint/
    );
  });
});
