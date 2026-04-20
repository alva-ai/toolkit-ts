import type { AlvaClient } from '../client.js';
import type {
  EnsureArraysJwtResponse,
  ArraysJwtStatusResponse,
} from '../types.js';

export class ArraysJwtResource {
  constructor(private client: AlvaClient) {}

  /** Idempotently sign-or-renew the Arrays JWT server-side. */
  async ensure(): Promise<EnsureArraysJwtResponse> {
    this.client._requireAuth();
    return this.client._request(
      'POST',
      '/api/v1/arrays-jwt/ensure'
    ) as Promise<EnsureArraysJwtResponse>;
  }

  /** Report the current Arrays JWT state for the authenticated user. */
  async status(): Promise<ArraysJwtStatusResponse> {
    this.client._requireAuth();
    return this.client._request(
      'GET',
      '/api/v1/arrays-jwt/status'
    ) as Promise<ArraysJwtStatusResponse>;
  }
}
