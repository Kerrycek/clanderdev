import { getRuntimeConfig } from '../../app/config';
import { MALFORMED_HAVEAPI_ENVELOPE_ERROR_CODE, parseHaveApiEnvelope } from './haveapiEnvelope';

export { MALFORMED_HAVEAPI_ENVELOPE_ERROR_CODE } from './haveapiEnvelope';
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [k: string]: JsonValue };
export interface HaveApiEnvelope {
  status: boolean;
  message?: string;
  errors?: unknown;
  response?: Record<string, unknown> | null;
}
export interface HaveApiRequestInfo {
  method: string;
  /** HaveAPI path (relative to apiBaseUrl), e.g. "/vpses" */
  path: string;
  /** Full URL used for the request (best-effort, may be omitted) */
  url?: string;
}

export const SESSION_EXPIRED_EVENT = 'webui-next:session-expired';

export class HaveApiError extends Error {
  public readonly envelope: HaveApiEnvelope;
  /**
   * HTTP status code (when the transport returned non-2xx).
   *
   * Note: HaveAPI may also return `status: false` with HTTP 200; in that case
   * `httpStatus` is undefined.
   */
  public readonly httpStatus?: number;

  /** Best-effort request metadata for debugging/support. */
  public request?: HaveApiRequestInfo;

  constructor(envelope: HaveApiEnvelope, fallbackMessage = 'Request failed', httpStatus?: number, request?: HaveApiRequestInfo) {
    super(envelope.message || fallbackMessage);
    this.name = 'HaveApiError';
    this.envelope = envelope;
    this.httpStatus = httpStatus;
    this.request = request;
  }
}

function messageLooksLikeExpiredSession(message: unknown): boolean {
  if (typeof message !== 'string') return false;
  const normalized = message.trim().toLowerCase();
  if (!normalized) return false;

  return (
    normalized.includes('unauthorized') ||
    normalized.includes('not authenticated') ||
    normalized.includes('authentication required') ||
    normalized.includes('authentication failed') ||
    normalized.includes('invalid token') ||
    normalized.includes('token expired') ||
    normalized.includes('session expired') ||
    normalized.includes('invalid session') ||
    normalized.includes('session not found') ||
    normalized.includes('unknown session')
  );
}

export function isExpiredSessionError(error: unknown): boolean {
  if (!(error instanceof HaveApiError)) return false;
  if (error.httpStatus === 401) return true;
  return messageLooksLikeExpiredSession(error.envelope?.message);
}

function notifySessionExpired(error: unknown): void {
  if (!isExpiredSessionError(error)) return;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { error } }));
}

export interface CallOpts {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';
  path: string;
  // Input params are sent namespaced as query parameters for GET/OPTIONS and namespaced JSON for others.
  namespace?: string;
  params?: Record<string, unknown>;
  // Meta params are sent under the meta namespace.
  meta?: Record<string, unknown>;

  /**
   * Optional abort signal.
   *
   * Used by UI surfaces like the command palette to cancel in-flight requests
   * when the query changes.
   */
  signal?: AbortSignal;
}

function getHaveApiDescriptionFromWindow(): any | undefined {
  // Legacy vpsAdmin webui exposes the API description on window.vpsAdmin.description.
  // This is very useful for reading dynamic bits like authentication header name
  // and meta namespace.
  if (typeof window === 'undefined') return undefined;
  return (window as any).vpsAdmin?.description;
}

let cachedDescription: any | undefined;
let descriptionPromise: Promise<any | undefined> | null = null;

