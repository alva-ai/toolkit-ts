import type { AlvaClient } from '../client.js';
import { V1PlaybookSkillsResource } from './playbookSkills.js';
import { V1PlaybooksResource } from './playbooks.js';
import { V1TradingResource } from './trading.js';

/**
 * `client.v1`: the 0.x methods that have no /api/v2 route. They call /api/v1
 * or GraphQL with their 0.x types and IDs, accept the credentials 0.x
 * accepts, and move back to the client when their /api/v2 route exists.
 * CHANGELOG 1.0.0 lists them.
 */
export class V1Resources {
  private _playbooks?: V1PlaybooksResource;
  private _playbookSkills?: V1PlaybookSkillsResource;
  private _trading?: V1TradingResource;

  constructor(private readonly client: AlvaClient) {}

  /** Playbook discovery without an API key. */
  get playbooks(): V1PlaybooksResource {
    return (this._playbooks ??= new V1PlaybooksResource(this.client));
  }

  /** Skillhub reads without an API key. */
  get playbookSkills(): V1PlaybookSkillsResource {
    return (this._playbookSkills ??= new V1PlaybookSkillsResource(this.client));
  }

  get trading(): V1TradingResource {
    return (this._trading ??= new V1TradingResource(this.client));
  }
}
