import type { AlvaClient } from '../client.js';
import type { CreateCommentRequest, Comment } from '../types.js';

export class CommentsResource {
  constructor(private client: AlvaClient) {}

  async create(params: CreateCommentRequest): Promise<Comment> {
    this.client._requireAuth();
    return this.client._request('POST', '/api/v1/playbook/comment', {
      body: {
        username: params.username,
        name: params.name,
        content: params.content,
        parent_id: params.parent_id,
      },
    }) as Promise<Comment>;
  }

  async pin(params: { comment_id: number }): Promise<Comment> {
    this.client._requireAuth();
    return this.client._request('POST', '/api/v1/playbook/comment/pin', {
      body: { comment_id: params.comment_id },
    }) as Promise<Comment>;
  }

  async unpin(params: { comment_id: number }): Promise<Comment> {
    this.client._requireAuth();
    return this.client._request('POST', '/api/v1/playbook/comment/unpin', {
      body: { comment_id: params.comment_id },
    }) as Promise<Comment>;
  }
}
