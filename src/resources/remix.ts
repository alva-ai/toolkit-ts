import type { AlvaClient } from '../client.js';
import type { RemixRequest } from '../types.js';

export class RemixResource {
  constructor(private client: AlvaClient) {}

  async save(params: RemixRequest): Promise<void> {
    this.client._requireAuth();
    await this.client._request('POST', '/api/v1/remix', {
      body: {
        child: params.child,
        parents: params.parents,
      },
    });
  }
}
