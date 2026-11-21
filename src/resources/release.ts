import type { AlvaClient } from '../client.js';
import { v2Path, type Schema } from '../platformApi.js';

export interface ReleaseWriteOptions {
  /** The write's Idempotency-Key; omitted, each call gets a new one. */
  idempotencyKey?: string;
}

/** Feed and Playbook publishing on /api/v2. */
export class ReleaseResource {
  constructor(private client: AlvaClient) {}

  /**
   * Publishes a feed (automation) version from a cronjob. A new feed is
   * paused; `skipFirstRun` skips the run that publishing triggers.
   */
  async feed(
    body: Schema<'PublishAutomationBody'>,
    options: ReleaseWriteOptions = {}
  ): Promise<Schema<'AutomationVersion'>> {
    return this.client._v2Request('POST', '/me/automations', {
      body,
      idempotencyKey: options.idempotencyKey,
    });
  }

  /** Creates a draft Playbook, or a new draft of one of the caller's. */
  async playbookDraft(
    body: Schema<'NewDraft'>,
    options: ReleaseWriteOptions = {}
  ): Promise<Schema<'Draft'>> {
    return this.client._v2Request('POST', '/drafts', {
      body,
      idempotencyKey: options.idempotencyKey,
    });
  }

  /**
   * Publishes a release of one of the caller's Playbooks. Publishing bundled
   * private feeds needs `confirmBundledFeedExposure`.
   */
  async playbook(
    playbookId: string,
    body: Schema<'NewRelease'>,
    options: ReleaseWriteOptions = {}
  ): Promise<Schema<'Release'>> {
    return this.client._v2Request(
      'POST',
      v2Path`/playbooks/${playbookId}/publish`,
      { body, idempotencyKey: options.idempotencyKey }
    );
  }
}
