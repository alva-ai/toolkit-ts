import { describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { CliUsageError } from '../../src/error.js';
import { dispatch as dispatchTerminal } from '../../src/cli/index.js';
import { dispatch as dispatchEmbedded } from '../../src/cli/embeddedDispatch.js';

for (const [surface, dispatch] of [
  ['terminal', dispatchTerminal],
  ['embedded', dispatchEmbedded],
] as const) {
  describe(`company-news ${surface} dispatch`, () => {
    it('creates a multi-ticker managed feed with one call and returns lossless IDs', async () => {
      const client = new AlvaClient({ apiKey: 'key' });
      const result = {
        feed_id: '9223372036854775807',
        cronjob_id: '9223372036854775806',
      };
      const create = vi
        .spyOn(client.companyNews, 'create')
        .mockResolvedValue(result);
      const received = await dispatch(client, [
        'company-news',
        'create',
        '--name',
        'my-news',
        '--tickers',
        ' NVDA, AMD ',
        '--initial-lookback-hours',
        '48',
        '--page-size',
        '30',
      ]);
      expect(received).toEqual(result);
      expect(create).toHaveBeenCalledExactlyOnceWith({
        name: 'my-news',
        tickers: ['NVDA', 'AMD'],
        initial_lookback_hours: 48,
        page_size: 30,
      });
    });

    it('leaves optional limits to the backend', async () => {
      const client = new AlvaClient({ apiKey: 'key' });
      const create = vi
        .spyOn(client.companyNews, 'create')
        .mockResolvedValue({ feed_id: '1', cronjob_id: '2' });
      await dispatch(client, [
        'company-news',
        'create',
        '--name',
        'my-news',
        '--tickers',
        'NVDA',
      ]);
      expect(create).toHaveBeenCalledWith({
        name: 'my-news',
        tickers: ['NVDA'],
      });
    });

    it.each([
      [],
      ['--name', 'my-news'],
      ['--tickers', 'NVDA'],
      ['--name', 'my-news', '--tickers', 'NVDA,,AMD'],
      ['--name', 'my-news', '--tickers', 'NVDA', '--page-size', '1.5'],
      [
        '--name',
        'my-news',
        '--tickers',
        'NVDA',
        '--initial-lookback-hours',
        '-1',
      ],
      ['--name', 'my-news', '--tickers', 'NVDA', '--page-size', '101'],
      ['--name', 'my-news', '--tickers', 'NVDA', '--path', '~/pipeline.js'],
      ['--name', 'my-news', '--tickers', 'NVDA', '--uid', '42'],
      ['--name', 'my-news', '--tickers', 'NVDA', '--start'],
    ])(
      'rejects invalid or script/identity/activation flags %j',
      async (...flags) => {
        const client = new AlvaClient({ apiKey: 'key' });
        const create = vi.spyOn(client.companyNews, 'create');
        await expect(
          dispatch(client, ['company-news', 'create', ...flags])
        ).rejects.toBeInstanceOf(CliUsageError);
        expect(create).not.toHaveBeenCalled();
      }
    );

    it('documents paused creation, billing and absence of script uploads', async () => {
      const client = new AlvaClient({});
      const result = (await dispatch(client, ['company-news', '--help'])) as {
        text: string;
      };
      expect(result.text).toContain('paused');
      expect(result.text).toContain('tickers');
      expect(result.text).toContain('script');
      expect(result.text).toContain('credits');
    });
  });
}
