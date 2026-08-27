'use strict';

const crypto = require('crypto');

const DEFAULT_OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;
const DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_LOGIN_RATE_LIMIT_MAX = 20;
const DEFAULT_LOGIN_RATE_LIMIT_MAX_ENTRIES = 10_000;
const DEFAULT_OAUTH_FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_OAUTH_RESPONSE_MAX_BYTES = 64 * 1024;

function randomState() {
  return crypto.randomBytes(24).toString('base64url');
}

function createOAuthState(now = Date.now()) {
  return {
    value: randomState(),
    issuedAt: now,
  };
}

function sanitizeNext(next) {
  if (!next || typeof next !== 'string') return '/app';
  if (!next.startsWith('/') || next.startsWith('//')) return '/app';

  try {
    const baseUrl = 'http://local.invalid';
    const url = new URL(next, baseUrl);
    if (url.origin !== baseUrl) return '/app';
    const path = `${url.pathname}${url.search}${url.hash}`;
    if (url.searchParams.get('session') === 'expired') return '/app';
    return path;
  } catch {
    return '/app';
  }
}

function timingSafeStringEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;

  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function consumeOAuthState(
  session,
  candidate,
  { now = Date.now(), maxAgeMs = DEFAULT_OAUTH_STATE_MAX_AGE_MS } = {},
) {
  const expected = session?.oauth_state;
  const issuedAt = Number(session?.oauth_state_issued_at);

  if (session) {
    session.oauth_state = undefined;
    session.oauth_state_issued_at = undefined;
  }

  if (!timingSafeStringEqual(candidate, expected)) return false;
  if (!Number.isFinite(issuedAt) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return false;
  if (issuedAt > now || now - issuedAt > maxAgeMs) return false;

  return true;
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function clearSessionCookie(res, name) {
  res.clearCookie(name, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
  });
}

function getRequestHeader(req, name) {
  if (typeof req?.get === 'function') return req.get(name);
  return req?.headers?.[name.toLowerCase()];
}

function normalizedOrigin(value) {
  if (typeof value !== 'string' || value.trim() === '') return undefined;

  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function isSameOriginRequest(req, expectedOrigin) {
  const fetchSite = getRequestHeader(req, 'sec-fetch-site')?.toLowerCase();
  if (fetchSite) {
    // `none` is reserved for user-initiated browser navigation, e.g. typing a
    // URL or using a bookmark. It cannot be produced by a cross-site document.
    return fetchSite === 'same-origin' || fetchSite === 'none';
  }

  const expected = normalizedOrigin(expectedOrigin);
  if (!expected) return false;

  const source = getRequestHeader(req, 'origin') || getRequestHeader(req, 'referer');
  return normalizedOrigin(source) === expected;
}

async function cancelResponseBody(response) {
  if (typeof response?.body?.cancel !== 'function') return;

  try {
    await response.body.cancel();
  } catch {
    // Aborting fetch usually cancels or locks the body first. Either outcome
    // is sufficient; cancellation is only a best-effort cleanup here.
  }
}

async function readLimitedResponseText(
  response,
  maxBytes = DEFAULT_OAUTH_RESPONSE_MAX_BYTES,
) {
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError('maxBytes must be a positive integer');
  }

  const contentLength = response?.headers?.get?.('content-length');
  const declaredLength = contentLength == null ? undefined : Number(contentLength);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await cancelResponseBody(response);
    throw new Error('OAuth response exceeded the configured size limit');
  }

  if (!response?.body) return '';

  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    const bytes = Buffer.from(chunk);
    total += bytes.length;
    if (total > maxBytes) {
      await cancelResponseBody(response);
      throw new Error('OAuth response exceeded the configured size limit');
    }
    chunks.push(bytes);
  }

  return Buffer.concat(chunks, total).toString('utf8');
}

