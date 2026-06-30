import { AlvaError } from './error.js';
import type { AlvaClientConfig } from './types.js';
import { FsResource } from './resources/fs.js';
import { RunResource } from './resources/run.js';
import { DeployResource } from './resources/deploy.js';
import { ReleaseResource } from './resources/release.js';
import { FeedResource } from './resources/feed.js';
import { PlaybooksResource } from './resources/playbooks.js';
import { SecretsResource } from './resources/secrets.js';
import { SdkDocsResource } from './resources/sdkDocs.js';
import { DataSkillsResource } from './resources/dataSkills.js';
import { PlaybookSkillsResource } from './resources/playbookSkills.js';
import { CommentsResource } from './resources/comments.js';
import { RemixResource } from './resources/remix.js';
import { ScreenshotResource } from './resources/screenshot.js';
import { UserResource } from './resources/user.js';
import { TradingResource } from './resources/trading.js';
import { PortfolioResource } from './resources/portfolio.js';
import { ArraysJwtResource } from './resources/arraysJwt.js';
import { NotificationsResource } from './resources/notifications.js';
import { NotificationPreferencesResource } from './resources/notificationPreferences.js';
import { SubscriptionsResource } from './resources/subscriptions.js';
import { ChannelGroupSubscriptionsResource } from './resources/channelGroupSubscriptions.js';
import { FeedbackResource } from './resources/feedback.js';
import { FunctionsResource } from './resources/functions.js';
import { CreditsResource } from './resources/credits.js';

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

  private _fs?: FsResource;
  private _run?: RunResource;
  private _deploy?: DeployResource;
  private _release?: ReleaseResource;
  private _feed?: FeedResource;
  private _playbooks?: PlaybooksResource;
  private _secrets?: SecretsResource;
  private _sdk?: SdkDocsResource;
  private _dataSkills?: DataSkillsResource;
  private _playbookSkills?: PlaybookSkillsResource;
  private _comments?: CommentsResource;
  private _remix?: RemixResource;
  private _screenshot?: ScreenshotResource;
  private _user?: UserResource;
  private _trading?: TradingResource;
  private _portfolio?: PortfolioResource;
  private _arraysJwt?: ArraysJwtResource;
  private _notifications?: NotificationsResource;
  private _notificationPreferences?: NotificationPreferencesResource;
  private _subscriptions?: SubscriptionsResource;
  private _channelGroupSubscriptions?: ChannelGroupSubscriptionsResource;
  private _feedback?: FeedbackResource;
  private _functions?: FunctionsResource;
  private _credits?: CreditsResource;

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
  get release(): ReleaseResource {
    return (this._release ??= new ReleaseResource(this));
  }
  get feed(): FeedResource {
    return (this._feed ??= new FeedResource(this));
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
  get screenshot(): ScreenshotResource {
    return (this._screenshot ??= new ScreenshotResource(this));
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

  _requireAuth(): void {
    if (!this.pbsvToken && !this.viewer_token && !this.apiKey) {
      throw new AlvaError(
        'UNAUTHENTICATED',
        'Authentication is required. Pass pbsvToken, viewer_token, or apiKey in the constructor.',
        401
      );
    }
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

    const headers: Record<string, string> = {};
    if (!options?.noAuth) {
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
    if (this.originSessionId && !options?.noAuth) {
      headers['X-Alva-Origin-Session-Id'] = this.originSessionId;
    }

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

    let response: Response;
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
      body: fetchBody,
      signal: controller?.signal ?? externalSignal,
    };
    if (timeoutMs !== undefined) {
      fetchInit.timeout = timeoutMs;
    }

    try {
      response = await fetch(url, fetchInit);
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

    if (!response.ok) {
      // Read body as text first to avoid double consumption
      let bodyText = '';
      try {
        bodyText = await Promise.resolve(response.text());
      } catch {
        bodyText = '';
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json') && bodyText) {
        try {
          const data = JSON.parse(bodyText) as {
            error?: { code?: string; message?: string };
          };
          if (data.error) {
            throw new AlvaError(
              data.error.code ?? 'UNKNOWN',
              data.error.message ?? `HTTP ${response.status}`,
              response.status
            );
          }
        } catch (e) {
          if (e instanceof AlvaError) throw e;
          // JSON parse failed or no error envelope — fall through
        }
      }
      throw new AlvaError(
        'UNKNOWN',
        `HTTP ${response.status}: ${bodyText.slice(0, 200)}`,
        response.status
      );
    }

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
}
