import type { AlvaClient } from '../client.js';
import type { Secret } from '../types.js';

/** A secret's value, which /api/v2 never returns: /api/v1 with its 0.x shape. */
export class V1SecretsResource {
  constructor(private client: AlvaClient) {}

  async get(params: { name: string }): Promise<Secret> {
    this.client._requireAuth();
    return this.client._request(
      'GET',
      `/api/v1/secrets/${encodeURIComponent(params.name)}`
    ) as Promise<Secret>;
  }
}
