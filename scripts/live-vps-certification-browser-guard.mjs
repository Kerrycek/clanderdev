const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function fail(message) {
  throw new Error(message);
}

function assertPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) fail(`${label} must be a positive integer.`);
  return value;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be a plain JSON object.`);
  }
  return value;
}

function assertExactObjectKeys(value, expectedKeys, label) {
  const object = assertPlainObject(value, label);
  const actualKeys = Object.keys(object).sort();
  const expected = [...expectedKeys].sort();
  if (!sameJson(actualKeys, expected)) {
    fail(`${label} must contain exactly: ${expected.join(', ')}`);
  }
  return object;
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sameJson(left, right) {
  return canonicalize(left) === canonicalize(right);
}

/**
 * Stateful, code-owned browser mutation allowlist for the destructive VPS
 * certification. It decides before the pinned browser proxy performs any
 * request, so an unexpected same-origin mutation never reaches the live API.
 */
export function createLiveVpsBrowserMutationGuard({
  origin,
  apiVersion,
  expectedCreatePayloadSha256,
  assertCreatePayload,
  payloadSha256,
}) {
  if (origin !== 'https://dev.crucio.cz') fail('Browser mutation guard requires the exact audited origin.');
  if (apiVersion !== '7.0') fail('Browser mutation guard requires API protocol 7.0.');
  if (typeof expectedCreatePayloadSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedCreatePayloadSha256)) {
    fail('Browser mutation guard requires an exact create-payload SHA-256.');
  }
  if (typeof assertCreatePayload !== 'function' || typeof payloadSha256 !== 'function') {
    fail('Browser mutation guard requires code-owned create-payload validators.');
  }

  const expectedKinds = ['create', 'start', 'restart', 'stop'];
  const attempts = [];
  let expectedIndex = 0;
  let ownedVpsId = null;

  function expectedPath() {
    const kind = expectedKinds[expectedIndex];
    if (kind === 'create') return `/v${apiVersion}/vpses`;
    if (!kind || ownedVpsId === null) return null;
    return `/v${apiVersion}/vpses/${ownedVpsId}/${kind}`;
  }

  function decision({ method, url, body }) {
    const normalizedMethod = String(method ?? '').toUpperCase();
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return { allow: false, reason: 'invalid URL', kind: null };
    }

    if (parsedUrl.origin !== origin || parsedUrl.username !== '' || parsedUrl.password !== '') {
      return { allow: false, reason: 'foreign origin', kind: null };
    }
    if (normalizedMethod === 'GET' || normalizedMethod === 'HEAD') {
      return { allow: true, reason: 'read-only request', kind: null };
    }
    if (!STATE_CHANGING_METHODS.has(normalizedMethod)) {
      return { allow: false, reason: `method ${normalizedMethod || '(empty)'} is not allowlisted`, kind: null };
    }

    const kind = expectedKinds[expectedIndex] ?? null;
    const pathname = parsedUrl.pathname;
    const target = expectedPath();
    if (normalizedMethod !== 'POST' || target === null || pathname !== target || parsedUrl.search || parsedUrl.hash) {
      return {
        allow: false,
        reason: `unexpected mutation; expected POST ${target ?? '(registered owned VPS required)'}`,
        kind,
      };
    }

    try {
      const parsedBody = assertPlainObject(body, `${kind} request body`);
      if (kind === 'create') {
        assertExactObjectKeys(parsedBody, ['vps'], 'create request body');
        const createPayload = assertCreatePayload(parsedBody.vps);
        if (payloadSha256(createPayload) !== expectedCreatePayloadSha256) {
          fail('create payload digest differs from the pre-registered intent');
        }
      } else if (!sameJson(parsedBody, {})) {
        fail(`${kind} body must be exactly an empty JSON object`);
      }
    } catch (error) {
      return { allow: false, reason: error instanceof Error ? error.message : String(error), kind };
    }

    expectedIndex += 1;
    return { allow: true, reason: 'exact guarded mutation', kind };
  }

  return {
    inspect(input) {
      const result = decision(input);
      const normalizedMethod = String(input.method ?? '').toUpperCase();
      if (STATE_CHANGING_METHODS.has(normalizedMethod) || !result.allow) {
        attempts.push({
          sequence: attempts.length + 1,
          method: normalizedMethod,
          path: (() => {
            try {
              return new URL(input.url).pathname;
            } catch {
              return '(invalid URL)';
            }
          })(),
          kind: result.kind,
          allowed: result.allow,
          reason: result.reason,
        });
      }
      return result;
    },

    registerOwnedVpsId(vpsId) {
      const id = assertPositiveInteger(vpsId, 'owned VPS id');
      if (expectedIndex !== 1 || ownedVpsId !== null) {
        fail('Owned VPS ID can be registered only once, after the guarded create request.');
      }
      ownedVpsId = id;
    },

    countAttempts(method, pathname) {
      const normalizedMethod = String(method).toUpperCase();
      return attempts.filter((attempt) => attempt.method === normalizedMethod && attempt.path === pathname).length;
    },

    snapshot() {
      return attempts.map((attempt) => ({ ...attempt }));
    },

    assertComplete() {
      const allowed = attempts.filter((attempt) => attempt.allowed);
      if (expectedIndex !== expectedKinds.length || allowed.length !== expectedKinds.length) {
        fail('Browser mutation accounting is incomplete.');
      }
      for (const [index, kind] of expectedKinds.entries()) {
        if (allowed[index]?.kind !== kind) fail(`Browser mutation accounting is missing the exact ${kind} request.`);
      }
      if (attempts.some((attempt) => !attempt.allowed)) {
        fail('Browser mutation accounting contains a blocked mutation attempt.');
      }
      return true;
    },
  };
}