async function fetchLimitedResponseText(
  url,
  options,
  {
    timeoutMs = DEFAULT_OAUTH_FETCH_TIMEOUT_MS,
    maxBytes = DEFAULT_OAUTH_RESPONSE_MAX_BYTES,
    fetchImpl = globalThis.fetch,
  } = {},
) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('timeoutMs must be a positive number');
  }
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('fetchImpl must be a function');
  }

  const controller = new AbortController();
  const externalSignal = options?.signal;
  const abortFromExternalSignal = () => controller.abort(externalSignal.reason);
  if (externalSignal?.aborted) abortFromExternalSignal();
  else externalSignal?.addEventListener?.('abort', abortFromExternalSignal, { once: true });

  let response;
  let timedOut = false;
  let timeout;
  const timeoutError = new Error('OAuth request timed out');
  timeoutError.code = 'ETIMEDOUT';

  const operation = (async () => {
    response = await fetchImpl(url, { ...options, signal: controller.signal });
    const text = await readLimitedResponseText(response, maxBytes);
    return { response, text };
  })();

  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(timeoutError);
      void cancelResponseBody(response);
      reject(timeoutError);
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, deadline]);
  } catch (error) {
    if (timedOut) throw timeoutError;
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener?.('abort', abortFromExternalSignal);
  }
}

function setRuntimeConfigSecurityHeaders(res) {
  res.setHeader('content-type', 'application/javascript; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('cross-origin-resource-policy', 'same-origin');
  res.setHeader('x-content-type-options', 'nosniff');
}

function setRuntimeSessionSecurityHeaders(res) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('cross-origin-resource-policy', 'same-origin');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('vary', 'Sec-Fetch-Site');
}

function validateOAuthTokenResponse(data) {
  if (
    !data
    || typeof data !== 'object'
    || Array.isArray(data)
    || typeof data.access_token !== 'string'
    || data.access_token.trim() === ''
  ) {
    throw new Error('OAuth provider returned no access token');
  }

  return {
    ...data,
    access_token: data.access_token.trim(),
  };
}

function createFixedWindowRateLimiter({
  windowMs = DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS,
  max = DEFAULT_LOGIN_RATE_LIMIT_MAX,
  maxEntries = DEFAULT_LOGIN_RATE_LIMIT_MAX_ENTRIES,
  now = Date.now,
  key = (req) => req.ip || req.socket?.remoteAddress || 'unknown',
} = {}) {
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new TypeError('windowMs must be a positive number');
  }
  if (!Number.isInteger(max) || max <= 0) {
    throw new TypeError('max must be a positive integer');
  }
  if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
    throw new TypeError('maxEntries must be a positive integer');
  }

  const entries = new Map();
  let requestsSinceSweep = 0;

  function sweepExpired(currentTime) {
    for (const [entryKey, entry] of entries) {
      if (entry.resetAt <= currentTime) entries.delete(entryKey);
    }

    while (entries.size >= maxEntries) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey === undefined) break;
      entries.delete(oldestKey);
    }
  }

  return function fixedWindowRateLimit(req, res, next) {
    const currentTime = now();
    requestsSinceSweep += 1;
    if (requestsSinceSweep >= 100 || entries.size >= maxEntries) {
      sweepExpired(currentTime);
      requestsSinceSweep = 0;
    }

    const entryKey = String(key(req));
    let entry = entries.get(entryKey);
    if (!entry || entry.resetAt <= currentTime) {
      if (!entry && entries.size >= maxEntries) sweepExpired(currentTime);
      entry = { count: 0, resetAt: currentTime + windowMs };
      entries.set(entryKey, entry);
    }

    if (entry.count >= max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1000));
      res.setHeader('retry-after', String(retryAfterSeconds));
      res.setHeader('cache-control', 'no-store');
      return res.status(429).type('text/plain').send('Too many login attempts. Please try again later.');
    }

    entry.count += 1;
    return next();
  };
}

module.exports = {
  DEFAULT_LOGIN_RATE_LIMIT_MAX,
  DEFAULT_LOGIN_RATE_LIMIT_MAX_ENTRIES,
  DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS,
  DEFAULT_OAUTH_FETCH_TIMEOUT_MS,
  DEFAULT_OAUTH_RESPONSE_MAX_BYTES,
  DEFAULT_OAUTH_STATE_MAX_AGE_MS,
  clearSessionCookie,
  consumeOAuthState,
  createFixedWindowRateLimiter,
  createOAuthState,
  destroySession,
  fetchLimitedResponseText,
  isSameOriginRequest,
  readLimitedResponseText,
  regenerateSession,
  sanitizeNext,
  saveSession,
  setRuntimeConfigSecurityHeaders,
  setRuntimeSessionSecurityHeaders,
  validateOAuthTokenResponse,
};
