import { describe, it, expect, vi } from 'vitest';
import { handleAuthLoginNoBrowser } from '../../src/cli/auth.js';
import { loadConfig } from '../../src/cli/config.js';
import { deriveChallenge } from '../../src/cli/pkce.js';

const CONFIG_PATH = '/home/test/.config/alva/config.json';

function makeWriteConfigDeps() {
  return {
    env: {} as Record<string, string | undefined>,
    homedir: () => '/home/test',
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      ),
  };
}

// The API keys each config write stored, oldest first. Login rewrites the
// config unchanged before it signs in, so a write alone does not mean a key
// was saved.
function savedKeys(deps: ReturnType<typeof makeWriteConfigDeps>): string[] {
  return deps.writeFile.mock.calls.flatMap(([, data]) =>
    Object.values(
      (
        JSON.parse(data as string) as {
          profiles: Record<string, { apiKey?: string }>;
        }
      ).profiles
    ).flatMap((profile) => (profile.apiKey ? [profile.apiKey] : []))
  );
}

function lastWrite(deps: ReturnType<typeof makeWriteConfigDeps>): unknown {
  return JSON.parse(deps.writeFile.mock.calls.at(-1)![1] as string);
}

interface FetchCall {
  url: string;
  init?: { method?: string; headers?: Record<string, string>; body?: string };
}

interface MockFetchResponse {
  ok: boolean;
  status?: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}

function makeSequentialFetchMock(responses: MockFetchResponse[]) {
  const calls: FetchCall[] = [];
  let idx = 0;
  const fn = vi.fn(async (url: string, init?: FetchCall['init']) => {
    calls.push({ url, init });
    const r = responses[Math.min(idx, responses.length - 1)];
    idx++;
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 400),
      json: r.json ?? (async () => ({})),
      text: r.text ?? (async () => ''),
    } as unknown as Response;
  });
  return { fn, calls };
}

function makeReadlineMock(lines: string[]) {
  let idx = 0;
  const fn = vi.fn(async () => {
    const v = lines[Math.min(idx, lines.length - 1)];
    idx++;
    return v;
  });
  return { fn, getCallCount: () => idx };
}

function invalidGrantResponse(): MockFetchResponse {
  return {
    ok: false,
    status: 400,
    json: async () => ({
      error: 'invalid_grant',
      error_description: 'code did not match',
    }),
    text: async () =>
      JSON.stringify({
        error: 'invalid_grant',
        error_description: 'code did not match',
      }),
  };
}

function happyResponse(apiKey = 'alva_test123'): MockFetchResponse {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      api_key: apiKey,
      token_type: 'ApiKey',
      scope: 'cli',
    }),
  };
}

function makeBaseDeps(
  overrides: {
    readlineLines?: string[];
    fetchResponses?: MockFetchResponse[];
    fetchFn?: (url: string, init?: FetchCall['init']) => Promise<unknown>;
    oobRedirectUrl?: string;
    log?: (msg: string) => void;
  } = {}
) {
  const fixedState = 'a'.repeat(64);
  const fixedVerifier = 'v'.repeat(43);
  const fixedChallenge = deriveChallenge(fixedVerifier);
  const writeConfigDeps = makeWriteConfigDeps();

  const readline = makeReadlineMock(overrides.readlineLines ?? ['ABCD-EFGH']);

  let fetchMock: { fn: ReturnType<typeof vi.fn>; calls: FetchCall[] };
  if (overrides.fetchFn) {
    const calls: FetchCall[] = [];
    const fn = vi.fn(async (url: string, init?: FetchCall['init']) => {
      calls.push({ url, init });
      return overrides.fetchFn!(url, init) as unknown as Response;
    });
    fetchMock = { fn, calls };
  } else {
    fetchMock = makeSequentialFetchMock(
      overrides.fetchResponses ?? [happyResponse()]
    );
  }

  const logged: string[] = [];

  return {
    fixedState,
    fixedVerifier,
    fixedChallenge,
    writeConfigDeps,
    readline,
    fetchMock,
    logged,
    deps: {
      generateState: () => fixedState,
      generateCodeVerifier: () => fixedVerifier,
      // openBrowser and createServer are not used in Mode B; provide stubs
      // so the typed AuthLoginDeps shape is satisfied when shared.
      openBrowser: vi.fn().mockResolvedValue(undefined),
      createServer: vi.fn(),
      writeConfigDeps,
      timeout: 500,
      log: overrides.log ?? ((msg: string) => logged.push(msg)),
      fetch: fetchMock.fn,
      readline: readline.fn,
      oobRedirectUrl:
        overrides.oobRedirectUrl ?? 'https://alva.ai/oauth/code/callback',
      keyName: () => 'Mac mini',
    },
  };
}

