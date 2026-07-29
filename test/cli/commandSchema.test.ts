import { describe, expect, it } from 'vitest';
import { parseCommand } from '../../src/cli/commandSchema.js';
import { CliUsageError } from '../../src/error.js';

describe('declarative CLI command parser', () => {
  it('parses flags for the resolved leaf command', () => {
    const parsed = parseCommand([
      'alert',
      'enable',
      '--automation-ids',
      '10,11',
      '--channel-id=12',
    ]);

    expect(parsed.path).toEqual(['alert', 'enable']);
    expect(parsed.flags).toEqual({
      'automation-ids': '10,11',
      'channel-id': '12',
    });
    expect(parsed.positionals).toEqual([]);
  });

  it('rejects an unknown flag and suggests a flag from the same leaf', () => {
    expect(() =>
      parseCommand(['alert', 'enable', '--automation-idss', '10,11'])
    ).toThrow(
      /--automation-idss is not supported for 'alert enable'.*--automation-ids/
    );
  });

  it('rejects a globally known flag when the resolved leaf does not support it', () => {
    expect(() =>
      parseCommand(['agent', 'list', '--automation-ids', '10'])
    ).toThrow(/Unknown command: 'agent'/);

    expect(() =>
      parseCommand(['fs', 'read', '--automation-ids', '10'])
    ).toThrow(/--automation-ids is not supported for 'fs read'/);
  });

  it('resolves nested command leaves before validating their flags', () => {
    const parsed = parseCommand([
      'functions',
      'allowance',
      'create',
      '--playbook-id',
      '42',
      '--amount',
      '100',
    ]);

    expect(parsed.path).toEqual(['functions', 'allowance', 'create']);
    expect(parsed.flags).toEqual({
      'playbook-id': '42',
      amount: '100',
    });
  });

  it('preserves literal and synthetic boolean negation behavior', () => {
    expect(parseCommand(['auth', 'login', '--no-browser']).flags).toEqual({
      'no-browser': 'true',
    });

    expect(
      parseCommand(['deploy', 'update', '--id', '1', '--no-push-notify']).flags
    ).toEqual({ id: '1', 'push-notify': 'false' });

    expect(
      parseCommand(['deploy', 'update', '--id', '1', '--no-push-notify=false'])
        .flags
    ).toEqual({ id: '1', 'push-notify': 'true' });

    expect(() => parseCommand(['automation', 'list', '--json=maybe'])).toThrow(
      /--json must be true or false/
    );
  });

  it('rejects missing values without consuming the next flag', () => {
    expect(() =>
      parseCommand(['auth', 'login', '--auth-url', '--profile', 'staging'])
    ).toThrow(/--auth-url requires a value/);
  });

  it('validates positional argument bounds', () => {
    expect(
      parseCommand(['data-skills', 'endpoint', '--json', 'prices', 'README.md'])
        .positionals
    ).toEqual(['prices', 'README.md']);

    expect(() => parseCommand(['data-skills', 'endpoint', 'prices'])).toThrow(
      /Missing endpoint file/
    );

    expect(() =>
      parseCommand(['fs', 'read', 'unexpected', '--path', '~/file'])
    ).toThrow(/Unexpected argument 'unexpected' for 'fs read'/);

    expect(() => parseCommand(['lint', 'playbook', '--help'])).not.toThrow();
  });

  it('leaves broker arguments completely untouched', () => {
    const parsed = parseCommand([
      'broker',
      'order',
      'place',
      '--stdin',
      '--venue-native-future-flag',
    ]);

    expect(parsed.passthrough).toEqual([
      'order',
      'place',
      '--stdin',
      '--venue-native-future-flag',
    ]);
    expect(parsed.flags).toEqual({});
  });

  it('uses CliUsageError with the top-level command for parser failures', () => {
    try {
      parseCommand(['fs', 'read', '--pth', '~/file']);
      throw new Error('expected parseCommand to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(CliUsageError);
      expect((error as CliUsageError).command).toBe('fs');
    }
  });
});
