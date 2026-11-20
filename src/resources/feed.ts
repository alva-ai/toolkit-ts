import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import { v2Path, type Schema, type V2Query } from '../platformApi.js';

export type FeedListQuery = V2Query<'/me/automations', 'get'>;

/** Feed lifecycle on the /api/v2 automation routes (a feed is an automation). */
export class FeedResource {
  constructor(private client: AlvaClient) {}

  /** One page of the caller's feeds; `status` ACTIVE or PAUSED, both when omitted. */
  async list(
    query: FeedListQuery = {}
  ): Promise<Schema<'AutomationSummaryList'>> {
    return this.client._v2Request('GET', '/me/automations', { query });
  }

  /** Pauses the feed's future scheduled runs; the feed and its data stay. */
  async stop(id: string): Promise<Schema<'Automation'>> {
    return this.client._v2Request('POST', v2Path`/automations/${id}/pause`);
  }

  /** Resumes a paused feed's scheduled runs. */
  async resume(id: string): Promise<Schema<'Automation'>> {
    return this.client._v2Request('POST', v2Path`/automations/${id}/resume`);
  }

  /**
   * Soft-deletes a feed and its active majors; its producer cronjobs are
   * removed best-effort (the scavenger reconciles leftovers).
   */
  async delete(id: string): Promise<Record<string, never>> {
    return this.client._v2Request('DELETE', v2Path`/automations/${id}`);
  }

  /**
   * Publishes (PUBLIC) or unpublishes (PRIVATE) a feed, with its ALFS public
   * read grant in the same transaction. Prefer this over granting the public
   * read subject directly (`alva fs grant`), which leaves the flag behind.
   */
  async setVisibility(
    id: string,
    visibility: Schema<'OutputVisibility'>
  ): Promise<Schema<'AutomationVisibility'>> {
    // Any other value would select unpublish.
    if (visibility !== 'PUBLIC' && visibility !== 'PRIVATE') {
      throw new AlvaError(
        'INVALID_ARGUMENT',
        'visibility must be PUBLIC or PRIVATE',
        400
      );
    }
    return this.client._v2Request(
      'POST',
      visibility === 'PUBLIC'
        ? v2Path`/automations/${id}/publish`
        : v2Path`/automations/${id}/unpublish`
    );
  }
}
