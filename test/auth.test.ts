import { describe, it, expect, vi } from 'vitest';
import { generateState, handleAuthLogin } from '../src/cli/auth.js';
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

function makeDeps(overrides: Record<string, unknown> = {}) {
  const fixedState = 'a'.repeat(64);
  const writeConfigDeps = makeWriteConfigDeps();
  let capturedUrl = '';
  return {
    fixedState,
    writeConfigDeps,
    getCapturedUrl: () => capturedUrl,
    deps: {
      generateState: () => fixedState,
      openBrowser: vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url;
      }),
      writeConfigDeps,
      timeout: 500,
      log: () => {},
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
  const callbackUrl = url.searchParams.get('callback_url') ?? '';
  return new URL(callbackUrl).port;
}

describe('handleAuthLogin', () => {
  it('happy path: resolves with logged_in status when callback has valid api_key and state', async () => {
    const { fixedState, writeConfigDeps, getCapturedUrl, deps } = makeDeps();

    const loginPromise = handleAuthLogin(['auth', 'login'], deps);
    const openedUrl = await waitForServer(getCapturedUrl);
    const port = extractPort(openedUrl);

    const res = await httpGet(
      `http://127.0.0.1:${port}/callback?api_key=alva_abc&state=${fixedState}`
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Success');

    const result = await loginPromise;
    expect(result).toEqual({
      status: 'logged_in',
      apiKey: 'alva_abc',
      profile: 'default',
    });
    expect(writeConfigDeps.writeFile).toHaveBeenCalled();
  });

  it('state mismatch: responds 400 and promise stays pending', async () => {
    const { getCapturedUrl, deps } = makeDeps({ timeout: 300 });

    const loginPromise = handleAuthLogin(['auth', 'login'], deps);
    const openedUrl = await waitForServer(getCapturedUrl);
    const port = extractPort(openedUrl);

    const res = await httpGet(
      `http://127.0.0.1:${port}/callback?api_key=alva_abc&state=wrong`
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('State mismatch');

    // Promise should not have resolved — race with a short timeout
    const raceResult = await Promise.race([
      loginPromise.then(() => 'resolved'),
      new Promise<string>((r) => setTimeout(() => r('pending'), 100)),
    ]);
    expect(raceResult).toBe('pending');

    // Clean up: wait for the timeout rejection
    await loginPromise.catch(() => {
      // Expected timeout
    });
  });

  it('missing api_key: responds 400 and promise stays pending', async () => {
    const { fixedState, getCapturedUrl, deps } = makeDeps({ timeout: 300 });

    const loginPromise = handleAuthLogin(['auth', 'login'], deps);
    const openedUrl = await waitForServer(getCapturedUrl);
    const port = extractPort(openedUrl);

    const res = await httpGet(
      `http://127.0.0.1:${port}/callback?state=${fixedState}`
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('Missing API key');

    const raceResult = await Promise.race([
      loginPromise.then(() => 'resolved'),
      new Promise<string>((r) => setTimeout(() => r('pending'), 100)),
    ]);
    expect(raceResult).toBe('pending');

    await loginPromise.catch(() => {
      // Expected timeout
    });
  });

  it('timeout: rejects with timeout error when no callback received', async () => {
    const { deps } = makeDeps({ timeout: 100 });

    await expect(
      handleAuthLogin(['auth', 'login'], deps)
    ).rejects.toThrow('Login timed out waiting for callback');
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
      `http://127.0.0.1:${port}/callback?api_key=alva_abc&state=${fixedState}`
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

    expect(openedUrl).toContain('http://localhost:3000/apikey?');

    await loginPromise.catch(() => {
      // Timeout cleanup
    });
  });

  it('openBrowser success: exec called with URL', async () => {
    const { getCapturedUrl, deps } = makeDeps({ timeout: 300 });

    const loginPromise = handleAuthLogin(['auth', 'login'], deps);
    await waitForServer(getCapturedUrl);

    expect(deps.openBrowser).toHaveBeenCalledTimes(1);
    const url = deps.openBrowser.mock.calls[0][0] as string;
    expect(url).toContain('/apikey?');
    expect(url).toContain('callback_url=');
    expect(url).toContain('state=');

    await loginPromise.catch(() => {
      // Timeout cleanup
    });
  });

  it('openBrowser failure with successful callback still works', async () => {
    let capturedPort = 0;
    const fixedState = 'a'.repeat(64);
    const writeConfigDeps = makeWriteConfigDeps();

    const deps = {
      generateState: () => fixedState,
      openBrowser: vi.fn().mockRejectedValue(new Error('no browser')),
      writeConfigDeps,
      timeout: 2000,
      log: () => {},
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

    // Server started despite browser error
    expect(capturedPort).toBeGreaterThan(0);

    // Callback still works
    const res = await httpGet(
      `http://127.0.0.1:${capturedPort}/callback?api_key=alva_key&state=${fixedState}`
    );
    expect(res.statusCode).toBe(200);

    const result = await loginPromise;
    expect(result).toEqual({
      status: 'logged_in',
      apiKey: 'alva_key',
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

    await expect(
      handleAuthLogin(['auth', 'login'], deps)
    ).rejects.toThrow('EADDRINUSE');
  });
});
