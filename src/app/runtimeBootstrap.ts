export type OptionalRuntimeScriptName = 'config.js' | 'config.local.js';
export type RuntimeScriptLoader = (src: string) => Promise<void>;

export interface RuntimeSessionTarget {
  vpsAdmin?: Window['vpsAdmin'];
}

export interface LoadBffRuntimeSessionOptions {
  baseUrl?: string;
  origin?: string;
  fetchImpl?: typeof fetch;
  target?: RuntimeSessionTarget;
}

function currentWindowOrigin(): string {
  if (typeof window === 'undefined') return 'http://localhost';
  return window.location.origin;
}

function currentWindowHostname(): string {
  if (typeof window === 'undefined') return '';
  return window.location.hostname;
}

export function normalizeBaseUrl(baseUrl: string | undefined): string {
  if (!baseUrl) return '/';

  let normalized = baseUrl.trim();
  if (!normalized) return '/';
  if (!normalized.startsWith('/')) normalized = `/${normalized}`;
  if (!normalized.endsWith('/')) normalized = `${normalized}/`;
  return normalized;
}

export function shouldTryLocalRuntimeConfig(isDev: boolean, hostname: string): boolean {
  if (isDev) return true;

  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '[::1]'
  );
}

export function buildRuntimeScriptCandidates(
  scriptName: OptionalRuntimeScriptName,
  baseUrl: string | undefined,
  origin: string = currentWindowOrigin()
): string[] {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const candidates = [new URL(scriptName, `${origin}${normalizedBaseUrl}`).toString()];

  if (normalizedBaseUrl !== '/') {
    candidates.push(new URL(`/${scriptName}`, origin).toString());
  }

  return Array.from(new Set(candidates));
}

export function loadClassicRuntimeScript(src: string, doc: Document = document): Promise<void> {
  return new Promise((resolve, reject) => {
    const parent = doc.head ?? doc.body ?? doc.documentElement;
    if (!parent) {
      reject(new Error('runtimeBootstrap: no document parent available for script injection'));
      return;
    }

    const script = doc.createElement('script');
    script.src = src;
    script.async = false;
    script.defer = false;

    script.onload = () => {
      resolve();
    };

    script.onerror = () => {
      script.remove();
      reject(new Error(`runtimeBootstrap: failed to load ${src}`));
    };

    parent.appendChild(script);
  });
}

export interface LoadOptionalRuntimeScriptsOptions {
  baseUrl?: string;
  origin?: string;
  hostname?: string;
  isDev?: boolean;
  loadScript?: RuntimeScriptLoader;
  scriptNames?: OptionalRuntimeScriptName[];
}

export async function loadOptionalRuntimeScripts(
  options: LoadOptionalRuntimeScriptsOptions = {}
): Promise<string[]> {
  const origin = options.origin ?? currentWindowOrigin();
  const hostname = options.hostname ?? currentWindowHostname();
  const isDev = options.isDev ?? Boolean(import.meta.env.DEV);
  const loadScript = options.loadScript ?? ((src: string) => loadClassicRuntimeScript(src));

  const scriptNames: OptionalRuntimeScriptName[] = options.scriptNames
    ? [...options.scriptNames]
    : shouldTryLocalRuntimeConfig(isDev, hostname)
      ? ['config.js', 'config.local.js']
      : ['config.js'];

  const loadedScripts: string[] = [];

  for (const scriptName of scriptNames) {
    const candidates = buildRuntimeScriptCandidates(
      scriptName,
      options.baseUrl ?? import.meta.env.BASE_URL,
      origin
    );

    for (const src of candidates) {
      try {
        await loadScript(src);
        loadedScripts.push(src);
        break;
      } catch {
        // Optional runtime script. Try the next candidate or continue without it.
      }
    }
  }

  return loadedScripts;
}

export async function loadBffRuntimeSession(
  options: LoadBffRuntimeSessionOptions = {},
): Promise<string | null> {
  const origin = options.origin ?? currentWindowOrigin();
  const target = options.target ?? (typeof window !== 'undefined' ? window : undefined);
  const fetchImpl = options.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined);
  if (!target?.vpsAdmin || !fetchImpl) return null;

  const normalizedBaseUrl = normalizeBaseUrl(options.baseUrl ?? import.meta.env.BASE_URL);
  const candidates = [new URL('session.json', `${origin}${normalizedBaseUrl}`).toString()];
  if (normalizedBaseUrl !== '/') candidates.push(new URL('/session.json', origin).toString());

  for (const url of Array.from(new Set(candidates))) {
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) continue;
      if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) continue;

      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue;
      const values = payload as Record<string, unknown>;
      const accessToken = typeof values['accessToken'] === 'string' && values['accessToken'].trim()
        ? values['accessToken'].trim()
        : undefined;
      const rawExpiresAt = values['sessionExpiresAt'];
      const sessionExpiresAt = typeof rawExpiresAt === 'number' && Number.isFinite(rawExpiresAt) && rawExpiresAt > 0
        ? rawExpiresAt
        : null;

      target.vpsAdmin.accessToken = accessToken;
      target.vpsAdmin.webuiNext = {
        ...target.vpsAdmin.webuiNext,
        sessionExpiresAt,
      };
      return url;
    } catch {
      // Optional BFF session bootstrap. Static/legacy deployments do not expose it.
    }
  }

  return null;
}
