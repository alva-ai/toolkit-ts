import { AlvaError, responseError } from './error.js';
import {
  encodeQuery,
  generateRequestId,
  idempotencyKeyHeader,
  retryDelayMs,
  RETRY_BUDGET_MS,
  RETRY_MAX_ATTEMPTS,
  type Page,
  type V2Method,
  type V2PageOptions,
  type V2RequestOptions,
} from './platformApi.js';
import { V1Resources } from './v1/index.js';
import type { AlvaClientConfig } from './types.js';
import { FsResource } from './resources/fs.js';
import { RunResource } from './resources/run.js';
import { DeployResource } from './resources/deploy.js';
import { ServiceAccountResource } from './resources/serviceAccount.js';
import { ReleaseResource } from './resources/release.js';
import { FeedResource } from './resources/feed.js';
import { XResource } from './resources/x.js';
import { ForYouResource } from './resources/forYou.js';
import { AutomationResource } from './resources/automation.js';
import { PlaybooksResource } from './resources/playbooks.js';
import { SecretsResource } from './resources/secrets.js';
import { SdkDocsResource } from './resources/sdkDocs.js';
import { DataSkillsResource } from './resources/dataSkills.js';
import { PlaybookSkillsResource } from './resources/playbookSkills.js';
import { CommentsResource } from './resources/comments.js';
import { RemixResource } from './resources/remix.js';
import { UserResource } from './resources/user.js';
import { TradingResource } from './resources/trading.js';
import { PortfolioResource } from './resources/portfolio.js';
import { ArraysJwtResource } from './resources/arraysJwt.js';
import { NotificationsResource } from './resources/notifications.js';
import { NotificationPreferencesResource } from './resources/notificationPreferences.js';
import { SubscriptionsResource } from './resources/subscriptions.js';
import { FollowsResource } from './resources/follows.js';
import { AlertsResource } from './resources/alerts.js';
import { ChannelGroupSubscriptionsResource } from './resources/channelGroupSubscriptions.js';
import { FeedbackResource } from './resources/feedback.js';
import { FunctionsResource } from './resources/functions.js';
import { CreditsResource } from './resources/credits.js';
import { MarketsResource } from './resources/markets.js';
import { SchedulesResource } from './resources/schedules.js';
import { TradingPairsResource } from './resources/tradingPairs.js';
import { ThesesResource } from './resources/theses.js';
import { CompanyNewsResource } from './resources/companyNews.js';

const DEFAULT_BASE_URL = 'https://api-llm.prd.alva.ai';
export const DEFAULT_ARRAYS_BASE_URL = 'https://data-tools.prd.space.id';

interface RequestOptions {
  query?: Record<string, unknown>;
  body?: unknown;
  /** Raw JSON body, used when callers must preserve int64 numeric literals. */
  jsonBody?: string;
  /** Send raw body with application/octet-stream content type (for binary writes). */
  rawBody?: BodyInit;
  /** Override the base URL for this request (e.g. the Arrays data-tools endpoint). */
  baseUrl?: string;
  /** If true, skip attaching any Alva auth header (X-Alva-Api-Key / x-Playbook-Viewer). */
  noAuth?: boolean;
  /** Client-side HTTP timeout in milliseconds. */
  timeoutMs?: number;
  /** Optional AbortSignal for this request. Defaults to the client-level signal. */
  signal?: AbortSignal;
}

