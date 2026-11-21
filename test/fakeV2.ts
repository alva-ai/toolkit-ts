import { vi } from 'vitest';

/** One request the fake /api/v2 server received. */
export interface V2Call {
  method: string;
  /** Path below /api/v2, percent-encoded as sent. */
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body: unknown;
}

/** A route's answer: a JSON body (200), or a Response as is. */
type V2Handler = (call: V2Call) => unknown;

/** An RFC 9457 problem as the gateway writes it: every member present. */
export function problem(
  status: number,
  code: string,
  fields: Record<string, unknown> = {}
): Response {
  const reason = typeof fields.reason === 'string' ? fields.reason : null;
  return new Response(
    JSON.stringify({
      type: `https://alva.ai/problems/${(reason ?? code).toLowerCase().replaceAll('_', '-')}`,
      title: code,
      status,
      detail: `${code} detail`,
      code,
      reason,
      requiredPermission: null,
      invalidParams: null,
      retryAfter: null,
      ...fields,
    }),
    { status, headers: { 'content-type': 'application/problem+json' } }
  );
}

/**
 * Replaces fetch with a fake /api/v2 server whose routes are keyed
 * "METHOD /path" (the path below /api/v2, without the query). A handler may
 * be a list, answered in order. Any other request fails the test.
 */
export function fakeV2(routes: Record<string, V2Handler | V2Handler[]>): {
  calls: V2Call[];
  restore: () => void;
} {
  const original = globalThis.fetch;
  const calls: V2Call[] = [];
  const queues = new Map(
    Object.entries(routes).map(([key, h]) => [
      key,
      Array.isArray(h) ? [...h] : h,
    ])
  );
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input));
    if (!url.pathname.startsWith('/api/v2/')) {
      throw new Error(`unexpected request to ${url.pathname}`);
    }
    const text = typeof init?.body === 'string' ? init.body : undefined;
    const call: V2Call = {
      method: init?.method ?? 'GET',
      path: url.pathname.slice('/api/v2'.length),
      query: url.searchParams,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: text === undefined ? undefined : JSON.parse(text),
    };
    calls.push(call);
    const key = `${call.method} ${call.path}`;
    const entry = queues.get(key);
    const handler = Array.isArray(entry) ? entry.shift() : entry;
    if (!handler) throw new Error(`no fake route for ${key}`);
    const answer = handler(call);
    if (answer instanceof Response) return answer;
    return new Response(JSON.stringify(answer), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { calls, restore: () => void (globalThis.fetch = original) };
}
