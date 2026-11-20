import type { AlvaClient } from '../client.js';
import type { Schema } from '../platformApi.js';

/** The data-skills token (the Arrays JWT), which Backend keeps. */
export class ArraysJwtResource {
  constructor(private client: AlvaClient) {}

  /** Signs the token, or renews it when renewal is due. */
  async ensure(): Promise<Schema<'DataSkillsTokenRefresh'>> {
    this.client._requireAuth();
    return this.client._v2Request('POST', '/me/data-skills-token/refresh');
  }

  /** The token's state for the authenticated user. */
  async status(): Promise<Schema<'DataSkillsToken'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', '/me/data-skills-token');
  }
}