describe('handleAuthLoginNoBrowser (PKCE Mode B)', () => {
  it('happy path: prompts for code, exchanges, writes config; preserves dashes', async () => {
    const {
      fixedState,
      fixedVerifier,
      fixedChallenge,
      writeConfigDeps,
      fetchMock,
      logged,
      deps,
    } = makeBaseDeps();

    const result = await handleAuthLoginNoBrowser(['auth', 'login'], deps);

    expect(result).toEqual({
      status: 'logged_in',
      apiKey: 'alva_test123',
      profile: 'default',
    });
    expect(lastWrite(writeConfigDeps)).toEqual({
      profiles: {
        default: {
          apiKey: 'alva_test123',
          baseUrl: 'https://api-llm.prd.alva.ai',
        },
      },
    });

    // fetch called once with the code verbatim (dash preserved — it's a
    // valid base64url character).
    expect(fetchMock.calls).toHaveLength(1);
    const call = fetchMock.calls[0];
    expect(call.url).toBe('https://api-llm.prd.alva.ai/api/v1/oauth/token');
    expect(call.init?.method).toBe('POST');
    const body = JSON.parse(call.init?.body ?? '{}');
    expect(body).toEqual({
      grant_type: 'authorization_code',
      code: 'ABCD-EFGH',
      code_verifier: fixedVerifier,
      redirect_uri: 'https://alva.ai/oauth/code/callback',
      client_id: 'alva-cli',
      name: 'Mac mini',
    });

    // Printed URL contains the PKCE params and OOB redirect_uri
    const printed = logged.join('');
    expect(printed).toMatch(/Open this URL/);
    // Extract a URL substring from the printed output
    const urlMatch = printed.match(/https?:\/\/\S+\/authorize\?\S+/);
    expect(urlMatch).not.toBeNull();
    const printedUrl = new URL(urlMatch![0]);
    expect(printedUrl.searchParams.get('response_type')).toBe('code');
    expect(printedUrl.searchParams.get('code_challenge')).toBe(fixedChallenge);
    expect(printedUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(printedUrl.searchParams.get('state')).toBe(fixedState);
    expect(printedUrl.searchParams.get('redirect_uri')).toBe(
      'https://alva.ai/oauth/code/callback'
    );
  });

  it('preserves dashes and underscores in code (base64url-valid chars)', async () => {
    // Real codes from base64.RawURLEncoding contain `-` and `_`. Earlier
    // versions stripped dashes and caused invalid_grant ~30% of the time.
    const code = 'abc-DEF_xyz';
    const { fetchMock, deps } = makeBaseDeps({
      readlineLines: [code],
    });

    const result = await handleAuthLoginNoBrowser(['auth', 'login'], deps);

    expect(result.status).toBe('logged_in');
    expect(fetchMock.calls).toHaveLength(1);
    const body = JSON.parse(fetchMock.calls[0].init?.body ?? '{}');
    expect(body.code).toBe(code);
  });

  it('paste retry: empty line then valid code; invalid_grant then success', async () => {
    const { writeConfigDeps, readline, deps } = makeBaseDeps({
      readlineLines: ['', 'ABCD-EFGH'],
      fetchResponses: [invalidGrantResponse(), happyResponse()],
    });

    const result = await handleAuthLoginNoBrowser(['auth', 'login'], deps);

    expect(result.status).toBe('logged_in');
    expect(savedKeys(writeConfigDeps)).toEqual(['alva_test123']);
    // readline called twice (empty then valid)
    expect(readline.getCallCount()).toBeGreaterThanOrEqual(2);
  });

  it('3 retries exhausted: throws and saves no key', async () => {
    const { writeConfigDeps, fetchMock, deps } = makeBaseDeps({
      readlineLines: ['BAD1', 'BAD2', 'BAD3', 'BAD4'],
      fetchResponses: [
        invalidGrantResponse(),
        invalidGrantResponse(),
        invalidGrantResponse(),
      ],
    });

    await expect(
      handleAuthLoginNoBrowser(['auth', 'login'], deps)
    ).rejects.toThrow(/alva auth login/);

    expect(savedKeys(writeConfigDeps)).toEqual([]);
    // Should not have attempted a 4th exchange
    expect(fetchMock.calls.length).toBeLessThanOrEqual(3);
  });

  it('derives oobRedirectUrl from --auth-url when not explicitly provided', async () => {
    // Drop the oobRedirectUrl override so the handler's derivation path
    // runs. Pass --auth-url stg; expect the stg-origin OOB URL.
    const { fetchMock, logged, deps } = makeBaseDeps();
    // Remove the test-helper's default to exercise the derive code path.
    delete (deps as { oobRedirectUrl?: string }).oobRedirectUrl;

    await handleAuthLoginNoBrowser(
      ['auth', 'login', '--auth-url', 'https://stg.alva.xyz'],
      deps
    );

    // Both the printed authorize URL and the exchange body should carry
    // the stg-origin OOB URL.
    const expected = 'https://stg.alva.xyz/oauth/code/callback';
    const body = JSON.parse(fetchMock.calls[0].init?.body ?? '{}');
    expect(body.redirect_uri).toBe(expected);

    const printedUrl = new URL(
      logged.join('').match(/https?:\/\/\S+\/authorize\?\S+/)![0]
    );
    expect(printedUrl.searchParams.get('redirect_uri')).toBe(expected);
  });

  it('explicit deps.oobRedirectUrl wins over derivation (test escape hatch)', async () => {
    const explicit = 'http://localhost:3001/oauth/code/callback';
    const { fetchMock, deps } = makeBaseDeps({
      oobRedirectUrl: explicit,
    });

    await handleAuthLoginNoBrowser(
      ['auth', 'login', '--auth-url', 'https://stg.alva.xyz'],
      deps
    );

    const body = JSON.parse(fetchMock.calls[0].init?.body ?? '{}');
    expect(body.redirect_uri).toBe(explicit);
  });

  it('network error: surfaced verbatim, no retry, no config written', async () => {
    const { writeConfigDeps, fetchMock, readline, deps } = makeBaseDeps({
      readlineLines: ['ABCD'],
      fetchFn: async () => {
        throw new Error('ECONNREFUSED upstream');
      },
    });

    await expect(
      handleAuthLoginNoBrowser(['auth', 'login'], deps)
    ).rejects.toThrow(/ECONNREFUSED upstream/);

    expect(savedKeys(writeConfigDeps)).toEqual([]);
    // Only one exchange attempt for a non-invalid_grant failure
    expect(fetchMock.calls).toHaveLength(1);
    expect(readline.getCallCount()).toBe(1);
  });

  it('saves --base-url with the key, so later commands on the profile reach it', async () => {
    const files = new Map<string, string>();
    const { writeConfigDeps, fetchMock, deps } = makeBaseDeps();
    writeConfigDeps.writeFile.mockImplementation(
      async (path: string, data: string) => {
        files.set(path, data);
      }
    );
    writeConfigDeps.readFile.mockImplementation(async (path: string) => {
      const data = files.get(path);
      if (data === undefined)
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return data;
    });

    await handleAuthLoginNoBrowser(
      [
        'auth',
        'login',
        '--profile',
        'agentlink-new',
        '--base-url',
        'https://api-llm.stg.alva.ai',
      ],
      deps
    );

    expect(fetchMock.calls[0].url).toBe(
      'https://api-llm.stg.alva.ai/api/v1/oauth/token'
    );
    const next = loadConfig({
      argv: ['whoami', '--profile', 'agentlink-new'],
      env: {},
      readFile: (path) => {
        const data = files.get(path);
        if (data === undefined) throw new Error('ENOENT');
        return data;
      },
      homedir: () => '/home/test',
    });
    expect(next.apiKey).toBe('alva_test123');
    expect(next.baseUrl).toBe('https://api-llm.stg.alva.ai');
  });

  it('a login without --base-url points the profile back at the default API', async () => {
    const existing =
      JSON.stringify({
        profiles: {
          default: {
            apiKey: 'alva_stg_old',
            baseUrl: 'https://api-llm.stg.alva.ai',
          },
        },
      }) + '\n';
    const { writeConfigDeps, deps } = makeBaseDeps();
    writeConfigDeps.readFile.mockResolvedValue(existing);

    await handleAuthLoginNoBrowser(['auth', 'login'], deps);

    // The writability check rewrites the file as it was.
    expect(writeConfigDeps.writeFile.mock.calls[0][1]).toBe(existing);
    expect(lastWrite(writeConfigDeps)).toEqual({
      profiles: {
        default: {
          apiKey: 'alva_test123',
          baseUrl: 'https://api-llm.prd.alva.ai',
        },
      },
    });
  });

  it('cannot write the config: fails before showing a URL or minting a key', async () => {
    const { writeConfigDeps, fetchMock, readline, logged, deps } =
      makeBaseDeps();
    writeConfigDeps.writeFile.mockRejectedValue(
      new Error('EPERM: operation not permitted')
    );

    await expect(
      handleAuthLoginNoBrowser(['auth', 'login'], deps)
    ).rejects.toThrow(
      `Cannot write ${CONFIG_PATH} (EPERM: operation not permitted)`
    );

    expect(fetchMock.calls).toHaveLength(0);
    expect(readline.getCallCount()).toBe(0);
    expect(logged.join('')).not.toMatch(/Open this URL/);
  });

  it('a config that exists but cannot be read is left alone', async () => {
    const { writeConfigDeps, fetchMock, readline, deps } = makeBaseDeps();
    writeConfigDeps.readFile.mockRejectedValue(
      Object.assign(new Error('EACCES: permission denied'), {
        code: 'EACCES',
      })
    );

    await expect(
      handleAuthLoginNoBrowser(['auth', 'login'], deps)
    ).rejects.toThrow(`Cannot read ${CONFIG_PATH} (EACCES: permission denied)`);

    expect(writeConfigDeps.writeFile).not.toHaveBeenCalled();
    expect(fetchMock.calls).toHaveLength(0);
    expect(readline.getCallCount()).toBe(0);
  });
});
