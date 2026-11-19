import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { dispatchCli, handleBroker } from '../../src/cli/dispatch.js';
import { dispatch as dispatchEmbedded } from '../../src/cli/embeddedDispatch.js';
import { CliUsageError } from '../../src/error.js';
import { fakeV2, problem } from '../fakeV2.js';

function makeClient(): AlvaClient {
  const client = new AlvaClient({ apiKey: 'test-key' });
  client.trading.orders = vi.fn().mockResolvedValue([]);
  client.trading.equityHistory = vi.fn().mockResolvedValue([]);
  client.trading.subscribe = vi.fn().mockResolvedValue({});
  return client;
}

let restore = () => {};
afterEach(() => restore());

describe('trading CLI on /api/v2', () => {
  it('filters orders by origin and refuses the retired --source', async () => {
    const client = makeClient();
    await dispatchCli(client, [
      'trading',
      'orders',
      '--account-id',
      'broker_account_0a',
      '--origin',
      'alva_direct',
    ]);
    expect(client.trading.orders).toHaveBeenCalledWith({
      accountId: 'broker_account_0a',
      origin: 'ALVA_DIRECT',
      since: undefined,
      limit: undefined,
    });
    await expect(
      dispatchEmbedded(client, [
        'portfolio',
        'orders',
        '--account-id',
        'broker_account_0a',
        '--source',
        'manual',
      ])
    ).rejects.toThrow(/--origin/);
    await expect(
      dispatchCli(client, [
        'trading',
        'orders',
        '--account-id',
        'broker_account_0a',
        '--origin',
        'robot',
      ])
    ).rejects.toBeInstanceOf(CliUsageError);
    expect(client.trading.orders).toHaveBeenCalledTimes(1);
  });

  it('reads equity history for a range', async () => {
    const client = makeClient();
    await dispatchEmbedded(client, [
      'portfolio',
      'equity-history',
      '--account-id',
      'broker_account_0a',
      '--range',
      'one_week',
    ]);
    expect(client.trading.equityHistory).toHaveBeenCalledWith(
      expect.objectContaining({ range: 'ONE_WEEK' })
    );
  });

  it('subscribes by signal source ID without the feed owner and name', async () => {
    const client = makeClient();
    await dispatchCli(client, [
      'trading',
      'subscribe',
      '--account-id',
      'broker_account_0a',
      '--signal-source-id',
      'automation_0signals',
      '--playbook-id',
      'playbook_0btc',
      '--playbook-version',
      '1.0.0',
    ]);
    expect(client.trading.subscribe).toHaveBeenCalledWith({
      accountId: 'broker_account_0a',
      sourceUsername: '',
      sourceFeed: '',
      playbookId: 'playbook_0btc',
      playbookVersion: '1.0.0',
      signalSourceId: 'automation_0signals',
      executeLatest: undefined,
    });
    await expect(
      dispatchCli(client, [
        'trading',
        'subscribe',
        '--account-id',
        'broker_account_0a',
        '--playbook-id',
        'playbook_0btc',
        '--playbook-version',
        '1.0.0',
      ])
    ).rejects.toThrow(/--source-username/);
  });
});

describe('broker invocations on /api/v2', () => {
  it('posts the argv and hands the envelope and exit code to the writer', async () => {
    const fake = fakeV2({
      'POST /broker/invocations': () => ({
        envelope: { schemaVersion: 2, status: 'rejected' },
        exitCode: 1,
      }),
    });
    restore = fake.restore;
    const writeBrokerResult = vi.fn().mockResolvedValue(undefined);

    await handleBroker(
      new AlvaClient({ apiKey: 'test-key' }),
      ['quote', '--venue', 'binance'],
      { writeBrokerResult }
    );

    expect(fake.calls[0].body).toEqual({
      argv: ['quote', '--venue', 'binance'],
    });
    expect(writeBrokerResult).toHaveBeenCalledWith(
      { schemaVersion: 2, status: 'rejected' },
      1
    );
  });

  it('turns a refused invocation into the network envelope with exit 2', async () => {
    restore = fakeV2({
      'POST /broker/invocations': () =>
        problem(403, 'INSUFFICIENT_PERMISSION', {
          detail: 'this credential lacks trading:write',
          requiredPermission: 'trading:write',
        }),
    }).restore;
    const writeBrokerResult = vi.fn().mockResolvedValue(undefined);

    await handleBroker(new AlvaClient({ apiKey: 'test-key' }), ['accounts'], {
      writeBrokerResult,
    });

    expect(writeBrokerResult).toHaveBeenCalledWith(
      {
        schemaVersion: 2,
        status: 'error',
        reason: {
          code: 'network',
          message: 'this credential lacks trading:write',
        },
      },
      2
    );
  });
});
