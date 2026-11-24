import { describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { AlvaError } from '../../src/error.js';

const MAX_ID = '9223372036854775807';

function stubbed(...responses: unknown[]) {
  const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
    _request: ReturnType<typeof vi.fn>;
  };
  const request = vi.fn();
  for (const response of responses) {
    if (response instanceof Error) request.mockRejectedValueOnce(response);
    else request.mockResolvedValueOnce(response);
  }
  client._request = request;
  return client;
}

const macroNotable = {
  kinds: ['fundamentals', 'macro'],
  min_importance: 'notable',
};

describe('Thesis Signal preferences', () => {
  it('reads a Thesis setting over REST', async () => {
    const client = stubbed({
      thesis_id: MAX_ID,
      signal_preferences: macroNotable,
    });
    await expect(client.theses.getSignalPreferences(MAX_ID)).resolves.toEqual({
      thesis_id: MAX_ID,
      preferences: macroNotable,
    });
    expect(client._request).toHaveBeenCalledWith(
      'GET',
      `/api/v1/theses/${MAX_ID}/signal-preferences`
    );
  });

  it('reads the last choice without an id', async () => {
    const client = stubbed({
      thesis_id: null,
      signal_preferences: macroNotable,
    });
    await expect(client.theses.getSignalPreferences()).resolves.toEqual({
      thesis_id: null,
      preferences: macroNotable,
    });
    expect(client._request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/theses/signal-preferences'
    );
  });

  it("passes the gateway's refusal through", async () => {
    const client = stubbed(
      new AlvaError('PERMISSION_DENIED', 'only the author', 403)
    );
    await expect(
      client.theses.getSignalPreferences(MAX_ID)
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED', status: 403 });
  });

  it('writes the whole setting deduplicated', async () => {
    const client = stubbed({
      thesis_id: MAX_ID,
      signal_preferences: { kinds: ['macro'], min_importance: 'major' },
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
      'PUT',
      `/api/v1/theses/${MAX_ID}/signal-preferences`,
      {
        body: {
          signal_preferences: { kinds: ['macro'], min_importance: 'major' },
        },
      }
    );
  });

  it('rejects invalid settings before any request and odd responses after', async () => {
    const client = stubbed(
      {
        thesis_id: MAX_ID,
        signal_preferences: { kinds: ['news'], min_importance: 'all' },
      },
      { thesis_id: '1', signal_preferences: macroNotable }
    );
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
    // An unknown kind, then a setting for another Thesis.
    for (let i = 0; i < 2; i++) {
      await expect(
        client.theses.getSignalPreferences(MAX_ID)
      ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  });
});
