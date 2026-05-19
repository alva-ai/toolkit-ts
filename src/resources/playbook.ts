import type { AlvaClient } from '../client.js';

export interface PlaybookListItem {
  id: string;
  name: string;
  display_name?: string;
  visibility?: string;
  created_at?: string;
  updated_at?: string;
  cursor?: string;
}

export interface ListPlaybookResponse {
  playbooks: PlaybookListItem[];
  has_next: boolean;
}

export interface DeletePlaybookResult {
  playbook_path: string;
}

export type PlaybookListFilter = 'draft' | 'running' | 'paused';

export class PlaybookResource {
  constructor(private client: AlvaClient) {}

  /**
   * List playbooks owned by the authenticated user. Backed by
   * gateway `GET /api/v1/playbook`, which calls `ListPlaybooksByUID`
   * + `BatchGetPlaybookPreviews` and returns enriched items
   * (name / display_name / visibility / created_at).
   */
  async list(params?: {
    cursor?: string;
    limit?: number;
    filter?: PlaybookListFilter;
  }): Promise<ListPlaybookResponse> {
    this.client._requireAuth();
    const query: Record<string, unknown> = {};
    if (params?.cursor) query.cursor = params.cursor;
    if (params?.limit !== undefined) query.limit = params.limit;
    if (params?.filter) query.filter = params.filter;
    return this.client._request('GET', '/api/v1/playbook', {
      query,
    }) as Promise<ListPlaybookResponse>;
  }

  /**
   * Soft-delete a playbook by name. Sets `deleted_at` on the DB row and
   * removes the dbview mount + public-read ACL on ALFS. The user's free-tier
   * playbook quota is freed as soon as this call returns.
   *
   * Note: `alva fs remove --path ~/playbooks/<name>` only clears the ALFS
   * files — the DB row stays, the quota stays consumed, and the platform
   * still treats the playbook as live. Use this command for a real delete.
   */
  async delete(params: { name: string }): Promise<DeletePlaybookResult> {
    this.client._requireAuth();
    const encoded = encodeURIComponent(params.name);
    return this.client._request(
      'DELETE',
      `/api/v1/playbook/${encoded}`
    ) as Promise<DeletePlaybookResult>;
  }
}
