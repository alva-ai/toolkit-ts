import { describe, expect, it } from 'vitest';
import { parseCommand } from '../../src/cli/commandSchema.js';

// Regression tests for the auth-login boolean flag pair --no-browser /
// --browser. The original parser treated `--no-X` as the negation of
// `--X` whenever X was a known boolean flag. Since `browser` was registered as
// boolean, the shortcut swallowed `--no-browser` as `--browser=false`,
// defeating the intent. The command schema checks literal names first.

describe('command parser --no-browser / --browser', () => {
  it('treats --no-browser as a literal boolean flag, not the negation of --browser', () => {
    const flags = parseCommand(['auth', 'login', '--no-browser']).flags;
    expect(flags['no-browser']).toBe('true');
    expect(flags.browser).toBeUndefined();
  });

  it('treats --browser as a literal boolean flag (no value-consumption)', () => {
    const flags = parseCommand([
      'auth',
      'login',
      '--browser',
      '--profile',
      'stg',
    ]).flags;
    expect(flags.browser).toBe('true');
    expect(flags.profile).toBe('stg');
  });

  it('--no-mkdir-parents still works via the --no-X shortcut (existing behavior)', () => {
    // `mkdir-parents` is declared boolean, while `no-mkdir-parents` is not a
    // literal flag, so the synthetic negation path resolves it.
    const flags = parseCommand(['fs', 'write', '--no-mkdir-parents']).flags;
    expect(flags['mkdir-parents']).toBe('false');
  });

  it('--no-browser=true with explicit value is honored verbatim', () => {
    const flags = parseCommand(['auth', 'login', '--no-browser=true']).flags;
    expect(flags['no-browser']).toBe('true');
  });

  it('non-boolean --flag value still consumes the next arg', () => {
    const flags = parseCommand([
      'auth',
      'login',
      '--auth-url',
      'https://stg.alva.xyz',
      '--no-browser',
    ]).flags;
    expect(flags['auth-url']).toBe('https://stg.alva.xyz');
    expect(flags['no-browser']).toBe('true');
  });

  it('--flag at end of argv (no value) throws instead of silently falling back', () => {
    // Reproduces the multi-line shell footgun: when a command split
    // across lines without a `\` continuation, --base-url ends up with
    // no value and the URL became a separate shell command. Before
    // this change the old parser silently dropped the flag and the CLI
    // fell back to its default (prd), producing an HTTP 404 against a
    // stg-issued code.
    expect(() => parseCommand(['auth', 'login', '--base-url'])).toThrow(
      /--base-url requires a value/
    );
  });

  it('--flag followed by another --flag throws (no value)', () => {
    // `--auth-url --profile stg` — auth-url ate `--profile` as its
    // value before, leaving profile unrecognized later. Force an
    // error so the typo surfaces.
    expect(() =>
      parseCommand(['auth', 'login', '--auth-url', '--profile', 'stg'])
    ).toThrow(/--auth-url requires a value/);
  });
});
