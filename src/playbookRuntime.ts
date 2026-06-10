type UdfErrorCode =
  | 'PBSV_EXPIRED'
  | 'PBSV_INVALID'
  | 'PBSV_PID_MISMATCH'
  | 'CONSENT_REQUIRED'
  | 'INSUFFICIENT_CREDITS'
  | 'FUNCTION_NOT_FOUND'
  | 'FUNCTION_DISABLED'
  | 'RESOURCE_EXHAUSTED'
  | 'EXECUTION_FAILED'
  | 'UNAUTHENTICATED'
  | 'PERMISSION_DENIED'
  | 'INTERNAL';

type UdfErrorBody = {
  error?: {
    code?: UdfErrorCode | string;
    message?: string;
    metadata?: Record<string, unknown>;
  };
  details?: {
    metadata?: Record<string, unknown>;
  };
};

type ConsentResult = 'granted' | 'denied' | 'timeout';

// Outcome of a subscribe proposal. The parent decides; the iframe only asks.
//   subscribed — user confirmed and the parent subscribed them (session).
//   declined   — user dismissed the confirm prompt.
//   timeout    — no response within CONSENT_TIMEOUT_MS.
//   error      — runtime not ready / invalid input / parent reported an error.
export type SubscribeProposalResult =
  | 'subscribed'
  | 'declined'
  | 'timeout'
  | 'error';

export type SubscribeProposalInput = {
  feedOwner: string;
  feedName: string;
};

export type SubscribeApi = {
  /**
   * Ask the parent (main site) to offer the viewer a subscription to a feed.
   * The iframe CANNOT subscribe directly — it only proposes; the trusted
   * parent shows a confirm prompt and, on user confirmation, subscribes with
   * the viewer's own session. Resolves with the outcome.
   */
  propose: (input: SubscribeProposalInput) => Promise<SubscribeProposalResult>;
};

export type UdfDescriptor = {
  name: string;
  params_schema: unknown | null;
};

export type UdfInvokeResponse<TResult = unknown> = {
  result: TResult;
  logs?: unknown;
  credits_used_total?: number;
  credits_charged_owner?: number;
  credits_charged_consumer?: number;
};

export type UdfButtonOptions = {
  functionName: string;
  params?: unknown;
  label?: string;
  loadingLabel?: string;
  disabledLabel?: string;
};

export type UdfButtonEventDetail<TResult = unknown> = {
  functionName: string;
  result?: TResult;
  error?: unknown;
};

export type UdfApi = {
  call: <TResult = unknown>(
    functionName: string,
    params: unknown
  ) => Promise<UdfInvokeResponse<TResult>>;
  list: () => Promise<UdfDescriptor[]>;
  getViewerToken: () => string | null;
  isAuthenticated: () => boolean;
  renderButton: (
    target: HTMLElement | string,
    options: UdfButtonOptions
  ) => HTMLButtonElement;
  UdfError: typeof UdfError;
  UdfAuthRequiredError: typeof UdfAuthRequiredError;
  UdfTokenExpiredError: typeof UdfTokenExpiredError;
  UdfTokenInvalidError: typeof UdfTokenInvalidError;
  UdfPidMismatchError: typeof UdfPidMismatchError;
  UdfConsentRequiredError: typeof UdfConsentRequiredError;
  UdfConsentDeniedError: typeof UdfConsentDeniedError;
  UdfConsentTimeoutError: typeof UdfConsentTimeoutError;
  UdfInsufficientCredits: typeof UdfInsufficientCredits;
  UdfFunctionNotFoundError: typeof UdfFunctionNotFoundError;
  UdfFunctionDisabledError: typeof UdfFunctionDisabledError;
  UdfRateLimitedError: typeof UdfRateLimitedError;
  UdfExecutionError: typeof UdfExecutionError;
  UdfTransportError: typeof UdfTransportError;
};

declare global {
  interface Window {
    alva?: {
      udf?: UdfApi;
      subscribe?: SubscribeApi;
      [key: string]: unknown;
    };
  }
}

