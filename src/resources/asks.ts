import type { AlvaClient } from '../client.js';
import { AlvaError, responseError } from '../error.js';
import { v2Path, type Schema } from '../platformApi.js';

/** Waits between polls of an ask: 1, 2 and 4 s, then every 5 s. */
const POLL_DELAYS_MS = [1_000, 2_000, 4_000];
const POLL_INTERVAL_MS = 5_000;
/** An ask runs for at most 35 minutes. */
const WAIT_LIMIT_MS = 35 * 60_000;

export interface AskWaitOptions {
  /** Ends the wait early with NETWORK_ABORTED. */
  signal?: AbortSignal;
}

/**
 * Agent asks (AIP-151 long-running operations): `create` starts one and
 * answers at once with its AskOperation, `get` reads it, `wait` polls it
 * until it is done.
 */
export class AsksResource {
  constructor(private client: AlvaClient) {}

  /** Starts an ask (paid: a retry with the same `idempotencyKey` starts it once). */
  async create(
    body: Schema<'NewAsk'>,
    options: { idempotencyKey?: string } = {}
  ): Promise<Schema<'AskOperation'>> {
    this.client._requireAuth();
    return this.client._v2Request('POST', '/asks', {
      body,
      idempotencyKey: options.idempotencyKey,
    });
  }

  /** The operation as it is now; NOT_FOUND once its stream is gone. */
  async get(askOperationId: string): Promise<Schema<'AskOperation'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'GET',
      v2Path`/ask-operations/${askOperationId}`
    );
  }

  /**
   * Polls the operation until it is done and returns it with its response.
   * An operation that ended with an error throws that problem as an
   * AlvaError; one not done after 35 minutes is DEADLINE_EXCEEDED.
   */
  async wait(
    operation: Schema<'AskOperation'>,
    options: AskWaitOptions = {}
  ): Promise<Schema<'AskOperation'>> {
    const started = Date.now();
    let current = operation;
    for (let poll = 0; !current.done; poll += 1) {
      const delay = POLL_DELAYS_MS[poll] ?? POLL_INTERVAL_MS;
      if (Date.now() - started + delay > WAIT_LIMIT_MS) {
        throw new AlvaError(
          'DEADLINE_EXCEEDED',
          `ask ${current.id} is not done after 35 minutes`,
          504
        );
      }
      await pause(delay, options.signal ?? this.client.signal);
      current = await this.get(current.id);
    }
    if (current.error) {
      // The operation's problem, read by the one problem parser.
      throw await responseError(
        new Response(JSON.stringify(current.error), {
          status: current.error.status,
          headers: { 'content-type': 'application/problem+json' },
        })
      );
    }
    return current;
  }
}

function pause(ms: number, signal: AbortSignal | undefined): Promise<void> {
  const aborted = () =>
    new AlvaError('NETWORK_ABORTED', 'the ask wait was aborted', 0);
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(aborted());
    const onAbort = () => {
      clearTimeout(timer);
      reject(aborted());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
