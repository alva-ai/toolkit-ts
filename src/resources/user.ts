import type { AlvaClient } from '../client.js';
import type { UserProfile } from '../types.js';

export class UserResource {
  constructor(private client: AlvaClient) {}

  async me(): Promise<UserProfile> {
    this.client._requireAuth();
    return this.client._request('GET', '/api/v1/me') as Promise<UserProfile>;
  }
}