export class UdfError extends Error {
  readonly code: string;
  readonly metadata: Record<string, unknown>;
  readonly status?: number;

  constructor(
    message: string,
    {
      code,
      metadata = {},
      status,
    }: { code: string; metadata?: Record<string, unknown>; status?: number }
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.metadata = metadata;
    this.status = status;
  }
}

export class UdfAuthRequiredError extends UdfError {
  constructor() {
    super('Sign in to use this UDF.', { code: 'AUTH_REQUIRED' });
  }
}

export class UdfTokenExpiredError extends UdfError {}
export class UdfTokenInvalidError extends UdfError {}
export class UdfPidMismatchError extends UdfError {}
export class UdfConsentRequiredError extends UdfError {}
export class UdfConsentDeniedError extends UdfError {
  constructor() {
    super('UDF consent was denied.', { code: 'CONSENT_DENIED' });
  }
}
export class UdfConsentTimeoutError extends UdfError {
  constructor() {
    super('UDF consent timed out.', { code: 'CONSENT_TIMEOUT' });
  }
}
export class UdfInsufficientCredits extends UdfError {}
export class UdfFunctionNotFoundError extends UdfError {}
export class UdfFunctionDisabledError extends UdfError {}
export class UdfRateLimitedError extends UdfError {}
export class UdfExecutionError extends UdfError {}
export class UdfTransportError extends UdfError {}

export const PBSV_UPDATE_MESSAGE = 'alva:pbsv:update';
export const UDF_CONSENT_REQUEST_MESSAGE = 'alva:udf:consent-request';
export const UDF_CONSENT_RESPONSE_MESSAGE = 'alva:udf:consent-response';
export const UDF_AUTH_REQUIRED_MESSAGE = 'alva:udf:auth-required';
export const SUBSCRIBE_PROPOSE_MESSAGE = 'alva:subscribe:propose';
export const SUBSCRIBE_RESULT_MESSAGE = 'alva:subscribe:result';

const DEFAULT_API_ORIGIN = 'https://api-llm.prd.alva.ai';
const CONSENT_TIMEOUT_MS = 5 * 60 * 1000;

let cachedToken: string | null = null;
let expectedParentOrigin: string | null = null;
let apiOrigin = DEFAULT_API_ORIGIN;
let playbookIdFromBoot: string | null = null;
let runtimeWindow: Window | null = null;
let installed = false;