async function fetchHaveApiDescriptionFromApi(): Promise<any | undefined> {
  const cfg = getRuntimeConfig();

  // In most HaveAPI deployments, the version base URL returns the JSON description.
  // Example: https://api.example.tld/v7.0
  // We try a few safe candidates.
  const candidates = [
    cfg.apiBaseUrl,
    `${cfg.apiBaseUrl}/`,
    cfg.apiUrl,
    `${cfg.apiUrl}/`,
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      const ct = res.headers.get('content-type') ?? '';
      if (!res.ok) continue;

      // Some servers return JSON without a strict content-type.
      if (ct.includes('application/json') || ct.includes('application/vnd') || ct.includes('+json') || ct === '') {
        const data = await res.json().catch(() => undefined);
        if (data && typeof data === 'object') {
          return data;
        }
      }
    } catch {
      // ignore and try next candidate
    }
  }

  return undefined;
}

async function getHaveApiDescription(): Promise<any | undefined> {
  const winDesc = getHaveApiDescriptionFromWindow();
  if (winDesc) return winDesc;

  const cfg = getRuntimeConfig();
  if (cfg.haveApi?.authHeader && cfg.haveApi?.metaNamespace) return undefined;

  if (cachedDescription) return cachedDescription;

  if (!descriptionPromise) {
    descriptionPromise = fetchHaveApiDescriptionFromApi()
      .then((d) => {
        cachedDescription = d;
        return d;
      })
      .catch(() => undefined);
  }

  return descriptionPromise;
}

function getMetaNamespace(desc: any): string {
  return (desc && desc.meta && typeof desc.meta.namespace === 'string' && desc.meta.namespace) || '_meta';
}

function buildQuery(namespace: string, params: Record<string, unknown>): URLSearchParams {
  const qs = new URLSearchParams();

  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (v === null) {
      qs.append(`${namespace}[${k}]`, '');
      continue;
    }

    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean') {
      qs.append(`${namespace}[${k}]`, String(v));
      continue;
    }

    // HaveAPI query-string encoding is scalar. If you need structured data,
    // send it as JSON body (POST/PUT/PATCH/DELETE) instead.
    throw new HaveApiError(
      {
        status: false,
        message: `Invalid query parameter ${namespace}[${k}] (must be string/number/boolean/null)`,
        response: { key: k, value: v },
      },
      'Invalid query parameter'
    );
  }

  return qs;
}

export function unwrapSingleResponse<T>(
  envelope: HaveApiEnvelope,
  metaNamespace: string = '_meta'
): { data: T; meta?: Record<string, unknown> } {
  if (!envelope.status) {
    throw new HaveApiError(envelope);
  }

  const resp: any = envelope.response;
  if (!resp) {
    // Some actions return no response body beyond status.
    return { data: null as unknown as T };
  }

  if (Array.isArray(resp)) {
    return { data: resp as unknown as T };
  }

  // HaveAPI uses a configurable meta namespace (usually "_meta"). When the SPA runs
  // without the legacy vpsAdmin bootstrap, we may not know it. Be tolerant and
  // treat both "_meta" and "meta" as meta keys.
  const metaCandidates = new Set<string>([
    metaNamespace,
    metaNamespace === '_meta' ? 'meta' : '_meta',
  ]);

  const metaValue = resp[metaNamespace] ?? resp['_meta'] ?? resp['meta'];
  const meta = metaValue && typeof metaValue === 'object' && !Array.isArray(metaValue) ? (metaValue as Record<string, unknown>) : undefined;
  const keys = Object.keys(resp).filter((k) => !metaCandidates.has(k));

  if (keys.length === 1) {
    const k = keys[0];

    // With `noUncheckedIndexedAccess`, keys[0] is `string | undefined`.
    // This guard keeps the function type-safe.
    if (!k) return { data: resp as unknown as T, meta };

    return { data: resp[k] as T, meta };
  }

  // When there are multiple namespaces (or response is not an object), return the whole response.
  return { data: resp as unknown as T, meta };
}

/**
 * Convenience helper: many vpsAdmin actions queue async tasks and return
 * `action_state_id` in the meta block.
 */
