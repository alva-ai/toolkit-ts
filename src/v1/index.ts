import type { AlvaClient } from '../client.js';
import { V1ChannelGroupSubscriptionsResource } from './channelGroupSubscriptions.js';
import { V1FsResource } from './fs.js';
import { V1NotificationsResource } from './notifications.js';
import { V1PlaybooksResource } from './playbooks.js';
import { V1PlaybookSkillsResource } from './playbookSkills.js';
import { V1SecretsResource } from './secrets.js';
import { StewardResource } from './steward.js';
import { V1SubscriptionsResource } from './subscriptions.js';
import { V1TradingResource } from './trading.js';

/**
 * `client.v1`: the 0.x methods that have no /api/v2 route. They call /api/v1
 * or GraphQL with their 0.x types and IDs, accept the credentials 0.x
 * accepts, and move back to the client when their /api/v2 route exists.
 * CHANGELOG 1.0.0 lists them.
 */
export class V1Resources {
  private _channelGroupSubscriptions?: V1ChannelGroupSubscriptionsResource;
  private _fs?: V1FsResource;
  private _notifications?: V1NotificationsResource;
  private _playbooks?: V1PlaybooksResource;
  private _playbookSkills?: V1PlaybookSkillsResource;
  private _secrets?: V1SecretsResource;
  private _steward?: StewardResource;
  private _subscriptions?: V1SubscriptionsResource;
  private _trading?: V1TradingResource;

  constructor(private readonly client: AlvaClient) {}

  /** IM group alert subscriptions by numeric origin session. */
  get channelGroupSubscriptions(): V1ChannelGroupSubscriptionsResource {
    return (this._channelGroupSubscriptions ??=
      new V1ChannelGroupSubscriptionsResource(this.client));
  }

  /** ALFS files with a PBSV or viewer token, or public reads without a credential. */
  get fs(): V1FsResource {
    return (this._fs ??= new V1FsResource(this.client));
  }

  /** A feed's notification history by owner and name. */
  get notifications(): V1NotificationsResource {
    return (this._notifications ??= new V1NotificationsResource(this.client));
  }

  /** Playbook discovery without an API key. */
  get playbooks(): V1PlaybooksResource {
    return (this._playbooks ??= new V1PlaybooksResource(this.client));
  }

  /** Skillhub reads without an API key. */
  get playbookSkills(): V1PlaybookSkillsResource {
    return (this._playbookSkills ??= new V1PlaybookSkillsResource(this.client));
  }

  /** A secret's value. */
  get secrets(): V1SecretsResource {
    return (this._secrets ??= new V1SecretsResource(this.client));
  }

  /** Push steward commands and the Daily Brief (GraphQL /query). */
  get steward(): StewardResource {
    return (this._steward ??= new StewardResource(this.client));
  }

  /** Alerts of one feed by owner and name. */
  get subscriptions(): V1SubscriptionsResource {
    return (this._subscriptions ??= new V1SubscriptionsResource(this.client));
  }

  /** Trade subscriptions that execute the latest signal at once. */
  get trading(): V1TradingResource {
    return (this._trading ??= new V1TradingResource(this.client));
  }
}
