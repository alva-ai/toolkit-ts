import type { AlvaClient } from '../client.js';
import { v2Path, type Schema } from '../platformApi.js';

export class RemixResource {
  constructor(private client: AlvaClient) {}

  /** Replaces the Playbooks `playbookId` was remixed from with `parentIds`. */
  async save(
    playbookId: string,
    parentIds: string[],
    options: { idempotencyKey?: string } = {}
  ): Promise<Schema<'Playbook'>> {
    return this.client._v2Request('PATCH', v2Path`/playbooks/${playbookId}`, {
      body: { remixSourceIds: parentIds },
      idempotencyKey: options.idempotencyKey,
    });
  }
}
