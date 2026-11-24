import { describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';

const MAX_ID = '9223372036854775807';

function stubbed(...responses: unknown[]) {
  const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
    _request: ReturnType<typeof vi.fn>;
  };
  const request = vi.fn();
  for (const response of responses) request.mockResolvedValueOnce(response);
  client._request = request;
  return client;
}

const macroNotable = {
  kinds: ['FUNDAMENTALS', 'MACRO'],
  minImportance: 'NOTABLE',
};

describe('Thesis Signal preferences', () => {
  it('reads a Thesis setting through its Playbook node, lowercased', async () => {
    const client = stubbed({
      data: { node: { signalPreferences: macroNotable } },
    });
    await expect(client.theses.getSignalPreferences(MAX_ID)).resolves.toEqual({
      thesis_id: MAX_ID,
      preferences: {
        kinds: ['fundamentals', 'macro'],
        min_importance: 'notable',
      },
    });
    expect(client._request).toHaveBeenCalledWith(
      'POST',
      '/query',
      expect.objectContaining({
        body: expect.objectContaining({
          variables: { id: `Playbook:${MAX_ID}` },
        }),
      })
    );
  });

  it('reads the last choice without an id', async () => {
    const client = stubbed({
      data: {
        viewer: { account: { lastThesisSignalPreferences: macroNotable } },
      },
    });
    await expect(client.theses.getSignalPreferences()).resolves.toEqual({
      thesis_id: null,
      preferences: {
        kinds: ['fundamentals', 'macro'],
        min_importance: 'notable',
      },
    });
  });

  it('refuses a Thesis the caller does not author', async () => {
    const client = stubbed({ data: { node: { signalPreferences: null } } });
    await expect(
      client.theses.getSignalPreferences(MAX_ID)
    ).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      status: 403,
    });
  });

  it('writes the whole setting uppercased and deduplicated', async () => {
    const client = stubbed({
      data: {
        setThesisSignalPreferences: {
          preferences: { kinds: ['MACRO'], minImportance: 'MAJOR' },
        },
      },
    });
    await expect(
      client.theses.setSignalPreferences(MAX_ID, {
        kinds: ['macro', 'macro'],
        min_importance: 'major',
      })
    ).resolves.toEqual({
      thesis_id: MAX_ID,
      preferences: { kinds: ['macro'], min_importance: 'major' },
    });
    expect(client._request).toHaveBeenCalledWith(
      'POST',
      '/query',
      expect.objectContaining({
        body: expect.objectContaining({
          variables: {
            input: {
              thesisId: MAX_ID,
              preferences: { kinds: ['MACRO'], minImportance: 'MAJOR' },
            },
          },
        }),
      })
    );
  });

  it('rejects invalid settings before any request and unknown values in a response', async () => {
    const client = stubbed({
      data: {
        node: { signalPreferences: { kinds: ['NEWS'], minImportance: 'ALL' } },
      },
    });
    for (const bad of [
      { kinds: [], min_importance: 'all' },
      { kinds: ['news'], min_importance: 'all' },
      { kinds: ['macro'], min_importance: 'minor' },
    ]) {
      await expect(
        client.theses.setSignalPreferences(MAX_ID, bad as never)
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    }
    await expect(
      client.theses.create({
        request_id: '123e4567-e89b-72d3-c456-426614174000',
        body: 'b',
        signal_preferences: { kinds: [], min_importance: 'all' },
      })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(client._request).not.toHaveBeenCalled();
    await expect(
      client.theses.getSignalPreferences(MAX_ID)
    ).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});
