import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import { v2Path, type Schema, type V2Query } from '../platformApi.js';

/** pageSize and pageToken of a Thesis list. */
export type ThesisPageQuery = V2Query<'/theses/{thesisId}/updates', 'get'>;

/** Options of a Thesis write. */
export interface ThesisWriteOptions {
  /**
   * The write's Idempotency-Key, a UUID: reuse it to retry the same write
   * safely. Omitted, each call gets a new one.
   */
  idempotencyKey?: string;
}

/**
 * Whose Theses `list` reads: exactly one of person, personName, user,
 * ticker or assetId, with the page query of the list it ends on.
 */
export interface ListThesesParams extends V2Query<
  '/profiles/{profileId}/theses',
  'get'
> {
  /** A Person's exact handle (a PERSON Profile's `handle`). */
  person?: string;
  /** A Person name search; it must match one Person. */
  personName?: string;
  /** A user's exact username (a USER Profile's `handle`). */
  user?: string;
  /** A catalog symbol. */
  ticker?: string;
  /** An Asset ID. */
  assetId?: string;
}

const SELECTORS = [
  'person',
  'personName',
  'user',
  'ticker',
  'assetId',
] as const;

/**
 * Theses on /api/v2: reads, writes and explicit text rewriting. Methods
 * return the routes' JSON (`Schema<'Thesis'>`, `Schema<'ThesisList'>`, ...).
 * Writes send one Idempotency-Key per call (`idempotencyKey`, else a new
 * UUID) and never start Signal or Alert setup as a side effect.
 */
export class ThesesResource {
  constructor(private client: AlvaClient) {}

  /**
   * One page of an author's or an asset's Theses. An author is named by an
   * exact handle (person, user) or a Person name search that must match one
   * Person (AMBIGUOUS_IDENTITY lists the candidates); `archived` applies to
   * author lists only.
   */
  async list(params: ListThesesParams): Promise<Schema<'ThesisList'>> {
    const chosen = SELECTORS.filter((key) => params[key] !== undefined);
    if (chosen.length !== 1) {
      throw invalidArgument(
        'choose exactly one of person, personName, user, ticker or assetId'
      );
    }
    const { person, personName, user, ticker, assetId, ...query } = params;
    if (ticker !== undefined || assetId !== undefined) {
      if (query.archived !== undefined) {
        throw invalidArgument('archived applies only to author lists');
      }
      const id =
        assetId ??
        (
          await this.client._v2Request<Schema<'Asset'>>(
            'GET',
            v2Path`/assets/by-symbol/${ticker as string}`
          )
        ).id;
      return this.client._v2Request('GET', v2Path`/assets/${id}/theses`, {
        query: { pageSize: query.pageSize, pageToken: query.pageToken },
      });
    }
    const profile =
      personName !== undefined
        ? await this.uniquePerson(personName)
        : await this.exactProfile(
            person === undefined ? 'USER' : 'PERSON',
            (person ?? user) as string
          );
    return this.client._v2Request(
      'GET',
      v2Path`/profiles/${profile.id}/theses`,
      { query }
    );
  }

  /**
   * One page of the Theses related to the current Update. While they are
   * being prepared the read fails with reason RELATED_THESES_GENERATING
   * (503, not retried): ask again later.
   */
  async related(
    id: string,
    query: ThesisPageQuery = {}
  ): Promise<Schema<'RelatedThesisList'>> {
    return this.client._v2Request('GET', v2Path`/theses/${id}/related`, {
      query,
    });
  }

  /** The assets a text mentions, and what publishing them would store. */
  async assetCandidates(
    input: Schema<'AssetSuggestionsInput'>,
    options: ThesisWriteOptions = {}
  ): Promise<Schema<'AssetSuggestions'>> {
    return this.client._v2Request('POST', '/thesis-asset-suggestions', {
      body: input,
      idempotencyKey: options.idempotencyKey,
    });
  }

