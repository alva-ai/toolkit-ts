import type { AlvaClient } from '../client.js';
import type { Schema } from '../platformApi.js';

export class UserResource {
  private username?: Promise<string>;

  constructor(private client: AlvaClient) {}

  /** The caller's account: username, plan, messaging bindings and home path. */
  async me(): Promise<Schema<'Me'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', '/me');
  }

  /**
   * @internal The caller's username, read once per client: resources rebuild
   * home-relative and `/alva/home/<username>/…` paths with it.
   */
  _username(): Promise<string> {
    this.username ??= this.client._v2Request<Schema<'Me'>>('GET', '/me').then(
      (me) => me.username,
      (error: unknown) => {
        this.username = undefined;
        throw error;
      }
    );
    return this.username;
  }
}
