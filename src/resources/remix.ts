import type { AlvaClient } from '../client.js';
import { v2Path } from '../platformApi.js';
import type { RemixRequest } from '../types.js';
import { playbookBySlug } from './playbooks.js';

export class RemixResource {
  constructor(private client: AlvaClient) {}

  /** Replaces the playbooks `child` was remixed from with `parents`. */
  async save(params: RemixRequest): Promise<void> {
    this.client._requireAuth();
    const [child, ...parents] = await Promise.all(
      [params.child, ...params.parents].map((p) =>
        playbookBySlug(this.client, p.username, p.name)
      )
    );
    await this.client._v2Request('PATCH', v2Path`/playbooks/${child.id}`, {
      body: { remixSourceIds: parents.map((p) => p.id) },
    });
  }
}