  /** The Thesis return; `detail` revalues it and lists each Update's positions. */
  async thesisReturn(
    id: string,
    query: V2Query<'/theses/{thesisId}/return', 'get'> = {}
  ): Promise<Schema<'ThesisReturnInfo'>> {
    return this.client._v2Request('GET', v2Path`/theses/${id}/return`, {
      query,
    });
  }

  /**
   * Every watchpoint of the current Update, in number order: what the Thesis
   * depends on, or what would show it right or wrong.
   */
  async watchpoints(id: string): Promise<Schema<'ThesisWatchpoints'>> {
    return this.client._v2Request('GET', v2Path`/theses/${id}/watchpoints`);
  }

  async create(
    body: Schema<'NewThesis'>,
    options: ThesisWriteOptions = {}
  ): Promise<Schema<'Thesis'>> {
    return this.client._v2Request('POST', '/theses', {
      body,
      idempotencyKey: options.idempotencyKey,
    });
  }

  async get(id: string): Promise<Schema<'Thesis'>> {
    return this.client._v2Request('GET', v2Path`/theses/${id}`);
  }

  /** The Thesis whose page is https://alva.ai/thesis/<number>. */
  async getByNumber(number: number): Promise<Schema<'Thesis'>> {
    return this.client._v2Request('GET', v2Path`/theses/by-number/${number}`);
  }

  /** One Update (Thesis version) by its ID. */
  async getVersion(versionId: string): Promise<Schema<'ThesisVersion'>> {
    return this.client._v2Request('GET', v2Path`/thesis-versions/${versionId}`);
  }

  /** One Update by the Thesis number and the Update's number. */
  async getVersionByNumber(
    number: number,
    versionNumber: number
  ): Promise<Schema<'ThesisVersion'>> {
    return this.client._v2Request(
      'GET',
      v2Path`/theses/by-number/${number}/versions/${versionNumber}`
    );
  }

  /** One page of reader-visible Updates, editorial revisions folded together. */
  async listUpdates(
    id: string,
    query: ThesisPageQuery = {}
  ): Promise<Schema<'ThesisVersionList'>> {
    return this.client._v2Request('GET', v2Path`/theses/${id}/updates`, {
      query,
    });
  }

  /** One page of the Thesis's Signals; its research state is `Thesis.research`. */
  async signals(
    id: string,
    query: ThesisPageQuery = {}
  ): Promise<Schema<'SignalList'>> {
    return this.client._v2Request('GET', v2Path`/theses/${id}/signals`, {
      query,
    });
  }

  /**
   * One write of a Thesis from the Update `expectedVersionId` names: absent
   * members carry over, and assets, categoryIds and media replace the lists.
   * A narrower `visibility` is set before the Update is published and a
   * wider one after it, so a failure between the two never shows the
   * content to more readers than asked; `archived: false`
   * unarchives the Thesis with this content, `archived: true` archives it.
   * A stale `expectedVersionId` is CONFLICT and writes nothing. An Update
   * identical to the current one writes nothing and returns the Thesis
   * unchanged.
   */
  async update(
    id: string,
    body: Schema<'ThesisUpdate'>,
    options: ThesisWriteOptions = {}
  ): Promise<Schema<'Thesis'>> {
    return this.client._v2Request('POST', v2Path`/theses/${id}/updates`, {
      body,
      idempotencyKey: options.idempotencyKey,
    });
  }

  /** Archives the current Update (`expectedVersionId`) and pauses research. */
  async archive(
    id: string,
    input: Schema<'ArchiveInput'>,
    options: ThesisWriteOptions = {}
  ): Promise<Schema<'Thesis'>> {
    return this.client._v2Request('POST', v2Path`/theses/${id}/archive`, {
      body: input,
      idempotencyKey: options.idempotencyKey,
    });
  }

