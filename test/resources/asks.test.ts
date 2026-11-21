import { afterEach, describe, it, expect, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import type { Schema } from '../../src/platformApi.js';
import { fakeV2 } from '../fakeV2.js';
import { v2 } from '../v2Schema.js';

const ID = 'ask_operation_0a';

function operation(
  overrides: Partial<Schema<'AskOperation'>> = {}
): Schema<'AskOperation'> {
  return v2('AskOperation', {
    id: ID,
    done: false,
    metadata: { sessionId: 'session_0s', createdAt: '2026-11-20T09:00:00Z' },
    response: null,
    error: null,
    ...overrides,
  });
}

const DONE = { done: true, response: { text: 'NVDA beat.' } };

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  vi.useRealTimers();
});

function client() {
  return new AlvaClient({ apiKey: 'key', baseUrl: 'https://api.test' });
}

/** A fetch whose requests never answer and fail only when their signal aborts. */
function stallingFetch(): Promise<void> {
  const original = globalThis.fetch;
  restore = () => void (globalThis.fetch = original);
  let polled!: () => void;
  const polling = new Promise<void>((resolve) => (polled = resolve));
  globalThis.fetch = vi.fn(
    (_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        polled();
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError'))
        );
      })
  ) as unknown as typeof fetch;
  return polling;
}

describe('AsksResource', () => {
  it('create() posts the NewAsk with a key and returns the 202 AskOperation', async () => {
    const fake = fakeV2({
      'POST /asks': () =>
        new Response(JSON.stringify(operation()), {
          status: 202,
          headers: {
            'content-type': 'application/json',
            location: `/api/v2/ask-operations/${ID}`,
          },
        }),
    });
    restore = fake.restore;
    expect(
      await client().asks.create(
        { prompt: 'How did NVDA do?' },
        { idempotencyKey: 'ask-1' }
      )
    ).toEqual(operation());
    expect(fake.calls[0].body).toEqual({ prompt: 'How did NVDA do?' });
    expect(fake.calls[0].headers['Idempotency-Key']).toBe('"ask-1"');
  });

  it('wait() polls after 1, 2 and 4 s, then every 5 s, until done', async () => {
    vi.useFakeTimers({ now: 0 });
    const polledAt: number[] = [];
    const answers = [operation(), operation(), operation(), operation()];
    const fake = fakeV2({
      [`GET /ask-operations/${ID}`]: () => {
        polledAt.push(Date.now());
        return answers.shift() ?? operation(DONE);
      },
    });
    restore = fake.restore;
    const waiting = client().asks.wait(operation());
    await vi.advanceTimersByTimeAsync(1_000 + 2_000 + 4_000 + 5_000 + 5_000);
    expect(await waiting).toEqual(operation(DONE));
    expect(polledAt).toEqual([1_000, 3_000, 7_000, 12_000, 17_000]);
  });

  it('wait() returns a done operation without polling', async () => {
    const fake = fakeV2({});
    restore = fake.restore;
    expect(await client().asks.wait(operation(DONE))).toEqual(operation(DONE));
    expect(fake.calls).toHaveLength(0);
  });

  it('wait() throws the problem of an operation that failed', async () => {
    const failed = operation({
      done: true,
      error: {
        type: 'https://alva.ai/problems/internal',
        title: 'INTERNAL',
        status: 500,
        detail: 'the agent turn failed',
        code: 'INTERNAL',
        reason: null,
        requiredPermission: null,
        invalidParams: null,
        retryAfter: null,
      },
    });
    restore = fakeV2({}).restore;
    await expect(client().asks.wait(failed)).rejects.toMatchObject({
      code: 'INTERNAL',
      status: 500,
      message: 'the agent turn failed',
    });
  });

  it('wait() ends a stalled poll when its signal aborts', async () => {
    const polling = stallingFetch();
    const controller = new AbortController();
    const waiting = client().asks.wait(operation(), {
      signal: controller.signal,
    });
    const outcome = expect(waiting).rejects.toMatchObject({
      code: 'NETWORK_ABORTED',
      message: 'the ask wait was aborted',
    });
    await polling;
    controller.abort();
    await outcome;
  });

  it('wait() with an aborted signal polls nothing', async () => {
    const fake = fakeV2({});
    restore = fake.restore;
    await expect(
      client().asks.wait(operation(), { signal: AbortSignal.abort() })
    ).rejects.toMatchObject({ code: 'NETWORK_ABORTED' });
    expect(fake.calls).toHaveLength(0);
  });

  it('wait() rejects a poll answered after its signal aborted', async () => {
    const controller = new AbortController();
    const fake = fakeV2({
      [`GET /ask-operations/${ID}`]: () => {
        controller.abort();
        return operation(DONE);
      },
    });
    restore = fake.restore;
    await expect(
      client().asks.wait(operation(), { signal: controller.signal })
    ).rejects.toMatchObject({ code: 'NETWORK_ABORTED' });
    expect(fake.calls).toHaveLength(1);
  });

  it('wait() ends a poll still in flight at 35 minutes with DEADLINE_EXCEEDED', async () => {
    vi.useFakeTimers({ now: 0 });
    stallingFetch();
    const waiting = client().asks.wait(operation());
    const outcome = expect(waiting).rejects.toMatchObject({
      code: 'DEADLINE_EXCEEDED',
      status: 504,
    });
    await vi.advanceTimersByTimeAsync(35 * 60_000);
    await outcome;
  });

  it('wait() gives up after 35 minutes with DEADLINE_EXCEEDED', async () => {
    vi.useFakeTimers({ now: 0 });
    const fake = fakeV2({ [`GET /ask-operations/${ID}`]: () => operation() });
    restore = fake.restore;
    const waiting = client().asks.wait(operation());
    const outcome = expect(waiting).rejects.toMatchObject({
      code: 'DEADLINE_EXCEEDED',
    });
    await vi.advanceTimersByTimeAsync(35 * 60_000);
    await outcome;
    expect(fake.calls.length).toBe(
      3 + Math.floor((35 * 60_000 - 7_000) / 5_000)
    );
  });
});