const pendingConsents = new Map<
  string,
  {
    resolve: (result: ConsentResult) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

const pendingProposals = new Map<
  string,
  {
    resolve: (result: SubscribeProposalResult) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

const normalizeProposalResult = (value: unknown): SubscribeProposalResult => {
  if (value === 'subscribed' || value === 'declined' || value === 'timeout') {
    return value;
  }
  return 'error';
};

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return atob(padded);
};

export const playbookIdFromToken = (token: string | null) => {
  if (!token) return null;
  const [, payload] = token.split('.');
  if (!payload) return null;
  try {
    const parsed = JSON.parse(decodeBase64Url(payload)) as { pid?: unknown };
    if (typeof parsed.pid === 'number') return String(parsed.pid);
    if (typeof parsed.pid === 'string') return parsed.pid;
  } catch {
    return null;
  }
  return null;
};

export const getViewerToken = () => cachedToken;

const isAuthenticated = () => !!getViewerToken();

const stripPbsvFromUrl = (targetWindow: Window) => {
  const url = new URL(targetWindow.location.href);
  url.searchParams.delete('_pbsv');
  targetWindow.history.replaceState(
    null,
    '',
    url.pathname + url.search + url.hash
  );
};

const parseBootParams = (targetWindow: Window) => {
  const params = new URLSearchParams(targetWindow.location.search);
  cachedToken = params.get('_pbsv');
  expectedParentOrigin = params.get('parent_origin');
  apiOrigin = (params.get('api_origin') || DEFAULT_API_ORIGIN).replace(
    /\/$/,
    ''
  );
  playbookIdFromBoot = playbookIdFromToken(cachedToken);
  if (cachedToken) stripPbsvFromUrl(targetWindow);
};

const safeJson = async (response: Response): Promise<UdfErrorBody> => {
  try {
    return (await response.json()) as UdfErrorBody;
  } catch {
    return {};
  }
};

const parseResultPayload = <TResult>(result: unknown): TResult => {
  if (typeof result !== 'string') return result as TResult;
  try {
    return JSON.parse(result) as TResult;
  } catch {
    return result as TResult;
  }
};

const normalizeInvokeResponse = <TResult>(
  body: UdfErrorBody
): UdfInvokeResponse<TResult> => {
  const envelope = body as UdfInvokeResponse<unknown>;
  return {
    ...envelope,
    result: parseResultPayload<TResult>(envelope.result),
  };
};

const errorMetadata = (body: UdfErrorBody) =>
  body.error?.metadata || body.details?.metadata || {};

export const mapUdfErrorResponse = (
  body: UdfErrorBody,
  status?: number
): UdfError => {
  const code = body.error?.code || 'TRANSPORT';
  const message = body.error?.message || code;
  const metadata = errorMetadata(body);
  const props = { code, metadata, status };

  switch (code) {
    case 'PBSV_EXPIRED':
      return new UdfTokenExpiredError(message, props);
    case 'PBSV_INVALID':
    case 'UNAUTHENTICATED':
      return new UdfTokenInvalidError(message, props);
    case 'PBSV_PID_MISMATCH':
      return new UdfPidMismatchError(message, props);
    case 'CONSENT_REQUIRED':
      return new UdfConsentRequiredError(message, props);
    case 'INSUFFICIENT_CREDITS':
      return new UdfInsufficientCredits(message, props);
    case 'FUNCTION_NOT_FOUND':
      return new UdfFunctionNotFoundError(message, props);
    case 'FUNCTION_DISABLED':
      return new UdfFunctionDisabledError(message, props);
    case 'RESOURCE_EXHAUSTED':
      return new UdfRateLimitedError(message, props);
    case 'EXECUTION_FAILED':
      return new UdfExecutionError(message, props);
    default:
      return new UdfTransportError(message, props);
  }
};

const onMessage = (event: MessageEvent) => {
  if (!runtimeWindow || !expectedParentOrigin) return;
  if (event.origin !== expectedParentOrigin) return;
  if (event.source !== runtimeWindow.parent) return;
  if (!event.data || typeof event.data !== 'object') return;

  const data = event.data as {
    type?: unknown;
    token?: unknown;
    request_id?: unknown;
    granted?: unknown;
    status?: unknown;
  };

  if (data.type === PBSV_UPDATE_MESSAGE) {
    if (typeof data.token === 'string' && data.token.length > 0) {
      cachedToken = data.token;
      playbookIdFromBoot = playbookIdFromToken(data.token);
    }
    return;
  }

  if (data.type === SUBSCRIBE_RESULT_MESSAGE) {
    if (typeof data.request_id !== 'string') return;
    const pending = pendingProposals.get(data.request_id);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingProposals.delete(data.request_id);
    pending.resolve(normalizeProposalResult(data.status));
    return;
  }

  if (data.type !== UDF_CONSENT_RESPONSE_MESSAGE) return;
  if (typeof data.request_id !== 'string') return;

  const pending = pendingConsents.get(data.request_id);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingConsents.delete(data.request_id);
  pending.resolve(data.granted === true ? 'granted' : 'denied');
};

const randomRequestId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const playbookIdForInvoke = () => {
  if (!playbookIdFromBoot) return null;
  const numericId = Number(playbookIdFromBoot);
  return Number.isSafeInteger(numericId) ? numericId : null;
};

const requestConsent = async (
  playbookId: string,
  minAllowance: number
): Promise<ConsentResult> => {
  if (!runtimeWindow || !expectedParentOrigin) return 'denied';
  const targetOrigin = expectedParentOrigin;
  const requestId = randomRequestId();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingConsents.delete(requestId);
      resolve('timeout');
    }, CONSENT_TIMEOUT_MS);
    pendingConsents.set(requestId, { resolve, timer });
    runtimeWindow?.parent.postMessage(
      {
        type: UDF_CONSENT_REQUEST_MESSAGE,
        request_id: requestId,
        playbook_id: playbookId,
        min_allowance: minAllowance,
      },
      targetOrigin
    );
  });
};

