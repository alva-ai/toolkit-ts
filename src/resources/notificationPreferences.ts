import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import type {
  NotificationPreferenceKey,
  NotificationPreferencesResponse,
  NotificationPreferenceUpdateParams,
  NotificationPreferenceUpdateResponse,
} from '../types.js';

/** GET and PATCH /api/v2/me/notification-preferences. */
interface WirePreferences {
  sessionCompleted: boolean | null;
}

const FIELDS: Record<NotificationPreferenceKey, keyof WirePreferences> = {
  session_completed: 'sessionCompleted',
};

export class NotificationPreferencesResource {
  constructor(private client: AlvaClient) {}

  /**
   * List the caller's notification preference settings. Server defaults
   * are included even when the caller has not explicitly stored a setting.
   */
  async list(): Promise<NotificationPreferencesResponse> {
    this.client._requireAuth();
    const prefs = await this.client._v2Request<WirePreferences>(
      'GET',
      '/me/notification-preferences'
    );
    return {
      settings:
        prefs.sessionCompleted === null
          ? []
          : [{ key: 'session_completed', enabled: prefs.sessionCompleted }],
    };
  }

  /**
   * Enable or disable one notification preference.
   */
  async update(
    params: NotificationPreferenceUpdateParams
  ): Promise<NotificationPreferenceUpdateResponse> {
    this.client._requireAuth();
    const field = Object.hasOwn(FIELDS, params.key)
      ? FIELDS[params.key]
      : undefined;
    if (field === undefined) {
      throw new AlvaError(
        'INVALID_ARGUMENT',
        `unknown notification preference ${JSON.stringify(params.key)}`,
        400
      );
    }
    const prefs = await this.client._v2Request<WirePreferences>(
      'PATCH',
      '/me/notification-preferences',
      { body: { [field]: params.enabled } }
    );
    return {
      setting: { key: params.key, enabled: prefs[field] ?? params.enabled },
    };
  }
}
