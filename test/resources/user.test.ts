import { afterEach, describe, it, expect } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { aMe } from '../accountV2.js';
import { fakeV2, problem } from '../fakeV2.js';

let restore: (() => void) | undefined;
afterEach(() => restore?.());

function client() {
  return new AlvaClient({ apiKey: 'key', baseUrl: 'https://api.test' });
}

describe('UserResource', () => {
  it('me() returns the /api/v2 Me as the route answers it', async () => {
    const fake = fakeV2({ 'GET /me': () => aMe() });
    restore = fake.restore;
    expect(await client().user.me()).toEqual(aMe());
    expect(fake.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /me']);
  });

  it('_username() reads the account once and retries after a failure', async () => {
    const fake = fakeV2({
      'GET /me': [() => problem(400, 'INVALID_ARGUMENT'), () => aMe()],
    });
    restore = fake.restore;
    const c = client();
    await expect(c.user._username()).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    expect(await c.user._username()).toBe('alice');
    expect(await c.user._username()).toBe('alice');
    expect(fake.calls).toHaveLength(2);
  });
});
