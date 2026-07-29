'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
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
} = require('./security');

test('sanitizeNext keeps same-origin paths and rejects redirect tricks', () => {
  assert.equal(sanitizeNext('/app/vps/42?tab=network#routes'), '/app/vps/42?tab=network#routes');
  assert.equal(sanitizeNext('https://attacker.example/steal'), '/app');
  assert.equal(sanitizeNext('//attacker.example/steal'), '/app');
  assert.equal(sanitizeNext('/\\attacker.example/steal'), '/app');
  assert.equal(sanitizeNext('/app?session=expired'), '/app');
});

test('createOAuthState creates a timestamped unpredictable value', () => {
  const first = createOAuthState(123);
  const second = createOAuthState(123);

  assert.equal(first.issuedAt, 123);
  assert.match(first.value, /^[A-Za-z0-9_-]{32}$/);
  assert.notEqual(first.value, second.value);
});

test('consumeOAuthState accepts a fresh match once', () => {
  const session = {
    oauth_state: 'expected',
    oauth_state_issued_at: 1_000,
  };

  assert.equal(consumeOAuthState(session, 'expected', { now: 2_000 }), true);
  assert.equal(session.oauth_state, undefined);
  assert.equal(session.oauth_state_issued_at, undefined);
  assert.equal(consumeOAuthState(session, 'expected', { now: 2_000 }), false);
});

test('consumeOAuthState rejects mismatches, expired values and future timestamps', () => {
  assert.equal(
    consumeOAuthState(
      { oauth_state: 'expected', oauth_state_issued_at: 1_000 },
      'different',
      { now: 2_000 },
    ),
    false,
  );
  assert.equal(
    consumeOAuthState(
      { oauth_state: 'expected', oauth_state_issued_at: 1_000 },
      'expected',
      { now: 1_000 + DEFAULT_OAUTH_STATE_MAX_AGE_MS + 1 },
    ),
    false,
  );
  assert.equal(
    consumeOAuthState(
      { oauth_state: 'expected', oauth_state_issued_at: 2_001 },
      'expected',
      { now: 2_000 },
    ),
    false,
  );
});

test('session helpers resolve and reject callback-style session operations', async () => {
  await saveSession({ session: { save: (callback) => callback() } });
  await regenerateSession({ session: { regenerate: (callback) => callback() } });
  await destroySession({ session: { destroy: (callback) => callback() } });

  await assert.rejects(
    saveSession({ session: { save: (callback) => callback(new Error('save failed')) } }),
    /save failed/,
  );
  await assert.rejects(
    regenerateSession({ session: { regenerate: (callback) => callback(new Error('regenerate failed')) } }),
    /regenerate failed/,
  );
  await assert.rejects(
    destroySession({ session: { destroy: (callback) => callback(new Error('destroy failed')) } }),
    /destroy failed/,
  );
});

test('logout cookie clearing matches the security attributes of the session cookie', () => {
  const calls = [];
  clearSessionCookie({
    clearCookie(name, options) {
      calls.push({ name, options });
    },
  }, 'test_session');

  assert.deepEqual(calls, [{
    name: 'test_session',
    options: {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    },
  }]);
});

test('same-origin request validation rejects cross-site and sibling-origin requests', () => {
  const request = (headers) => ({
    get(name) {
      return headers[name.toLowerCase()];
    },
  });
  const origin = 'https://clankerdev.vpsfree.cz';

  assert.equal(isSameOriginRequest(request({ 'sec-fetch-site': 'same-origin' }), origin), true);
  assert.equal(isSameOriginRequest(request({ 'sec-fetch-site': 'none' }), origin), true);
  assert.equal(isSameOriginRequest(request({ 'sec-fetch-site': 'same-site' }), origin), false);
  assert.equal(isSameOriginRequest(request({ 'sec-fetch-site': 'cross-site' }), origin), false);
  assert.equal(isSameOriginRequest(request({ origin }), origin), true);
  assert.equal(
    isSameOriginRequest(request({ referer: `${origin}/app/account` }), origin),
    true,
  );
  assert.equal(
    isSameOriginRequest(request({ origin: 'https://attacker.example' }), origin),
    false,
  );
  assert.equal(isSameOriginRequest(request({}), origin), false);
});

test('bounded OAuth response reader rejects oversized streamed bodies', async () => {
  let canceled = false;
  const response = {
    headers: { get: () => null },
    body: {
      async *[Symbol.asyncIterator]() {
        yield Buffer.from('abc');
        yield Buffer.from('def');
      },
      async cancel() {
        canceled = true;
      },
    },
  };

  await assert.rejects(
    readLimitedResponseText(response, 5),
    /exceeded the configured size limit/,
  );
  assert.equal(canceled, true);
});