interface FetchFailure {
  message: string;
  details: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringField(value: unknown, field: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const fieldValue = value[field];
  return typeof fieldValue === 'string' && fieldValue ? fieldValue : undefined;
}

function describeCause(cause: unknown): {
  message?: string;
  details?: Record<string, string>;
} {
  if (cause === undefined || cause === null) {
    return {};
  }
  const details: Record<string, string> = {};
  if (cause instanceof Error) {
    if (cause.name) details.name = cause.name;
    if (cause.message) details.message = cause.message;
    const code = stringField(cause, 'code');
    if (code) details.code = code;
  } else if (isRecord(cause)) {
    const code = stringField(cause, 'code');
    const name = stringField(cause, 'name');
    const message = stringField(cause, 'message');
    if (code) details.code = code;
    if (name) details.name = name;
    if (message) details.message = message;
  } else {
    details.message = String(cause);
  }

  const parts = [details.code, details.name, details.message].filter(
    (part): part is string => Boolean(part)
  );
  return {
    message: parts.length > 0 ? parts.join(': ') : undefined,
    details: Object.keys(details).length > 0 ? details : undefined,
  };
}

function describeFetchFailure(err: unknown): FetchFailure {
  const message =
    err instanceof Error && err.message
      ? err.message
      : 'Network request failed';
  const details: Record<string, unknown> = {};

  if (err instanceof Error) {
    details.name = err.name;
    details.message = err.message;
  } else {
    details.message = String(err);
  }

  const { message: causeMessage, details: causeDetails } = describeCause(
    isRecord(err) ? err.cause : undefined
  );
  if (causeDetails) {
    details.cause = causeDetails;
  }

  return {
    message: causeMessage ? `${message}; cause: ${causeMessage}` : message,
    details,
  };
}

export class AlvaClient {
  readonly baseUrl: string;
  readonly arraysBaseUrl: string;
  readonly viewer_token?: string;
  readonly pbsvToken?: string;
  readonly apiKey?: string;
  readonly gaClientId?: string;
  readonly gaSessionId?: string;
  readonly utmParams?: string;
  readonly signal?: AbortSignal;
  /**
   * Alva chat session that owns work produced through this client (playbooks,
   * feeds, uploaded files). Forwarded as `X-Alva-Origin-Session-Id` so the
   * backend can attribute created artifacts to the originating session. This
   * is a request-context hint, NOT auth — the backend still verifies the
   * session belongs to the authenticated user before honoring it. Distinct
   * from `gaSessionId` (browser analytics).
   */
  readonly originSessionId?: string;
  /** Session profile kind associated with originSessionId. */
  readonly originSessionKind?: string;
  /** Host-attached file Session target, distinct from the chat origin header. */
  readonly originInboxPath?: string;

  private _fs?: FsResource;
  private _run?: RunResource;
  private _deploy?: DeployResource;
  private _serviceAccount?: ServiceAccountResource;
  private _release?: ReleaseResource;
  private _feed?: FeedResource;
  private _x?: XResource;
  private _forYou?: ForYouResource;
  private _automation?: AutomationResource;
  private _playbooks?: PlaybooksResource;
  private _secrets?: SecretsResource;
  private _sdk?: SdkDocsResource;
  private _dataSkills?: DataSkillsResource;
  private _playbookSkills?: PlaybookSkillsResource;
  private _comments?: CommentsResource;
  private _remix?: RemixResource;
  private _user?: UserResource;
  private _trading?: TradingResource;
  private _portfolio?: PortfolioResource;
  private _arraysJwt?: ArraysJwtResource;
  private _notifications?: NotificationsResource;
  private _notificationPreferences?: NotificationPreferencesResource;
  private _subscriptions?: SubscriptionsResource;
  private _follows?: FollowsResource;
  private _alerts?: AlertsResource;
  private _channelGroupSubscriptions?: ChannelGroupSubscriptionsResource;
  private _feedback?: FeedbackResource;
  private _functions?: FunctionsResource;
  private _credits?: CreditsResource;
  private _markets?: MarketsResource;
  private _schedules?: SchedulesResource;
  private _tradingPairs?: TradingPairsResource;
  private _theses?: ThesesResource;
  private _companyNews?: CompanyNewsResource;
  private _v1?: V1Resources;

  constructor(config: AlvaClientConfig) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.arraysBaseUrl = config.arraysBaseUrl ?? DEFAULT_ARRAYS_BASE_URL;
    this.viewer_token = config.viewer_token;
    this.pbsvToken = config.pbsvToken;
    this.apiKey = config.apiKey;
    this.gaClientId = config.gaClientId;
    this.gaSessionId = config.gaSessionId;
    this.utmParams = config.utmParams;
    this.signal = config.signal;
    this.originSessionId = config.originSessionId;
    this.originSessionKind = config.originSessionKind;
    this.originInboxPath = config.originInboxPath;
  }

