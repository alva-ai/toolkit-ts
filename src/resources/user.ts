import type { AlvaClient } from '../client.js';
import type { AlvaId, UserProfile } from '../types.js';

type MessagingApp = 'TELEGRAM' | 'DISCORD' | 'SLACK' | 'WHATSAPP' | 'IMESSAGE';

/** GET /api/v2/me. */
interface WireMe {
  id: AlvaId;
  username: string;
  planTier: 'FREE' | 'PRO' | 'MAX';
  messagingBindings: { app: MessagingApp; displayName: string | null }[];
  preferredMessagingApp: MessagingApp | null;
  toolkitMinVersion: string;
  homePath: string;
}

export class UserResource {
  private username?: Promise<string>;

  constructor(private client: AlvaClient) {}

  async me(): Promise<UserProfile> {
    this.client._requireAuth();
    const me = await this.client._v2Request<WireMe>('GET', '/me');
    const binding = (app: MessagingApp) =>
      me.messagingBindings.find((b) => b.app === app)?.displayName ?? '';
    return {
      id: me.id,
      username: me.username,
      subscription_tier:
        me.planTier.toLowerCase() as UserProfile['subscription_tier'],
      telegram_username: binding('TELEGRAM'),
      discord_username: binding('DISCORD'),
      slack_username: binding('SLACK'),
      whatsapp_username: binding('WHATSAPP'),
      imessage_username: binding('IMESSAGE'),
      active_channel: me.preferredMessagingApp?.toLowerCase() ?? '',
      toolkit_min_version: me.toolkitMinVersion,
      home_path: me.homePath,
    };
  }

  /**
   * @internal The caller's username, read once per client: resources rebuild
   * home-relative and `/alva/home/<username>/…` paths with it.
   */
  _username(): Promise<string> {
    this.username ??= this.me().then(
      (me) => me.username,
      (error: unknown) => {
        this.username = undefined;
        throw error;
      }
    );
    return this.username;
  }
}
