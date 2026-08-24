import { describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { dispatchCli } from '../../src/cli/dispatch.js';
import { dispatch as dispatchEmbedded } from '../../src/cli/embeddedDispatch.js';
import { parseEmbeddedCommand } from '../../src/cli/embeddedCommandSchema.js';
import { embeddedCommandArgv } from '../../src/cli/agentCommandDefinitions.js';

const candidate = {
  symbol: 'RKLB',
  tradingPair: 'US_SPOT_RKLB_USD',
  market: 'US',
  instrumentType: 'spot',
  underlyingType: 'stock',
  quote: 'USD',
};

function makeClient(): AlvaClient {
  const client = new AlvaClient({ apiKey: 'test-key' });
  client.tradingPairs.search = vi.fn().mockResolvedValue({
    query: 'RKLB',
    candidates: [candidate],
  });
  client.tradingPairs.resolve = vi.fn().mockResolvedValue(candidate);
  return client;
}

describe('trading-pairs CLI', () => {
  it('dispatches terminal search with filters and JSON output', async () => {
    const client = makeClient();
    const result = await dispatchCli(client, [
      'trading-pairs',
      'search',
      '--symbol',
      'RKLB',
      '--market',
      'US',
      '--instrument-type',
      'spot',
      '--underlying-type',
      'stock',
      '--quote',
      'USD',
      '--json',
    ]);

    expect(client.tradingPairs.search).toHaveBeenCalledWith({
      symbol: 'RKLB',
      market: 'US',
      instrumentType: 'spot',
      underlyingType: 'stock',
      quote: 'USD',
      limit: undefined,
    });
    expect(result).toEqual({ query: 'RKLB', candidates: [candidate] });
  });

  it('routes the same commands through the Slim Agent profile', async () => {
    const client = makeClient();
    const parsed = parseEmbeddedCommand([
      'trading-pairs',
      'resolve',
      '--pair',
      'US_SPOT_RKLB_USD',
      '--json',
    ]);
    expect(embeddedCommandArgv(parsed)).toEqual([
      'trading-pairs',
      'resolve',
      '--pair',
      'US_SPOT_RKLB_USD',
      '--json',
    ]);

    const result = await dispatchEmbedded(client, [
      'trading-pairs',
      'resolve',
      '--pair',
      'US_SPOT_RKLB_USD',
      '--json',
    ]);
    expect(client.tradingPairs.resolve).toHaveBeenCalledWith({
      pair: 'US_SPOT_RKLB_USD',
      market: undefined,
      instrumentType: undefined,
      underlyingType: undefined,
      quote: undefined,
    });
    expect(result).toEqual(candidate);
  });

  it('exposes actionable leaf help to the Agent', async () => {
    const help = (await dispatchEmbedded(makeClient(), [
      'trading-pairs',
      'search',
      '--help',
    ])) as { _help: boolean; text: string };
    expect(help._help).toBe(true);
    expect(help.text).toContain('--symbol <ticker>');
    expect(help.text).toContain('Multiple results are normal');

    const groupHelp = (await dispatchEmbedded(makeClient(), [
      'trading-pairs',
      '--help',
    ])) as { _help: boolean; text: string };
    expect(groupHelp._help).toBe(true);
    expect(groupHelp.text).not.toContain('--underlying-type stock --quote USD');

    const terminalHelp = (await dispatchCli(makeClient(), [
      'trading-pairs',
      '--help',
    ])) as { _help: boolean; text: string };
    expect(terminalHelp._help).toBe(true);
    expect(terminalHelp.text).toContain(
      'alva trading-pairs resolve --symbol RKLB --market US --instrument-type spot --quote USD --json'
    );
    expect(terminalHelp.text).not.toContain(
      '--underlying-type stock --quote USD'
    );
  });
});