  get fs(): FsResource {
    return (this._fs ??= new FsResource(this));
  }
  get run(): RunResource {
    return (this._run ??= new RunResource(this));
  }
  get deploy(): DeployResource {
    return (this._deploy ??= new DeployResource(this));
  }
  get serviceAccount(): ServiceAccountResource {
    return (this._serviceAccount ??= new ServiceAccountResource(this));
  }
  get release(): ReleaseResource {
    return (this._release ??= new ReleaseResource(this));
  }
  get feed(): FeedResource {
    return (this._feed ??= new FeedResource(this));
  }
  get automation(): AutomationResource {
    return (this._automation ??= new AutomationResource(this));
  }
  get playbooks(): PlaybooksResource {
    return (this._playbooks ??= new PlaybooksResource(this));
  }
  get secrets(): SecretsResource {
    return (this._secrets ??= new SecretsResource(this));
  }
  get sdk(): SdkDocsResource {
    return (this._sdk ??= new SdkDocsResource(this));
  }
  get dataSkills(): DataSkillsResource {
    return (this._dataSkills ??= new DataSkillsResource(this));
  }
  get playbookSkills(): PlaybookSkillsResource {
    return (this._playbookSkills ??= new PlaybookSkillsResource(this));
  }
  get comments(): CommentsResource {
    return (this._comments ??= new CommentsResource(this));
  }
  get remix(): RemixResource {
    return (this._remix ??= new RemixResource(this));
  }
  get user(): UserResource {
    return (this._user ??= new UserResource(this));
  }
  get trading(): TradingResource {
    return (this._trading ??= new TradingResource(this));
  }
  get portfolio(): PortfolioResource {
    return (this._portfolio ??= new PortfolioResource(this));
  }
  get arraysJwt(): ArraysJwtResource {
    return (this._arraysJwt ??= new ArraysJwtResource(this));
  }
  get notifications(): NotificationsResource {
    return (this._notifications ??= new NotificationsResource(this));
  }
  get notificationPreferences(): NotificationPreferencesResource {
    return (this._notificationPreferences ??=
      new NotificationPreferencesResource(this));
  }
  get subscriptions(): SubscriptionsResource {
    return (this._subscriptions ??= new SubscriptionsResource(this));
  }

  get follows(): FollowsResource {
    return (this._follows ??= new FollowsResource(this));
  }
  get alerts(): AlertsResource {
    return (this._alerts ??= new AlertsResource(this));
  }
  get channelGroupSubscriptions(): ChannelGroupSubscriptionsResource {
    return (this._channelGroupSubscriptions ??=
      new ChannelGroupSubscriptionsResource(this));
  }
  get feedback(): FeedbackResource {
    return (this._feedback ??= new FeedbackResource(this));
  }
  get functions(): FunctionsResource {
    return (this._functions ??= new FunctionsResource(this));
  }
  get credits(): CreditsResource {
    return (this._credits ??= new CreditsResource(this));
  }
  get markets(): MarketsResource {
    return (this._markets ??= new MarketsResource(this));
  }
  get tradingPairs(): TradingPairsResource {
    return (this._tradingPairs ??= new TradingPairsResource(this));
  }
  get schedules(): SchedulesResource {
    return (this._schedules ??= new SchedulesResource(this));
  }
  get theses(): ThesesResource {
    return (this._theses ??= new ThesesResource(this));
  }

  get companyNews(): CompanyNewsResource {
    return (this._companyNews ??= new CompanyNewsResource(this));
  }

  /** The 0.x methods without an /api/v2 route, with their 0.x types. */
  get v1(): V1Resources {
    return (this._v1 ??= new V1Resources(this));
  }

  _requireAuth(): void {
    if (!this.pbsvToken && !this.viewer_token && !this.apiKey) {
      throw new AlvaError(
        'UNAUTHENTICATED',
        'Authentication is required. Pass pbsvToken, viewer_token, or apiKey in the constructor.',
        401
      );
    }
  }

