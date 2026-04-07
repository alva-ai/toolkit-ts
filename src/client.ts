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

const DEFAULT_BASE_URL = 'https://api-llm.prd.alva.ai';

interface RequestOptions {
  query?: Record<string, unknown>;
  body?: unknown;
  /** Send raw body with application/octet-stream content type (for binary writes). */
  rawBody?: BodyInit;
}

export class AlvaClient {
  readonly baseUrl: string;
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

  constructor(config: AlvaClientConfig) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
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

  _requireAuth(): void {
    if (!this.apiKey) {
      throw new AlvaError(
        'UNAUTHENTICATED',
        'API key is required for this operation. Pass apiKey in the constructor.',
        401
      );
    }
  }

  async _request(
    method: string,
    path: string,
    options?: RequestOptions
  ): Promise<unknown> {
    let url = `${this.baseUrl}${path}`;

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
    if (this.apiKey) {
      headers['X-Alva-Api-Key'] = this.apiKey;
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
