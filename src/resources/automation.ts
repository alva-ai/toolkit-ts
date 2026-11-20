import type { AlvaClient } from '../client.js';
import { v2Path, type Schema } from '../platformApi.js';
import type { FeedListQuery } from './feed.js';
import type { ReleaseWriteOptions } from './release.js';
import type {
  AlvaId,
  AutomationAlertDelivery,
  AutomationAlertDeliveryGetRequest,
  AutomationAlertDeliveryUpdateRequest,
  AutomationAlertDeliveryUpdateResponse,
  AutomationInspectRequest,
  AutomationInspectResponse,
  AutomationUpdateRequest,
  AutomationUpdateResponse,
  FeedDeleteRequest,
  FeedStatusUpdateRequest,
} from '../types.js';

/** An Automation of /api/v2. */
interface WireAutomation {
  id: AlvaId;
  name: string;
  description: string | null;
  status: string;
  schedule: { cron: string; timezone: string };
  stats: { totalRuns: number };
  cronjobId: AlvaId | null;
  flow: string | null;
  flowConfigPath: string | null;
}

/** GET /api/v2/automations/{automationId}/delivery. */
interface WireDelivery {
  channelIds: AlvaId[];
  email: { enabled: boolean; available: boolean; address: string | null };
}

/** The v1 alias of the caller's Agent channel in `alvaChannelIds`. */
const AGENT_CHANNEL_ALIAS = '0';

function alertDelivery(delivery: WireDelivery): AutomationAlertDelivery {
  return {
    isEnabled: delivery.channelIds.length > 0 || delivery.email.enabled,
    alvaChannels: delivery.channelIds.map((id) => ({ id })),
    email: {
      isEnabled: delivery.email.enabled,
      isAvailable: delivery.email.available,
      address: delivery.email.address,
    },
  };
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

  /** Inspect one automation. */
  async inspect(
    params: AutomationInspectRequest
  ): Promise<AutomationInspectResponse> {
    this.client._requireAuth();
    const a = await this.client._v2Request<WireAutomation>(
      'GET',
      v2Path`/automations/${params.id}`
    );
    return {
      id: a.id,
      feed_id: a.id,
      ...(a.cronjobId ? { cronjob_id: a.cronjobId } : {}),
      name: a.name,
      ...(a.description ? { description: a.description } : {}),
      status: a.status,
      ...(a.schedule.cron ? { cron_expression: a.schedule.cron } : {}),
      total_runs: a.stats.totalRuns,
      flow_id: a.flow,
      flow_config_path: a.flowConfigPath,
    };
  }

  /** Partially update one existing automation by publishing a new version. */
  async update(
    params: AutomationUpdateRequest
  ): Promise<AutomationUpdateResponse> {
    this.client._requireAuth();
    if (!hasAutomationUpdate(params)) {
      throw new Error(
        'automation update requires at least one field or trigger=true'
      );
    }
    const version = await this.client._v2Request<{
      automationId: AlvaId;
      name: string;
      major: number;
      version: string;
      cronjobId: AlvaId;
    }>('POST', v2Path`/automations/${params.id}/versions`, {
      body: {
        version: params.version,
        cronjobId: params.cronjob_id,
        description: params.description,
        changelog: params.changelog,
        agentType: params.agent_type,
        triggerRun: params.trigger ?? false,
      },
    });
    return {
      id: version.automationId,
      feed_id: version.automationId,
      name: version.name,
      feed_major: version.major,
      version: version.version,
      cronjob_id: version.cronjobId,
    };
  }

  stop(params: FeedStatusUpdateRequest): Promise<Schema<'Automation'>> {
    return this.client.feed.stop(params.id);
  }

  resume(params: FeedStatusUpdateRequest): Promise<Schema<'Automation'>> {
    return this.client.feed.resume(params.id);
  }

  delete(params: FeedDeleteRequest): Promise<Record<string, never>> {
    return this.client.feed.delete(params.id);
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

  async get(
    params: AutomationAlertDeliveryGetRequest
  ): Promise<AutomationAlertDelivery> {
    this.client._requireAuth();
    return alertDelivery(await this.read(params.id));
  }

  /**
   * Replaces the Alva channel destinations and/or turns email on or off.
   * `alvaChannelIds` takes Channel IDs; "0" names the caller's Agent channel.
   */
  async update(
    params: AutomationAlertDeliveryUpdateRequest
  ): Promise<AutomationAlertDeliveryUpdateResponse> {
    this.client._requireAuth();
    const includeAlvaChannels = params.alvaChannelIds !== undefined;
    const includeEmail = params.emailEnabled !== undefined;
    if (!includeAlvaChannels && !includeEmail) {
      throw new Error(
        'automation delivery update requires alvaChannelIds or emailEnabled'
      );
    }
    const channelIds = includeAlvaChannels
      ? await this.channelIDs(params.alvaChannelIds ?? [])
      : undefined;
    await this.client._v2Request('PATCH', v2Path`/automations/${params.id}`, {
      body: { delivery: { channelIds, email: params.emailEnabled } },
    });
    const delivery = alertDelivery(await this.read(params.id));
    return {
      automation: { id: params.id },
      alertDelivery: {
        isEnabled: delivery.isEnabled,
        ...(includeAlvaChannels ? { alvaChannels: delivery.alvaChannels } : {}),
        ...(includeEmail ? { email: delivery.email } : {}),
      },
    };
  }

  private read(id: AlvaId): Promise<WireDelivery> {
    return this.client._v2Request<WireDelivery>(
      'GET',
      v2Path`/automations/${id}/delivery`
    );
  }

  private async channelIDs(values: readonly string[]): Promise<AlvaId[]> {
    const ids = [...new Set(values)];
    for (const id of ids) {
      if (!id.trim()) throw new Error('Alva channel ids must not be empty');
    }
    if (!ids.includes(AGENT_CHANNEL_ALIAS)) return ids;
    const agent = await this.client.schedules.agentChannelId();
    return [
      ...new Set(ids.map((id) => (id === AGENT_CHANNEL_ALIAS ? agent : id))),
    ];
  }
}

function hasAutomationUpdate(params: AutomationUpdateRequest): boolean {
  return (
    params.version !== undefined ||
    params.cronjob_id !== undefined ||
    params.description !== undefined ||
    params.changelog !== undefined ||
    params.agent_type !== undefined ||
    params.trigger === true
  );
}
