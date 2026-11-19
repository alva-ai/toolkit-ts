import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { AlvaError } from '../../src/error.js';
import { fakeV2, problem } from '../fakeV2.js';

const FEED = { id: 'automation_0news', cronjobId: 'cronjob_0news' };

let restore = () => {};
afterEach(() => restore());

describe('CompanyNewsResource', () => {
  it('creates one managed feed and returns its Automation and Cronjob IDs', async () => {
    const fake = fakeV2({ 'POST /company-news-feeds': () => FEED });
    restore = fake.restore;
    const client = new AlvaClient({ apiKey: 'test-key' });
    const result = await client.companyNews.create({
      name: 'my-news',
      tickers: ['NVDA', 'AMD'],
      initial_lookback_hours: 48,
      page_size: 30,
    });
    expect(result).toEqual({
      feed_id: 'automation_0news',
      cronjob_id: 'cronjob_0news',
    });
    expect(fake.calls).toHaveLength(1);
    const [call] = fake.calls;
    expect(call.headers['X-Alva-Api-Key']).toBe('test-key');
    expect(call.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(call.body).toEqual({
      name: 'my-news',
      tickers: ['NVDA', 'AMD'],
      initialLookbackHours: 48,
      batchSize: 30,
    });
  });

  it('leaves defaults to the backend and only sends configuration fields', async () => {
    const fake = fakeV2({ 'POST /company-news-feeds': () => FEED });
    restore = fake.restore;
    await new AlvaClient({ apiKey: 'key' }).companyNews.create({
      name: 'my-news',
      tickers: ['NVDA'],
    });
    expect(fake.calls[0].body).toEqual({ name: 'my-news', tickers: ['NVDA'] });
  });

  it('requires authentication and valid configuration before making requests', async () => {
    const unauthenticated = new AlvaClient({});
    await expect(
      unauthenticated.companyNews.create({ name: 'my-news', tickers: ['NVDA'] })
    ).rejects.toBeInstanceOf(AlvaError);
    const client = new AlvaClient({ apiKey: 'key' });
    const request = vi.spyOn(client, '_v2Request');
    for (const params of [
      { name: '', tickers: ['NVDA'] },
      { name: '../news', tickers: ['NVDA'] },
      { name: 'my-news\n', tickers: ['NVDA'] },
      { name: 'news-lane', tickers: ['NVDA'] },
      { name: 'my-news', tickers: [] },
      { name: 'my-news', tickers: ['NVDA', 'NVDA'] },
      { name: 'my-news', tickers: ['nvda'] },
      { name: 'my-news', tickers: ['NVDA\n'] },
      {
        name: 'my-news',
        tickers: Array.from({ length: 1001 }, (_, index) => `T${index}`),
      },
      { name: 'my-news', tickers: ['NVDA'], page_size: -1 },
      { name: 'my-news', tickers: ['NVDA'], page_size: 101 },
      { name: 'my-news', tickers: ['NVDA'], page_size: 1.5 },
      { name: 'my-news', tickers: ['NVDA'], initial_lookback_hours: 169 },
      { name: 'my-news', tickers: ['NVDA'], initial_lookback_hours: NaN },
    ]) {
      await expect(client.companyNews.create(params)).rejects.toBeInstanceOf(
        AlvaError
      );
    }
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    null,
    {},
    { ...FEED, id: 42 },
    { ...FEED, id: '' },
    { ...FEED, id: 'automation_0news\n' },
    { ...FEED, cronjobId: null },
  ])('rejects invalid creation responses: %j', async (response) => {
    const client = new AlvaClient({ apiKey: 'key' });
    vi.spyOn(client, '_v2Request').mockResolvedValue(response);
    await expect(
      client.companyNews.create({ name: 'my-news', tickers: ['NVDA'] })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE', status: 502 });
  });

  it('surfaces the problem of a refused creation and does not retry', async () => {
    const fake = fakeV2({
      'POST /company-news-feeds': () =>
        problem(409, 'CONFLICT', {
          detail: 'existing feed has different configuration',
        }),
    });
    restore = fake.restore;
    await expect(
      new AlvaClient({ apiKey: 'key' }).companyNews.create({
        name: 'my-news',
        tickers: ['NVDA'],
      })
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
      message: 'existing feed has different configuration',
    });
    expect(fake.calls).toHaveLength(1);
  });

  it('reports invalid parameters the server refused', async () => {
    restore = fakeV2({
      'POST /company-news-feeds': () =>
        problem(400, 'INVALID_ARGUMENT', {
          invalidParams: [
            { name: 'tickers', reason: 'send 1 to 1000 tickers' },
          ],
        }),
    }).restore;
    await expect(
      new AlvaClient({ apiKey: 'key' }).companyNews.create({
        name: 'my-news',
        tickers: ['NVDA'],
      })
    ).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
      invalidParams: [{ name: 'tickers', reason: 'send 1 to 1000 tickers' }],
    });
  });
});
