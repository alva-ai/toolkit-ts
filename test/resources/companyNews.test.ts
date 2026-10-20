import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { AlvaError } from '../../src/error.js';

const RESULT = {
  feed_id: '9223372036854775807',
  cronjob_id: '9223372036854775806',
};

const graphResult = (
  result: { feed_id: unknown; cronjob_id: unknown } = RESULT
) => ({
  data: {
    companyNews: {
      createFeed: { id: result.feed_id, producer: { id: result.cronjob_id } },
    },
  },
});

describe('CompanyNewsResource', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('creates one managed feed using the API key without deploying or resuming', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(graphResult()), {
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
    expect(url).toBe('https://api-llm.prd.alva.ai/query');
    expect(options.method).toBe('POST');
    expect(options.headers['X-Alva-Api-Key']).toBe('test-key');
    expect(JSON.parse(options.body)).toEqual({
      query: expect.stringContaining('companyNews'),
      variables: {
        input: {
          name: 'my-news',
          tickers: ['NVDA', 'AMD'],
          initialLookbackHours: 48,
          pageSize: 30,
        },
      },
    });
  });

  it('leaves defaults to the backend and only sends configuration fields', async () => {
    const client = new AlvaClient({ apiKey: 'key' });
    const request = vi
      .spyOn(client, '_request')
      .mockResolvedValue(graphResult());
    await client.companyNews.create({ name: 'my-news', tickers: ['NVDA'] });
    expect(request).toHaveBeenCalledWith('POST', '/query', {
      body: {
        query: expect.stringContaining('createFeed'),
        variables: { input: { name: 'my-news', tickers: ['NVDA'] } },
      },
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
    graphResult({ ...RESULT, feed_id: 42 }),
    graphResult({ ...RESULT, feed_id: '0' }),
    graphResult({ ...RESULT, feed_id: '42\n' }),
    graphResult({ ...RESULT, cronjob_id: '-1' }),
    graphResult({ ...RESULT, cronjob_id: '9223372036854775808' }),
    { data: { companyNews: { createFeed: null } } },
    { data: { companyNews: { createFeed: { id: '1', producer: null } } } },
  ])('rejects invalid creation responses: %j', async (response) => {
    const client = new AlvaClient({ apiKey: 'key' });
    vi.spyOn(client, '_request').mockResolvedValue(response);
    await expect(
      client.companyNews.create({ name: 'my-news', tickers: ['NVDA'] })
    ).rejects.toBeInstanceOf(AlvaError);
  });

  it('rejects GraphQL errors even with partial data and does not retry', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...graphResult(),
          errors: [
            {
              message: 'existing feed has different configuration',
              extensions: { code: 'ALREADY_EXISTS' },
            },
          ],
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetch);
    await expect(
      new AlvaClient({ apiKey: 'key' }).companyNews.create({
        name: 'my-news',
        tickers: ['NVDA'],
      })
    ).rejects.toMatchObject({ code: 'ALREADY_EXISTS', status: 409 });
    expect(fetch).toHaveBeenCalledTimes(1);
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
