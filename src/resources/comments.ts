import type { AlvaClient } from '../client.js';
import { v2Path, type Schema } from '../platformApi.js';

export interface CommentWriteOptions {
  /** The write's Idempotency-Key; omitted, each call gets a new one. */
  idempotencyKey?: string;
}

/** Playbook comments on /api/v2. */
export class CommentsResource {
  constructor(private client: AlvaClient) {}

  /** Posts a comment, or a reply (`parentId`), on a Playbook. */
  async create(
    playbookId: string,
    body: Schema<'NewComment'>,
    options: CommentWriteOptions = {}
  ): Promise<Schema<'Comment'>> {
    return this.client._v2Request(
      'POST',
      v2Path`/playbooks/${playbookId}/comments`,
      { body, idempotencyKey: options.idempotencyKey }
    );
  }

  /** Pins a comment; the Playbook's owner may. */
  async pin(id: string): Promise<Schema<'Comment'>> {
    return this.setPinned(id, true);
  }

  async unpin(id: string): Promise<Schema<'Comment'>> {
    return this.setPinned(id, false);
  }

  private async setPinned(
    id: string,
    pinned: boolean
  ): Promise<Schema<'Comment'>> {
    return this.client._v2Request('PATCH', v2Path`/comments/${id}`, {
      body: { pinned },
    });
  }
}
