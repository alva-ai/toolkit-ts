import type { AlvaClient } from '../client.js';
import type {
  NotificationPreferencesResponse,
  NotificationPreferenceUpdateParams,
  NotificationPreferenceUpdateResponse,
} from '../types.js';

export class NotificationPreferencesResource {
  constructor(private client: AlvaClient) {}

  /**
   * List the caller's notification preference settings. Server defaults
   * are included even when the caller has not explicitly stored a setting.
   */
  async list(): Promise<NotificationPreferencesResponse> {
    this.client._requireAuth();
    return this.client._request(
      'GET',
      '/api/v1/me/notifications/preferences'
    ) as Promise<NotificationPreferencesResponse>;
  }

  /**
   * Enable or disable one notification preference.
   */
  async update(
    params: NotificationPreferenceUpdateParams
  ): Promise<NotificationPreferenceUpdateResponse> {
    this.client._requireAuth();
    return this.client._request(
      'PATCH',
      `/api/v1/me/notifications/preferences/${encodeURIComponent(params.key)}`,
      {
        body: { enabled: params.enabled },
      }
    ) as Promise<NotificationPreferenceUpdateResponse>;
  }
}
