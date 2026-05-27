import { describe, it, expect, vi } from 'vitest';
import { generateState, handleAuthLogin } from '../../src/cli/auth.js';
import { deriveChallenge } from '../../src/cli/pkce.js';
import * as http from 'node:http';

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
  // 43-char base64url verifier
  const fixedVerifier = 'v'.repeat(43);
  const fixedChallenge = deriveChallenge(fixedVerifier);
  const writeConfigDeps = makeWriteConfigDeps();
  const fetchMock = makeFetchMock();
  let capturedUrl = '';
  return {
    fixedState,
    fixedVerifier,
    fixedChallenge,
    writeConfigDeps,
    fetchMock,
    getCapturedUrl: () => capturedUrl,
    deps: {
      generateState: () => fixedState,
      generateCodeVerifier: () => fixedVerifier,
      openBrowser: vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url;
      }),
      writeConfigDeps,
      timeout: 500,
      log: () => {},
      fetch: fetchMock.fn,
      ...overrides,
    },
  };
}

async function waitForServer(getCapturedUrl: () => string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 10));
    if (getCapturedUrl()) break;
  }
  return getCapturedUrl();
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

function extractPort(openedUrl: string): string {
  const url = new URL(openedUrl);
  const redirectUri = url.searchParams.get('redirect_uri') ?? '';
  return new URL(redirectUri).port;
}

