import { describe, it, expect, vi } from 'vitest';
import { handleAuthLoginNoBrowser } from '../../src/cli/auth.js';
import { deriveChallenge } from '../../src/cli/pkce.js';

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

function makeBaseDeps(overrides: {
  readlineLines?: string[];
  fetchResponses?: MockFetchResponse[];
  fetchFn?: (
    url: string,
    init?: FetchCall['init']
  ) => Promise<unknown>;
  oobRedirectUrl?: string;
  log?: (msg: string) => void;
} = {}) {
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
    },
  };
}

describe('handleAuthLoginNoBrowser (PKCE Mode B)', () => {
  it('happy path: prompts for code, exchanges, writes config; strips dashes', async () => {
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
    expect(writeConfigDeps.writeFile).toHaveBeenCalledTimes(1);

    // fetch called once with stripped code
    expect(fetchMock.calls).toHaveLength(1);
    const call = fetchMock.calls[0];
    expect(call.url).toBe('https://api-llm.prd.alva.ai/oauth/token');
    expect(call.init?.method).toBe('POST');
    const body = JSON.parse(call.init?.body ?? '{}');
    expect(body).toEqual({
      grant_type: 'authorization_code',
      code: 'ABCDEFGH',
      code_verifier: fixedVerifier,
      redirect_uri: 'https://alva.ai/oauth/code/callback',
      client_id: 'alva-cli',
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

  it('paste retry: empty line then valid code; invalid_grant then success', async () => {
    const { writeConfigDeps, readline, deps } = makeBaseDeps({
      readlineLines: ['', 'ABCD-EFGH'],
      fetchResponses: [invalidGrantResponse(), happyResponse()],
    });

    const result = await handleAuthLoginNoBrowser(['auth', 'login'], deps);

    expect(result.status).toBe('logged_in');
    expect(writeConfigDeps.writeFile).toHaveBeenCalledTimes(1);
    // readline called twice (empty then valid)
    expect(readline.getCallCount()).toBeGreaterThanOrEqual(2);
  });

  it('3 retries exhausted: throws and writeConfig NOT called', async () => {
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

    expect(writeConfigDeps.writeFile).not.toHaveBeenCalled();
    // Should not have attempted a 4th exchange
    expect(fetchMock.calls.length).toBeLessThanOrEqual(3);
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

    expect(writeConfigDeps.writeFile).not.toHaveBeenCalled();
    // Only one exchange attempt for a non-invalid_grant failure
    expect(fetchMock.calls).toHaveLength(1);
    expect(readline.getCallCount()).toBe(1);
  });
});
