import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCommand } from '../../src/cli/commandSchema.js';
import { parseEmbeddedCommand } from '../../src/cli/embeddedCommandSchema.js';
import { embeddedCommandArgv } from '../../src/cli/agentCommandDefinitions.js';
import * as embeddedDispatch from '../../src/cli/embeddedDispatch.js';

describe('Slim Alva Agent command profile', () => {
  it('keeps embedded catalog modules out of the system CLI dependency path', () => {
    for (const relativePath of [
      '../../src/cli/index.ts',
      '../../src/cli/dispatch.ts',
      '../../src/cli/commandSchema.ts',
    ]) {
      const source = readFileSync(
        new URL(relativePath, import.meta.url),
        'utf8'
      );
      expect(source).not.toMatch(
        /embeddedCommand|embeddedDispatch|agentCommandDefinitions|agentHelp/
      );
    }
  });

  it('publishes a unique leaf inventory for exhaustive safety smokes', () => {
    expect(embeddedDispatch.ALPI_ALVA_COMMAND_PATHS).toHaveLength(
      new Set(embeddedDispatch.ALPI_ALVA_COMMAND_PATHS).size
    );
    expect(embeddedDispatch.ALPI_ALVA_COMMAND_PATHS).toContain(
      'account whoami'
    );
    expect(embeddedDispatch.ALPI_ALVA_COMMAND_PATHS).toContain(
      'automation delivery get'
    );
    expect(embeddedDispatch.ALPI_ALVA_COMMAND_PATHS).toContain(
      'automation delivery update'
    );
    expect(embeddedDispatch.ALPI_ALVA_COMMAND_PATHS).toContain(
      'automation runs logs'
    );
    expect(embeddedDispatch.ALPI_ALVA_COMMAND_PATHS).toContain(
      'trading broker'
    );
    expect(embeddedDispatch.ALPI_ALVA_COMMAND_PATHS).not.toContain('sdk doc');
    expect(embeddedDispatch).not.toHaveProperty('dispatchCli');
    expect(embeddedDispatch).not.toHaveProperty('HELP_TEXT');
  });

  it('exposes regrouped account and playbook commands', () => {
    const whoami = parseEmbeddedCommand(['account', 'whoami']);
    expect(embeddedCommandArgv(whoami)).toEqual(['whoami']);

    const draft = parseEmbeddedCommand([
      'playbooks',
      'draft',
      '--name',
      'pulse',
      '--display-name',
      'Market Pulse',
      '--feeds',
      '[]',
    ]);
    expect(embeddedCommandArgv(draft)).toEqual([
      'release',
      'playbook-draft',
      '--name',
      'pulse',
      '--display-name',
      'Market Pulse',
      '--feeds',
      '[]',
    ]);
  });

  it('keeps per-Automation delivery controls under the unified product tree', () => {
    const get = parseEmbeddedCommand([
      'automation',
      'delivery',
      'get',
      '--id',
      '42',
    ]);
    expect(embeddedCommandArgv(get)).toEqual([
      'automation',
      'delivery',
      'get',
      '--id',
      '42',
    ]);

    const update = parseEmbeddedCommand([
      'automation',
      'delivery',
      'update',
      '--id',
      '42',
      '--no-email-enabled',
    ]);
    expect(embeddedCommandArgv(update)).toEqual([
      'automation',
      'delivery',
      'update',
      '--id',
      '42',
      '--no-email-enabled',
    ]);
  });

  it('rejects legacy-only and removed commands in the Agent profile', () => {
    for (const argv of [
      ['whoami'],
      ['deploy', 'list'],
      ['sdk', 'partitions'],
      ['arrays', 'token', 'status'],
      ['trading', 'portfolio'],
      ['trading', 'update-risk-rules'],
    ]) {
      expect(() => parseEmbeddedCommand(argv)).toThrow(
        /Unknown command|Unknown subcommand/
      );
    }
  });

  it('keeps the terminal profile unchanged', () => {
    expect(parseCommand(['whoami']).path).toEqual(['whoami']);
    expect(parseCommand(['deploy', 'list']).path).toEqual(['deploy', 'list']);
    expect(parseCommand(['sdk', 'partitions']).path).toEqual([
      'sdk',
      'partitions',
    ]);
  });

  it('moves portfolio reads out of trading', () => {
    for (const path of [
      ['portfolio', 'accounts'],
      ['portfolio', 'summary'],
      ['portfolio', 'activities'],
      ['portfolio', 'orders'],
      ['portfolio', 'equity-history'],
    ]) {
      expect(parseEmbeddedCommand(path).path).toEqual(path);
    }

    const orders = parseEmbeddedCommand([
      'portfolio',
      'orders',
      '--account-id',
      '42',
    ]);
    expect(embeddedCommandArgv(orders)).toEqual([
      'trading',
      'orders',
      '--account-id',
      '42',
    ]);

    const history = parseEmbeddedCommand([
      'portfolio',
      'equity-history',
      '--account-id',
      '42',
    ]);
    expect(embeddedCommandArgv(history)).toEqual([
      'trading',
      'equity-history',
      '--account-id',
      '42',
    ]);
  });

  it('elevates shared execution prerequisites above Signal and Broker', () => {
    expect(
      embeddedCommandArgv(parseEmbeddedCommand(['trading', 'accounts']))
    ).toEqual(['broker', 'accounts']);
    expect(
      embeddedCommandArgv(parseEmbeddedCommand(['trading', 'risk-rules']))
    ).toEqual(['broker', 'risk-rules']);
  });

  it('isolates legacy Signal commands and removes execute-latest', () => {
    const subscribe = parseEmbeddedCommand([
      'trading',
      'signals',
      'subscriptions',
      'subscribe',
      '--account-id',
      '42',
      '--source-username',
      'alice',
      '--source-feed',
      'signals',
      '--playbook-id',
      '7',
      '--playbook-version',
      'v1.0.0',
    ]);
    expect(embeddedCommandArgv(subscribe).slice(0, 2)).toEqual([
      'trading',
      'subscribe',
    ]);

    expect(() =>
      parseEmbeddedCommand([
        'trading',
        'signals',
        'subscriptions',
        'subscribe',
        '--execute-latest',
      ])
    ).toThrow(/--execute-latest is not supported/);
  });

  it('defaults Signal execution to dry-run and requires --live to remove it', () => {
    const safe = parseEmbeddedCommand([
      'trading',
      'signals',
      'execute',
      '--account-id',
      '42',
      '--signal',
      '{}',
    ]);
    expect(embeddedCommandArgv(safe)).toEqual([
      'trading',
      'execute',
      '--account-id',
      '42',
      '--signal',
      '{}',
      '--dry-run',
    ]);

    const live = parseEmbeddedCommand([
      'trading',
      'signals',
      'execute',
      '--account-id',
      '42',
      '--signal',
      '{}',
      '--live',
    ]);
    expect(embeddedCommandArgv(live)).not.toContain('--dry-run');
  });

  it('keeps playbook social targets out of the alert tree', () => {
    expect(() =>
      parseEmbeddedCommand(['alert', 'enable', '--playbook', 'alice/momentum'])
    ).toThrow(/--playbook is not supported/);
  });

  it('omits local-file flags and returns screenshots as Agent images', () => {
    for (const argv of [
      ['fs', 'write', '--path', '~/x', '--file', './x'],
      ['run', '--local-file', './x.js'],
      [
        'playbooks',
        'functions',
        'register',
        '--params-schema-file',
        './schema.json',
      ],
      ['playbooks', 'screenshot', '--url', '/p', '--out', './p.png'],
    ]) {
      expect(() => parseEmbeddedCommand(argv)).toThrow(/is not supported/);
    }

    const screenshot = parseEmbeddedCommand([
      'playbooks',
      'screenshot',
      '--url',
      '/p',
    ]);
    expect(embeddedCommandArgv(screenshot)).toEqual([
      'screenshot',
      '--url',
      '/p',
      '--base64',
    ]);
  });

  it('preserves every broker token after the nested prefix', () => {
    const parsed = parseEmbeddedCommand([
      'trading',
      'broker',
      'order',
      'place',
      '--profile',
      'venue-native',
      '--future-flag',
    ]);
    expect(embeddedCommandArgv(parsed)).toEqual([
      'broker',
      'order',
      'place',
      '--profile',
      'venue-native',
      '--future-flag',
    ]);
  });
});
