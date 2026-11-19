import { vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import type { AlvaClientConfig } from '../../src/types.js';
import type { V2RequestOptions } from '../../src/platformApi.js';

type Answer = unknown | ((options: V2RequestOptions) => unknown);

/**
 * An API-key client whose /api/v2 transport answers from `routes`, keyed
 * "METHOD /path" (the path relative to /api/v2, as resources pass it). A
 * function answer receives the request options; a thrown error rejects. Any
 * other request fails the test. `_v2Pages` runs on top of it unchanged.
 */
export function v2Client(
  routes: Record<string, Answer>,
  config: AlvaClientConfig = { apiKey: 'key' }
) {
  const client = new AlvaClient(config);
  const v2 = vi.fn(
    async (method: string, path: string, options: V2RequestOptions = {}) => {
      const key = `${method} ${path}`;
      if (!Object.hasOwn(routes, key)) throw new Error(`unexpected ${key}`);
      const answer = routes[key];
      return typeof answer === 'function'
        ? (answer as (o: V2RequestOptions) => unknown)(options)
        : structuredClone(answer);
    }
  );
  client._v2Request = v2 as unknown as AlvaClient['_v2Request'];
  const legacy = vi.fn(async () => {
    throw new Error('unexpected v1 request');
  });
  client._request = legacy as unknown as AlvaClient['_request'];
  return { client, v2, legacy };
}

/** The calls the transport received, as [method, path, options]. */
export function calls(v2: ReturnType<typeof v2Client>['v2']) {
  return v2.mock.calls.map(([method, path, options]) => [
    method,
    path,
    options ?? {},
  ]);
}
