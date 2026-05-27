import { describe, expect, it, vi } from 'vitest';
import * as http from 'node:http';
import { generateState, handleAuthLogin } from '../../src/cli/auth.js';
import { deriveChallenge } from '../../src/cli/pkce.js';

// Mode A is a dual-URL race:
//   - openBrowser fires the LOCAL URL (redirect_uri = 127.0.0.1:<port>/callback).
//     If consent completes on this machine the listener catches the
//     callback and finishes — no manual paste.
//   - stderr prints the OOB URL (redirect_uri = ${authUrl}/oauth/code/callback).
//     If the user opens it on another device they see a code-display
//     page; they paste the code back here.
// Whichever path resolves first wins. The two paths exchange with
// different redirect_uri values because each code is bound to its own
// redirect_uri at issue time.

describe('generateState', () => {
  it('returns a 64-character hex string (32 bytes)', () => {
    const state = generateState();
    expect(state).toMatch(/^[0-9a-f]{64}$/);
  });
});

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

function makeFetchMock(
  response: {
    ok: boolean;
    status?: number;
    json?: () => Promise<unknown>;
    text?: () => Promise<string>;
  } = {
    ok: true,
    status: 200,
    json: async () => ({
      api_key: 'alva_test123',
      token_type: 'ApiKey',
      scope: 'cli',
    }),
  }
) {
  const calls: FetchCall[] = [];
  const fn = vi.fn(async (url: string, init?: FetchCall['init']) => {
    calls.push({ url, init });
    return {
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 400),
      json: response.json ?? (async () => ({})),
      text: response.text ?? (async () => ''),
    } as unknown as Response;
  });
  return { fn, calls };
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  const fixedState = 'a'.repeat(64);
  const fixedVerifier = 'v'.repeat(43);
  const fixedChallenge = deriveChallenge(fixedVerifier);
  const writeConfigDeps = makeWriteConfigDeps();
  const fetchMock = makeFetchMock();
  let capturedOpenedUrl = '';
  const logged: string[] = [];
  return {
    fixedState,
    fixedVerifier,
    fixedChallenge,
    writeConfigDeps,
    fetchMock,
    logged,
    getOpenedUrl: () => capturedOpenedUrl,
    deps: {
      generateState: () => fixedState,
      generateCodeVerifier: () => fixedVerifier,
      openBrowser: vi.fn().mockImplementation(async (url: string) => {
        capturedOpenedUrl = url;
      }),
      writeConfigDeps,
      createServer: (handler: http.RequestListener) =>
        http.createServer(handler),
      timeout: 500,
      log: (msg: string) => logged.push(msg),
      fetch: fetchMock.fn,
      ...overrides,
    },
  };
}

async function waitForServer(getOpenedUrl: () => string): Promise<string> {
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 10));
    if (getOpenedUrl()) return getOpenedUrl();
  }
  return getOpenedUrl();
}

function httpGet(url: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString(),
          });
        });
      })
      .on('error', reject);
  });
}

function extractLocalPort(openedLocalUrl: string): string {
  const url = new URL(openedLocalUrl);
  const redirectUri = url.searchParams.get('redirect_uri') ?? '';
  return new URL(redirectUri).port;
}

