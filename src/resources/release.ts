import type { AlvaClient } from '../client.js';
import { v2Path } from '../platformApi.js';
import type {
  AlvaId,
  FeedReleaseRequest,
  FeedReleaseResponse,
  PlaybookDraftRequest,
  PlaybookDraftResponse,
  PlaybookReleaseRequest,
  PlaybookReleaseResponse,
} from '../types.js';
import { parsePlaybookSkillId } from './playbookSkills.js';
import { callerUsername, ownPlaybook, type WirePlaybook } from './playbooks.js';

function automationPins(
  feeds: Array<{ feed_id: AlvaId; feed_major?: number }>
): Array<{ automationId: AlvaId; major?: number }> {
  return feeds.map((f) => ({ automationId: f.feed_id, major: f.feed_major }));
}

export class ReleaseResource {
  constructor(private client: AlvaClient) {}

  async feed(params: FeedReleaseRequest): Promise<FeedReleaseResponse> {
    this.client._requireAuth();
    const username = await callerUsername(this.client);
    const released = await this.client._v2Request<{
      automationId: AlvaId;
      name: string;
      major: number;
    }>('POST', '/me/automations', {
      body: {
        name: params.name,
        version: params.version,
        cronjobId: params.cronjob_id,
        viewJson:
          params.view_json === undefined
            ? undefined
            : JSON.stringify(params.view_json),
        description: params.description,
        changelog: params.changelog,
        agentType: params.agent_type,
        skipFirstRun: params.skip_auto_trigger,
      },
    });
    return {
      feed_id: released.automationId,
      name: released.name,
      feed_major: released.major,
      feed_path: `/alva/home/${username}/feeds/${released.name}`,
    };
  }

  async playbookDraft(
    params: PlaybookDraftRequest
  ): Promise<PlaybookDraftResponse> {
    this.client._requireAuth();
    let skillId: AlvaId | undefined;
    if (params.skill_id) {
      const { username, name } = parsePlaybookSkillId(params.skill_id);
      skillId = (
        await this.client._v2Request<{ id: AlvaId }>(
          'GET',
          v2Path`/skills/by-name/${username}/${name}`
        )
      ).id;
    }
    const draft = await this.client._v2Request<{
      id: AlvaId;
      playbook: WirePlaybook;
    }>('POST', '/drafts', {
      body: {
        slug: params.name,
        title: params.display_name,
        description: params.description,
        automations: automationPins(params.feeds),
        tradingSymbols: params.trading_symbols,
        skillId,
        tags: params.tags,
      },
    });
    return {
      playbook_id: draft.playbook.id,
      playbook_version_id: draft.id,
      playbook_path: draft.playbook.path ?? '',
    };
  }

  async playbook(
    params: PlaybookReleaseRequest
  ): Promise<PlaybookReleaseResponse> {
    this.client._requireAuth();
    const playbook = await ownPlaybook(this.client, params.name);
    const release = await this.client._v2Request<{
      playbook: WirePlaybook;
      version: string;
      url: string | null;
    }>('POST', v2Path`/playbooks/${playbook.id}/publish`, {
      body: {
        version: params.version,
        automations: automationPins(params.feeds),
        changelog: params.changelog,
        readmePath: params.readme_url,
        confirmBundledFeedExposure: params.confirm_bundled_feed_exposure,
      },
    });
    return {
      playbook_id: release.playbook.id,
      version: release.version,
      published_url: release.url ?? '',
      playbook_path: release.playbook.path ?? '',
    };
  }
}
