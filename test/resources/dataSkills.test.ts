import { describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { DataSkillsResource } from '../../src/resources/dataSkills.js';

function makeClient(): AlvaClient & { _request: ReturnType<typeof vi.fn> } {
  const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
    _request: ReturnType<typeof vi.fn>;
  };
  client._request = vi.fn();
  return client;
}

describe('DataSkillsResource', () => {
  it('adds endpoint counts without local tier enrichment', async () => {
    const client = makeClient();
    const skills = [
      {
        name: 'arrays-data-api-equity-estimates-and-targets',
        description: 'Equity estimates and targets',
      },
    ];
    client._request.mockResolvedValue({ success: true, data: skills });

    const result = await new DataSkillsResource(client).list();

    expect(result).toEqual({
      skills: [
        {
          ...skills[0],
          metadata: { endpoint_count: 4 },
        },
      ],
    });
  });

  it('adds endpoint inventory to a summary without tier fields', async () => {
    const client = makeClient();
    const doc = {
      name: 'arrays-data-api-equity-estimates-and-targets',
      description: 'Equity estimates and targets',
      content: 'summary docs',
    };
    client._request.mockResolvedValue({ success: true, data: [doc] });

    const result = await new DataSkillsResource(client).summary({
      name: doc.name,
    });

    expect(result).toMatchObject({
      ...doc,
      metadata: { endpoint_count: 4 },
    });
    expect(result.endpoint_metadata).toHaveLength(4);
    expect(result.endpoint_metadata?.[3]).toEqual({
      skill: doc.name,
      file: 'estimates-guidance',
      method: 'GET',
      path: '/api/v1/stocks/estimates-guidance',
    });
  });

  it('adds endpoint location without local access metadata', async () => {
    const client = makeClient();
    const doc = {
      name: 'estimates-guidance',
      description: 'Estimate guidance documentation',
      content: 'endpoint docs',
    };
    client._request.mockResolvedValue({ success: true, data: [doc] });

    const result = await new DataSkillsResource(client).endpoint({
      name: 'arrays-data-api-equity-estimates-and-targets',
      file: 'estimates-guidance',
    });

    expect(result).toEqual({
      ...doc,
      metadata: {
        skill: 'arrays-data-api-equity-estimates-and-targets',
        file: 'estimates-guidance',
        method: 'GET',
        path: '/api/v1/stocks/estimates-guidance',
      },
    });
  });
});
