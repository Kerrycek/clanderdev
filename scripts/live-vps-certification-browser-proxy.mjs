const REDIRECT_STATUS_MIN = 300;
const REDIRECT_STATUS_MAX = 399;

function fail(message) {
  throw new Error(message);
}

function responseStatus(response) {
  const status = Number(response?.status?.());
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    fail('Pinned browser proxy received an invalid HTTP status.');
  }
  return status;
}

function safeResponseHeaders(headers) {
  const source = headers && typeof headers === 'object' && !Array.isArray(headers) ? headers : {};
  const safe = {};
  for (const name of ['cache-control', 'content-encoding', 'content-language', 'content-type', 'etag', 'expires', 'last-modified', 'vary']) {
    const value = source[name];
    if (typeof value === 'string' && value.length > 0) safe[name] = value;
  }
  return safe;
}

export function isLiveVpsRedirectStatus(status) {
  return Number.isInteger(status) && status >= REDIRECT_STATUS_MIN && status <= REDIRECT_STATUS_MAX;
}

export function classifyLiveVpsBrowserAuthentication({ headers, isApiRequest, token }) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
    fail('Browser authentication classification requires request headers.');
  }
  if (typeof isApiRequest !== 'boolean' || typeof token !== 'string' || token.length === 0) {
    fail('Browser authentication classification requires an explicit API scope and token.');
  }
  if (headers['x-haveapi-oauth2-token'] !== undefined) {
    return { allow: false, reason: 'legacy OAuth2 resume header is forbidden' };
  }
  const authToken = headers['x-haveapi-auth-token'];
  if (isApiRequest) {
    return authToken === token
      ? { allow: true, reason: 'exact detached-session API token' }
      : { allow: false, reason: 'API request omitted the exact detached-session token' };
  }
  return authToken === undefined
    ? { allow: true, reason: 'token-free static request' }
    : { allow: false, reason: 'static request carried an authentication token' };
}

/**
 * Fulfil one intercepted browser request from the code-pinned HTTPS client.
 * The browser never receives a 3xx response, so it cannot replay an admin
 * token or mutation body to either a changed path or a foreign origin.
 */
export async function proxyPinnedLiveVpsBrowserRequest({
  route,
  client,
  pathname,
  method,
  data,
  timeout = 60_000,
}) {
  if (!route || typeof route.fulfill !== 'function' || typeof route.abort !== 'function') {
    fail('Pinned browser proxy requires a Playwright route.');
  }
  if (!client || typeof client.fetch !== 'function') {
    fail('Pinned browser proxy requires a pinned HTTPS client.');
  }

  const normalizedMethod = String(method ?? '').toUpperCase();
  const response = await client.fetch(pathname, {
    method: normalizedMethod,
    maxRedirects: 0,
    timeout,
    ...(data === undefined ? {} : { data }),
  });
  const status = responseStatus(response);
  if (isLiveVpsRedirectStatus(status)) {
    await route.abort('blockedbyclient');
    return { kind: 'blocked-redirect', status };
  }

  const body = normalizedMethod === 'HEAD' ? Buffer.alloc(0) : await response.body();
  await route.fulfill({
    status,
    headers: safeResponseHeaders(response.headers()),
    body,
  });
  return { kind: 'fulfilled', status };
}