test('OAuth timeout remains active while the response body is being read', async () => {
  let requestSignal;
  let canceled = false;
  const fetchImpl = async (_url, options) => {
    requestSignal = options.signal;
    return {
      ok: true,
      headers: { get: () => null },
      body: {
        async *[Symbol.asyncIterator]() {
          yield Buffer.from('{"access_token":"partial');
          await new Promise((resolve, reject) => {
            requestSignal.addEventListener('abort', () => reject(requestSignal.reason), {
              once: true,
            });
          });
        },
        async cancel() {
          canceled = true;
        },
      },
    };
  };

  await assert.rejects(
    fetchLimitedResponseText(
      'https://oauth.example/token',
      { method: 'POST' },
      { timeoutMs: 20, maxBytes: 1024, fetchImpl },
    ),
    (error) => error?.code === 'ETIMEDOUT' && /timed out/.test(error.message),
  );
  assert.equal(requestSignal.aborted, true);
  assert.equal(canceled, true);
});

test('bounded OAuth fetch returns the response and complete body on time', async () => {
  const response = {
    ok: true,
    headers: { get: () => '5' },
    body: {
      async *[Symbol.asyncIterator]() {
        yield Buffer.from('hello');
      },
    },
  };

  const result = await fetchLimitedResponseText(
    'https://oauth.example/token',
    {},
    { timeoutMs: 100, maxBytes: 5, fetchImpl: async () => response },
  );

  assert.equal(result.response, response);
  assert.equal(result.text, 'hello');
});

test('runtime config is explicitly non-cacheable and same-origin only', () => {
  const headers = new Map();
  setRuntimeConfigSecurityHeaders({
    setHeader(name, value) {
      headers.set(name, value);
    },
  });

  assert.equal(headers.get('cache-control'), 'no-store');
  assert.equal(headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
});

test('OAuth token response must contain a non-empty access token', () => {
  assert.deepEqual(
    validateOAuthTokenResponse({ access_token: '  token-value  ', refresh_token: 'refresh' }),
    { access_token: 'token-value', refresh_token: 'refresh' },
  );

  assert.throws(() => validateOAuthTokenResponse(undefined), /no access token/);
  assert.throws(() => validateOAuthTokenResponse({}), /no access token/);
  assert.throws(() => validateOAuthTokenResponse({ access_token: '   ' }), /no access token/);
});

test('runtime session JSON is non-cacheable, same-origin only and non-executable', () => {
  const headers = new Map();
  setRuntimeSessionSecurityHeaders({
    setHeader(name, value) {
      headers.set(name, value);
    },
  });

  assert.equal(headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(headers.get('cache-control'), 'no-store');
  assert.equal(headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('vary'), 'Sec-Fetch-Site');
});

test('login limiter rejects excess requests and resets after its window', () => {
  let currentTime = 1_000;
  const limiter = createFixedWindowRateLimiter({
    max: 2,
    windowMs: 5_000,
    now: () => currentTime,
    key: () => 'client-1',
  });
  const calls = [];
  const response = {
    setHeader(name, value) {
      calls.push(['header', name, value]);
    },
    status(code) {
      calls.push(['status', code]);
      return this;
    },
    type(value) {
      calls.push(['type', value]);
      return this;
    },
    send(value) {
      calls.push(['send', value]);
      return this;
    },
  };
  let allowed = 0;

  limiter({}, response, () => { allowed += 1; });
  limiter({}, response, () => { allowed += 1; });
  limiter({}, response, () => { allowed += 1; });

  assert.equal(allowed, 2);
  assert.ok(calls.some((call) => call[0] === 'status' && call[1] === 429));
  assert.ok(calls.some((call) => call[0] === 'header' && call[1] === 'retry-after'));

  currentTime += 5_001;
  limiter({}, response, () => { allowed += 1; });
  assert.equal(allowed, 3);
});

test('login limiter bounds its in-memory client map', () => {
  let client = 0;
  const limiter = createFixedWindowRateLimiter({
    max: 1,
    maxEntries: 2,
    windowMs: 5_000,
    now: () => 1_000,
    key: () => `client-${client}`,
  });
  const response = {
    setHeader() {},
    status() { return this; },
    type() { return this; },
    send() { return this; },
  };

  limiter({}, response, () => {});
  client = 1;
  limiter({}, response, () => {});
  client = 2;
  limiter({}, response, () => {});
  client = 0;

  let allowed = false;
  limiter({}, response, () => { allowed = true; });
  assert.equal(allowed, true);
});
