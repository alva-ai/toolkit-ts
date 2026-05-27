import { describe, expect, it } from 'vitest';
import { parseFlags } from '../../src/cli/index.js';

// Regression tests for the auth-login boolean flag pair --no-browser /
// --browser. The original parseFlags treated `--no-X` as the negation of
// `--X` whenever X was a known boolean flag. Since `'browser'` is in
// BOOLEAN_FLAGS (so `alva auth login --browser` parses standalone), the
// shortcut swallowed `--no-browser` as `--browser=false`, defeating the
// intent. Fixed by checking literal flag names first.

describe('parseFlags --no-browser / --browser', () => {
  it('treats --no-browser as a literal boolean flag, not the negation of --browser', () => {
    const flags = parseFlags(['login', '--no-browser']);
    expect(flags['no-browser']).toBe('true');
    expect(flags.browser).toBeUndefined();
  });

  it('treats --browser as a literal boolean flag (no value-consumption)', () => {
    const flags = parseFlags(['login', '--browser', '--profile', 'stg']);
    expect(flags.browser).toBe('true');
    expect(flags.profile).toBe('stg');
  });

  it('--no-mkdir-parents still works via the --no-X shortcut (existing behavior)', () => {
    // `'mkdir-parents'` is in BOOLEAN_FLAGS but `'no-mkdir-parents'` is
    // NOT, so the shortcut path is the only way this resolves.
    const flags = parseFlags(['write', '--no-mkdir-parents']);
    expect(flags['mkdir-parents']).toBe('false');
  });

  it('--no-browser=true with explicit value is honored verbatim', () => {
    const flags = parseFlags(['login', '--no-browser=true']);
    expect(flags['no-browser']).toBe('true');
  });

  it('non-boolean --flag value still consumes the next arg', () => {
    const flags = parseFlags([
      'login',
      '--auth-url',
      'https://stg.alva.xyz',
      '--no-browser',
    ]);
    expect(flags['auth-url']).toBe('https://stg.alva.xyz');
    expect(flags['no-browser']).toBe('true');
  });

  it('--flag at end of argv (no value) throws instead of silently falling back', () => {
    // Reproduces the multi-line shell footgun: when a command split
    // across lines without a `\` continuation, --base-url ends up with
    // no value and the URL became a separate shell command. Before
    // this change parseFlags silently dropped the flag and the CLI
    // fell back to its default (prd), producing an HTTP 404 against a
    // stg-issued code.
    expect(() => parseFlags(['login', '--base-url'])).toThrow(
      /--base-url requires a value/
    );
  });

  it('--flag followed by another --flag throws (no value)', () => {
    // `--auth-url --profile stg` — auth-url ate `--profile` as its
    // value before, leaving profile unrecognized later. Force an
    // error so the typo surfaces.
    expect(() =>
      parseFlags(['login', '--auth-url', '--profile', 'stg'])
    ).toThrow(/--auth-url requires a value/);
  });
});
