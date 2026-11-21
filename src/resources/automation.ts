import type { AlvaClient } from '../client.js';
import { v2Path, type Schema } from '../platformApi.js';
import type { FeedListQuery } from './feed.js';
import type { ReleaseWriteOptions } from './release.js';

export interface AutomationWriteOptions {
  /** Idempotency-Key of the write; a new UUID when omitted. */
  idempotencyKey?: string;
}

/**
 * Product-facing automation API. inspect, update and delivery call
 * /api/v2/automations; list, stop, resume, delete and publish delegate to the
 * feed and release resources.
 */
export class AutomationResource {
  readonly delivery: AutomationAlertDeliveryResource;

  constructor(private client: AlvaClient) {
    this.delivery = new AutomationAlertDeliveryResource(client);
  }

  list(query: FeedListQuery = {}): Promise<Schema<'AutomationSummaryList'>> {
    return this.client.feed.list(query);
  }

  /** One automation: its schedule, run stats, producer cronjob and flow. */
  async inspect(automationId: string): Promise<Schema<'Automation'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', v2Path`/automations/${automationId}`);
  }

  /**
   * Publishes a new version of an existing automation: only the members
   * given change; `triggerRun` runs it once after publishing.
   */
  async update(
    automationId: string,
    body: Schema<'PublishVersionBody'>,
    options: AutomationWriteOptions = {}
  ): Promise<Schema<'AutomationVersion'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'POST',
      v2Path`/automations/${automationId}/versions`,
      { body, idempotencyKey: options.idempotencyKey }
    );
  }

  stop(automationId: string): Promise<Schema<'Automation'>> {
    return this.client.feed.stop(automationId);
  }

  resume(automationId: string): Promise<Schema<'Automation'>> {
    return this.client.feed.resume(automationId);
  }

  delete(automationId: string): Promise<Record<string, never>> {
    return this.client.feed.delete(automationId);
  }

  publish(
    body: Schema<'PublishAutomationBody'>,
    options: ReleaseWriteOptions = {}
  ): Promise<Schema<'AutomationVersion'>> {
    return this.client.release.feed(body, options);
  }
}

export class AutomationAlertDeliveryResource {
  constructor(private client: AlvaClient) {}

  /** Where the automation's alerts go: Alva channels and email. */
  async get(automationId: string): Promise<Schema<'AutomationDelivery'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'GET',
      v2Path`/automations/${automationId}/delivery`
    );
  }

  /**
   * Changes the destinations: `channelIds` replaces the Alva channels,
   * `addChannelIds`/`removeChannelIds` edit them, `email` turns email on or
   * off. Returns the Automation.
   */
  async update(
    automationId: string,
    patch: Schema<'DeliveryPatch'>,
    options: AutomationWriteOptions = {}
  ): Promise<Schema<'Automation'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'PATCH',
      v2Path`/automations/${automationId}`,
      { body: { delivery: patch }, idempotencyKey: options.idempotencyKey }
    );
  }
}