describe('handleAuthLogin (PKCE Mode A)', () => {
  it('happy path: receives code on callback, exchanges for api_key, writes config', async () => {
    const {
      fixedState,
      fixedVerifier,
      fixedChallenge,
      writeConfigDeps,
      fetchMock,
      getCapturedUrl,
      deps,
    } = makeDeps();

    const loginPromise = handleAuthLogin(['auth', 'login'], deps);
    const openedUrl = await waitForServer(getCapturedUrl);
    const port = extractPort(openedUrl);

    // Verify the authorize URL carries the PKCE + OAuth params
    const parsed = new URL(openedUrl);
    expect(parsed.pathname).toBe('/authorize');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('client_id')).toBe('alva-cli');
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      `http://127.0.0.1:${port}/callback`
    );
    expect(parsed.searchParams.get('code_challenge')).toBe(fixedChallenge);
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('state')).toBe(fixedState);
    expect(parsed.searchParams.get('scope')).toBe('cli');

    const res = await httpGet(
      `http://127.0.0.1:${port}/callback?code=XYZ&state=${fixedState}`
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('all set for Alva');

    const result = await loginPromise;
    expect(result).toEqual({
      status: 'logged_in',
      apiKey: 'alva_test123',
      profile: 'default',
    });
    expect(writeConfigDeps.writeFile).toHaveBeenCalled();

    // Verify token exchange POST
    expect(fetchMock.calls).toHaveLength(1);
    const call = fetchMock.calls[0];
    expect(call.url).toBe('https://api-llm.prd.alva.ai/api/v1/oauth/token');
    expect(call.init?.method).toBe('POST');
    expect(call.init?.headers?.['Content-Type']).toBe('application/json');
    const body = JSON.parse(call.init?.body ?? '{}');
    expect(body).toEqual({
      grant_type: 'authorization_code',
      code: 'XYZ',
      code_verifier: fixedVerifier,
      redirect_uri: `http://127.0.0.1:${port}/callback`,
      client_id: 'alva-cli',
    });
  });

  it('state mismatch: responds 400 and promise stays pending', async () => {
    const { getCapturedUrl, fetchMock, deps } = makeDeps({ timeout: 300 });

    const loginPromise = handleAuthLogin(['auth', 'login'], deps);
    const openedUrl = await waitForServer(getCapturedUrl);
    const port = extractPort(openedUrl);

    const res = await httpGet(
      `http://127.0.0.1:${port}/callback?code=XYZ&state=wrong`
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('State mismatch');
    expect(fetchMock.calls).toHaveLength(0);

    const raceResult = await Promise.race([
      loginPromise.then(() => 'resolved'),
      new Promise<string>((r) => setTimeout(() => r('pending'), 100)),
    ]);
    expect(raceResult).toBe('pending');

    await loginPromise.catch(() => {
      // expected timeout
    });
  });

  it('missing code: responds 400 and promise stays pending', async () => {
    const { fixedState, getCapturedUrl, fetchMock, deps } = makeDeps({
      timeout: 300,
    });

    const loginPromise = handleAuthLogin(['auth', 'login'], deps);
    const openedUrl = await waitForServer(getCapturedUrl);
    const port = extractPort(openedUrl);

    const res = await httpGet(
      `http://127.0.0.1:${port}/callback?state=${fixedState}`
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('Missing');
    expect(fetchMock.calls).toHaveLength(0);

    const raceResult = await Promise.race([
      loginPromise.then(() => 'resolved'),
      new Promise<string>((r) => setTimeout(() => r('pending'), 100)),
    ]);
    expect(raceResult).toBe('pending');

    await loginPromise.catch(() => {
      // expected timeout
    });
  });

  it('error=access_denied on callback: rejects with a user-friendly decline message', async () => {
    const { fixedState, getCapturedUrl, fetchMock, deps } = makeDeps();

    const loginPromise = handleAuthLogin(['auth', 'login'], deps);
    const settled = loginPromise.then(
      (v) => ({ ok: true, v }) as const,
      (e) => ({ ok: false, e: e as Error }) as const
    );
    const openedUrl = await waitForServer(getCapturedUrl);
    const port = extractPort(openedUrl);

    await httpGet(
      `http://127.0.0.1:${port}/callback?error=access_denied&error_description=user%20declined%20authorization&state=${fixedState}`
    );

    const outcome = await settled;
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      // access_denied is a known OAuth error code; we surface a
      // friendly message that mentions retrying with `alva auth login`,
      // not the raw error code which is user-hostile.
      expect(outcome.e.message).toMatch(/declined.*alva auth login/i);
    }
    expect(fetchMock.calls).toHaveLength(0);
  });

  it('error=server_error on callback: surfaces error_description verbatim', async () => {
    const { fixedState, getCapturedUrl, fetchMock, deps } = makeDeps();

    const loginPromise = handleAuthLogin(['auth', 'login'], deps);
    const settled = loginPromise.then(
      (v) => ({ ok: true, v }) as const,
      (e) => ({ ok: false, e: e as Error }) as const
    );
    const openedUrl = await waitForServer(getCapturedUrl);
    const port = extractPort(openedUrl);

    const desc = 'authorization server is overloaded, try again later';
    await httpGet(
      `http://127.0.0.1:${port}/callback?error=server_error&error_description=${encodeURIComponent(
        desc
      )}&state=${fixedState}`
    );

    const outcome = await settled;
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.e.message).toContain(desc);
    }
    expect(fetchMock.calls).toHaveLength(0);
  });

  it('token exchange returns invalid_grant: rejects, no config written', async () => {
    const fetchMock = makeFetchMock({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'invalid_grant',
        error_description: 'code expired',
      }),
      text: async () =>
        JSON.stringify({
          error: 'invalid_grant',
          error_description: 'code expired',
        }),
    });
    const { fixedState, writeConfigDeps, getCapturedUrl, deps } = makeDeps({
      fetch: fetchMock.fn,
    });

    const loginPromise = handleAuthLogin(['auth', 'login'], deps);
    const settled = loginPromise.then(
      (v) => ({ ok: true, v }) as const,
      (e) => ({ ok: false, e: e as Error }) as const
    );
    const openedUrl = await waitForServer(getCapturedUrl);
    const port = extractPort(openedUrl);

    await httpGet(
      `http://127.0.0.1:${port}/callback?code=XYZ&state=${fixedState}`
    );

    const outcome = await settled;
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.e.message).toMatch(/invalid_grant/);
    }
    expect(writeConfigDeps.writeFile).not.toHaveBeenCalled();
  });

  it('timeout: rejects with timeout error when no callback received', async () => {
    const { deps } = makeDeps({ timeout: 100 });

    await expect(handleAuthLogin(['auth', 'login'], deps)).rejects.toThrow(
      'Login timed out waiting for callback'
    );
  });

  it('--profile flag: saves config under specified profile', async () => {
    const { fixedState, writeConfigDeps, getCapturedUrl, deps } = makeDeps();

    const loginPromise = handleAuthLogin(
      ['auth', 'login', '--profile', 'staging'],
      deps
    );
    const openedUrl = await waitForServer(getCapturedUrl);
    const port = extractPort(openedUrl);

    await httpGet(
      `http://127.0.0.1:${port}/callback?code=XYZ&state=${fixedState}`
    );

    const result = await loginPromise;
    expect(result.profile).toBe('staging');
    expect(writeConfigDeps.writeFile).toHaveBeenCalled();
    const writeCall = writeConfigDeps.writeFile.mock.calls[0];
    const written = JSON.parse(writeCall[1] as string);
    expect(written.profiles.staging).toBeDefined();
  });

  it('--auth-url flag: opens browser with custom auth URL', async () => {
    const { getCapturedUrl, deps } = makeDeps({ timeout: 300 });

    const loginPromise = handleAuthLogin(
      ['auth', 'login', '--auth-url', 'http://localhost:3000'],
      deps
    );
    const openedUrl = await waitForServer(getCapturedUrl);

    expect(openedUrl).toContain('http://localhost:3000/authorize?');

    await loginPromise.catch(() => {
      // timeout cleanup
    });
  });

  it('--base-url flag: posts token exchange to custom base URL', async () => {
    const { fixedState, fetchMock, getCapturedUrl, deps } = makeDeps();

    const loginPromise = handleAuthLogin(
      ['auth', 'login', '--base-url', 'http://localhost:8080'],
      deps
    );
    const openedUrl = await waitForServer(getCapturedUrl);
    const port = extractPort(openedUrl);

    await httpGet(
      `http://127.0.0.1:${port}/callback?code=XYZ&state=${fixedState}`
    );
    await loginPromise;

    expect(fetchMock.calls[0].url).toBe(
      'http://localhost:8080/api/v1/oauth/token'
    );
  });

  it('openBrowser failure with successful callback still works', async () => {
    let capturedPort = 0;
    const fixedState = 'a'.repeat(64);
    const fixedVerifier = 'v'.repeat(43);
    const writeConfigDeps = makeWriteConfigDeps();
    const fetchMock = makeFetchMock();

    const deps = {
      generateState: () => fixedState,
      generateCodeVerifier: () => fixedVerifier,
      openBrowser: vi.fn().mockRejectedValue(new Error('no browser')),
      writeConfigDeps,
      timeout: 2000,
      log: () => {},
      fetch: fetchMock.fn,
      createServer: (handler: http.RequestListener) => {
        const server = http.createServer(handler);
        const origListen = server.listen.bind(server);
        server.listen = ((...listenArgs: unknown[]) => {
          const cb = listenArgs[2] as () => void;
          return origListen(listenArgs[0], listenArgs[1], () => {
            const addr = server.address() as { port: number };
            capturedPort = addr.port;
            cb();
          });
        }) as typeof server.listen;
        return server;
      },
    };

    const loginPromise = handleAuthLogin(['auth', 'login'], deps);
    await new Promise((r) => setTimeout(r, 100));

    expect(capturedPort).toBeGreaterThan(0);

    const res = await httpGet(
      `http://127.0.0.1:${capturedPort}/callback?code=XYZ&state=${fixedState}`
    );
    expect(res.statusCode).toBe(200);

    const result = await loginPromise;
    expect(result).toEqual({
      status: 'logged_in',
      apiKey: 'alva_test123',
      profile: 'default',
    });
  });

  it('server listen error: rejects with error', async () => {
    const { deps } = makeDeps({
      createServer: (handler: http.RequestListener) => {
        const server = http.createServer(handler);
        const origListen = server.listen.bind(server);
        server.listen = ((...listenArgs: unknown[]) => {
          origListen(listenArgs[0], listenArgs[1], () => {
            server.emit('error', new Error('EADDRINUSE'));
          });
          return server;
        }) as typeof server.listen;
        return server;
      },
    });

    await expect(handleAuthLogin(['auth', 'login'], deps)).rejects.toThrow(
      'EADDRINUSE'
    );
  });
});
