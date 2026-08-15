import { describe, expect, it } from 'vitest';
import { parseCommand } from '../../src/cli/commandSchema.js';
import { agentCommandArgv } from '../../src/cli/agentCommandDefinitions.js';
import { SLIM_AGENT_COMMAND_PATHS } from '../../src/cli/dispatch.js';

describe('Slim Alva Agent command profile', () => {
  it('publishes a unique leaf inventory for exhaustive safety smokes', () => {
    expect(SLIM_AGENT_COMMAND_PATHS).toHaveLength(
      new Set(SLIM_AGENT_COMMAND_PATHS).size
    );
    expect(SLIM_AGENT_COMMAND_PATHS).toContain('account whoami');
    expect(SLIM_AGENT_COMMAND_PATHS).toContain('automation delivery get');
    expect(SLIM_AGENT_COMMAND_PATHS).toContain('automation delivery update');
    expect(SLIM_AGENT_COMMAND_PATHS).toContain('automation runs logs');
    expect(SLIM_AGENT_COMMAND_PATHS).toContain('trading broker');
    expect(SLIM_AGENT_COMMAND_PATHS).not.toContain('sdk doc');
  });

  it('exposes regrouped account and playbook commands', () => {
    const whoami = parseCommand(['account', 'whoami'], 'agent');
    expect(agentCommandArgv(whoami)).toEqual(['whoami']);

    const draft = parseCommand(
      [
        'playbooks',
        'draft',
        '--name',
        'pulse',
        '--display-name',
        'Market Pulse',
        '--feeds',
        '[]',
      ],
      'agent'
    );
    expect(agentCommandArgv(draft)).toEqual([
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
    const get = parseCommand(
      ['automation', 'delivery', 'get', '--id', '42'],
      'agent'
    );
    expect(agentCommandArgv(get)).toEqual([
      'automation',
      'delivery',
      'get',
      '--id',
      '42',
    ]);

    const update = parseCommand(
      ['automation', 'delivery', 'update', '--id', '42', '--no-email-enabled'],
      'agent'
    );
    expect(agentCommandArgv(update)).toEqual([
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
      expect(() => parseCommand(argv, 'agent')).toThrow(
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
      expect(parseCommand(path, 'agent').path).toEqual(path);
    }

    const orders = parseCommand(
      ['portfolio', 'orders', '--account-id', '42'],
      'agent'
    );
    expect(agentCommandArgv(orders)).toEqual([
      'trading',
      'orders',
      '--account-id',
      '42',
    ]);

    const history = parseCommand(
      ['portfolio', 'equity-history', '--account-id', '42'],
      'agent'
    );
    expect(agentCommandArgv(history)).toEqual([
      'trading',
      'equity-history',
      '--account-id',
      '42',
    ]);
  });

  it('elevates shared execution prerequisites above Signal and Broker', () => {
    expect(
      agentCommandArgv(parseCommand(['trading', 'accounts'], 'agent'))
    ).toEqual(['broker', 'accounts']);
    expect(
      agentCommandArgv(parseCommand(['trading', 'risk-rules'], 'agent'))
    ).toEqual(['broker', 'risk-rules']);
  });

  it('isolates legacy Signal commands and removes execute-latest', () => {
    const subscribe = parseCommand(
      [
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
      ],
      'agent'
    );
    expect(agentCommandArgv(subscribe).slice(0, 2)).toEqual([
      'trading',
      'subscribe',
    ]);

    expect(() =>
      parseCommand(
        [
          'trading',
          'signals',
          'subscriptions',
          'subscribe',
          '--execute-latest',
        ],
        'agent'
      )
    ).toThrow(/--execute-latest is not supported/);
  });

  it('defaults Signal execution to dry-run and requires --live to remove it', () => {
    const safe = parseCommand(
      ['trading', 'signals', 'execute', '--account-id', '42', '--signal', '{}'],
      'agent'
    );
    expect(agentCommandArgv(safe)).toEqual([
      'trading',
      'execute',
      '--account-id',
      '42',
      '--signal',
      '{}',
      '--dry-run',
    ]);

    const live = parseCommand(
      [
        'trading',
        'signals',
        'execute',
        '--account-id',
        '42',
        '--signal',
        '{}',
        '--live',
      ],
      'agent'
    );
    expect(agentCommandArgv(live)).not.toContain('--dry-run');
  });

  it('keeps playbook social targets out of the alert tree', () => {
    expect(() =>
      parseCommand(['alert', 'enable', '--playbook', 'alice/momentum'], 'agent')
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
      expect(() => parseCommand(argv, 'agent')).toThrow(/is not supported/);
    }

    const screenshot = parseCommand(
      ['playbooks', 'screenshot', '--url', '/p'],
      'agent'
    );
    expect(agentCommandArgv(screenshot)).toEqual([
      'screenshot',
      '--url',
      '/p',
      '--base64',
    ]);
  });

  it('preserves every broker token after the nested prefix', () => {
    const parsed = parseCommand(
      [
        'trading',
        'broker',
        'order',
        'place',
        '--profile',
        'venue-native',
        '--future-flag',
      ],
      'agent'
    );
    expect(agentCommandArgv(parsed)).toEqual([
      'broker',
      'order',
      'place',
      '--profile',
      'venue-native',
      '--future-flag',
    ]);
  });
});