export function getMetaActionStateId(meta: unknown): number | undefined {
  if (!meta || typeof meta !== 'object') return undefined;
  const raw =
    (meta as any)['action_state_id'] ??
    (meta as any)['state_id'] ??
    (meta as any)['action_state'] ??
    (meta as any)['state'];
  const rawId = raw && typeof raw === 'object' ? (raw as any)['id'] : raw;
  if (typeof rawId === 'number' && Number.isFinite(rawId)) return rawId;
  if (typeof rawId === 'string') {
    const n = Number(rawId);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export const MISSING_ACTION_STATE_ERROR_CODE = 'MISSING_ACTION_STATE' as const;

/**
 * Raised when an endpoint whose contract is an asynchronous action does not
 * return a usable action-state id. The mutation may already have reached the
 * server, so callers must fail closed and refresh state before offering a
 * retry instead of treating the response as synchronous success.
 */
export class MissingActionStateError extends Error {
  public readonly code = MISSING_ACTION_STATE_ERROR_CODE;
  public readonly action: string;
  public readonly result?: unknown;

  constructor(action: string, result?: unknown) {
    super(`Malformed ${action} response: missing action_state_id`);
    this.name = 'MissingActionStateError';
    this.action = action;
    this.result = result;
  }
}

export function isMissingActionStateError(error: unknown): error is MissingActionStateError {
  return error instanceof MissingActionStateError
    || (Boolean(error)
      && typeof error === 'object'
      && (error as { code?: unknown }).code === MISSING_ACTION_STATE_ERROR_CODE);
}

/**
 * Whether a submitted mutation has an unknown outcome and must not be retried
 * blindly. Explicit HaveAPI rejections and ordinary 4xx responses are
 * authoritative; transport loss, malformed responses and server failures are
 * not proof that the server did nothing.
 */
export function isAmbiguousMutationError(error: unknown): boolean {
  if (isMissingActionStateError(error)) return true;
  if (error instanceof HaveApiError) {
    if (
      error.envelope?.errors === 'INVALID_JSON_RESPONSE'
      || error.envelope?.errors === MALFORMED_HAVEAPI_ENVELOPE_ERROR_CODE
    ) return true;
    if (typeof error.httpStatus === 'number') {
      // These responses can be produced after a blocking mutation already
      // reached the server, so they are not authoritative rejections.
      if ([408, 425, 429].includes(error.httpStatus)) return true;
      return error.httpStatus < 400 || error.httpStatus >= 500;
    }
    return false;
  }
  return error instanceof TypeError || (typeof DOMException !== 'undefined' && error instanceof DOMException);
}

/** Require the async-operation proof promised by a blocking API action. */
export function requireActionStateResult<T extends { meta?: Record<string, unknown> }>(result: T, action: string): T {
  const actionStateId = getMetaActionStateId(result.meta);
  if (!Number.isInteger(actionStateId) || (actionStateId as number) <= 0) {
    throw new MissingActionStateError(action, result);
  }
  return result;
}

/**
 * Many HaveAPI Index actions return pagination metadata in `_meta`, including `total_count`.
 */
export function getMetaTotalCount(meta: unknown): number | undefined {
  if (!meta || typeof meta !== 'object') return undefined;
  const raw = (meta as any)['total_count'];
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function describeValue(value: unknown): string {
  if (Array.isArray(value)) return `array(${value.length})`;
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    const head = keys.slice(0, 5).join(', ');
    const tail = keys.length > 5 ? ', …' : '';
    return `object(${head}${tail})`;
  }
  return typeof value;
}

/**
 * Runtime guard for endpoints that are expected to return lists.
 *
 * Use this close to the API boundary so React Query can surface a meaningful error
 * instead of crashing the render with "... is not iterable".
 */
export function expectArray<T>(value: unknown, context: string): T[] {
  if (Array.isArray(value)) return value as T[];
  throw new Error(`${context}: expected array, got ${describeValue(value)}`);
}

function authHeaders(desc: any): Record<string, string> {
  const cfg = getRuntimeConfig();

  if (cfg.auth.kind === 'none') return {};

  // Standalone deployments may not have the HaveAPI description bootstrap
  // on window.vpsAdmin.description. Allow forcing the auth header name.
  const forcedHeader = cfg.haveApi?.authHeader;
  if (forcedHeader) {
    const token = cfg.auth.kind === 'oauth2' ? cfg.auth.accessToken : cfg.auth.sessionToken;
    return { [forcedHeader]: token };
  }

  // HaveAPI uses a provider-specific HTTP header announced in the API description.
  // (The legacy client avoids the standard Authorization header due to CORS policy.)
  const httpHeader: string | undefined = desc?.authentication?.[cfg.auth.kind]?.http_header;

  if (cfg.auth.kind === 'oauth2') {
    if (httpHeader) return { [httpHeader]: cfg.auth.accessToken };

    // Dev fallback. Note: may not work against api.vpsfree.cz due to CORS policy.
    return { Authorization: `Bearer ${cfg.auth.accessToken}` };
  }

  if (cfg.auth.kind === 'token') {
    const token = cfg.auth.sessionToken;

    if (httpHeader) return { [httpHeader]: token };

    // Dev fallback.
    return { 'X-HaveAPI-Auth-Token': token };
  }

  return {};
}

export async function haveApiCall<T>(opts: CallOpts): Promise<{ data: T; meta?: Record<string, unknown>; envelope: HaveApiEnvelope }> {
  const cfg = getRuntimeConfig();
  const desc = await getHaveApiDescription();
  const metaNs = cfg.haveApi?.metaNamespace ?? getMetaNamespace(desc);

  const method = opts.method ?? 'GET';

  let url = `${cfg.apiBaseUrl}${opts.path.startsWith('/') ? '' : '/'}${opts.path}`;

  const ns = opts.namespace;
  const qs = new URLSearchParams();

  const paramsInQuery = method === 'GET' || method === 'OPTIONS';

  if (paramsInQuery && ns && opts.params) {
    for (const [k, v] of buildQuery(ns, opts.params).entries()) qs.append(k, v);
  }

  if (paramsInQuery && opts.meta) {
    for (const [k, v] of buildQuery(metaNs, opts.meta).entries()) {
      qs.append(k, v);
    }
  }

  if ([...qs.keys()].length > 0) {
    url += (url.includes('?') ? '&' : '?') + qs.toString();
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...authHeaders(desc),
  };

  const init: RequestInit = {
    method,
    headers,
    // Match the legacy XHR client default: do not send cookies cross-origin.
    credentials: 'same-origin',
    signal: opts.signal,
  };

  if (!paramsInQuery) {
    headers['Content-Type'] = 'application/json';

    const body: Record<string, unknown> = {};

    if (ns && opts.params) {
      body[ns] = opts.params;
    }

    if (opts.meta) {
      body[metaNs] = opts.meta;
    }

    init.body = JSON.stringify(body);
  }

  const reqInfo: HaveApiRequestInfo = {
    method,
    path: opts.path,
    url,
  };


  const res = await fetch(url, init);
  const envelope = await parseHaveApiEnvelope(res);

  if (!res.ok) {
    // Some failures (e.g. 500) may still return JSON.
    const err = new HaveApiError(envelope, `HTTP ${res.status}`, res.status, reqInfo);
    notifySessionExpired(err);
    throw err;
  }

  let unwrapped: { data: T; meta?: Record<string, unknown> };
  try {
    unwrapped = unwrapSingleResponse<T>(envelope, metaNs);
  } catch (err: any) {
    if (err instanceof HaveApiError) {
      // HaveAPI can return {status:false} with HTTP 200.
      // Attach request info to help support/debug without screenshots.
      if (!err.request) err.request = reqInfo;
      notifySessionExpired(err);
    }
    throw err;
  }

  return { ...unwrapped, envelope };
}
