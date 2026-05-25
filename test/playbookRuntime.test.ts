import { beforeEach, describe, expect, it, vi } from 'vitest';

type MessageListener = (event: MessageEvent) => void;

type FakeWindow = {
  location: URL;
  history: { replaceState: ReturnType<typeof vi.fn> };
  parent: { postMessage: ReturnType<typeof vi.fn> };
  alva?: {
    udf?: {
      call: <TResult = unknown>(
        functionName: string,
        params: unknown
      ) => Promise<TResult>;
      list: () => Promise<Array<{ name: string; params_schema: unknown }>>;
      getViewerToken: () => string | null;
      UdfConsentDeniedError: new () => Error;
    };
  };
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  dispatchMessage: (event: Partial<MessageEvent>) => void;
};

function tokenWithPid(pid: string): string {
  const payload = Buffer.from(JSON.stringify({ type: 'pbsv', pid })).toString(
    'base64url'
  );
  return `header.${payload}.sig`;
}

function installFakeWindow(url: string): FakeWindow {
  const listeners: MessageListener[] = [];
  const fake: FakeWindow = {
    location: new URL(url),
    history: {
      replaceState: vi.fn((_state, _title, nextUrl: string) => {
        fake.location = new URL(nextUrl, fake.location.origin);
      }),
    },
    parent: { postMessage: vi.fn() },
    addEventListener: vi.fn((type: string, listener: MessageListener) => {
      if (type === 'message') listeners.push(listener);
    }),
    removeEventListener: vi.fn(),
    dispatchMessage: (event: Partial<MessageEvent>) => {
      for (const listener of listeners) {
        listener(event as MessageEvent);
      }
    },
  };
  vi.stubGlobal('window', fake);
  vi.stubGlobal('location', fake.location);
  vi.stubGlobal('history', fake.history);
  return fake;
}

function mockJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('playbook runtime SDK', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('boots from URL params, strips only _pbsv, and exposes alva.udf', async () => {
    const token = tokenWithPid('42');
    const fake = installFakeWindow(
      `https://alice.playbook.alva.ai/demo/v1?x=1&_pbsv=${token}&parent_origin=https%3A%2F%2Falva.ai`
    );
    const runtime = await import('../src/playbookRuntime.js');

    runtime.installPlaybookRuntime();

    expect(runtime.getViewerToken()).toBe(token);
    expect(fake.alva?.udf?.getViewerToken()).toBe(token);
    expect(fake.history.replaceState).toHaveBeenCalledWith(
      null,
      '',
      '/demo/v1?x=1&parent_origin=https%3A%2F%2Falva.ai'
    );
  });

  it('accepts pbsv refresh messages only from the expected parent', async () => {
    const oldToken = tokenWithPid('42');
    const newToken = tokenWithPid('84');
    const fake = installFakeWindow(
      `https://alice.playbook.alva.ai/demo/v1?_pbsv=${oldToken}&parent_origin=https%3A%2F%2Falva.ai`
    );
    const runtime = await import('../src/playbookRuntime.js');
    runtime.installPlaybookRuntime();

    fake.dispatchMessage({
      origin: 'https://evil.example',
      source: fake.parent as Window,
      data: { type: 'alva:pbsv:update', token: newToken },
    });
    expect(runtime.getViewerToken()).toBe(oldToken);

    fake.dispatchMessage({
      origin: 'https://alva.ai',
      source: fake.parent as Window,
      data: { type: 'alva:pbsv:update', token: newToken },
    });
    expect(runtime.getViewerToken()).toBe(newToken);
  });

  it('sends UDF invoke with pbsv headers and double-serialized params', async () => {
    const token = tokenWithPid('42');
    installFakeWindow(
      `https://alice.playbook.alva.ai/demo/v1?_pbsv=${token}&parent_origin=https%3A%2F%2Falva.ai&api_origin=https%3A%2F%2Fapi.test`
    );
    const fetch = vi
      .fn()
      .mockResolvedValue(mockJsonResponse({ result: { ok: true } }));
    vi.stubGlobal('fetch', fetch);
    const runtime = await import('../src/playbookRuntime.js');
    runtime.installPlaybookRuntime();

    const result = await runtime.udf.call('analyze', { ticker: 'AAPL' });

    expect(result).toEqual({ ok: true });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.test/api/v1/service/invoke');
    expect(init.headers.Authorization).toBe(`Bearer ${token}`);
    expect(init.headers['X-Pbsv']).toBe('1');
    expect(JSON.parse(init.body)).toEqual({
      playbook_id: '42',
      function_name: 'analyze',
      parameters_json: JSON.stringify({ ticker: 'AAPL' }),
    });
  });

  it('requests parent consent on CONSENT_REQUIRED and retries once when granted', async () => {
    const token = tokenWithPid('42');
    const fake = installFakeWindow(
      `https://alice.playbook.alva.ai/demo/v1?_pbsv=${token}&parent_origin=https%3A%2F%2Falva.ai`
    );
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        mockJsonResponse(
          {
            error: {
              code: 'CONSENT_REQUIRED',
              message: 'consent needed',
            },
            details: {
              metadata: {
                playbook_id: '42',
                min_allowance_suggested: 3,
              },
            },
          },
          402
        )
      )
      .mockResolvedValueOnce(mockJsonResponse({ result: 'done' }));
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('crypto', { randomUUID: () => 'request-1' });
    const runtime = await import('../src/playbookRuntime.js');
    runtime.installPlaybookRuntime();

    const pending = runtime.udf.call('analyze', { ticker: 'AAPL' });
    await vi.waitFor(() => {
      expect(fake.parent.postMessage).toHaveBeenCalledWith(
        {
          type: 'alva:udf:consent-request',
          request_id: 'request-1',
          playbook_id: '42',
          min_allowance: 3,
        },
        'https://alva.ai'
      );
    });
    fake.dispatchMessage({
      origin: 'https://alva.ai',
      source: fake.parent as Window,
      data: {
        type: 'alva:udf:consent-response',
        request_id: 'request-1',
        granted: true,
      },
    });

    await expect(pending).resolves.toBe('done');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('maps backend sentinel errors to typed errors', async () => {
    const token = tokenWithPid('42');
    installFakeWindow(
      `https://alice.playbook.alva.ai/demo/v1?_pbsv=${token}&parent_origin=https%3A%2F%2Falva.ai`
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonResponse(
          {
            error: {
              code: 'FUNCTION_NOT_FOUND',
              message: 'missing function',
              metadata: { function_name: 'missing' },
            },
          },
          404
        )
      )
    );
    const runtime = await import('../src/playbookRuntime.js');
    runtime.installPlaybookRuntime();

    await expect(runtime.udf.call('missing', {})).rejects.toBeInstanceOf(
      runtime.UdfFunctionNotFoundError
    );
  });

  it('renders a UDF button that invokes the function and emits result events', async () => {
    const token = tokenWithPid('42');
    const fake = installFakeWindow(
      `https://alice.playbook.alva.ai/demo/v1?_pbsv=${token}&parent_origin=https%3A%2F%2Falva.ai&api_origin=https%3A%2F%2Fapi.test`
    ) as FakeWindow & {
      document: { createElement: (tagName: string) => HTMLButtonElement };
    };
    const clickHandlers: Array<() => Promise<void>> = [];
    const dispatched: Array<{ type: string; detail: unknown }> = [];
    const button = {
      type: '',
      className: '',
      textContent: '',
      disabled: false,
      attributes: new Map<string, string>(),
      setAttribute: vi.fn((name: string, value: string) => {
        button.attributes.set(name, value);
      }),
      addEventListener: vi.fn((type: string, listener: () => Promise<void>) => {
        if (type === 'click') clickHandlers.push(listener);
      }),
      dispatchEvent: vi.fn((event: { type: string; detail: unknown }) => {
        dispatched.push(event);
        return true;
      }),
    };
    const container = {
      children: [] as unknown[],
      appendChild: vi.fn((node: unknown) => container.children.push(node)),
    };
    fake.document = {
      createElement: vi.fn(() => button as unknown as HTMLButtonElement),
    };
    vi.stubGlobal(
      'CustomEvent',
      class {
        type: string;
        detail: unknown;
        constructor(type: string, init?: { detail?: unknown }) {
          this.type = type;
          this.detail = init?.detail;
        }
      }
    );
    const fetch = vi
      .fn()
      .mockResolvedValue(mockJsonResponse({ result: { ok: true } }));
    vi.stubGlobal('fetch', fetch);
    const runtime = await import('../src/playbookRuntime.js');
    runtime.installPlaybookRuntime();

    const rendered = runtime.udf.renderButton(
      container as unknown as HTMLElement,
      {
        functionName: 'analyze',
        params: { ticker: 'MSFT' },
        label: 'Run analysis',
      }
    );

    expect(rendered).toBe(button);
    expect(container.children).toEqual([button]);
    expect(button.textContent).toBe('Run analysis');
    expect(button.disabled).toBe(false);

    await clickHandlers[0]();

    expect(fetch).toHaveBeenCalledWith(
      'https://api.test/api/v1/service/invoke',
      expect.objectContaining({
        body: JSON.stringify({
          playbook_id: '42',
          function_name: 'analyze',
          parameters_json: JSON.stringify({ ticker: 'MSFT' }),
        }),
      })
    );
    expect(dispatched.map((event) => event.type)).toEqual([
      'alva:udf-button:loading',
      'alva:udf-button:result',
    ]);
    expect(button.textContent).toBe('Run analysis');
    expect(button.disabled).toBe(false);
  });
});
