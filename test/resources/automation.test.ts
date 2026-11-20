import { afterEach, describe, it, expect, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { aDelivery, anAutomation, AUTOMATION } from '../automationV2.js';
import { fakeV2 } from '../fakeV2.js';
import { v2Client } from '../helpers/v2Client.js';
import { v2 } from '../v2Schema.js';

let restore: (() => void) | undefined;
afterEach(() => restore?.());

function client() {
  return new AlvaClient({ apiKey: 'key', baseUrl: 'https://api.test' });
}

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

  it('inspect() returns the Automation', async () => {
    const fake = fakeV2({
      [`GET /automations/${AUTOMATION}`]: () => anAutomation(),
    });
    restore = fake.restore;
    expect(await client().automation.inspect(AUTOMATION)).toEqual(
      anAutomation()
    );
  });

  it('update() publishes a version with the PublishVersionBody', async () => {
    const version = v2('AutomationVersion', {
      automationId: AUTOMATION,
      name: 'portfolio-watch',
      major: 2,
      version: '2.0.0',
      cronjobId: 'cronjob_0p420',
    });
    const fake = fakeV2({
      [`POST /automations/${AUTOMATION}/versions`]: () => version,
    });
    restore = fake.restore;
    const body = { version: '2.0.0', description: '', triggerRun: true };
    expect(
      await client().automation.update(AUTOMATION, body, {
        idempotencyKey: 'v2',
      })
    ).toEqual(version);
    expect(fake.calls[0].body).toEqual(body);
    expect(fake.calls[0].headers['Idempotency-Key']).toBe('"v2"');
  });

  it('delivery.get() returns the AutomationDelivery', async () => {
    const fake = fakeV2({
      [`GET /automations/${AUTOMATION}/delivery`]: () => aDelivery(),
    });
    restore = fake.restore;
    expect(await client().automation.delivery.get(AUTOMATION)).toEqual(
      aDelivery()
    );
  });

  it('delivery.update() patches the automation delivery and returns the Automation', async () => {
    const fake = fakeV2({
      [`PATCH /automations/${AUTOMATION}`]: () => anAutomation(),
    });
    restore = fake.restore;
    expect(
      await client().automation.delivery.update(AUTOMATION, {
        channelIds: [],
        email: false,
      })
    ).toEqual(anAutomation());
    expect(fake.calls[0].body).toEqual({
      delivery: { channelIds: [], email: false },
    });
    expect(fake.calls[0].headers['Content-Type']).toBe(
      'application/merge-patch+json'
    );
  });
});