  get x(): XResource {
    return (this._x ??= new XResource(this));
  }

  get forYou(): ForYouResource {
    return (this._forYou ??= new ForYouResource(this));
  }

  async _request(
    method: string,
    path: string,
    options?: RequestOptions
  ): Promise<unknown> {
    const baseUrl = options?.baseUrl ?? this.baseUrl;
    let url = `${baseUrl}${path}`;

    if (options?.query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined && value !== null) {
          params.set(key, String(value));
        }
      }
      const qs = params.toString();
      if (qs) {
        url += `?${qs}`;
      }
    }

    const headers = this._headers(options?.noAuth);

    let fetchBody: BodyInit | undefined;
    if (options?.rawBody !== undefined) {
      headers['Content-Type'] = 'application/octet-stream';
      fetchBody = options.rawBody;
    } else if (options?.jsonBody !== undefined) {
      headers['Content-Type'] = 'application/json';
      fetchBody = options.jsonBody;
    } else if (options?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      fetchBody = JSON.stringify(options.body);
    }

    const response = await this._send(
      method,
      path,
      url,
      headers,
      fetchBody,
      options
    );

    if (!response.ok) throw await responseError(response);

    return decodeResponse(response);
  }

  /**
   * Sends one /api/v2 call and returns its successful response, with the
   * body already read, so a body that fails to arrive fails the attempt.
   * `path` is relative to /api/v2 (build it with v2Path). The query repeats
   * a parameter per array element; PATCH sends a JSON Merge Patch; POST and
   * PATCH carry one Idempotency-Key per call. A network error, 409
   * IDEMPOTENCY_KEY_IN_USE, 429 with a short Retry-After, 502, 503 and 504
   * are retried (retryDelayMs) with the same key and body, at most 3
   * attempts within 60 s; any other failure is thrown as an AlvaError read
   * from the problem. /api/v2 takes API keys: a client holding a PBSV or
   * viewer token is refused with CREDENTIAL_REQUIRED before sending.
   */
  async _v2Fetch(
    method: V2Method,
    path: string,
    options: V2RequestOptions = {}
  ): Promise<Response> {
    const fullPath = `/api/v2${path}`;
    if (this.pbsvToken || this.viewer_token) {
      throw new AlvaError(
        'CREDENTIAL_REQUIRED',
        `${method} ${fullPath} needs an API key: the 1.x SDK sends no PBSV or viewer token to /api/v2. Use client.v1, or @alva-ai/toolkit@0.36 in a browser page.`,
        401
      );
    }
    const url = `${this.baseUrl}${fullPath}${encodeQuery(options.query)}`;
    const headers = this._headers(false);
    const jsonType =
      method === 'PATCH' ? 'application/merge-patch+json' : 'application/json';

    let fetchBody: BodyInit | undefined;
    if (options.rawBody !== undefined) {
      headers['Content-Type'] =
        options.contentType ?? 'application/octet-stream';
      fetchBody = options.rawBody;
    } else if (options.jsonBody !== undefined) {
      headers['Content-Type'] = jsonType;
      fetchBody = options.jsonBody;
    } else if (options.body !== undefined) {
      headers['Content-Type'] = jsonType;
      fetchBody = JSON.stringify(options.body);
    }
    if (options.range !== undefined) headers.Range = options.range;
    if (method === 'POST' || method === 'PATCH') {
      headers['Idempotency-Key'] = idempotencyKeyHeader(
        options.idempotencyKey ?? generateRequestId()
      );
    }

    const signal = options.signal ?? this.signal;
    const started = Date.now();
    for (let attempt = 1; ; attempt += 1) {
      let failure: AlvaError;
      try {
        const response = await this._send(
          method,
          fullPath,
          url,
          headers,
          fetchBody,
          options
        );
        if (response.ok)
          return await downloaded(response, signal, method, fullPath);
        failure = await responseError(response);
      } catch (err) {
        if (!(err instanceof AlvaError)) throw err;
        failure = err;
      }
      const delay =
        attempt < RETRY_MAX_ATTEMPTS
          ? retryDelayMs(failure, attempt)
          : undefined;
      if (delay === undefined || Date.now() - started + delay > RETRY_BUDGET_MS)
        throw failure;
      await sleep(delay, signal, method, fullPath);
    }
  }

  /**
   * Sends one /api/v2 call to a JSON route (_v2Fetch) and returns its body,
   * typed by the caller with the route's schema (`Schema<'Thesis'>`). A body
   * that is not a JSON object is INVALID_RESPONSE.
   */
  async _v2Request<T = unknown>(
    method: V2Method,
    path: string,
    options: V2RequestOptions = {}
  ): Promise<T> {
    const response = await this._v2Fetch(method, path, options);
    const contentType = (
      response.headers.get('content-type') ?? ''
    ).toLowerCase();
    let body: unknown;
    if (
      contentType.includes('application/json') ||
      contentType.includes('+json')
    ) {
      try {
        body = await response.json();
      } catch {
        body = undefined;
      }
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new AlvaError(
        'INVALID_RESPONSE',
        `${method} /api/v2${path} did not return a JSON object`,
        502
      );
    }
    return body as T;
  }

  /**
   * Reads an /api/v2 collection page by page ({items, nextPageToken}),
   * following nextPageToken until it is null. Combine with collectAll to read
   * every item.
   */
  async *_v2Pages<T>(
    path: string,
    options: V2PageOptions = {}
  ): AsyncGenerator<Page<T>, void, undefined> {
    let pageToken = options.pageToken;
    for (;;) {
      const page = await this._v2Request<Page<T>>('GET', path, {
        query: { ...options.query, pageSize: options.pageSize, pageToken },
        timeoutMs: options.timeoutMs,
        signal: options.signal,
      });
      if (!Array.isArray(page.items)) {
        throw new AlvaError(
          'INVALID_RESPONSE',
          `GET /api/v2${path} did not return a page`,
          502
        );
      }
      yield page;
      const next = page.nextPageToken;
      if (!next) return;
      if (next === pageToken) {
        throw new AlvaError(
          'INVALID_RESPONSE',
          `GET /api/v2${path} returned the page token it was sent`,
          502
        );
      }
      pageToken = next;
    }
  }

  /** The credential, analytics and origin-session headers of a request. */
  private _headers(noAuth: boolean | undefined): Record<string, string> {
    const headers: Record<string, string> = {};
    if (!noAuth) {
      if (this.pbsvToken) {
        headers.Authorization = `Bearer ${this.pbsvToken}`;
        headers['X-Pbsv'] = '1';
      } else if (this.viewer_token) {
        headers['x-Playbook-Viewer'] = this.viewer_token;
      } else if (this.apiKey) {
        headers['X-Alva-Api-Key'] = this.apiKey;
      }
    }

    if (this.gaClientId) {
      headers['X-Alva-GA-Client-ID'] = this.gaClientId;
    }
    if (this.gaSessionId) {
      headers['X-Alva-GA-Session-ID'] = this.gaSessionId;
    }
    if (this.utmParams) {
      headers['X-Alva-UTM-Params'] = this.utmParams;
    }
    // Origin-session attribution is identity-scoped: never attach it on noAuth
    // requests, which carry no caller identity to attribute work to.
    if (this.originSessionId && !noAuth) {
      headers['X-Alva-Origin-Session-Id'] = this.originSessionId;
    }
    return headers;
  }

  /** Fetches once, turning abort, timeout and network failures into AlvaError. */
  private async _send(
    method: string,
    path: string,
    url: string,
    headers: Record<string, string>,
    body: BodyInit | undefined,
    options: { timeoutMs?: number; signal?: AbortSignal } | undefined
  ): Promise<Response> {
    const timeoutMs = options?.timeoutMs;
    const externalSignal = options?.signal ?? this.signal;
    if (externalSignal?.aborted) {
      throw new AlvaError(
        'NETWORK_ABORTED',
        `Request aborted while calling ${method} ${path}`,
        0,
        {
          method,
          path,
        }
      );
    }
    const controller =
      timeoutMs !== undefined ? new AbortController() : undefined;
    let didTimeout = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let abortListener: (() => void) | undefined;
    if (controller && timeoutMs !== undefined) {
      if (externalSignal) {
        abortListener = () => controller.abort(externalSignal.reason);
        externalSignal.addEventListener('abort', abortListener, { once: true });
      }
      timeoutId = setTimeout(() => {
        didTimeout = true;
        controller.abort(
          new Error(
            `Request timed out after ${timeoutMs}ms while calling ${method} ${path}`
          )
        );
      }, timeoutMs);
    }

    const fetchInit: RequestInit & { timeout?: number } = {
      method,
      headers,
      body,
      signal: controller?.signal ?? externalSignal,
    };
    if (timeoutMs !== undefined) {
      fetchInit.timeout = timeoutMs;
    }

    try {
      return await fetch(url, fetchInit);
    } catch (err) {
      if (externalSignal?.aborted && !didTimeout) {
        throw new AlvaError(
          'NETWORK_ABORTED',
          `Request aborted while calling ${method} ${path}`,
          0,
          {
            method,
            path,
          }
        );
      }
      if (didTimeout) {
        throw new AlvaError(
          'NETWORK_TIMEOUT',
          `Request timed out after ${timeoutMs}ms while calling ${method} ${path}`,
          0,
          { method, path, timeout_ms: timeoutMs }
        );
      }
      const failure = describeFetchFailure(err);
      throw new AlvaError('NETWORK_ERROR', failure.message, 0, {
        method,
        path,
        ...failure.details,
      });
    } finally {
      if (abortListener && externalSignal) {
        externalSignal.removeEventListener('abort', abortListener);
      }
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }
}

