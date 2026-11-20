import { describe, it, expect, vi } from 'vitest';
import { v2Client } from '../helpers/v2Client.js';

const AUTOMATION = {
  id: 'automation_0a',
  name: 'btc-ema',
  description: null,
  status: 'ACTIVE',
  schedule: { cron: '0 */4 * * *', timezone: 'UTC' },
  stats: {
    totalRuns: 7,
    succeededRuns: 6,
    failedRuns: 1,
    lastRunAt: null,
    lastRunStatus: null,
  },
  sendsAlerts: true,
  agentType: null,
  cronjobId: 'cronjob_0c',
  flow: null,
  flowConfigPath: null,
};

const DELIVERY = {
  channelIds: ['channel_0agent', 'channel_0topic'],
  email: { enabled: false, available: true, address: 'a@example.com' },
};

describe('AutomationResource', () => {
  it('list, lifecycle and publish delegate to the feed and release resources', async () => {
    const { client } = v2Client({});
    client.feed.list = vi
      .fn()
      .mockResolvedValue({ items: [], nextPageToken: null });
    client.feed.stop = vi.fn().mockResolvedValue({ id: 'automation_0a' });
    client.feed.resume = vi.fn().mockResolvedValue({ id: 'automation_0a' });
    client.feed.delete = vi.fn().mockResolvedValue({});
    client.release.feed = vi.fn().mockResolvedValue({});
    const id = 'automation_0a';
    await client.automation.list({ pageSize: 20, pageToken: 'abc' });
    await client.automation.stop({ id });
    await client.automation.resume({ id });
    await client.automation.delete({ id });
    const release = {
      name: 'btc-ema',
      version: '1.0.0',
      cronjobId: 'cronjob_0c',
    };
    await client.automation.publish(release, { idempotencyKey: 'k1' });
    expect(client.feed.list).toHaveBeenCalledWith({
      pageSize: 20,
      pageToken: 'abc',
    });
    expect(client.feed.stop).toHaveBeenCalledWith(id);
    expect(client.feed.resume).toHaveBeenCalledWith(id);
    expect(client.feed.delete).toHaveBeenCalledWith(id);
    expect(client.release.feed).toHaveBeenCalledWith(release, {
      idempotencyKey: 'k1',
    });
  });

  it('inspect() rebuilds the v1 detail from GET /api/v2/automations/{id}', async () => {
    const { client, v2 } = v2Client({
      'GET /automations/automation_0a': AUTOMATION,
    });
    expect(await client.automation.inspect({ id: 'automation_0a' })).toEqual({
      id: 'automation_0a',
      feed_id: 'automation_0a',
      cronjob_id: 'cronjob_0c',
      name: 'btc-ema',
      status: 'ACTIVE',
      cron_expression: '0 */4 * * *',
      total_runs: 7,
      flow_id: null,
      flow_config_path: null,
    });
    expect(v2).toHaveBeenCalledWith('GET', '/automations/automation_0a');
  });

  it('inspect() keeps a description, flow and settings path, and omits a missing producer', async () => {
    const { client } = v2Client({
      'GET /automations/automation_0a': {
        ...AUTOMATION,
        description: 'BTC EMA',
        cronjobId: null,
        flow: 'alpha-radar',
        flowConfigPath: '/alva/home/alice/.automations/x.json',
      },
    });
    const detail = await client.automation.inspect({ id: 'automation_0a' });
    expect(detail).toMatchObject({
      description: 'BTC EMA',
      flow_id: 'alpha-radar',
      flow_config_path: '/alva/home/alice/.automations/x.json',
    });
    expect(detail).not.toHaveProperty('cronjob_id');
  });

  it('update() publishes a version and keeps explicit empty fields', async () => {
    const { client, v2 } = v2Client({
      'POST /automations/automation_0a/versions': {
        automationId: 'automation_0a',
        name: 'btc-ema',
        major: 2,
        version: '2.0.1',
        cronjobId: 'cronjob_0c',
      },
    });
    expect(
      await client.automation.update({
        id: 'automation_0a',
        version: '2.0.1',
        cronjob_id: 'cronjob_0c',
        description: '',
        trigger: true,
      })
    ).toEqual({
      id: 'automation_0a',
      feed_id: 'automation_0a',
      name: 'btc-ema',
      feed_major: 2,
      version: '2.0.1',
      cronjob_id: 'cronjob_0c',
    });
    expect(v2.mock.calls[0][2]).toEqual({
      body: {
        version: '2.0.1',
        cronjobId: 'cronjob_0c',
        description: '',
        changelog: undefined,
        agentType: undefined,
        triggerRun: true,
      },
    });
  });

  it('update() refuses a no-op before I/O', async () => {
    const { client, v2 } = v2Client({});
    await expect(
      client.automation.update({ id: 'automation_0a' })
    ).rejects.toThrow('automation update requires at least one field');
    expect(v2).not.toHaveBeenCalled();
  });

  it('delivery.get() rebuilds the v1 alert delivery', async () => {
    const { client } = v2Client({
      'GET /automations/automation_0a/delivery': DELIVERY,
    });
    expect(
      await client.automation.delivery.get({ id: 'automation_0a' })
    ).toEqual({
      isEnabled: true,
      alvaChannels: [{ id: 'channel_0agent' }, { id: 'channel_0topic' }],
      email: { isEnabled: false, isAvailable: true, address: 'a@example.com' },
    });
  });

  it('delivery.get() is disabled with no channel and no email', async () => {
    const { client } = v2Client({
      'GET /automations/automation_0a/delivery': {
        channelIds: [],
        email: { enabled: false, available: false, address: null },
      },
    });
    await expect(
      client.automation.delivery.get({ id: 'automation_0a' })
    ).resolves.toMatchObject({ isEnabled: false, alvaChannels: [] });
  });

  it('delivery.update() patches only the provided field and echoes it', async () => {
    const { client, v2 } = v2Client({
      'PATCH /automations/automation_0a': AUTOMATION,
      'GET /automations/automation_0a/delivery': {
        ...DELIVERY,
        email: { ...DELIVERY.email, enabled: true },
      },
    });
    expect(
      await client.automation.delivery.update({
        id: 'automation_0a',
        emailEnabled: true,
      })
    ).toEqual({
      automation: { id: 'automation_0a' },
      alertDelivery: {
        isEnabled: true,
        email: { isEnabled: true, isAvailable: true, address: 'a@example.com' },
      },
    });
    expect(v2.mock.calls[0]).toEqual([
      'PATCH',
      '/automations/automation_0a',
      { body: { delivery: { channelIds: undefined, email: true } } },
    ]);
  });

  it('delivery.update() resolves the agent alias 0 to the Agent channel', async () => {
    const { client, v2 } = v2Client({
      'GET /me/channels': {
        items: [{ id: 'channel_0agent', kind: 'AGENT' }],
        nextPageToken: null,
      },
      'PATCH /automations/automation_0a': AUTOMATION,
      'GET /automations/automation_0a/delivery': DELIVERY,
    });
    const result = await client.automation.delivery.update({
      id: 'automation_0a',
      alvaChannelIds: ['0', 'channel_0topic', 'channel_0agent'],
    });
    expect(v2.mock.calls.find((c) => c[0] === 'PATCH')?.[2]?.body).toEqual({
      delivery: {
        channelIds: ['channel_0agent', 'channel_0topic'],
        email: undefined,
      },
    });
    expect(result.alertDelivery).toEqual({
      isEnabled: true,
      alvaChannels: [{ id: 'channel_0agent' }, { id: 'channel_0topic' }],
    });
  });

  it('delivery.update() clears channels with an empty list and refuses a no-op', async () => {
    const { client, v2 } = v2Client({
      'PATCH /automations/automation_0a': AUTOMATION,
      'GET /automations/automation_0a/delivery': {
        ...DELIVERY,
        channelIds: [],
      },
    });
    await client.automation.delivery.update({
      id: 'automation_0a',
      alvaChannelIds: [],
    });
    expect(v2.mock.calls[0][2]?.body).toEqual({
      delivery: { channelIds: [], email: undefined },
    });
    v2.mockClear();
    await expect(
      client.automation.delivery.update({ id: 'automation_0a' })
    ).rejects.toThrow('requires alvaChannelIds or emailEnabled');
    expect(v2).not.toHaveBeenCalled();
  });
});
