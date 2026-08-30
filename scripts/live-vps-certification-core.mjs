import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const LIVE_VPS_CERTIFICATION_ORIGIN = 'https://dev.crucio.cz';
export const EXPECTED_VPSADMIN_API_FINGERPRINT = Object.freeze({
  version: '4.2.1',
  revision: '4a397464d945772bafe0328d2f2c512381f7400c',
});

const LEDGER_VERSION = 1;
const FIXTURE_KEYS = Object.freeze(['owner', 'node', 'osTemplate', 'environment', 'location']);
const FIXTURE_LABEL_FIELDS = Object.freeze({
  owner: ['login'],
  node: ['name'],
  osTemplate: ['name', 'label'],
  environment: ['label'],
  location: ['label'],
});
const SECRET_KEY_PATTERN = /(?:^|_)(?:authorization|cookie|password|secret|session|token)(?:$|_)/i;
const MAX_CREATION_WINDOW_MS = 60 * 60 * 1000;
const MAX_OPERATION_WINDOW_MS = 60 * 60 * 1000;
const MAX_HARD_DELETE_OBSERVATION_AGE_MS = 60 * 1000;

function isSecretKey(key) {
  const snakeCase = String(key).replace(/([a-z0-9])([A-Z])/g, '$1_$2');
  return SECRET_KEY_PATTERN.test(snakeCase);
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a plain object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain object.`);
  }
  return value;
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function assertPositiveInteger(value, label) {
  const normalized = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return normalized;
}

function assertNonNegativeInteger(value, label) {
  const normalized = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return normalized;
}

function assertFiniteWindow(value, label, maximum) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${label} must be a positive integer no greater than ${maximum}.`);
  }
  return value;
}

function parseTimestamp(value, label) {
  const timestamp = Date.parse(assertNonEmptyString(value, label));
  if (!Number.isFinite(timestamp)) throw new Error(`${label} must be a valid ISO timestamp.`);
  return timestamp;
}

function nowIso(now, label = 'now') {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error(`${label} must be a valid Date.`);
  }
  return now.toISOString();
}

function relationId(resource, relation) {
  const direct = resource?.[relation];
  const fallback = resource?.[`${relation}_id`];
  const raw = direct && typeof direct === 'object' ? direct.id : (direct ?? fallback);
  if (raw === undefined || raw === null || raw === '') return null;
  const normalized = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw;
  return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : null;
}

function relationObject(resource, relation) {
  const candidate = resource?.[relation];
  return candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : null;
}

