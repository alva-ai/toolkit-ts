import { request } from 'undici';
import { describe, expect, it } from 'vitest';

// test/setup/no-network.ts. The target is a TEST-NET-1 address (RFC 5737), so
// a missing guard fails by timing out, not by reaching a server.
const TARGET = 'http://192.0.2.1/api/v2/me';

describe('the no-network test setup', () => {
  it('refuses global fetch', async () => {
    await expect(fetch(TARGET)).rejects.toThrow(
      `test tried to reach the network (${TARGET})`
    );
  });

  it("refuses requests through undici's global dispatcher", async () => {
    await expect(request(TARGET)).rejects.toThrow(
      `test tried to reach the network (GET http://192.0.2.1/api/v2/me)`
    );
  });
});
