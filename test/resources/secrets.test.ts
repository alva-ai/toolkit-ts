import { describe, it, expect, vi } from 'vitest';
import { SecretsResource } from '../../src/resources/secrets.js';
import { AlvaClient } from '../../src/client.js';

function makeClient(): AlvaClient & { _request: ReturnType<typeof vi.fn> } {
  const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
    _request: ReturnType<typeof vi.fn>;
  };
  client._request = vi.fn().mockResolvedValue({});
  return client;
}

describe('SecretsResource', () => {
  it('create sends POST /api/v1/secrets', async () => {
    const client = makeClient();
    const secrets = new SecretsResource(client);
    await secrets.create({ name: 'KEY', value: 'val' });
    expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/secrets', {
      body: { name: 'KEY', value: 'val' },
    });
  });

  it('list sends GET /api/v1/secrets', async () => {
    const client = makeClient();
    const secrets = new SecretsResource(client);
    await secrets.list();
    expect(client._request).toHaveBeenCalledWith('GET', '/api/v1/secrets');
  });

  it('get sends GET /api/v1/secrets/:name', async () => {
    const client = makeClient();
    const secrets = new SecretsResource(client);
    await secrets.get({ name: 'KEY' });
    expect(client._request).toHaveBeenCalledWith('GET', '/api/v1/secrets/KEY');
  });

  it('update sends PUT /api/v1/secrets/:name', async () => {
    const client = makeClient();
    const secrets = new SecretsResource(client);
    await secrets.update({ name: 'KEY', value: 'new-val' });
    expect(client._request).toHaveBeenCalledWith('PUT', '/api/v1/secrets/KEY', {
      body: { value: 'new-val' },
    });
  });

  it('delete sends DELETE /api/v1/secrets/:name', async () => {
    const client = makeClient();
    const secrets = new SecretsResource(client);
    await secrets.delete({ name: 'KEY' });
    expect(client._request).toHaveBeenCalledWith(
      'DELETE',
      '/api/v1/secrets/KEY'
    );
  });
});
