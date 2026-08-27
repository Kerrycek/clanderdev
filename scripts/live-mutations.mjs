import fs from 'node:fs';
import path from 'node:path';

const LIVE_MUTATION_ORIGIN = 'https://dev.crucio.cz';
const LEDGER_VERSION = 1;

const CLEANUP_PRIORITY = Object.freeze({
  dns_record: 10,
  dns_zone: 20,
});

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function assertPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
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

export function assertNoSymlinkAncestors(targetPath) {
  const absolutePath = path.resolve(assertNonEmptyString(targetPath, 'artifact path'));
  for (const component of pathComponents(absolutePath)) {
    let stat;
    try {
      stat = fs.lstatSync(component);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing symlinked artifact path component: ${component}`);
    }
  }
  return absolutePath;
}

export function ensurePrivateDirectory(directoryPath) {
  const absolutePath = assertNoSymlinkAncestors(directoryPath);
  fs.mkdirSync(absolutePath, { recursive: true, mode: 0o700 });
  assertNoSymlinkAncestors(absolutePath);
  const stat = fs.lstatSync(absolutePath);
  if (!stat.isDirectory()) throw new Error(`Artifact directory is not a directory: ${absolutePath}`);
  fs.chmodSync(absolutePath, 0o700);
  return absolutePath;
}

function writePrivateFileAtomic(filePath, content) {
  const absolutePath = assertNoSymlinkAncestors(filePath);
  const directory = ensurePrivateDirectory(path.dirname(absolutePath));
  assertNoSymlinkAncestors(absolutePath);
  const temporaryPath = `${absolutePath}.tmp-${process.pid}`;
  assertNoSymlinkAncestors(temporaryPath);
  try {
    fs.writeFileSync(temporaryPath, content, { mode: 0o600, flag: 'wx' });
    fs.chmodSync(temporaryPath, 0o600);
    assertNoSymlinkAncestors(absolutePath);
    fs.renameSync(temporaryPath, absolutePath);
    assertNoSymlinkAncestors(absolutePath);
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
}

export function assertLiveMutationConfig({ baseURL, mutationsEnabled, token }) {
  if (mutationsEnabled !== '1') {
    throw new Error('Live mutations are disabled. Set E2E_LIVE_MUTATIONS=1 explicitly.');
  }

  const rawBaseURL = assertNonEmptyString(baseURL, 'E2E_BASE_URL');
  let parsed;
  try {
    parsed = new URL(rawBaseURL);
  } catch {
    throw new Error(`E2E_BASE_URL must be exactly ${LIVE_MUTATION_ORIGIN}.`);
  }

  const exactOrigin = parsed.origin === LIVE_MUTATION_ORIGIN;
  const rootOnly = parsed.pathname === '/' && parsed.search === '' && parsed.hash === '';
  const noCredentials = parsed.username === '' && parsed.password === '';
  if (!exactOrigin || !rootOnly || !noCredentials || rawBaseURL.replace(/\/$/, '') !== LIVE_MUTATION_ORIGIN) {
    throw new Error(`E2E_BASE_URL must be exactly ${LIVE_MUTATION_ORIGIN}.`);
  }

  assertNonEmptyString(token, 'E2E_LIVE_SESSION_TOKEN');

  return {
    baseURL: LIVE_MUTATION_ORIGIN,
    origin: LIVE_MUTATION_ORIGIN,
  };
}

export function createLiveRunIdentity({ now = new Date(), randomSuffix } = {}) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error('now must be a valid Date.');
  }
  const suffix = assertNonEmptyString(randomSuffix, 'randomSuffix').toLowerCase();
  if (!/^[a-z0-9]{6,16}$/.test(suffix)) {
    throw new Error('randomSuffix must contain 6-16 lowercase letters or digits.');
  }

  const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'z').toLowerCase();
  const prefix = `webui-next-live-${timestamp}-${suffix}`;
  if (prefix.length > 63) throw new Error('Generated run prefix is not DNS-label safe.');

  return {
    runId: `${timestamp}-${suffix}`,
    prefix,
  };
}

export function createObjectLedger({ runId, prefix, baseURL, createdAt = new Date().toISOString() }) {
  assertNonEmptyString(runId, 'runId');
  assertNonEmptyString(prefix, 'prefix');
  if (baseURL !== LIVE_MUTATION_ORIGIN) {
    throw new Error(`Ledger baseURL must be ${LIVE_MUTATION_ORIGIN}.`);
  }

  return {
    version: LEDGER_VERSION,
    runId,
    prefix,
    baseURL,
    createdAt,
    updatedAt: createdAt,
    status: 'running',
    pendingCreates: [],
    objects: [],
  };
}

export function assertMutationAdmin(envelope) {
  if (!envelope || envelope.status !== true) {
    throw new Error('Live mutation token was rejected by users/current.');
  }

  const user = envelope.response?.user ?? envelope.response;
  const rawId = user?.id;
  const id = typeof rawId === 'string' && /^\d+$/.test(rawId) ? Number(rawId) : rawId;
  assertPositiveInteger(id, 'users/current.id');

  const rawLevel = user?.level;
  const level = typeof rawLevel === 'string' && /^\d+$/.test(rawLevel) ? Number(rawLevel) : rawLevel;
  if (!Number.isSafeInteger(level) || level < 90) {
    throw new Error('Live mutations require an administrator token.');
  }

  return { id, role: 'admin' };
}

export function registerOwnedObject(ledger, object) {
  if (!ledger || ledger.version !== LEDGER_VERSION || !Array.isArray(ledger.objects)) {
    throw new Error('Invalid live mutation ledger.');
  }
  if (!Object.hasOwn(CLEANUP_PRIORITY, object?.kind)) {
    throw new Error(`Unsupported live object kind: ${String(object?.kind)}.`);
  }

  const id = assertPositiveInteger(object.id, `${object.kind}.id`);
  const label = assertNonEmptyString(object.label, `${object.kind}.label`);
  if (!label.startsWith(ledger.prefix)) {
    throw new Error(`Refusing to register ${object.kind} #${id}: label is outside run prefix.`);
  }

  if (ledger.objects.some((candidate) => candidate.kind === object.kind && candidate.id === id)) {
    throw new Error(`Duplicate live object ${object.kind} #${id}.`);
  }

  let parentId;
  if (object.kind === 'dns_record') {
    parentId = assertPositiveInteger(object.parentId, 'dns_record.parentId');
    const parent = ledger.objects.find((candidate) => candidate.kind === 'dns_zone' && candidate.id === parentId);
    if (!parent) {
      throw new Error(`Refusing to register dns_record #${id}: parent zone is not owned by this run.`);
    }
  }

  const entry = {
    kind: object.kind,
    id,
    label,
    ...(parentId === undefined ? {} : { parentId }),
    createdAt: object.createdAt ?? new Date().toISOString(),
    cleanup: {
      status: 'pending',
      attempts: 0,
    },
  };

  ledger.objects.push(entry);
  ledger.updatedAt = new Date().toISOString();
  return entry;
}

export function assertOwnedObject(ledger, object) {
  const owned = ledger?.objects?.find((candidate) => candidate.kind === object?.kind && candidate.id === object?.id);
  if (!owned || !owned.label.startsWith(ledger.prefix)) {
    throw new Error(`Refusing cleanup for unowned ${String(object?.kind)} #${String(object?.id)}.`);
  }
  return owned;
}

function relationId(resource, relation) {
  const direct = resource?.[relation];
  const fallback = resource?.[`${relation}_id`];
  const raw = direct && typeof direct === 'object' ? direct.id : (direct ?? fallback);
  const value = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function assertCleanupResourceIdentity(ledger, object, { namespace, resource }) {
  const owned = assertOwnedObject(ledger, object);
  const expectedNamespace = owned.kind === 'dns_record' ? 'dns_record' : 'dns_zone';
  if (namespace !== expectedNamespace) {
    throw new Error(`Refusing cleanup for ${owned.kind} #${owned.id}: unexpected resource type.`);
  }
  if (!resource || typeof resource !== 'object' || Array.isArray(resource)) {
    throw new Error(`Refusing cleanup for ${owned.kind} #${owned.id}: resource identity is missing.`);
  }

  const rawId = resource.id;
  const actualId = typeof rawId === 'string' && /^\d+$/.test(rawId) ? Number(rawId) : rawId;
  if (actualId !== owned.id) {
    throw new Error(`Refusing cleanup for ${owned.kind} #${owned.id}: resource ID changed.`);
  }

  const expectedName = owned.kind === 'dns_record'
    ? owned.label.slice(owned.label.lastIndexOf('/') + 1)
    : owned.label;
  if (!expectedName.startsWith(ledger.prefix) && owned.kind === 'dns_zone') {
    throw new Error(`Refusing cleanup for ${owned.kind} #${owned.id}: expected name is outside run prefix.`);
  }
  if (String(resource.name ?? '') !== expectedName) {
    throw new Error(`Refusing cleanup for ${owned.kind} #${owned.id}: resource name changed.`);
  }

  if (owned.kind === 'dns_record') {
    const recordType = String(resource.type ?? resource.record_type ?? '');
    if (recordType !== 'A') {
      throw new Error(`Refusing cleanup for dns_record #${owned.id}: DNS record type changed or is missing.`);
    }
    const zoneId = relationId(resource, 'dns_zone');
    if (zoneId !== owned.parentId) {
      throw new Error(`Refusing cleanup for dns_record #${owned.id}: parent zone changed or is missing.`);
    }
    const parent = assertOwnedObject(ledger, { kind: 'dns_zone', id: owned.parentId });
    if (!owned.label.startsWith(`${parent.label}/`)) {
      throw new Error(`Refusing cleanup for dns_record #${owned.id}: label is outside its owned parent.`);
    }
  }

  return owned;
}

export function matchesHaveApiMutation({ method, url }, { expectedMethod, resource, apiVersion = '7.0' }) {
  if (method !== expectedMethod) return false;
  if (typeof resource !== 'string' || !/^[a-z_]+(?:\/\d+)?$/.test(resource)) return false;
  if (!/^\d+\.\d+$/.test(apiVersion)) return false;

  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/$/, '');
    const expectedPaths = new Set([`/v${apiVersion}/${resource}`, `/api/v${apiVersion}/${resource}`]);
    return parsed.origin === LIVE_MUTATION_ORIGIN && expectedPaths.has(pathname);
  } catch {
    return false;
  }
}