describe('handleAuthLogin (Mode A — dual-URL race)', () => {
  it('listener path: callback wins, exchange uses localhost redirect_uri', async () => {
    const {
      fixedState,
      fixedVerifier,
      fixedChallenge,
      writeConfigDeps,
      fetchMock,
      getOpenedUrl,
      deps,
    } = makeDeps();

    const loginPromise = handleAuthLogin(['auth', 'login'], deps);
    const openedUrl = await waitForServer(getOpenedUrl);

    // openBrowser was called with the LOCAL url (localhost redirect_uri)
    const opened = new URL(openedUrl);
    expect(opened.pathname).toBe('/authorize');
    expect(opened.searchParams.get('code_challenge')).toBe(fixedChallenge);
    expect(opened.searchParams.get('state')).toBe(fixedState);
    const localRedirect = opened.searchParams.get('redirect_uri') ?? '';
    expect(localRedirect).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);

    const port = extractLocalPort(openedUrl);
    const res = await httpGet(
      `http://127.0.0.1:${port}/callback?code=LOCAL-XYZ&state=${fixedState}`
    );
    expect(res.statusCode).toBe(200);

    const result = await loginPromise;
    expect(result.apiKey).toBe('alva_test123');
    expect(writeConfigDeps.writeFile).toHaveBeenCalled();

    // Exchange happened with localhost redirect_uri.
    expect(fetchMock.calls).toHaveLength(1);
    const body = JSON.parse(fetchMock.calls[0].init?.body ?? '{}');
    expect(body.code).toBe('LOCAL-XYZ');
    expect(body.code_verifier).toBe(fixedVerifier);
    expect(body.redirect_uri).toBe(`http://127.0.0.1:${port}/callback`);
  });

  it('paste path: pasted code wins, exchange uses OOB redirect_uri', async () => {
    const readlineMock = vi.fn().mockResolvedValueOnce('PASTED-ABC');
    const { fixedVerifier, fetchMock, getOpenedUrl, deps } = makeDeps({
      readline: readlineMock,
    });

    const result = await handleAuthLogin(['auth', 'login'], deps);

    expect(result.apiKey).toBe('alva_test123');

    // openBrowser was still called with the LOCAL url (it's the
    // auto-popup target). But the exchange used OOB since paste won.
    const openedUrl = await waitForServer(getOpenedUrl);
    expect(new URL(openedUrl).searchParams.get('redirect_uri')).toMatch(
      /127\.0\.0\.1/
    );

    expect(fetchMock.calls).toHaveLength(1);
    const body = JSON.parse(fetchMock.calls[0].init?.body ?? '{}');
    expect(body.code).toBe('PASTED-ABC');
    expect(body.code_verifier).toBe(fixedVerifier);
    expect(body.redirect_uri).toBe('https://alva.ai/oauth/code/callback');
  });

  it('printed message contains the OOB URL (for copy/share)', async () => {
    const readlineMock = vi.fn().mockResolvedValueOnce('XYZ');
    const { fixedState, fixedChallenge, logged, deps } = makeDeps({
      readline: readlineMock,
    });
    await handleAuthLogin(['auth', 'login'], deps);

    const printed = logged.join('');
    const m = printed.match(/https:\/\/[^\s]+\/authorize\?\S+/);
    expect(m).not.toBeNull();
    const printedUrl = new URL(m![0]);
    expect(printedUrl.searchParams.get('redirect_uri')).toBe(
      'https://alva.ai/oauth/code/callback'
    );
    expect(printedUrl.searchParams.get('state')).toBe(fixedState);
    expect(printedUrl.searchParams.get('code_challenge')).toBe(fixedChallenge);
  });

  it('--auth-url stg routes BOTH urls to stg origin (printed OOB, opened local same authUrl)', async () => {
    const readlineMock = vi.fn().mockResolvedValueOnce('XYZ');
    const { logged, getOpenedUrl, deps, fetchMock } = makeDeps({
      readline: readlineMock,
    });

    await handleAuthLogin(
      ['auth', 'login', '--auth-url', 'https://stg.alva.xyz'],
      deps
    );

    // openBrowser local URL is on stg origin too, just with localhost
    // redirect_uri.
    const opened = new URL(await waitForServer(getOpenedUrl));
    expect(opened.origin).toBe('https://stg.alva.xyz');
    expect(opened.searchParams.get('redirect_uri')).toMatch(/127\.0\.0\.1/);

    // Printed (OOB) URL is on stg origin with stg OOB redirect.
    const printedUrlMatch = logged
      .join('')
      .match(/https:\/\/[^\s]+\/authorize\?\S+/);
    const printed = new URL(printedUrlMatch![0]);
    expect(printed.origin).toBe('https://stg.alva.xyz');
    expect(printed.searchParams.get('redirect_uri')).toBe(
      'https://stg.alva.xyz/oauth/code/callback'
    );

    // Paste-path exchange uses the stg OOB.
    const body = JSON.parse(fetchMock.calls[0].init?.body ?? '{}');
    expect(body.redirect_uri).toBe('https://stg.alva.xyz/oauth/code/callback');
  });

  it('callback with error=access_denied rejects with a friendly decline message', async () => {
    const { fixedState, getOpenedUrl, deps } = makeDeps();

    const loginPromise = handleAuthLogin(['auth', 'login'], deps);
    const settled = loginPromise.then(
      (v) => ({ ok: true, v }) as const,
      (e) => ({ ok: false, e: e as Error }) as const
    );

    const port = extractLocalPort(await waitForServer(getOpenedUrl));
    await httpGet(
      `http://127.0.0.1:${port}/callback?error=access_denied&error_description=user%20declined&state=${fixedState}`
    );

    const outcome = await settled;
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.e.message).toMatch(/declined.*alva auth login/i);
    }
  });

  it('callback state mismatch leaves the promise pending; eventually times out', async () => {
    const { getOpenedUrl, fetchMock, deps } = makeDeps({ timeout: 300 });

    const loginPromise = handleAuthLogin(['auth', 'login'], deps);
    const port = extractLocalPort(await waitForServer(getOpenedUrl));

    const res = await httpGet(
      `http://127.0.0.1:${port}/callback?code=XYZ&state=wrong`
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('State mismatch');
    expect(fetchMock.calls).toHaveLength(0);

    await expect(loginPromise).rejects.toThrow(/timed out/);
  });

  it('paste path: full callback URL pasted is parsed; exchange uses OOB redirect', async () => {
    const readlineMock = vi
      .fn()
      .mockResolvedValueOnce(
        'https://alva.ai/oauth/code/callback?code=FROM-OOB-URL&state=zzz'
      );
    const { fetchMock, deps } = makeDeps({ readline: readlineMock });

    await handleAuthLogin(['auth', 'login'], deps);

    const body = JSON.parse(fetchMock.calls[0].init?.body ?? '{}');
    expect(body.code).toBe('FROM-OOB-URL');
    expect(body.redirect_uri).toBe('https://alva.ai/oauth/code/callback');
  });

  it('openBrowser failure is non-fatal — paste still wins', async () => {
    const readlineMock = vi.fn().mockResolvedValueOnce('FALLBACK');
    const openBrowser = vi
      .fn()
      .mockRejectedValue(new Error('xdg-open not found'));
    const { writeConfigDeps, deps } = makeDeps({
      readline: readlineMock,
      openBrowser,
    });

    const result = await handleAuthLogin(['auth', 'login'], deps);

    expect(result.apiKey).toBe('alva_test123');
    expect(openBrowser).toHaveBeenCalled();
    expect(writeConfigDeps.writeFile).toHaveBeenCalled();
  });

  it('--profile flag is honored', async () => {
    const readlineMock = vi.fn().mockResolvedValueOnce('XYZ');
    const { writeConfigDeps, deps } = makeDeps({ readline: readlineMock });

    const result = await handleAuthLogin(
      ['auth', 'login', '--profile', 'stg'],
      deps
    );

    expect(result.profile).toBe('stg');
    expect(writeConfigDeps.writeFile).toHaveBeenCalled();
  });
});