const proposeSubscribe = async (
  input: SubscribeProposalInput
): Promise<SubscribeProposalResult> => {
  if (!runtimeWindow || !expectedParentOrigin) return 'error';
  // propose() is exposed to plain (untyped) playbook JS, so the fields may not
  // be strings at runtime. Validate before trimming — a non-string must resolve
  // to 'error', not throw.
  const feedOwner =
    typeof input?.feedOwner === 'string' ? input.feedOwner.trim() : '';
  const feedName =
    typeof input?.feedName === 'string' ? input.feedName.trim() : '';
  if (!feedOwner || !feedName) return 'error';
  const targetOrigin = expectedParentOrigin;
  const requestId = randomRequestId();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingProposals.delete(requestId);
      resolve('timeout');
    }, CONSENT_TIMEOUT_MS);
    pendingProposals.set(requestId, { resolve, timer });
    runtimeWindow?.parent.postMessage(
      {
        type: SUBSCRIBE_PROPOSE_MESSAGE,
        request_id: requestId,
        playbook_id: playbookIdFromBoot,
        feed: { owner: feedOwner, name: feedName },
      },
      targetOrigin
    );
  });
};

export const subscribe: SubscribeApi = {
  propose: proposeSubscribe,
};

const requestAuthentication = (functionName: string) => {
  if (!runtimeWindow || !expectedParentOrigin) return;
  runtimeWindow.parent.postMessage(
    {
      type: UDF_AUTH_REQUIRED_MESSAGE,
      function_name: functionName,
    },
    expectedParentOrigin
  );
};

const call = async <TResult>(
  functionName: string,
  params: unknown,
  retried = false
): Promise<UdfInvokeResponse<TResult>> => {
  const token = getViewerToken();
  if (!token) throw new UdfAuthRequiredError();
  if (!playbookIdFromBoot) {
    throw new UdfPidMismatchError('Missing playbook id.', {
      code: 'PBSV_PID_MISMATCH',
    });
  }
  const playbookId = playbookIdForInvoke();
  if (!playbookId) {
    throw new UdfPidMismatchError('Invalid playbook id.', {
      code: 'PBSV_PID_MISMATCH',
    });
  }

  let response: Response;
  try {
    response = await fetch(`${apiOrigin}/api/v1/service/invoke`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Pbsv': '1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        playbook_id: playbookId,
        function_name: functionName,
        parameters_json: JSON.stringify(params),
      }),
    });
  } catch {
    throw new UdfTransportError('Network error while invoking UDF.', {
      code: 'TRANSPORT',
    });
  }

  const body = await safeJson(response);
  if (response.ok) {
    return normalizeInvokeResponse<TResult>(body);
  }

  if (body.error?.code === 'CONSENT_REQUIRED' && !retried) {
    const metadata = errorMetadata(body);
    const playbookId =
      typeof metadata.playbook_id === 'string'
        ? metadata.playbook_id
        : playbookIdFromBoot;
    const minAllowance =
      typeof metadata.min_allowance_suggested === 'number'
        ? metadata.min_allowance_suggested
        : 1;
    const consent = await requestConsent(playbookId, minAllowance);
    if (consent === 'granted') return call<TResult>(functionName, params, true);
    if (consent === 'timeout') throw new UdfConsentTimeoutError();
    throw new UdfConsentDeniedError();
  }

  throw mapUdfErrorResponse(body, response.status);
};