  /** Publishes the current content as a new Update and resumes research. */
  async unarchive(
    id: string,
    input: Schema<'ArchiveInput'>,
    options: ThesisWriteOptions = {}
  ): Promise<Schema<'Thesis'>> {
    return this.client._v2Request('POST', v2Path`/theses/${id}/unarchive`, {
      body: input,
      idempotencyKey: options.idempotencyKey,
    });
  }

  /** Follows (stars) or unfollows a Thesis. */
  async setStarred(
    id: string,
    starred: boolean
  ): Promise<Schema<'ThesisFollow'>> {
    return starred
      ? this.client._v2Request('POST', '/me/followed-theses', {
          body: { thesisId: id },
        })
      : this.client._v2Request('DELETE', v2Path`/me/followed-theses/${id}`);
  }

  /** Resumes (true) or pauses (false) the Thesis's Signal research. */
  async setSignalEnabled(
    id: string,
    enabled: boolean
  ): Promise<Schema<'Thesis'>> {
    return this.client._v2Request(
      'POST',
      enabled
        ? v2Path`/theses/${id}/research/resume`
        : v2Path`/theses/${id}/research/pause`
    );
  }

  /**
   * Changes who can read the Thesis. Leaving PAID ends paid renewals and
   * fails with reason PAID_RENEWALS_END_CONFIRMATION_REQUIRED until
   * `confirmEndPaidRenewals` is true.
   */
  async setVisibility(
    id: string,
    patch: Schema<'ThesisPatch'>,
    options: ThesisWriteOptions = {}
  ): Promise<Schema<'Thesis'>> {
    return this.client._v2Request('PATCH', v2Path`/theses/${id}`, {
      body: patch,
      idempotencyKey: options.idempotencyKey,
    });
  }

  /** Rewrites a Thesis text; nothing is saved. */
  async rewrite(
    input: Schema<'RewriteInput'>,
    options: ThesisWriteOptions = {}
  ): Promise<Schema<'Rewrite'>> {
    return this.client._v2Request('POST', '/thesis-rewrites', {
      body: input,
      idempotencyKey: options.idempotencyKey,
    });
  }

  /** The profile whose handle is exactly `handle`, among the search matches. */
  private async exactProfile(
    kind: Schema<'ProfileKind'>,
    handle: string
  ): Promise<Schema<'Profile'>> {
    const page = await this.profileSearch(kind, handle);
    const wanted = handle.toLowerCase();
    const hit = page.items.find((p) => p.handle.toLowerCase() === wanted);
    if (!hit) throw notFound();
    return hit;
  }

  /** The one Person a name search matches; never a guess among several. */
  private async uniquePerson(name: string): Promise<Schema<'Profile'>> {
    const page = await this.profileSearch('PERSON', name);
    const more = page.nextPageToken !== null;
    if (page.items.length === 1 && !more) return page.items[0];
    if (page.items.length === 0 && !more) throw notFound();
    const candidates = page.items.map((p) => ({
      id: p.id,
      handle: p.handle,
      displayName: p.displayName,
    }));
    throw new AlvaError(
      'AMBIGUOUS_IDENTITY',
      // Agent hosts forward only Error.message, so it names the candidates.
      `Choose an exact identity before reading theses. Candidates: ${JSON.stringify(candidates)}${
        more ? ' More matches exist; refine the name.' : ''
      }`,
      400,
      { candidates, more }
    );
  }

  private async profileSearch(
    kind: Schema<'ProfileKind'>,
    query: string
  ): Promise<Schema<'ProfileList'>> {
    return this.client._v2Request('GET', '/profiles', {
      query: { query, kind, pageSize: 50 },
    });
  }
}

function invalidArgument(message: string): AlvaError {
  return new AlvaError('INVALID_ARGUMENT', message, 400);
}

function notFound(): AlvaError {
  return new AlvaError(
    'NOT_FOUND',
    'No visible matching identity or Thesis found',
    404
  );
}