function assertNoSecretFields(value, label = 'value', seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${label} contains a non-finite number.`);
    return;
  }
  if (typeof value !== 'object') throw new Error(`${label} contains a non-JSON value.`);
  if (seen.has(value)) throw new Error(`${label} contains a circular reference.`);
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSecretFields(entry, `${label}[${index}]`, seen));
    seen.delete(value);
    return;
  }

  assertPlainObject(value, label);
  for (const [key, entry] of Object.entries(value)) {
    if (isSecretKey(key)) {
      throw new Error(`${label} contains forbidden secret field ${key}.`);
    }
    assertNoSecretFields(entry, `${label}.${key}`, seen);
  }
  seen.delete(value);
}

function canonicalize(value, label = 'payload') {
  assertNoSecretFields(value, label);

  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry, index) => canonicalize(entry, `${label}[${index}]`)).join(',')}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], `${label}.${key}`)}`)
    .join(',')}}`;
}

function assertExactDevOrigin(baseURL) {
  const raw = assertNonEmptyString(baseURL, 'E2E_BASE_URL');
  if (raw !== baseURL) throw new Error(`E2E_BASE_URL must be exactly ${LIVE_VPS_CERTIFICATION_ORIGIN}.`);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`E2E_BASE_URL must be exactly ${LIVE_VPS_CERTIFICATION_ORIGIN}.`);
  }

  const rootOnly = parsed.pathname === '/' && parsed.search === '' && parsed.hash === '';
  const noCredentials = parsed.username === '' && parsed.password === '';
  const normalizedRaw = raw.endsWith('/') ? raw.slice(0, -1) : raw;
  if (
    parsed.origin !== LIVE_VPS_CERTIFICATION_ORIGIN ||
    !rootOnly ||
    !noCredentials ||
    normalizedRaw !== LIVE_VPS_CERTIFICATION_ORIGIN
  ) {
    throw new Error(`E2E_BASE_URL must be exactly ${LIVE_VPS_CERTIFICATION_ORIGIN}.`);
  }
  return LIVE_VPS_CERTIFICATION_ORIGIN;
}

export function assertRuntimeApiFingerprint(fingerprint) {
  assertPlainObject(fingerprint, 'runtime API fingerprint');
  const version = assertNonEmptyString(fingerprint.version, 'runtime API version');
  const revision = assertNonEmptyString(fingerprint.revision, 'runtime API revision');
  if (
    version !== EXPECTED_VPSADMIN_API_FINGERPRINT.version ||
    revision !== EXPECTED_VPSADMIN_API_FINGERPRINT.revision
  ) {
    throw new Error(
      `Runtime API fingerprint must be exactly ${EXPECTED_VPSADMIN_API_FINGERPRINT.version} / ` +
      `${EXPECTED_VPSADMIN_API_FINGERPRINT.revision}.`
    );
  }
  return { ...EXPECTED_VPSADMIN_API_FINGERPRINT };
}

export function assertFixtureManifest(manifest) {
  assertPlainObject(manifest, 'fixture manifest');
  const unknownKeys = Object.keys(manifest).filter((key) => !FIXTURE_KEYS.includes(key));
  if (unknownKeys.length > 0) {
    throw new Error(`Fixture manifest contains unsupported entries: ${unknownKeys.join(', ')}.`);
  }

  const normalized = {};
  for (const key of FIXTURE_KEYS) {
    const fixture = assertPlainObject(manifest[key], `fixture manifest.${key}`);
    const id = assertPositiveInteger(fixture.id, `fixture manifest.${key}.id`);
    if (fixture.match !== undefined) {
      const unknownFixtureKeys = Object.keys(fixture).filter((field) => !['id', 'match'].includes(field));
      if (unknownFixtureKeys.length > 0) {
        throw new Error(`fixture manifest.${key} contains unsupported fields: ${unknownFixtureKeys.join(', ')}.`);
      }
      const match = assertPlainObject(fixture.match, `fixture manifest.${key}.match`);
      const unknownMatchKeys = Object.keys(match).filter((field) => !['kind', 'value'].includes(field));
      if (unknownMatchKeys.length > 0) {
        throw new Error(`fixture manifest.${key}.match contains unsupported fields: ${unknownMatchKeys.join(', ')}.`);
      }
      if (!['exact', 'prefix'].includes(match.kind)) {
        throw new Error(`fixture manifest.${key}.match.kind must be exact or prefix.`);
      }
      normalized[key] = {
        id,
        match: {
          kind: match.kind,
          value: assertNonEmptyString(match.value, `fixture manifest.${key}.match.value`),
        },
      };
      continue;
    }
    const unknownFixtureKeys = Object.keys(fixture).filter(
      (field) => !['id', 'expectedLabel', 'expectedLabelPrefix'].includes(field)
    );
    if (unknownFixtureKeys.length > 0) {
      throw new Error(`fixture manifest.${key} contains unsupported fields: ${unknownFixtureKeys.join(', ')}.`);
    }
    const hasExact = typeof fixture.expectedLabel === 'string' && fixture.expectedLabel.trim() !== '';
    const hasPrefix = typeof fixture.expectedLabelPrefix === 'string' && fixture.expectedLabelPrefix.trim() !== '';
    if (hasExact === hasPrefix) {
      throw new Error(
        `fixture manifest.${key} must define exactly one of expectedLabel or expectedLabelPrefix.`
      );
    }
    const match = hasExact
      ? { kind: 'exact', value: fixture.expectedLabel.trim() }
      : { kind: 'prefix', value: fixture.expectedLabelPrefix.trim() };
    normalized[key] = { id, match };
  }

  assertNoSecretFields(normalized, 'fixture manifest');
  return normalized;
}

function fixtureResourceLabel(kind, resource) {
  for (const field of FIXTURE_LABEL_FIELDS[kind]) {
    const value = resource?.[field];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return null;
}

export function assertFixtureResources(manifest, resources) {
  const normalizedManifest = assertFixtureManifest(manifest);
  assertPlainObject(resources, 'fixture resources');
  const validated = {};

  for (const key of FIXTURE_KEYS) {
    const resource = assertPlainObject(resources[key], `fixture resources.${key}`);
    const id = assertPositiveInteger(resource.id, `fixture resources.${key}.id`);
    if (id !== normalizedManifest[key].id) {
      throw new Error(`Fixture ${key} ID mismatch: expected ${normalizedManifest[key].id}, received ${id}.`);
    }
    const label = fixtureResourceLabel(key, resource);
    if (!label) throw new Error(`Fixture ${key} label is missing.`);
    const { match } = normalizedManifest[key];
    const matches = match.kind === 'exact' ? label === match.value : label.startsWith(match.value);
    if (!matches) throw new Error(`Fixture ${key} label does not match its manifest allowlist.`);
    validated[key] = { id, label };
  }

  const nodeLocationId = relationId(resources.node, 'location');
  if (nodeLocationId !== normalizedManifest.location.id) {
    throw new Error('Fixture node is not related to the allowlisted location.');
  }
  const locationEnvironmentId = relationId(resources.location, 'environment');
  if (locationEnvironmentId !== normalizedManifest.environment.id) {
    throw new Error('Fixture location is not related to the allowlisted environment.');
  }

  return validated;
}

export function assertLiveVpsCertificationConfig({
  baseURL,
  mutationsEnabled,
  adminToken,
  apiFingerprint,
  fixtureManifest,
}) {
  if (mutationsEnabled !== '1') {
    throw new Error('Live VPS mutations are disabled. Set E2E_LIVE_VPS_MUTATIONS=1 explicitly.');
  }
  const origin = assertExactDevOrigin(baseURL);
  assertNonEmptyString(adminToken, 'live VPS administrator token');
  const fingerprint = assertRuntimeApiFingerprint(apiFingerprint);
  const manifest = assertFixtureManifest(fixtureManifest);
  return { baseURL: origin, origin, fingerprint, manifest };
}

export function createLiveVpsRunIdentity({ now = new Date(), randomSuffix } = {}) {
  const iso = nowIso(now);
  const suffix = assertNonEmptyString(randomSuffix, 'randomSuffix').toLowerCase();
  if (!/^[a-z0-9]{6,12}$/.test(suffix)) {
    throw new Error('randomSuffix must contain 6-12 lowercase letters or digits.');
  }
  const timestamp = iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'z').toLowerCase();
  const runId = `${timestamp}-${suffix}`;
  const prefix = `webui-next-live-vps-${runId}`;
  if (prefix.length > 63 || !/^[a-z0-9-]+$/.test(prefix)) {
    throw new Error('Generated live VPS hostname is not DNS-label safe.');
  }
  return {
    runId,
    prefix,
    hostname: prefix,
    infoMarker: `webui-next-live-vps:${runId}`,
  };
}

export function canonicalPayloadSha256(payload) {
  return crypto.createHash('sha256').update(canonicalize(payload)).digest('hex');
}

export function assertSafeVpsCreatePayload(payload, { identity, fixtureManifest }) {
  const input = assertPlainObject(payload, 'VPS create payload');
  const manifest = assertFixtureManifest(fixtureManifest);
  const required = {
    hostname: assertNonEmptyString(identity?.hostname, 'run identity hostname'),
    info: assertNonEmptyString(identity?.infoMarker, 'run identity info marker'),
    user: manifest.owner.id,
    node: manifest.node.id,
    os_template: manifest.osTemplate.id,
    start: false,
    ipv4: 0,
    ipv6: 0,
    ipv4_private: 0,
  };
  const allowedKeys = new Set([
    ...Object.keys(required),
    'cpu',
    'memory',
    'swap',
    'diskspace',
  ]);
  const unknownKeys = Object.keys(input).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`VPS create payload contains unsupported fields: ${unknownKeys.join(', ')}.`);
  }
  for (const [key, expected] of Object.entries(required)) {
    if (!Object.hasOwn(input, key) || input[key] !== expected) {
      throw new Error(`VPS create payload field ${key} must equal the guarded run value.`);
    }
  }
  for (const key of ['cpu', 'memory', 'diskspace']) {
    if (Object.hasOwn(input, key)) assertPositiveInteger(input[key], `VPS create payload.${key}`);
  }
  if (Object.hasOwn(input, 'swap')) assertNonNegativeInteger(input.swap, 'VPS create payload.swap');
  assertNoSecretFields(input, 'VPS create payload');
  return input;
}

export function createVpsCertificationLedger({
  identity,
  fixtureManifest,
  createPayload,
  baseURL,
  createdAt = new Date(),
  creationWindowMs,
}) {
  const startedAt = nowIso(createdAt, 'createdAt');
  if (baseURL !== LIVE_VPS_CERTIFICATION_ORIGIN) {
    throw new Error(`Ledger baseURL must be ${LIVE_VPS_CERTIFICATION_ORIGIN}.`);
  }
  const windowMs = assertFiniteWindow(creationWindowMs, 'creationWindowMs', MAX_CREATION_WINDOW_MS);
  const manifest = assertFixtureManifest(fixtureManifest);
  const safePayload = assertSafeVpsCreatePayload(createPayload, { identity, fixtureManifest });
  const runId = assertNonEmptyString(identity?.runId, 'run identity runId');
  const hostname = assertNonEmptyString(identity?.hostname, 'run identity hostname');
  const infoMarker = assertNonEmptyString(identity?.infoMarker, 'run identity info marker');
  if (!hostname.startsWith('webui-next-live-vps-') || infoMarker !== `webui-next-live-vps:${runId}`) {
    throw new Error('Run identity is outside the live VPS namespace.');
  }

  const ledger = {
    version: LEDGER_VERSION,
    kind: 'live-vps-certification',
    runId,
    baseURL,
    apiFingerprint: { ...EXPECTED_VPSADMIN_API_FINGERPRINT },
    fixtureManifest: manifest,
    createdAt: startedAt,
    updatedAt: startedAt,
    vps: {
      state: 'intent',
      hostname,
      infoMarker,
      createPayloadSha256: canonicalPayloadSha256(safePayload),
      creationWindow: {
        from: startedAt,
        until: new Date(Date.parse(startedAt) + windowMs).toISOString(),
      },
      cleanup: {
        mode: null,
        attempts: 0,
      },
    },
    history: [{ state: 'intent', at: startedAt }],
  };
  assertNoSecretFields(ledger, 'VPS certification ledger');
  return ledger;
}

function assertLedger(ledger) {
  assertPlainObject(ledger, 'VPS certification ledger');
  if (ledger.version !== LEDGER_VERSION || ledger.kind !== 'live-vps-certification') {
    throw new Error('Invalid VPS certification ledger.');
  }
  if (ledger.baseURL !== LIVE_VPS_CERTIFICATION_ORIGIN) {
    throw new Error('VPS certification ledger has an unsafe origin.');
  }
  assertRuntimeApiFingerprint(ledger.apiFingerprint);
  assertFixtureManifest(ledger.fixtureManifest);
  assertPlainObject(ledger.vps, 'VPS certification ledger.vps');
  if (!['intent', 'created', 'verified', 'cleanup', 'cleaned'].includes(ledger.vps.state)) {
    throw new Error('VPS certification ledger has an invalid state.');
  }
  assertPlainObject(ledger.vps.cleanup, 'VPS certification ledger.vps.cleanup');
  if (!Array.isArray(ledger.history)) throw new Error('VPS certification ledger history is missing.');
  assertNoSecretFields(ledger, 'VPS certification ledger');
  return ledger;
}

function transitionLedger(ledger, fromStates, nextState, at, details = {}) {
  assertLedger(ledger);
  if (!fromStates.includes(ledger.vps.state)) {
    throw new Error(`Invalid VPS ledger transition ${ledger.vps.state} -> ${nextState}.`);
  }
  const timestamp = nowIso(at, 'transition timestamp');
  Object.assign(ledger.vps, details, { state: nextState });
  ledger.updatedAt = timestamp;
  ledger.history.push({ state: nextState, at: timestamp });
  return ledger.vps;
}

export function registerCreatedVps(ledger, { id, observedAt = new Date() }) {
  const vpsId = assertPositiveInteger(id, 'created VPS id');
  return transitionLedger(ledger, ['intent'], 'created', observedAt, {
    id: vpsId,
    createdObservedAt: nowIso(observedAt, 'observedAt'),
  });
}

function assertExpectedRelation(resource, relation, expectedId) {
  const actualId = relationId(resource, relation);
  if (actualId !== expectedId) {
    throw new Error(`VPS ${relation} relation is missing or foreign.`);
  }
}

function assertCandidateVpsIdentity(
  ledger,
  { resource, ipAssignments, observedAt = new Date() },
  { requireRegisteredId }
) {
  assertLedger(ledger);
  const candidate = assertPlainObject(resource, 'VPS identity resource');
  const id = assertPositiveInteger(candidate.id, 'VPS identity resource.id');
  if (requireRegisteredId && id !== ledger.vps.id) throw new Error('VPS identity resource ID is foreign.');
  if (candidate.hostname !== ledger.vps.hostname) throw new Error('VPS hostname is foreign.');
  if (candidate.info !== ledger.vps.infoMarker) throw new Error('VPS info marker is foreign or missing.');

  const manifest = assertFixtureManifest(ledger.fixtureManifest);
  assertExpectedRelation(candidate, 'user', manifest.owner.id);
  assertExpectedRelation(candidate, 'node', manifest.node.id);
  assertExpectedRelation(candidate, 'os_template', manifest.osTemplate.id);

  const node = relationObject(candidate, 'node');
  const location = relationObject(node, 'location');
  if (relationId(node, 'location') !== manifest.location.id) {
    throw new Error('VPS node location relation is missing or foreign.');
  }
  if (relationId(location, 'environment') !== manifest.environment.id) {
    throw new Error('VPS location environment relation is missing or foreign.');
  }

  const createdAt = parseTimestamp(candidate.created_at, 'VPS created_at');
  const windowFrom = parseTimestamp(ledger.vps.creationWindow.from, 'VPS creation window start');
  const windowUntil = parseTimestamp(ledger.vps.creationWindow.until, 'VPS creation window end');
  const observed = observedAt.getTime();
  nowIso(observedAt, 'observedAt');
  if (createdAt < windowFrom || createdAt > windowUntil || createdAt > observed) {
    throw new Error('VPS created_at is outside the guarded creation window.');
  }

  if (!Array.isArray(ipAssignments)) {
    throw new Error('VPS IP assignments must be supplied explicitly.');
  }
  if (ipAssignments.length !== 0) {
    throw new Error('VPS has IP assignments and is not safe for certification cleanup.');
  }

  return { id, hostname: candidate.hostname, createdAt: candidate.created_at };
}

export function assertVpsIdentity(ledger, observation) {
  assertLedger(ledger);
  if (!['created', 'verified', 'cleanup'].includes(ledger.vps.state)) {
    throw new Error(`VPS identity cannot be validated from ledger state ${ledger.vps.state}.`);
  }
  return assertCandidateVpsIdentity(ledger, observation, { requireRegisteredId: true });
}

export function verifyCreatedVps(ledger, observation) {
  const identity = assertVpsIdentity(ledger, observation);
  const verifiedAt = observation.observedAt ?? new Date();
  transitionLedger(ledger, ['created'], 'verified', verifiedAt, {
    verifiedAt: nowIso(verifiedAt, 'observedAt'),
  });
  return identity;
}

export function reconcileUniqueCreatedVps(ledger, observations) {
  assertLedger(ledger);
  if (!['intent', 'created'].includes(ledger.vps.state)) {
    throw new Error('VPS reconciliation requires an intent or created ledger entry.');
  }
  if (!Array.isArray(observations)) throw new Error('VPS reconciliation observations must be an array.');
  const matches = [];
  for (const observation of observations) {
    try {
      matches.push({
        observation,
        identity: assertCandidateVpsIdentity(ledger, observation, {
          requireRegisteredId: ledger.vps.state === 'created',
        }),
      });
    } catch {
      // A reconciliation scan is expected to contain unrelated rows. Only an
      // exact fully validated identity is eligible for ownership.
    }
  }
  if (matches.length === 0) throw new Error('VPS reconciliation found no exact guarded candidate.');
  if (matches.length > 1) throw new Error('VPS reconciliation is ambiguous: multiple exact guarded candidates found.');
  return matches[0];
}

export function assertHardDeleteAllowed(
  ledger,
  observation,
  { now = new Date(), maxObservationAgeMs = MAX_HARD_DELETE_OBSERVATION_AGE_MS } = {}
) {
  assertLedger(ledger);
  if (!['verified', 'cleanup'].includes(ledger.vps.state) || !ledger.vps.verifiedAt) {
    throw new Error('Hard delete is allowed only for an owned verified VPS.');
  }
  if (!(observation?.observedAt instanceof Date) || Number.isNaN(observation.observedAt.getTime())) {
    throw new Error('Hard delete requires an explicit fresh VPS observation timestamp.');
  }
  nowIso(now, 'hard-delete gate timestamp');
  assertFiniteWindow(
    maxObservationAgeMs,
    'hard-delete observation maximum age',
    MAX_HARD_DELETE_OBSERVATION_AGE_MS
  );
  const observationAge = now.getTime() - observation.observedAt.getTime();
  if (observationAge < 0 || observationAge > maxObservationAgeMs) {
    throw new Error('Hard delete requires a fresh VPS observation.');
  }
  if (observation.resource?.is_running !== false) {
    throw new Error('Hard delete requires the owned VPS to be explicitly stopped (is_running=false).');
  }
  return assertVpsIdentity(ledger, observation);
}

export function beginVpsCleanup(ledger, observation, { hardDelete, at = new Date() }) {
  if (hardDelete !== true) {
    throw new Error('Certification cleanup requires an explicit hardDelete=true acknowledgement.');
  }
  assertHardDeleteAllowed(ledger, observation, { now: at });
  const timestamp = nowIso(at, 'cleanup timestamp');
  return transitionLedger(ledger, ['verified', 'cleanup'], 'cleanup', at, {
    cleanup: {
      ...ledger.vps.cleanup,
      attempts: ledger.vps.cleanup.attempts + 1,
      mode: 'hard-delete',
      lastAttemptAt: timestamp,
    },
  });
}

export function markVpsCleanupComplete(ledger, { at = new Date() } = {}) {
  const timestamp = nowIso(at, 'cleanup completion timestamp');
  return transitionLedger(ledger, ['cleanup'], 'cleaned', at, {
    cleanup: {
      ...ledger.vps.cleanup,
      completedAt: timestamp,
    },
  });
}

function actionStateOutcome(actionState) {
  if (actionState === undefined || actionState === null) return null;
  assertPlainObject(actionState, 'action state');
  if (actionState.finished === true) {
    if (actionState.status === true) return 'success';
    if (actionState.status === false) return 'failure';
    return 'ambiguous';
  }
  if (actionState.finished === false) return 'pending';
  return 'ambiguous';
}

function transactionOutcome(transactionChain) {
  if (transactionChain === undefined || transactionChain === null) return null;
  assertPlainObject(transactionChain, 'transaction chain');
  const state = typeof transactionChain.state === 'string' ? transactionChain.state.toLowerCase() : '';
  if (state === 'done') return 'success';
  if (['failed', 'fatal', 'cancelled', 'canceled'].includes(state)) return 'failure';
  if (['staged', 'queued', 'rollbacking', 'running'].includes(state)) return 'pending';
  return 'ambiguous';
}

export function classifyBoundedOperationOutcome({
  actionState,
  transactionChain,
  startedAt,
  deadline,
  now = new Date(),
}) {
  const started = parseTimestamp(startedAt, 'operation startedAt');
  const ends = parseTimestamp(deadline, 'operation deadline');
  const current = now.getTime();
  nowIso(now);
  if (ends <= started || ends - started > MAX_OPERATION_WINDOW_MS) {
    throw new Error(`Operation window must be positive and at most ${MAX_OPERATION_WINDOW_MS} milliseconds.`);
  }
  if (current < started) throw new Error('Operation observation predates its start.');

  const action = actionStateOutcome(actionState);
  const transaction = transactionOutcome(transactionChain);
  const signals = [action, transaction].filter((entry) => entry !== null);

  if (signals.includes('ambiguous')) {
    return { kind: 'ambiguous', actionState: action, transactionChain: transaction };
  }
  if (
    (action === 'success' && transaction === 'failure') ||
    (action === 'failure' && transaction === 'success')
  ) {
    return { kind: 'ambiguous', actionState: action, transactionChain: transaction };
  }
  if (action === 'failure' || transaction === 'failure') {
    return { kind: 'failure', actionState: action, transactionChain: transaction };
  }
  if (action === 'success' && transaction === 'success') {
    return { kind: 'success', actionState: action, transactionChain: transaction };
  }
  if (current >= ends) {
    return { kind: 'timeout', actionState: action, transactionChain: transaction };
  }
  return { kind: 'pending', actionState: action, transactionChain: transaction };
}

function pathComponents(absolutePath) {
  const parsed = path.parse(absolutePath);
  const relative = absolutePath.slice(parsed.root.length);
  const segments = relative.split(path.sep).filter(Boolean);
  const components = [parsed.root];
  let current = parsed.root;
  for (const segment of segments) {
    current = path.join(current, segment);
    components.push(current);
  }
  return components;
}

function resolveTrustedDarwinVarAlias(absolutePath) {
  if (process.platform !== 'darwin') return absolutePath;
  const alias = '/var';
  const canonical = '/private/var';
  if (absolutePath !== alias && !absolutePath.startsWith(`${alias}${path.sep}`)) return absolutePath;

  try {
    if (!fs.lstatSync(alias).isSymbolicLink() || fs.realpathSync(alias) !== canonical) return absolutePath;
  } catch {
    return absolutePath;
  }

  const suffix = absolutePath.slice(alias.length).replace(/^\/+/, '');
  return suffix ? path.join(canonical, suffix) : canonical;
}

export function assertNoSymlinkedVpsArtifactPath(targetPath) {
  const absolutePath = resolveTrustedDarwinVarAlias(
    path.resolve(assertNonEmptyString(targetPath, 'artifact path'))
  );
  for (const component of pathComponents(absolutePath)) {
    try {
      if (fs.lstatSync(component).isSymbolicLink()) {
        throw new Error(`Refusing symlinked VPS certification artifact path component: ${component}`);
      }
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
  }
  return absolutePath;
}

export function ensurePrivateVpsArtifactDirectory(directoryPath) {
  const absolutePath = assertNoSymlinkedVpsArtifactPath(directoryPath);
  fs.mkdirSync(absolutePath, { recursive: true, mode: 0o700 });
  assertNoSymlinkedVpsArtifactPath(absolutePath);
  const stat = fs.lstatSync(absolutePath);
  if (!stat.isDirectory()) throw new Error(`VPS artifact directory is not a directory: ${absolutePath}`);
  fs.chmodSync(absolutePath, 0o700);
  return absolutePath;
}

export function writeVpsCertificationLedgerAtomic(filePath, ledger) {
  assertLedger(ledger);
  const absolutePath = assertNoSymlinkedVpsArtifactPath(filePath);
  const directory = ensurePrivateVpsArtifactDirectory(path.dirname(absolutePath));
  const temporaryPath = `${absolutePath}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  assertNoSymlinkedVpsArtifactPath(temporaryPath);
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(ledger, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    fs.chmodSync(temporaryPath, 0o600);
    assertNoSymlinkedVpsArtifactPath(absolutePath);
    fs.renameSync(temporaryPath, absolutePath);
    assertNoSymlinkedVpsArtifactPath(absolutePath);
    fs.chmodSync(absolutePath, 0o600);
  } finally {
    try {
      const stat = fs.lstatSync(temporaryPath);
      if (!stat.isSymbolicLink() && stat.isFile()) fs.unlinkSync(temporaryPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  fs.chmodSync(directory, 0o700);
  return absolutePath;
}