export function cleanupOrder(ledger) {
  if (!ledger || !Array.isArray(ledger.objects)) throw new Error('Invalid live mutation ledger.');
  return [...ledger.objects].sort((left, right) => {
    const priority = CLEANUP_PRIORITY[left.kind] - CLEANUP_PRIORITY[right.kind];
    if (priority !== 0) return priority;
    return right.id - left.id;
  });
}

export async function cleanupOwnedObjects(ledger, handlers, { onChange, sanitizeError } = {}) {
  const failures = [];
  const cleaned = [];

  ledger.status = 'cleaning';
  ledger.updatedAt = new Date().toISOString();
  await onChange?.(ledger);

  for (const candidate of cleanupOrder(ledger)) {
    const object = assertOwnedObject(ledger, candidate);
    if (object.cleanup.status === 'cleaned') continue;

    if (object.kind === 'dns_zone') {
      const unclearedChildren = ledger.objects.filter(
        (entry) => entry.kind === 'dns_record' && entry.parentId === object.id && entry.cleanup.status !== 'cleaned'
      );
      if (unclearedChildren.length > 0) {
        const childRefs = unclearedChildren.map((entry) => `dns_record #${entry.id}`).join(', ');
        const error = `Blocked parent cleanup: owned children are not clean (${childRefs}).`;
        object.cleanup.status = 'blocked';
        object.cleanup.error = error;
        object.cleanup.blockedBy = unclearedChildren.map((entry) => ({ kind: entry.kind, id: entry.id }));
        failures.push({ kind: object.kind, id: object.id, error, blocked: true });
        ledger.updatedAt = new Date().toISOString();
        await onChange?.(ledger);
        continue;
      }
    }

    delete object.cleanup.blockedBy;

    const handler = handlers?.[object.kind];
    object.cleanup.attempts += 1;
    object.cleanup.lastAttemptAt = new Date().toISOString();

    if (typeof handler !== 'function') {
      const error = `Missing cleanup handler for ${object.kind}.`;
      object.cleanup.status = 'failed';
      object.cleanup.error = error;
      failures.push({ kind: object.kind, id: object.id, error });
      await onChange?.(ledger);
      continue;
    }

    try {
      await handler(object);
      object.cleanup.status = 'cleaned';
      object.cleanup.cleanedAt = new Date().toISOString();
      delete object.cleanup.error;
      cleaned.push({ kind: object.kind, id: object.id });
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      const message = typeof sanitizeError === 'function' ? sanitizeError(rawMessage) : rawMessage;
      object.cleanup.status = 'failed';
      object.cleanup.error = message;
      failures.push({ kind: object.kind, id: object.id, error: message });
    }

    ledger.updatedAt = new Date().toISOString();
    await onChange?.(ledger);
  }

  ledger.status = failures.length === 0 ? 'cleaned' : 'cleanup_failed';
  ledger.updatedAt = new Date().toISOString();
  await onChange?.(ledger);

  return { cleaned, failures };
}

export function writeLedgerAtomic(filePath, ledger) {
  writePrivateFileAtomic(filePath, `${JSON.stringify(ledger, null, 2)}\n`);
}

export function extractHaveApiResourceId(envelope, namespace) {
  const response = envelope?.response;
  const resource = response?.[namespace] ?? response;
  const rawId = resource?.id;
  const id = typeof rawId === 'string' && /^\d+$/.test(rawId) ? Number(rawId) : rawId;
  return assertPositiveInteger(id, `${namespace}.id`);
}

export { LIVE_MUTATION_ORIGIN };