const list = async (): Promise<UdfDescriptor[]> => {
  const token = getViewerToken();
  if (!token) throw new UdfAuthRequiredError();
  if (!playbookIdFromBoot) {
    throw new UdfPidMismatchError('Missing playbook id.', {
      code: 'PBSV_PID_MISMATCH',
    });
  }

  const url = new URL(`${apiOrigin}/api/v1/service/functions`);
  url.searchParams.set('playbook_id', playbookIdFromBoot);
  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Pbsv': '1',
    },
  });
  const body = await safeJson(response);
  if (!response.ok) throw mapUdfErrorResponse(body, response.status);
  const functions = (body as { functions?: UdfDescriptor[] }).functions;
  return Array.isArray(functions) ? functions : [];
};

const dispatchButtonEvent = (
  button: HTMLButtonElement,
  name: string,
  detail: UdfButtonEventDetail
) => {
  button.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
};

const resolveButtonTarget = (target: HTMLElement | string): HTMLElement => {
  if (typeof target !== 'string') return target;
  const root = runtimeWindow?.document;
  const element = root?.querySelector(target);
  if (element && 'appendChild' in element) {
    return element as HTMLElement;
  }
  throw new Error(`UDF button target not found: ${target}`);
};

const renderButton = (
  target: HTMLElement | string,
  options: UdfButtonOptions
): HTMLButtonElement => {
  if (!runtimeWindow) throw new Error('Playbook runtime is not installed.');
  const container = resolveButtonTarget(target);
  const button = runtimeWindow.document.createElement('button');
  const label = options.label || options.functionName;
  const loadingLabel = options.loadingLabel || 'Running...';
  const disabledLabel = options.disabledLabel || 'Sign in to run';

  button.type = 'button';
  button.className = 'alva-udf-button';
  button.textContent = isAuthenticated() ? label : disabledLabel;
  button.disabled = false;
  button.setAttribute('data-function-name', options.functionName);
  if (!isAuthenticated()) button.setAttribute('aria-disabled', 'true');

  button.addEventListener('click', async () => {
    if (!isAuthenticated()) {
      requestAuthentication(options.functionName);
      return;
    }
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = loadingLabel;
    dispatchButtonEvent(button, 'alva:udf-button:loading', {
      functionName: options.functionName,
    });
    try {
      const result = await call(options.functionName, options.params ?? {});
      dispatchButtonEvent(button, 'alva:udf-button:result', {
        functionName: options.functionName,
        result,
      });
    } catch (error) {
      dispatchButtonEvent(button, 'alva:udf-button:error', {
        functionName: options.functionName,
        error,
      });
    } finally {
      button.disabled = false;
      button.textContent = isAuthenticated() ? label : disabledLabel;
      if (!isAuthenticated()) button.setAttribute('aria-disabled', 'true');
    }
  });

  container.appendChild(button);
  return button;
};

export const udf: UdfApi = {
  call,
  list,
  getViewerToken,
  isAuthenticated,
  renderButton,
  UdfError,
  UdfAuthRequiredError,
  UdfTokenExpiredError,
  UdfTokenInvalidError,
  UdfPidMismatchError,
  UdfConsentRequiredError,
  UdfConsentDeniedError,
  UdfConsentTimeoutError,
  UdfInsufficientCredits,
  UdfFunctionNotFoundError,
  UdfFunctionDisabledError,
  UdfRateLimitedError,
  UdfExecutionError,
  UdfTransportError,
};

export const installPlaybookRuntime = (targetWindow?: Window) => {
  const nextWindow =
    targetWindow ?? (typeof window === 'undefined' ? undefined : window);
  if (!nextWindow || installed) return;
  runtimeWindow = nextWindow;
  installed = true;
  parseBootParams(nextWindow);
  nextWindow.addEventListener('message', onMessage);

  const target = nextWindow as Window & {
    alva?: Record<string, unknown>;
  };
  const existing = target.alva || {};
  target.alva = {
    ...existing,
    udf,
    subscribe,
  };
};
