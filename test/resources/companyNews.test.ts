import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { AlvaError } from '../../src/error.js';

const RESULT = {
  feed_id: '9223372036854775807',
  cronjob_id: '9223372036854775806',
};

describe('CompanyNewsResource', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('creates one managed feed using the API key without deploying or resuming', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(RESULT), {
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetch);
    const client = new AlvaClient({ apiKey: 'test-key' });
    const result = await client.companyNews.create({
      name: 'my-news',
      tickers: ['NVDA', 'AMD'],
      initial_lookback_hours: 48,
      page_size: 30,
    });
    expect(result).toEqual(RESULT);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('https://api-llm.prd.alva.ai/api/v1/company-news');
    expect(options.method).toBe('POST');
    expect(options.headers['X-Alva-Api-Key']).toBe('test-key');
    expect(JSON.parse(options.body)).toEqual({
      name: 'my-news',
      tickers: ['NVDA', 'AMD'],
      initial_lookback_hours: 48,
      page_size: 30,
    });
  });

  it('leaves defaults to the backend and only sends configuration fields', async () => {
    const client = new AlvaClient({ apiKey: 'key' });
    const request = vi.spyOn(client, '_request').mockResolvedValue(RESULT);
    await client.companyNews.create({ name: 'my-news', tickers: ['NVDA'] });
    expect(request).toHaveBeenCalledWith('POST', '/api/v1/company-news', {
      body: { name: 'my-news', tickers: ['NVDA'] },
    });
  });

  it('requires authentication and valid configuration before making requests', async () => {
    const unauthenticated = new AlvaClient({});
    await expect(
      unauthenticated.companyNews.create({ name: 'my-news', tickers: ['NVDA'] })
    ).rejects.toBeInstanceOf(AlvaError);
    const client = new AlvaClient({ apiKey: 'key' });
    const request = vi.spyOn(client, '_request');
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
    { ...RESULT, feed_id: 42 },
    { ...RESULT, feed_id: '0' },
    { ...RESULT, feed_id: '42\n' },
    { ...RESULT, cronjob_id: '-1' },
    { ...RESULT, cronjob_id: '9223372036854775808' },
  ])('rejects invalid creation responses: %j', async (response) => {
    const client = new AlvaClient({ apiKey: 'key' });
    vi.spyOn(client, '_request').mockResolvedValue(response);
    await expect(
      client.companyNews.create({ name: 'my-news', tickers: ['NVDA'] })
    ).rejects.toBeInstanceOf(AlvaError);
  });

  it('does not retry or fall back to script deployment on backend failure', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'FAILED_PRECONDITION',
          message: 'company news is disabled',
        }),
        { status: 412 }
      )
    );
    vi.stubGlobal('fetch', fetch);
    const client = new AlvaClient({ apiKey: 'key' });
    await expect(
      client.companyNews.create({ name: 'my-news', tickers: ['NVDA'] })
    ).rejects.toMatchObject({ status: 412 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