/**
 * The successful response with its body read into memory. A body that fails
 * to arrive is NETWORK_ABORTED after the caller's abort, else NETWORK_ERROR
 * (retried); only a body that arrived can be INVALID_RESPONSE.
 */
async function downloaded(
  response: Response,
  signal: AbortSignal | undefined,
  method: string,
  path: string
): Promise<Response> {
  if (response.body === null) return response;
  let bytes: ArrayBuffer;
  try {
    bytes = await response.arrayBuffer();
  } catch (err) {
    if (signal?.aborted) {
      throw new AlvaError(
        'NETWORK_ABORTED',
        `Request aborted while calling ${method} ${path}`,
        0,
        { method, path }
      );
    }
    const failure = describeFetchFailure(err);
    throw new AlvaError('NETWORK_ERROR', failure.message, 0, {
      method,
      path,
      ...failure.details,
    });
  }
  return new Response(bytes, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/** Waits between two attempts of one call; an abort ends the wait. */
function sleep(
  ms: number,
  signal: AbortSignal | undefined,
  method: string,
  path: string
): Promise<void> {
  const aborted = () =>
    new AlvaError(
      'NETWORK_ABORTED',
      `Request aborted while calling ${method} ${path}`,
      0,
      { method, path }
    );
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(aborted());
    const onAbort = () => {
      clearTimeout(timer);
      reject(aborted());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function decodeResponse(response: Response): Promise<unknown> {
  // Handle 204 No Content and empty responses
  if (response.status === 204) {
    return undefined;
  }

  // Only parse as JSON when the server says so; everything else (PDF,
  // octet-stream, image/*, text/*, …) is returned as raw bytes so callers
  // like `fs.read` can handle binary files. An allowlist of binary types is
  // never complete: e.g. a PDF served as application/pdf used to fall through
  // to response.json() and throw a JSON parse error.
  //
  // Match the media type case-insensitively and accept the `+json`
  // structured-suffix family (e.g. application/graphql-response+json from the
  // GraphQL gateway), not just the literal application/json.
  const contentType = (
    response.headers.get('content-type') ?? ''
  ).toLowerCase();
  if (
    contentType.includes('application/json') ||
    contentType.includes('+json')
  ) {
    return response.json();
  }

  return response.arrayBuffer();
}
