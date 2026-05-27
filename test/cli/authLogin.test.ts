import { describe, expect, it, vi } from 'vitest';
import { generateState, handleAuthLogin } from '../../src/cli/auth.js';
import { deriveChallenge } from '../../src/cli/pkce.js';

describe('generateState', () => {
  it('returns a 64-character hex string (32 bytes)', () => {
    const state = generateState();
    expect(state).toMatch(/^[0-9a-f]{64}$/);
  });
});

// Mode A is now "Mode B + best-effort openBrowser". The OOB paste flow
// itself is exhaustively covered in authLoginNoBrowser.test.ts (happy
// path, retry, 3-exhaust, network error, OOB URL derivation, dash/
// underscore preservation, etc.). The tests here only cover Mode A's
// extra behavior: openBrowser is called with the same OOB authorize
// URL that the paste flow then re-derives and prints.

function makeWriteConfigDeps() {
  return {
    env: {} as Record<string, string | undefined>,
    homedir: () => '/home/test',
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
  };
}

interface FetchCall {
  url: string;
  init?: { method?: string; headers?: Record<string, string>; body?: string };
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  const fixedState = 'a'.repeat(64);
  const fixedVerifier = 'v'.repeat(43);
  const fixedChallenge = deriveChallenge(fixedVerifier);

  const writeConfigDeps = makeWriteConfigDeps();
  const fetchCalls: FetchCall[] = [];
  const fetchFn = vi.fn(async (url: string, init?: FetchCall['init']) => {
    fetchCalls.push({ url, init });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        api_key: 'alva_test123',
        token_type: 'ApiKey',
        scope: 'cli',
      }),
      text: async () => '',
    } as unknown as Response;
  });

  const openBrowser = vi.fn().mockResolvedValue(undefined);
  const readline = vi.fn().mockResolvedValue('ABCD-EFGH');

  return {
    fixedState,
    fixedVerifier,
    fixedChallenge,
    writeConfigDeps,
    fetchCalls,
    openBrowser,
    readline,
    deps: {
      generateState: () => fixedState,
      generateCodeVerifier: () => fixedVerifier,
      openBrowser,
      writeConfigDeps,
      log: () => {},
      fetch: fetchFn,
      readline,
      // createServer / timeout are still in the type for backward
      // compat with the old listener-based interface, but the new
      // OOB-only flow never reads them. Provide stubs so the typed
      // shape stays satisfiable.
      createServer: vi.fn(),
      timeout: 500,
      ...overrides,
    },
  };
}

describe('handleAuthLogin (Mode A — OOB paste + openBrowser)', () => {
  it('opens browser with the OOB authorize URL, then exchanges pasted code', async () => {
    const {
      fixedState,
      fixedVerifier,
      fixedChallenge,
      writeConfigDeps,
      openBrowser,
      readline,
      fetchCalls,
      deps,
    } = makeDeps();

    const result = await handleAuthLogin(['auth', 'login'], deps);

    expect(result).toEqual({
      status: 'logged_in',
      apiKey: 'alva_test123',
      profile: 'default',
    });

    // openBrowser fired exactly once with the authorize URL.
    expect(openBrowser).toHaveBeenCalledTimes(1);
    const openedUrl = new URL(openBrowser.mock.calls[0][0]);
    expect(openedUrl.pathname).toBe('/authorize');
    expect(openedUrl.searchParams.get('response_type')).toBe('code');
    expect(openedUrl.searchParams.get('client_id')).toBe('alva-cli');
    expect(openedUrl.searchParams.get('code_challenge')).toBe(fixedChallenge);
    expect(openedUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(openedUrl.searchParams.get('state')).toBe(fixedState);
    expect(openedUrl.searchParams.get('scope')).toBe('cli');

    // redirect_uri is the OOB display page derived from authUrl
    // (default authUrl is https://alva.ai → OOB at same origin).
    expect(openedUrl.searchParams.get('redirect_uri')).toBe(
      'https://alva.ai/oauth/code/callback'
    );

    // Paste prompt consumed; exchange happened with the pasted code
    // and the SAME OOB redirect_uri.
    expect(readline).toHaveBeenCalled();
    expect(fetchCalls).toHaveLength(1);
    const body = JSON.parse(fetchCalls[0].init?.body ?? '{}');
    expect(body).toEqual({
      grant_type: 'authorization_code',
      code: 'ABCD-EFGH',
      code_verifier: fixedVerifier,
      redirect_uri: 'https://alva.ai/oauth/code/callback',
      client_id: 'alva-cli',
    });

    expect(writeConfigDeps.writeFile).toHaveBeenCalled();
  });

  it('--auth-url stg routes openBrowser AND exchange to stg OOB', async () => {
    const { openBrowser, fetchCalls, deps } = makeDeps();

    await handleAuthLogin(
      ['auth', 'login', '--auth-url', 'https://stg.alva.xyz'],
      deps
    );

    const opened = new URL(openBrowser.mock.calls[0][0]);
    expect(opened.origin).toBe('https://stg.alva.xyz');
    expect(opened.searchParams.get('redirect_uri')).toBe(
      'https://stg.alva.xyz/oauth/code/callback'
    );

    const body = JSON.parse(fetchCalls[0].init?.body ?? '{}');
    expect(body.redirect_uri).toBe('https://stg.alva.xyz/oauth/code/callback');
  });

  it('openBrowser failure is swallowed — flow continues via paste', async () => {
    const openBrowser = vi
      .fn()
      .mockRejectedValue(new Error('xdg-open not found'));
    const { writeConfigDeps, deps } = makeDeps({ openBrowser });

    const result = await handleAuthLogin(['auth', 'login'], deps);

    expect(result.apiKey).toBe('alva_test123');
    expect(openBrowser).toHaveBeenCalled();
    expect(writeConfigDeps.writeFile).toHaveBeenCalled();
  });

  it('--profile flag is honored end-to-end', async () => {
    const { writeConfigDeps, deps } = makeDeps();

    const result = await handleAuthLogin(
      ['auth', 'login', '--profile', 'stg'],
      deps
    );

    expect(result.profile).toBe('stg');
    expect(writeConfigDeps.writeFile).toHaveBeenCalled();
  });
});
