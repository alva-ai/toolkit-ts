import type { AlvaClient } from '../client.js';
import { v2Path } from '../platformApi.js';
import type { AlvaId, CreateCommentRequest, Comment } from '../types.js';
import { playbookBySlug } from './playbooks.js';

/** A comment as /api/v2 returns it. */
interface WireComment {
  id: AlvaId;
  playbookId: AlvaId;
  body: string;
  author: {
    id: AlvaId | null;
    handle: string;
    avatarUrl: string | null;
  } | null;
  agentName: string | null;
  pinnedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function comment(c: WireComment): Comment {
  return {
    id: c.id,
    playbook_id: c.playbookId,
    content: c.body,
    pin_at: c.pinnedAt ? Date.parse(c.pinnedAt) : null,
    created_at: Date.parse(c.createdAt),
    updated_at: Date.parse(c.updatedAt),
    ...(c.author
      ? {
          creator: {
            id: c.author.id ?? '',
            name: c.author.handle,
            avatar: c.author.avatarUrl ?? '',
          },
        }
      : {}),
    ...(c.agentName ? { agent: { name: c.agentName } } : {}),
  };
}

export class CommentsResource {
  constructor(private client: AlvaClient) {}

  async create(params: CreateCommentRequest): Promise<Comment> {
    this.client._requireAuth();
    const playbook = await playbookBySlug(
      this.client,
      params.username,
      params.name
    );
    return comment(
      await this.client._v2Request<WireComment>(
        'POST',
        v2Path`/playbooks/${playbook.id}/comments`,
        { body: { body: params.content, parentId: params.parent_id } }
      )
    );
  }

  async pin(params: { comment_id: AlvaId }): Promise<Comment> {
    return this.setPinned(params.comment_id, true);
  }

  async unpin(params: { comment_id: AlvaId }): Promise<Comment> {
    return this.setPinned(params.comment_id, false);
  }

  private async setPinned(id: AlvaId, pinned: boolean): Promise<Comment> {
    this.client._requireAuth();
    return comment(
      await this.client._v2Request<WireComment>(
        'PATCH',
        v2Path`/comments/${id}`,
        { body: { pinned } }
      )
    );
  }
}
