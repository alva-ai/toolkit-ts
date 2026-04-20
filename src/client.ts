import { AlvaError } from './error.js';
import type { AlvaClientConfig } from './types.js';
import { FsResource } from './resources/fs.js';
import { RunResource } from './resources/run.js';
import { DeployResource } from './resources/deploy.js';
import { ReleaseResource } from './resources/release.js';
import { SecretsResource } from './resources/secrets.js';
import { SdkDocsResource } from './resources/sdkDocs.js';
import { CommentsResource } from './resources/comments.js';
import { RemixResource } from './resources/remix.js';
import { ScreenshotResource } from './resources/screenshot.js';
import { UserResource } from './resources/user.js';
import { TradingResource } from './resources/trading.js';
import { ArraysJwtResource } from './resources/arraysJwt.js';

const DEFAULT_BASE_URL = 'https://api-llm.prd.alva.ai';
const DEFAULT_ARRAYS_BASE_URL = 'https://data-tools.prd.space.id';

interface RequestOptions {
  query?: Record<string, unknown>;
  body?: unknown;
  /** Send raw body with application/octet-stream content type (for binary writes). */
  rawBody?: BodyInit;
  /** Override the base URL for this request (e.g. the Arrays data-tools endpoint). */
  baseUrl?: string;
  /** If true, skip attaching any Alva auth header (X-Alva-Api-Key / x-Playbook-Viewer). */
  noAuth?: boolean;
}

export class AlvaClient {
  readonly baseUrl: string;
  readonly arraysBaseUrl: string;
  readonly viewer_token?: string;
  readonly apiKey?: string;

  private _fs?: FsResource;
  private _run?: RunResource;
  private _deploy?: DeployResource;
  private _release?: ReleaseResource;
  private _secrets?: SecretsResource;
  private _sdk?: SdkDocsResource;
  private _comments?: CommentsResource;
  private _remix?: RemixResource;
  private _screenshot?: ScreenshotResource;
  private _user?: UserResource;
  private _trading?: TradingResource;
  private _arraysJwt?: ArraysJwtResource;

  constructor(config: AlvaClientConfig) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.arraysBaseUrl = config.arraysBaseUrl ?? DEFAULT_ARRAYS_BASE_URL;
    this.viewer_token = config.viewer_token;
    this.apiKey = config.apiKey;
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
  get secrets(): SecretsResource {
    return (this._secrets ??= new SecretsResource(this));
  }
  get sdk(): SdkDocsResource {
    return (this._sdk ??= new SdkDocsResource(this));
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
  get arraysJwt(): ArraysJwtResource {
    return (this._arraysJwt ??= new ArraysJwtResource(this));
  }

  _requireAuth(): void {
    if (!this.viewer_token && !this.apiKey) {
      throw new AlvaError(
        'UNAUTHENTICATED',
        'Authentication is required. Pass viewer_token or apiKey in the constructor.',
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
      if (this.viewer_token) {
        headers['x-Playbook-Viewer'] = this.viewer_token;
      } else if (this.apiKey) {
        headers['X-Alva-Api-Key'] = this.apiKey;
      }
    }

    let fetchBody: BodyInit | undefined;
    if (options?.rawBody !== undefined) {
      headers['Content-Type'] = 'application/octet-stream';
      fetchBody = options.rawBody;
    } else if (options?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      fetchBody = JSON.stringify(options.body);
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: fetchBody,
      });
    } catch (err) {
      throw new AlvaError(
        'NETWORK_ERROR',
        err instanceof Error ? err.message : 'Network request failed',
        0
      );
    }

    if (!response.ok) {
      // Read body as text first to avoid double consumption
      const bodyText = await response.text().catch(() => '');
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

    const contentType = response.headers.get('content-type') ?? '';
    if (
      contentType.includes('application/octet-stream') ||
      contentType.includes('image/')
    ) {
      return response.arrayBuffer();
    }

    return response.json();
  }
}
