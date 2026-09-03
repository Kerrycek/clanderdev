#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { chromium } from '@playwright/test';

import {
  LIVE_VPS_CERTIFICATION_ORIGIN,
  assertFixtureResources,
  assertHardDeleteAllowed,
  assertLiveVpsCertificationConfig,
  assertNoSymlinkedVpsArtifactPath,
  assertSafeVpsCreatePayload,
  assertVpsIdentity,
  beginVpsCleanup,
  canonicalPayloadSha256,
  classifyBoundedOperationOutcome,
  createLiveVpsRunIdentity,
  createVpsCertificationLedger,
  ensurePrivateVpsArtifactDirectory,
  hasActiveMaintenanceLock,
  markVpsCleanupComplete,
  reconcileUniqueCreatedVps,
  registerCreatedVps,
  verifyCreatedVps,
  writeVpsCertificationLedgerAtomic,
} from './live-vps-certification-core.mjs';
import { createLiveVpsBrowserMutationGuard } from './live-vps-certification-browser-guard.mjs';
import {
  classifyLiveVpsBrowserAuthentication,
  proxyPinnedLiveVpsBrowserRequest,
} from './live-vps-certification-browser-proxy.mjs';
import {
  buildOwnerVpsCountUrl,
  buildExactLiveVpsPresenceUrl,
  buildLiveVpsReconciliationUrl,
  classifyExactLiveVpsPresenceResponse,
  classifyExactVpsCandidateSet,
  classifyLiveVpsHardDeleteEvidence,
  classifyOwnerVpsCountResponse,
} from './live-vps-certification-reconciliation.mjs';
import {
  PINNED_LIVE_VPS_LEAF_DER_SHA256,
  PINNED_LIVE_VPS_SPKI_SHA256_BASE64,
  PinnedLiveVpsHttpsClient,
  verifyPinnedLiveVpsTlsCertificate,
} from './live-vps-certification-tls.mjs';

process.umask(0o077);

const OPERATION_TIMEOUT_MS = 10 * 60 * 1000;
const CREATE_RECONCILIATION_ATTEMPTS = 12;
const CREATE_RECONCILIATION_DELAY_MS = 2_500;
const CREATE_UNIQUENESS_STABLE_OBSERVATIONS = 3;
const UI_MUTATION_SETTLE_MS = 1_500;
const OBJECT_POLL_ATTEMPTS = 60;
const OBJECT_POLL_DELAY_MS = 2_000;
// This is the exact public /v7.0/ response audited for the source revision
// accepted by live-vps-certification-core.mjs. It is intentionally code-pinned:
// an operator-controlled fixture must not be able to attest an arbitrary API.
const PINNED_PUBLIC_API_DESCRIPTION_SHA256 =
  '9637bfe1e83001f58e976384eba7e397e15929bb3b9251bfc454fdae959a812e';
const SAFE_RESOURCE_RANGES = Object.freeze({
  cpu: { min: 1, max: 4 },
  memory: { min: 1024, max: 8192 },
  diskspace: { min: 1024, max: 32768 },
  swap: { min: 0, max: 4096 },
});

function fail(message) {
  throw new Error(message);
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be a plain object.`);
  return value;
}

function assertExactKeys(value, expected, label) {
  const keys = Object.keys(assertPlainObject(value, label));
  const unknown = keys.filter((key) => !expected.includes(key));
  const missing = expected.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length > 0) fail(`${label} contains unsupported fields: ${unknown.join(', ')}.`);
  if (missing.length > 0) fail(`${label} is missing fields: ${missing.join(', ')}.`);
}

function positiveInteger(value, label) {
  const normalized = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(normalized) || normalized <= 0) fail(`${label} must be a positive integer.`);
  return normalized;
}

function nonNegativeInteger(value, label) {
  const normalized = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(normalized) || normalized < 0) fail(`${label} must be a non-negative integer.`);
  return normalized;
}

function relationId(resource, relation) {
  const direct = resource?.[relation];
  const fallback = resource?.[`${relation}_id`];
  const raw = direct && typeof direct === 'object' ? direct.id : (direct ?? fallback);
  const normalized = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw;
  return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : null;
}

function sanitizeText(value, token) {
  let sanitized = String(value ?? '');
  if (token) sanitized = sanitized.split(token).join('[REDACTED]');
  return sanitized
    .replace(/X-HaveAPI-(?:OAuth2|Auth)-Token\s*[:=]\s*[^\s,;]+/gi, '[REDACTED AUTH HEADER]')
    .replace(/Authorization\s*[:=]\s*Bearer\s+[^\s,;]+/gi, '[REDACTED AUTH HEADER]');
}

function safeError(error, token) {
  return sanitizeText(error instanceof Error ? error.message : String(error), token);
}

function sanitizeBrowserPath(rawUrl, token) {
  let pathname;
  try {
    pathname = new URL(String(rawUrl)).pathname;
  } catch {
    pathname = String(rawUrl ?? '').split(/[?#]/, 1)[0];
  }
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // Keep malformed percent-encoding inspectable without risking a reporter failure.
  }
  return sanitizeText(pathname, token).slice(0, 300);
}

function sanitizeBrowserLocation(location, token) {
  const rawLocation = location && typeof location === 'object' ? location : {};
  return {
    path: sanitizeBrowserPath(rawLocation.url ?? '', token),
    line: Number.isSafeInteger(rawLocation.lineNumber) && rawLocation.lineNumber >= 0
      ? rawLocation.lineNumber
      : null,
    column: Number.isSafeInteger(rawLocation.columnNumber) && rawLocation.columnNumber >= 0
      ? rawLocation.columnNumber
      : null,
  };
}

function readPrivateFile(filePath, label) {
  const absolutePath = assertNoSymlinkedVpsArtifactPath(path.resolve(filePath));
  const stat = fs.lstatSync(absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a regular file.`);
  if ((stat.mode & 0o077) !== 0) fail(`${label} must not be readable or writable by group/other (chmod 600).`);
  return fs.readFileSync(absolutePath, 'utf8');
}

function readAdminToken() {
  const inline = process.env.E2E_LIVE_ADMIN_TOKEN?.trim() || '';
  const tokenFile = process.env.E2E_LIVE_ADMIN_TOKEN_FILE?.trim() || '';
  if (inline && tokenFile) fail('Set exactly one of E2E_LIVE_ADMIN_TOKEN or E2E_LIVE_ADMIN_TOKEN_FILE.');
  if (inline) return inline;
  if (!tokenFile) return '';
  const token = readPrivateFile(tokenFile, 'E2E_LIVE_ADMIN_TOKEN_FILE').trim();
  if (!token) fail('E2E_LIVE_ADMIN_TOKEN_FILE is empty.');
  return token;
}

function normalizeFixture(raw) {
  assertExactKeys(raw, ['apiProtocolVersion', 'apiFingerprint', 'fixtures', 'resources'], 'fixture file');
  if (raw.apiProtocolVersion !== '7.0') fail('fixture file.apiProtocolVersion must be exactly 7.0.');
  assertExactKeys(
    raw.apiFingerprint,
    ['version', 'revision'],
    'fixture file.apiFingerprint'
  );
  assertExactKeys(raw.resources, ['cpu', 'memory', 'diskspace', 'swap'], 'fixture file.resources');

  const resources = {};
  for (const [name, range] of Object.entries(SAFE_RESOURCE_RANGES)) {
    const value = name === 'swap'
      ? nonNegativeInteger(raw.resources[name], `fixture file.resources.${name}`)
      : positiveInteger(raw.resources[name], `fixture file.resources.${name}`);
    if (value < range.min || value > range.max) {
      fail(`fixture file.resources.${name} must be in the guarded range ${range.min}-${range.max}.`);
    }
    resources[name] = value;
  }

  return {
    apiProtocolVersion: '7.0',
    apiFingerprint: raw.apiFingerprint,
    fixtures: raw.fixtures,
    resources,
  };
}

function readFixture() {
  const fixtureFile = process.env.E2E_LIVE_VPS_FIXTURE_FILE?.trim();
  if (!fixtureFile) fail('E2E_LIVE_VPS_FIXTURE_FILE is required.');
  let raw;
  try {
    raw = JSON.parse(readPrivateFile(fixtureFile, 'E2E_LIVE_VPS_FIXTURE_FILE'));
  } catch (error) {
    if (error instanceof SyntaxError) fail('E2E_LIVE_VPS_FIXTURE_FILE is not valid JSON.');
    throw error;
  }
  return normalizeFixture(raw);
}

function privateWriteJson(filePath, value) {
  const absolutePath = assertNoSymlinkedVpsArtifactPath(filePath);
  ensurePrivateVpsArtifactDirectory(path.dirname(absolutePath));
  const temporaryPath = `${absolutePath}.tmp-${process.pid}-${crypto.randomBytes(5).toString('hex')}`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporaryPath, absolutePath);
    fs.chmodSync(absolutePath, 0o600);
  } finally {
    try {
      const stat = fs.lstatSync(temporaryPath);
      if (stat.isFile() && !stat.isSymbolicLink()) fs.unlinkSync(temporaryPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

function hardenArtifactTree(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  assertNoSymlinkedVpsArtifactPath(targetPath);
  const stat = fs.lstatSync(targetPath);
  if (stat.isDirectory()) {
    fs.chmodSync(targetPath, 0o700);
    for (const entry of fs.readdirSync(targetPath)) hardenArtifactTree(path.join(targetPath, entry));
  } else if (stat.isFile()) {
    fs.chmodSync(targetPath, 0o600);
  }
}

function sleep(milliseconds) {
  if (cleanupInProgress) return new Promise((resolve) => setTimeout(resolve, milliseconds));
  throwIfInterrupted();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      interruptController.signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(interruptController.signal.reason);
    };
    interruptController.signal.addEventListener('abort', onAbort, { once: true });
  });
}

const interruptController = new AbortController();
let cleanupInProgress = false;
const requestGracefulInterruption = (signal) => {
  if (!interruptController.signal.aborted) {
    interruptController.abort(new Error(`Live VPS certification interrupted by ${signal}; guarded cleanup will run.`));
  }
};
const onSigint = () => requestGracefulInterruption('SIGINT');
const onSigterm = () => requestGracefulInterruption('SIGTERM');
process.once('SIGINT', onSigint);
process.once('SIGTERM', onSigterm);

function throwIfInterrupted() {
  if (interruptController.signal.aborted) throw interruptController.signal.reason;
}

function envelopeResource(envelope, namespace) {
  const response = envelope?.response;
  const namespaced = response?.[namespace];
  if (namespaced && typeof namespaced === 'object' && !Array.isArray(namespaced)) return namespaced;
  if (response && typeof response === 'object' && !Array.isArray(response) && Object.hasOwn(response, 'id')) return response;
  return null;
}

function envelopeRows(envelope, namespace) {
  const response = envelope?.response;
  if (Array.isArray(response)) return response;
  const namespaced = response?.[namespace];
  if (Array.isArray(namespaced)) return namespaced;
  if (namespaced && typeof namespaced === 'object') return [namespaced];
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    const arrays = Object.entries(response).filter(
      ([key, value]) => !['_meta', 'meta'].includes(key) && Array.isArray(value)
    );
    if (arrays.length === 1) return arrays[0][1];
  }
  return [];
}

function envelopeActionStateId(envelope) {
  const response = envelope?.response;
  const meta = response?._meta ?? response?.meta ?? envelope?._meta ?? envelope?.meta;
  const raw = meta?.action_state_id ?? meta?.state_id ?? meta?.action_state ?? meta?.state;
  const rawId = raw && typeof raw === 'object' ? raw.id : raw;
  return positiveInteger(rawId, 'HaveAPI action_state_id');
}

function envelopeMeta(envelope) {
  const response = envelope?.response;
  const meta = response?._meta ?? response?.meta ?? envelope?._meta ?? envelope?.meta;
  return meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : null;
}

function envelopeTotalCount(envelope, label) {
  const raw = envelopeMeta(envelope)?.total_count;
  if (raw === undefined || raw === null || raw === '') return null;
  return nonNegativeInteger(raw, `${label} total_count`);
}

function requestPath(apiVersion, pathname) {
  return `/v${apiVersion}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

function paramsUrl(apiVersion, pathname, namespace, params = {}, meta = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(`${namespace}[${key}]`, String(value));
  }
  for (const [key, value] of Object.entries(meta)) {
    if (value !== undefined) query.set(`_meta[${key}]`, String(value));
  }
  const encoded = query.toString();
  return `${requestPath(apiVersion, pathname)}${encoded ? `?${encoded}` : ''}`;
}

function assertAdminUser(envelope) {
  if (envelope?.status !== true) fail('The live VPS token was rejected by users/current.');
  const user = envelopeResource(envelope, 'user') ?? envelope?.response;
  const id = positiveInteger(user?.id, 'users/current.id');
  const level = nonNegativeInteger(user?.level, 'users/current.level');
  if (level < 90) fail('Live VPS certification requires an administrator token (level 90+).');
  return { id, level, login: String(user?.login ?? '') };
}

const baseURL = process.env.E2E_BASE_URL?.trim() ?? '';
const token = readAdminToken();
const fixture = readFixture();
const config = assertLiveVpsCertificationConfig({
  baseURL,
  mutationsEnabled: process.env.E2E_LIVE_VPS_MUTATIONS,
  adminToken: token,
  apiFingerprint: fixture.apiFingerprint,
  fixtureManifest: fixture.fixtures,
});

const identity = createLiveVpsRunIdentity({
  now: new Date(),
  randomSuffix: crypto.randomBytes(4).toString('hex'),
});
const outputRoot = path.resolve(process.env.E2E_LIVE_VPS_OUT_DIR ?? path.join('work', 'live-vps-certification'));
const runDirectory = path.join(outputRoot, identity.runId);
const ledgerPath = path.join(runDirectory, 'ledger.json');
const reportPath = path.join(runDirectory, 'report.json');
const recordArtifacts = process.env.E2E_RECORD_ARTIFACTS === '1';
const chromiumExecutablePath = process.env.E2E_CHROMIUM_EXECUTABLE_PATH?.trim() || undefined;
const apiVersion = fixture.apiProtocolVersion;

const createPayload = assertSafeVpsCreatePayload({
  hostname: identity.hostname,
  info: identity.infoMarker,
  user: fixture.fixtures.owner.id,
  node: fixture.fixtures.node.id,
  os_template: fixture.fixtures.osTemplate.id,
  start: false,
  ipv4: 0,
  ipv6: 0,
  ipv4_private: 0,
  ...fixture.resources,
}, { identity, fixtureManifest: fixture.fixtures });

const ledger = createVpsCertificationLedger({
  identity,
  fixtureManifest: fixture.fixtures,
  createPayload,
  baseURL: config.baseURL,
  creationWindowMs: 30 * 60 * 1000,
});
ledger.execution = { mode: 'serial', workers: 1 };
ledger.operations = [];

let publicContext;
let apiContext;
let browser;
let browserContext;
let page;
let tlsProof;
let createdVpsId;
let createSubmissionStarted = false;
let browserMutationGuard;
let testError = null;
let cleanupError = null;
const checks = [];
const browserHttpFailures = [];
const browserRequestFailures = [];
const consoleFailures = [];
const artifactFailures = [];
const securityFailures = [];
const cleanup = { attempted: false, stopped: false, deleted: false, objectAbsent: false };

function persistLedger() {
  writeVpsCertificationLedgerAtomic(ledgerPath, ledger);
}

function recordOperation(name, actionStateId, status, extra = {}) {
  const existing = ledger.operations.find((entry) => entry.name === name && entry.actionStateId === actionStateId);
  const entry = {
    name,
    actionStateId,
    transactionChainId: actionStateId,
    status,
    at: new Date().toISOString(),
    ...extra,
  };
  if (existing) Object.assign(existing, entry);
  else ledger.operations.push(entry);
  persistLedger();
}

async function check(name, callback) {
  const startedAt = new Date().toISOString();
  try {
    throwIfInterrupted();
    await callback();
    throwIfInterrupted();
    checks.push({ name, status: 'passed', startedAt, finishedAt: new Date().toISOString() });
  } catch (error) {
    checks.push({
      name,
      status: 'failed',
      startedAt,
      finishedAt: new Date().toISOString(),
      error: safeError(error, token),
    });
    await screenshot(`error-${String(checks.length).padStart(2, '0')}`, { bestEffort: true });
    throw error;
  }
}

async function screenshot(name, { bestEffort = false } = {}) {
  if (!recordArtifacts || !page) return;
  const screenshotPath = path.join(runDirectory, `${name}.png`);
  try {
    assertNoSymlinkedVpsArtifactPath(screenshotPath);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    fs.chmodSync(screenshotPath, 0o600);
  } catch (error) {
    artifactFailures.push({ name, error: safeError(error, token) });
    if (!bestEffort) throw error;
  }
}

async function parseEnvelope(response, label) {
  const envelope = await response.json().catch(() => null);
  if (!response.ok() || envelope?.status === false || !envelope) {
    fail(`${label} failed (HTTP ${response.status()}): ${sanitizeText(envelope?.message ?? 'invalid response', token)}`);
  }
  return envelope;
}

async function apiFetch(pathname, options = {}) {
  if (!apiContext) fail('Independent HaveAPI request context is unavailable.');
  return apiContext.fetch(requestPath(apiVersion, pathname), {
    method: options.method ?? 'GET',
    failOnStatusCode: false,
    maxRedirects: 0,
    timeout: options.timeout ?? 30_000,
    ...(options.data === undefined ? {} : { data: options.data }),
  });
}

async function apiEnvelope(pathname, options = {}) {
  const response = await apiFetch(pathname, options);
  return parseEnvelope(response, `${options.method ?? 'GET'} ${pathname}`);
}

async function apiResource(resource, namespace, id, includes) {
  const response = await apiContext.get(paramsUrl(apiVersion, `/${resource}/${id}`, namespace, {}, { includes }), {
    failOnStatusCode: false,
    maxRedirects: 0,
    timeout: 30_000,
  });
  const envelope = await parseEnvelope(response, `GET ${resource}/${id}`);
  const value = envelopeResource(envelope, namespace);
  if (!value) fail(`GET ${resource}/${id} omitted ${namespace}.`);
  return value;
}

async function fetchIpAssignments(vpsId) {
  const response = await apiContext.get(
    paramsUrl(apiVersion, '/ip_addresses', 'ip_address', { vps: vpsId, limit: 250 }, { includes: 'network_interface__vps' }),
    { failOnStatusCode: false, maxRedirects: 0, timeout: 30_000 }
  );
  const envelope = await parseEnvelope(response, `GET ip_addresses for VPS #${vpsId}`);
  return envelopeRows(envelope, 'ip_address');
}

async function observeVps(vpsId) {
  const resource = await apiResource(
    'vpses',
    'vps',
    vpsId,
    'node__location__environment,user,os_template'
  );
  return { resource, ipAssignments: await fetchIpAssignments(vpsId), observedAt: new Date() };
}

async function fetchVpsState(vpsId) {
  const response = await apiContext.get(
    buildExactLiveVpsPresenceUrl({
      apiVersion,
      vpsId,
      hostname: identity.hostname,
      ownerId: fixture.fixtures.owner.id,
      nodeId: fixture.fixtures.node.id,
    }),
    { failOnStatusCode: false, maxRedirects: 0, timeout: 30_000 }
  );
  const envelope = await response.json().catch(() => null);
  try {
    return classifyExactLiveVpsPresenceResponse({
      httpStatus: response.status(),
      envelope,
      vpsId,
    });
  } catch (error) {
    fail(`Authenticated exact VPS #${vpsId} presence proof failed: ${safeError(error, token)}`);
  }
}

async function verifyPublicRuntime() {
  const configResponse = await publicContext.get('/config.js', {
    failOnStatusCode: false,
    maxRedirects: 0,
    timeout: 30_000,
  });
  if (!configResponse.ok()) fail(`Public config.js returned HTTP ${configResponse.status()}.`);
  const body = await configResponse.text();
  const apiMatch = body.match(/window\.vpsAdmin\.api\s*=\s*(\{[^;]+\})\s*;/);
  if (!apiMatch) fail('Public config.js does not expose the expected API configuration.');
  let publicApi;
  try {
    publicApi = JSON.parse(apiMatch[1]);
  } catch {
    fail('Public config.js API configuration is not valid JSON.');
  }
  if (publicApi?.url !== LIVE_VPS_CERTIFICATION_ORIGIN || publicApi?.version !== apiVersion) {
    fail(`Public config.js must target ${LIVE_VPS_CERTIFICATION_ORIGIN} API v${apiVersion}.`);
  }

  const descriptionResponse = await publicContext.get(`/v${apiVersion}/`, {
    failOnStatusCode: false,
    maxRedirects: 0,
    timeout: 60_000,
  });
  if (!descriptionResponse.ok()) fail(`Public API description returned HTTP ${descriptionResponse.status()}.`);
  const description = await descriptionResponse.text();
  if (!description.includes(`<h1 id="api">API v${apiVersion}</h1>`)) {
    fail(`Public API description does not prove API protocol v${apiVersion}.`);
  }
  const descriptionSha256 = crypto.createHash('sha256').update(description).digest('hex');
  if (descriptionSha256 !== PINNED_PUBLIC_API_DESCRIPTION_SHA256) {
    fail('The deployed public API description does not match the audited revision fingerprint.');
  }
}

async function verifyFixtureAndResources() {
  const resources = {
    owner: await apiResource('users', 'user', fixture.fixtures.owner.id),
    node: await apiResource('nodes', 'node', fixture.fixtures.node.id, 'location__environment'),
    osTemplate: await apiResource('os_templates', 'os_template', fixture.fixtures.osTemplate.id),
    environment: await apiResource('environments', 'environment', fixture.fixtures.environment.id),
    location: await apiResource('locations', 'location', fixture.fixtures.location.id, 'environment'),
  };
  assertFixtureResources(fixture.fixtures, resources);

  if (resources.node.type !== undefined && resources.node.type !== 'node') fail('Allowlisted node is not a VPS node.');
  if (resources.node.hypervisor_type !== undefined && resources.node.hypervisor_type !== 'vpsadminos') {
    fail('Allowlisted node is not a vpsadminos hypervisor.');
  }
  if (resources.node.active === false) fail('Allowlisted node is inactive.');
  if (resources.node.status !== undefined && resources.node.status !== true) {
    fail('Allowlisted node does not report an explicitly healthy status.');
  }
  if (hasActiveMaintenanceLock(resources.node.maintenance_lock)) {
    fail('Allowlisted node is under maintenance.');
  }
  if (resources.node.maintenance === true || resources.node.locked === true) {
    fail('Allowlisted node exposes an active maintenance/lock flag.');
  }
  if (resources.osTemplate.enabled === false) fail('Allowlisted OS template is disabled.');
  if (resources.osTemplate.hypervisor_type !== undefined && resources.osTemplate.hypervisor_type !== 'vpsadminos') {
    fail('Allowlisted OS template is not compatible with vpsadminos.');
  }
  if (resources.environment.can_create_vps === false) fail('Allowlisted environment currently forbids VPS creation.');

  const environmentConfigResponse = await apiContext.get(
    paramsUrl(
      apiVersion,
      `/users/${fixture.fixtures.owner.id}/environment_configs`,
      'environment_config',
      { environment: fixture.fixtures.environment.id, limit: 10 },
      { includes: 'environment' }
    ),
    { failOnStatusCode: false, maxRedirects: 0, timeout: 30_000 }
  );
  const environmentConfigEnvelope = await parseEnvelope(
    environmentConfigResponse,
    `GET users/${fixture.fixtures.owner.id}/environment_configs`
  );
  const environmentConfigs = envelopeRows(environmentConfigEnvelope, 'environment_config').filter(
    (candidate) => relationId(candidate, 'environment') === fixture.fixtures.environment.id
  );
  if (environmentConfigs.length !== 1) {
    fail('The allowlisted owner must have exactly one unambiguous environment config for the fixture environment.');
  }
  const environmentConfig = environmentConfigs[0];
  if (environmentConfig.can_create_vps !== true) {
    fail('The allowlisted owner environment config does not explicitly allow VPS creation.');
  }
  const maxVpsCount = nonNegativeInteger(
    environmentConfig.max_vps_count,
    'owner environment config.max_vps_count'
  );
  if (maxVpsCount > 0) {
    const ownerVpsResponse = await apiContext.get(
      buildOwnerVpsCountUrl({
        apiVersion,
        ownerId: fixture.fixtures.owner.id,
        environmentId: fixture.fixtures.environment.id,
      }),
      { failOnStatusCode: false, maxRedirects: 0, timeout: 30_000 }
    );
    const ownerVpsEnvelope = await ownerVpsResponse.json().catch(() => null);
    const currentVpsCount = classifyOwnerVpsCountResponse({
      httpStatus: ownerVpsResponse.status(),
      envelope: ownerVpsEnvelope,
    });
    if (currentVpsCount >= maxVpsCount) {
      fail('The allowlisted owner has no remaining VPS-count capacity in the fixture environment.');
    }
  }

  const definitionsResponse = await apiContext.get(
    paramsUrl(apiVersion, '/cluster_resources', 'cluster_resource', { limit: 250 }),
    { failOnStatusCode: false, maxRedirects: 0, timeout: 30_000 }
  );
  const definitionsEnvelope = await parseEnvelope(definitionsResponse, 'GET cluster_resources');
  const definitions = envelopeRows(definitionsEnvelope, 'cluster_resource');

  const allocationsResponse = await apiContext.get(
    paramsUrl(
      apiVersion,
      `/users/${fixture.fixtures.owner.id}/cluster_resources`,
      'cluster_resource',
      { environment: fixture.fixtures.environment.id, limit: 250 },
      { includes: 'environment,cluster_resource' }
    ),
    { failOnStatusCode: false, maxRedirects: 0, timeout: 30_000 }
  );
  const allocationsEnvelope = await parseEnvelope(
    allocationsResponse,
    `GET users/${fixture.fixtures.owner.id}/cluster_resources`
  );
  const allocations = envelopeRows(allocationsEnvelope, 'cluster_resource');

  for (const [name, value] of Object.entries(fixture.resources)) {
    const matchingDefinitions = definitions.filter((candidate) => candidate?.name === name);
    if (matchingDefinitions.length !== 1) {
      fail(`API cluster resource definition ${name} is missing or ambiguous.`);
    }
    const definition = matchingDefinitions[0];
    const minimum = definition.min === undefined || definition.min === null ? null : Number(definition.min);
    const maximum = definition.max === undefined || definition.max === null ? null : Number(definition.max);
    if (minimum !== null && (!Number.isFinite(minimum) || value < minimum)) {
      fail(`Allowlisted ${name} is below the live API minimum.`);
    }
    if (maximum !== null && (!Number.isFinite(maximum) || value > maximum)) {
      fail(`Allowlisted ${name} is above the live API maximum.`);
    }
    if (definition.stepsize !== undefined && definition.stepsize !== null) {
      const stepsize = Number(definition.stepsize);
      if (!Number.isFinite(stepsize) || stepsize <= 0) {
        fail(`Live API cluster resource ${name} exposes an invalid stepsize.`);
      }
      const offset = value - (minimum ?? 0);
      const steps = offset / stepsize;
      if (offset < 0 || Math.abs(steps - Math.round(steps)) > 1e-9) {
        fail(`Allowlisted ${name} does not align with the live API stepsize.`);
      }
    }

    const matchingAllocations = allocations.filter((candidate) => {
      const clusterResource = candidate?.cluster_resource;
      return (
        relationId(candidate, 'environment') === fixture.fixtures.environment.id &&
        clusterResource &&
        typeof clusterResource === 'object' &&
        clusterResource.name === name
      );
    });
    if (matchingAllocations.length !== 1) {
      fail(`Owner cluster-resource capacity for ${name} is missing or ambiguous.`);
    }
    const allocation = matchingAllocations[0];
    if (relationId(allocation, 'cluster_resource') !== positiveInteger(definition.id, `${name} definition.id`)) {
      fail(`Owner cluster-resource allocation ${name} points to a foreign definition.`);
    }
    const allocatedValue = nonNegativeInteger(allocation.value, `owner ${name} allocation.value`);
    const freeValue = nonNegativeInteger(allocation.free, `owner ${name} allocation.free`);
    if (freeValue > allocatedValue) {
      fail(`Owner ${name} free capacity exceeds its allocated capacity.`);
    }
    if (value > allocatedValue || value > freeValue) {
      fail(`Owner ${name} capacity is insufficient for the guarded fixture value.`);
    }
  }

  return resources;
}

function apiPathMatches(response, method, pathname) {
  if (response.request().method() !== method) return false;
  const url = new URL(response.url());
  return url.origin === config.origin && url.pathname === requestPath(apiVersion, pathname);
}

async function captureUiMutation(method, pathname, action) {
  if (!browserMutationGuard) fail('Browser mutation guard is unavailable.');
  const guardedPath = requestPath(apiVersion, pathname);
  const attemptsBefore = browserMutationGuard.countAttempts(method, guardedPath);
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) => apiPathMatches(candidate, method, pathname),
      { timeout: 60_000 }
    ),
    action(),
  ]);
  await sleep(UI_MUTATION_SETTLE_MS);
  const attemptCount = browserMutationGuard.countAttempts(method, guardedPath) - attemptsBefore;
  ledger.uiMutationAttempts = browserMutationGuard.snapshot();
  persistLedger();
  if (attemptCount !== 1) {
    fail(`${method} ${pathname} produced ${attemptCount} browser mutation attempts; exactly one is required.`);
  }
  const envelope = await parseEnvelope(response, `${method} ${pathname} through UI`);
  return { response, envelope };
}

async function waitForAction(actionStateId, name) {
  const startedAt = new Date();
  const deadline = new Date(startedAt.getTime() + OPERATION_TIMEOUT_MS);
  recordOperation(name, actionStateId, 'pending', { startedAt: startedAt.toISOString(), deadline: deadline.toISOString() });
  let lastActionState = null;
  let lastTransactionChain = null;
  let lastProofError = null;

  while (Date.now() < deadline.getTime()) {
    try {
      const pollResponse = await apiContext.get(
        paramsUrl(apiVersion, `/action_states/${actionStateId}/poll`, 'action_state', { timeout: 5, update_in: 1 }),
        { failOnStatusCode: false, maxRedirects: 0, timeout: 15_000 }
      );
      const pollEnvelope = await parseEnvelope(pollResponse, `poll action state #${actionStateId}`);
      lastActionState = envelopeResource(pollEnvelope, 'action_state');
      if (!lastActionState) fail(`Action-state poll #${actionStateId} omitted action_state.`);
      lastProofError = null;
    } catch (error) {
      lastProofError = safeError(error, token);
      await sleep(1_000);
      continue;
    }

    try {
      const chainResponse = await apiFetch(`/transaction_chains/${actionStateId}`);
      const chainEnvelope = await chainResponse.json().catch(() => null);
      if (!chainResponse.ok() || chainEnvelope?.status === false || !chainEnvelope) {
        throw new Error(`GET transaction chain #${actionStateId} returned HTTP ${chainResponse.status()}.`);
      }
      lastTransactionChain = envelopeResource(chainEnvelope, 'transaction_chain');
      if (!lastTransactionChain) fail(`Transaction-chain response #${actionStateId} omitted transaction_chain.`);
      lastProofError = null;
    } catch (error) {
      lastProofError = safeError(error, token);
    }

    const classified = classifyBoundedOperationOutcome({
      actionState: lastActionState,
      transactionChain: lastTransactionChain,
      startedAt: startedAt.toISOString(),
      deadline: deadline.toISOString(),
      now: new Date(),
    });
    if (classified.kind === 'failure' || classified.kind === 'ambiguous') {
      recordOperation(name, actionStateId, classified.kind);
      fail(`${name} action state #${actionStateId} ended as ${classified.kind}.`);
    }
    const actionDone = lastActionState?.finished === true && lastActionState?.status === true;
    const chainDone = String(lastTransactionChain?.state ?? '').toLowerCase() === 'done';
    if (actionDone && chainDone) {
      recordOperation(name, actionStateId, 'passed', { finishedAt: new Date().toISOString() });
      return;
    }
    await sleep(1_000);
  }

  const classified = classifyBoundedOperationOutcome({
    actionState: lastActionState,
    transactionChain: lastTransactionChain,
    startedAt: startedAt.toISOString(),
    deadline: deadline.toISOString(),
    now: new Date(),
  });
  recordOperation(name, actionStateId, classified.kind, {
    ...(lastProofError ? { lastProofError } : {}),
  });
  fail(
    `${name} action state #${actionStateId} did not finish with matching action-state and transaction-chain proof ` +
    `before the guarded deadline${lastProofError ? ` (${lastProofError})` : ''}.`
  );
}

async function waitForRunningState(vpsId, expected) {
  for (let attempt = 0; attempt < OBJECT_POLL_ATTEMPTS; attempt += 1) {
    const current = await fetchVpsState(vpsId);
    if (current.exists && current.resource.is_running === expected) return current.resource;
    await sleep(OBJECT_POLL_DELAY_MS);
  }
  fail(`VPS #${vpsId} did not reach is_running=${expected}.`);
}

async function waitForVpsAbsent(vpsId) {
  try {
    for (let attempt = 0; attempt < OBJECT_POLL_ATTEMPTS; attempt += 1) {
      const exactPresence = await fetchVpsState(vpsId);
      if (!exactPresence.exists) return exactPresence;
      await sleep(OBJECT_POLL_DELAY_MS);
    }
  } catch (error) {
    ledger.vps.manualReview = {
      required: true,
      reason: 'authenticated exact VPS absence proof failed during cleanup',
      candidateIds: [vpsId],
      observedAt: new Date().toISOString(),
    };
    persistLedger();
    throw error;
  }
  ledger.vps.manualReview = {
    required: true,
    reason: 'authenticated exact VPS query still returned the owned VPS after cleanup deadline',
    candidateIds: [vpsId],
    observedAt: new Date().toISOString(),
  };
  persistLedger();
  fail(`VPS #${vpsId} still exists after hard delete.`);
}

async function fetchReconciliationObservations() {
  const response = await apiContext.get(
    buildLiveVpsReconciliationUrl({
      apiVersion,
      hostname: identity.hostname,
      ownerId: fixture.fixtures.owner.id,
      nodeId: fixture.fixtures.node.id,
    }),
    { failOnStatusCode: false, maxRedirects: 0, timeout: 30_000 }
  );
  const envelope = await parseEnvelope(response, 'reconcile guarded VPS create');
  const rows = envelopeRows(envelope, 'vps');
  const totalCount = envelopeTotalCount(envelope, 'guarded VPS reconciliation');
  if (totalCount === null || totalCount !== rows.length) {
    fail('Guarded VPS reconciliation requires an exact, untruncated total_count proof.');
  }
  const observations = [];
  for (const row of rows) {
    const id = positiveInteger(row?.id, 'guarded VPS reconciliation row.id');
    observations.push(await observeVps(id));
  }
  return observations;
}

function unregisteredReconciliationLedger() {
  const candidateLedger = structuredClone(ledger);
  candidateLedger.vps.state = 'intent';
  delete candidateLedger.vps.id;
  delete candidateLedger.vps.createdObservedAt;
  delete candidateLedger.vps.verifiedAt;
  return candidateLedger;
}

function exactReconciliationMatches(observations) {
  const candidateLedger = unregisteredReconciliationLedger();
  const matches = [];
  for (const observation of observations) {
    try {
      matches.push(reconcileUniqueCreatedVps(candidateLedger, [observation]));
    } catch {
      // The query is intentionally broader than the full run identity. Only a
      // complete hostname/info/relations/time-window/zero-IP match counts.
    }
  }
  return matches;
}

function requireManualReconciliation(reason, candidateIds) {
  ledger.vps.manualReview = {
    required: true,
    reason,
    candidateIds,
    observedAt: new Date().toISOString(),
  };
  persistLedger();
  fail(`${reason} Candidate IDs are recorded in the private ledger for manual review; no automatic delete is allowed.`);
}

async function reconcileCreatedVps() {
  let lastError;
  let sawCandidate = false;
  let stableCandidateId = null;
  let stableObservations = 0;
  for (let attempt = 0; attempt < CREATE_RECONCILIATION_ATTEMPTS; attempt += 1) {
    try {
      const observations = await fetchReconciliationObservations();
      const matches = exactReconciliationMatches(observations);
      const candidateSet = classifyExactVpsCandidateSet(matches, {
        registeredId: ledger.vps.state === 'created' ? ledger.vps.id : null,
      });
      if (candidateSet.kind === 'none') {
        stableCandidateId = null;
        stableObservations = 0;
        lastError = new Error('No guarded VPS candidate is visible yet.');
      } else if (candidateSet.kind === 'manual-review') {
        requireManualReconciliation(`VPS reconciliation is ambiguous: ${candidateSet.reason}.`, candidateSet.candidateIds);
      } else {
        sawCandidate = true;
        const matched = candidateSet.match;
        if (!matched) fail('Guarded VPS reconciliation lost its unique candidate.');
        if (stableCandidateId === matched.identity.id) stableObservations += 1;
        else {
          stableCandidateId = matched.identity.id;
          stableObservations = 1;
        }
        if (stableObservations < CREATE_UNIQUENESS_STABLE_OBSERVATIONS) {
          lastError = new Error('Unique guarded VPS candidate has not remained stable long enough.');
          if (attempt < CREATE_RECONCILIATION_ATTEMPTS - 1) await sleep(CREATE_RECONCILIATION_DELAY_MS);
          continue;
        }
        if (ledger.vps.state === 'intent') registerCreatedVps(ledger, { id: matched.identity.id });
        createdVpsId = matched.identity.id;
        persistLedger();
        return matched.observation;
      }
    } catch (error) {
      lastError = error;
      if (ledger.vps.manualReview?.required === true) throw error;
    }
    if (attempt < CREATE_RECONCILIATION_ATTEMPTS - 1) await sleep(CREATE_RECONCILIATION_DELAY_MS);
  }
  if (!sawCandidate) return null;
  throw lastError ?? new Error('Unable to reconcile guarded VPS create.');
}

async function createVpsThroughUi() {
  await page.goto('/admin/vps/new', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('vps.create').waitFor({ timeout: 60_000 });
  await page.getByTestId('vps.create.user').fill(String(fixture.fixtures.owner.id));
  await page.getByTestId('vps.create.location').selectOption(String(fixture.fixtures.location.id));
  await page.getByTestId('vps.create.node').selectOption(String(fixture.fixtures.node.id));
  await page.getByTestId('vps.create.os_template').selectOption(String(fixture.fixtures.osTemplate.id));
  await page.getByTestId('vps.create.hostname').fill(identity.hostname);
  await page.getByTestId('vps.create.info').fill(identity.infoMarker);
  for (const [name, value] of Object.entries(fixture.resources)) {
    await page.getByTestId(`vps.create.${name}`).fill(String(value));
  }
  await page.getByTestId('vps.create.ipv4').fill('0');
  await page.getByTestId('vps.create.ipv6').fill('0');
  await page.getByTestId('vps.create.ipv4_private').fill('0');
  const start = page.getByTestId('vps.create.start');
  if (await start.isChecked()) await start.uncheck();
  await page.getByTestId('vps.create.ready').waitFor({ timeout: 30_000 });
  await screenshot('01-vps-create-ready');

  let captured;
  try {
    createSubmissionStarted = true;
    captured = await captureUiMutation('POST', '/vpses', () => page.getByTestId('vps.create.submit').click());
    const actualBody = captured.response.request().postDataJSON();
    const actualPayload = actualBody?.vps;
    assertSafeVpsCreatePayload(actualPayload, { identity, fixtureManifest: fixture.fixtures });
    if (canonicalPayloadSha256(actualPayload) !== ledger.vps.createPayloadSha256) {
      fail('The real UI VPS create payload differs from the pre-registered guarded payload.');
    }
    const resource = envelopeResource(captured.envelope, 'vps');
    createdVpsId = positiveInteger(resource?.id, 'created VPS id');
    registerCreatedVps(ledger, { id: createdVpsId });
    browserMutationGuard.registerOwnedVpsId(createdVpsId);
    persistLedger();
    const actionStateId = envelopeActionStateId(captured.envelope);
    await waitForAction(actionStateId, 'create');
  } catch (error) {
    const observation = await reconcileCreatedVps().catch((reconcileError) => {
      throw new AggregateError([error, reconcileError], 'VPS create failed and guarded reconciliation was not unique.');
    });
    if (!observation) throw error;
    if (ledger.vps.state === 'created') {
      verifyCreatedVps(ledger, observation);
      persistLedger();
    }
    throw error;
  }

  const observation = await reconcileCreatedVps();
  if (!observation) fail('The normal create path could not prove one stable exact guarded VPS candidate.');
  verifyCreatedVps(ledger, observation);
  persistLedger();
  await waitForRunningState(createdVpsId, false);
  await screenshot('02-vps-created-stopped');
}

async function runUiPowerAction(kind, expectedRunning) {
  const route = `/admin/vps/${createdVpsId}/lifecycle/${kind}`;
  const endpoint = `/vpses/${createdVpsId}/${kind}`;
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.getByTestId(`vps.lifecycle.${kind}`).waitFor({ timeout: 60_000 });
  const confirm = page.getByTestId(`vps.lifecycle.${kind}.confirm`);
  if (!(await confirm.isChecked())) await confirm.check();
  const captured = await captureUiMutation('POST', endpoint, () =>
    page.getByTestId(`vps.lifecycle.${kind}.submit`).click()
  );
  const actionStateId = envelopeActionStateId(captured.envelope);
  await waitForAction(actionStateId, kind);
  await waitForRunningState(createdVpsId, expectedRunning);
  await screenshot(`${kind === 'start' ? '03' : kind === 'restart' ? '04' : '05'}-vps-${kind}`);
}

async function cleanupOwnedVps() {
  cleanup.attempted = true;
  if (ledger.vps.state === 'cleaned') {
    cleanup.deleted = true;
    cleanup.objectAbsent = true;
    return;
  }

  if (ledger.vps.state === 'intent' || ledger.vps.state === 'created') {
    if (ledger.vps.manualReview?.required === true) {
      fail('Private ledger requires manual reconciliation; automatic cleanup is forbidden.');
    }
    if (ledger.vps.state === 'intent' && !createSubmissionStarted) {
      cleanup.objectAbsent = true;
      return;
    }
    const observation = await reconcileCreatedVps();
    if (!observation) {
      fail(
        'A VPS create was submitted, but the bounded exact-identity reconciliation could not prove creation or absence. ' +
        'No blind retry or delete is allowed; inspect the private ledger manually.'
      );
    }
    if (ledger.vps.state === 'created') verifyCreatedVps(ledger, observation);
    persistLedger();
  }
  if (!createdVpsId && ledger.vps.id) createdVpsId = ledger.vps.id;
  if (!createdVpsId) return;

  let currentState = await fetchVpsState(createdVpsId);
  if (!currentState.exists) {
    if (ledger.vps.state === 'cleanup') {
      ledger.vps.manualReview = {
        required: true,
        reason: 'exact VPS query returned zero rows while cleanup lacked terminal delete proof',
        candidateIds: [createdVpsId],
        observedAt: new Date().toISOString(),
      };
      persistLedger();
      fail('Cleanup cannot be completed from zero-row absence without terminal delete proof.');
    }
    fail('The verified VPS disappeared before this run issued its guarded hard delete.');
  }

  let observation = await observeVps(createdVpsId);
  // A failed UI power step may leave the owned VPS running. Prove identity
  // first, then stop it; the stricter hard-delete gate is intentionally only
  // evaluated against the fresh stopped observation below.
  assertVpsIdentity(ledger, observation);
  const observedRunningState = observation.resource.is_running;
  if (observedRunningState !== true && observedRunningState !== false) {
    fail('The verified VPS omitted an explicit is_running state before cleanup.');
  }
  if (observedRunningState === true) {
    const stopEnvelope = await apiEnvelope(`/vpses/${createdVpsId}/stop`, { method: 'POST', data: { vps: { force: false } } });
    const stopActionId = envelopeActionStateId(stopEnvelope);
    await waitForAction(stopActionId, 'cleanup-stop');
    await waitForRunningState(createdVpsId, false);
    cleanup.stopped = true;
    observation = await observeVps(createdVpsId);
    assertHardDeleteAllowed(ledger, observation);
  }
  currentState = await fetchVpsState(createdVpsId);
  if (!currentState.exists || currentState.resource.is_running !== false) {
    fail('Hard delete requires a fresh API observation with is_running exactly false.');
  }
  observation = await observeVps(createdVpsId);
  assertHardDeleteAllowed(ledger, observation);
  if (observation.resource.is_running !== false) {
    fail('The strict cleanup identity observation does not prove is_running=false.');
  }

  beginVpsCleanup(ledger, observation, { hardDelete: true });
  persistLedger();
  const deleteEnvelope = await apiEnvelope(`/vpses/${createdVpsId}`, {
    method: 'DELETE',
    data: { vps: { lazy: false } },
  });
  let deleteProofError;
  try {
    const deleteActionId = envelopeActionStateId(deleteEnvelope);
    await waitForAction(deleteActionId, 'hard-delete');
  } catch (error) {
    deleteProofError = error;
  }
  if (deleteProofError) {
    let absenceDiagnostic = null;
    let absenceDiagnosticError = null;
    try {
      absenceDiagnostic = await waitForVpsAbsent(createdVpsId);
    } catch (error) {
      absenceDiagnosticError = error;
    }
    const evidence = absenceDiagnostic
      ? classifyLiveVpsHardDeleteEvidence({ terminalProofSucceeded: false, exactPresence: absenceDiagnostic })
      : {
          kind: 'manual-review',
          canMarkCleaned: false,
          reason: 'terminal delete proof failed and exact absence could not be diagnosed',
        };
    ledger.vps.manualReview = {
      required: true,
      reason: evidence.reason,
      candidateIds: [createdVpsId],
      observedAt: new Date().toISOString(),
    };
    persistLedger();
    if (absenceDiagnosticError) {
      throw new AggregateError(
        [deleteProofError, absenceDiagnosticError],
        'Hard delete lacked terminal proof and exact absence could not be diagnosed; manual review is required.'
      );
    }
    throw deleteProofError;
  }
  try {
    const exactPresence = await waitForVpsAbsent(createdVpsId);
    const evidence = classifyLiveVpsHardDeleteEvidence({ terminalProofSucceeded: true, exactPresence });
    if (!evidence.canMarkCleaned) fail(evidence.reason);
    cleanup.deleted = true;
    cleanup.objectAbsent = true;
    markVpsCleanupComplete(ledger);
    persistLedger();
  } catch (absenceError) {
    throw absenceError;
  }
}

function writeReport() {
  const report = {
    runId: identity.runId,
    baseURL: config.baseURL,
    api: {
      protocolVersion: apiVersion,
      sourceVersion: config.fingerprint.version,
      sourceRevision: config.fingerprint.revision,
      publicDescriptionSha256: PINNED_PUBLIC_API_DESCRIPTION_SHA256,
      revisionEvidence:
        'private audited revision attestation plus an exact SHA-256 match of the deployed public API description',
      tls: tlsProof ?? {
        host: 'dev.crucio.cz',
        leafDerSha256: PINNED_LIVE_VPS_LEAF_DER_SHA256,
        spkiSha256Base64: PINNED_LIVE_VPS_SPKI_SHA256_BASE64,
        status: 'not-proven',
      },
    },
    execution: { mode: 'serial', workers: 1 },
    fixtureIds: Object.fromEntries(Object.entries(fixture.fixtures).map(([key, value]) => [key, value.id])),
    resourceValues: fixture.resources,
    coverage: [
      'public WebUI/API target proof',
      'administrator authentication through users/current',
      'allowlisted owner/node/location/environment/template relationship validation',
      'one stopped VPS with zero requested IP addresses created through the real UI',
      'route-time browser mutation allowlist and exact single-request accounting',
      'start, restart and stop through the real UI',
      'bounded action-state and transaction-chain verification after every operation',
      'strict identity and zero-IP verification before cleanup',
      'independent HaveAPI hard delete with lazy=false and absence proof',
    ],
    checks,
    operations: ledger.operations,
    uiMutationAttempts: ledger.uiMutationAttempts ?? [],
    manualReview: ledger.vps.manualReview ?? null,
    cleanup,
    testError: testError ? safeError(testError, token) : null,
    cleanupError: cleanupError ? safeError(cleanupError, token) : null,
    responseFailures: browserHttpFailures.filter((entry) => entry.status >= 500),
    browserHttpFailures,
    browserRequestFailures,
    consoleFailures,
    artifactFailures,
    securityFailures,
    ledgerPath,
  };
  privateWriteJson(reportPath, JSON.parse(sanitizeText(JSON.stringify(report), token)));
}

persistLedger();

try {
  ensurePrivateVpsArtifactDirectory(runDirectory);
  await check('verify the code-pinned dev.crucio.cz TLS leaf before any token-bearing connection', async () => {
    tlsProof = await verifyPinnedLiveVpsTlsCertificate();
  });
  publicContext = new PinnedLiveVpsHttpsClient();
  apiContext = new PinnedLiveVpsHttpsClient({ adminToken: token });

  await check('prove the exact public dev.crucio.cz WebUI/API target', verifyPublicRuntime);
  await check('verify users/current is an administrator', async () => {
    assertAdminUser(await apiEnvelope('/users/current'));
  });
  await check('verify every private fixture and guarded resource value against the live API', verifyFixtureAndResources);

  browser = await chromium.launch({
    headless: process.env.E2E_HEADLESS !== '0',
    ...(chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {}),
    args: [`--ignore-certificate-errors-spki-list=${PINNED_LIVE_VPS_SPKI_SHA256_BASE64}`],
  });
  browserContext = await browser.newContext({
    baseURL: config.baseURL,
    serviceWorkers: 'block',
    viewport: { width: 1680, height: 1100 },
  });
  browserMutationGuard = createLiveVpsBrowserMutationGuard({
    origin: config.origin,
    apiVersion,
    expectedCreatePayloadSha256: ledger.vps.createPayloadSha256,
    assertCreatePayload: (payload) => assertSafeVpsCreatePayload(payload, {
      identity,
      fixtureManifest: fixture.fixtures,
    }),
    payloadSha256: canonicalPayloadSha256,
  });
  const configBody = [
    'window.vpsAdmin = window.vpsAdmin || {};',
    `window.vpsAdmin.api = ${JSON.stringify({ url: config.baseURL, version: apiVersion })};`,
    `window.vpsAdmin.sessionToken = ${JSON.stringify(token)};`,
    'window.vpsAdmin.webuiNext = { haveApi: { authHeader: "X-HaveAPI-Auth-Token", metaNamespace: "_meta" }, uiSettings: { persistence: "local" } };',
    '',
  ].join('\n');
  await browserContext.route('**/*', async (route) => {
    const request = route.request();
    const rawUrl = request.url();
    if (rawUrl === 'about:blank') {
      await route.abort('blockedbyclient');
      return;
    }

    let url;
    try {
      url = new URL(rawUrl);
    } catch {
      securityFailures.push({
        kind: 'invalid-browser-request-url',
        method: request.method(),
        url: sanitizeText(rawUrl, token).slice(0, 300),
      });
      await route.abort('blockedbyclient');
      return;
    }

    if (url.origin !== config.origin || url.username !== '' || url.password !== '') {
      securityFailures.push({
        kind: 'cross-origin-browser-request',
        method: request.method(),
        url: `${url.origin}${url.pathname}`.slice(0, 300),
      });
      await route.abort('blockedbyclient');
      return;
    }

    const apiPathPrefix = `/v${apiVersion}/`;
    const isApiRequest = url.pathname === `/v${apiVersion}` || url.pathname.startsWith(apiPathPrefix);
    const browserAuthentication = classifyLiveVpsBrowserAuthentication({
      headers: request.headers(),
      isApiRequest,
      token,
    });
    if (!browserAuthentication.allow) {
      securityFailures.push({
        kind: 'invalid-browser-api-authentication',
        method: request.method(),
        path: url.pathname,
        reason: browserAuthentication.reason,
      });
      persistLedger();
      await route.abort('blockedbyclient');
      return;
    }

    if (url.pathname === '/config.js') {
      if (request.method() !== 'GET' || url.search || url.hash) {
        securityFailures.push({
          kind: 'unexpected-runtime-config-request',
          method: request.method(),
          url: url.pathname,
        });
        await route.abort('blockedbyclient');
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: configBody,
      });
      return;
    }

    let body = {};
    if (!['GET', 'HEAD'].includes(request.method())) {
      const rawBody = request.postData();
      try {
        body = rawBody === null || rawBody.trim() === '' ? {} : JSON.parse(rawBody);
      } catch {
        securityFailures.push({
          kind: 'non-json-browser-mutation',
          method: request.method(),
          path: url.pathname,
        });
        await route.abort('blockedbyclient');
        return;
      }
    }
    const mutationDecision = browserMutationGuard.inspect({
      method: request.method(),
      url: rawUrl,
      body,
    });
    ledger.uiMutationAttempts = browserMutationGuard.snapshot();
    if (!mutationDecision.allow) {
      securityFailures.push({
        kind: 'blocked-browser-mutation',
        method: request.method(),
        path: url.pathname,
        reason: mutationDecision.reason,
      });
      persistLedger();
      await route.abort('blockedbyclient');
      return;
    }

    try {
      const proxyResult = await proxyPinnedLiveVpsBrowserRequest({
        route,
        client: isApiRequest ? apiContext : publicContext,
        pathname: `${url.pathname}${url.search}`,
        method: request.method(),
        data: ['GET', 'HEAD'].includes(request.method()) ? undefined : body,
      });
      if (proxyResult.kind === 'blocked-redirect') {
        securityFailures.push({
          kind: isApiRequest ? 'blocked-browser-api-redirect' : 'blocked-browser-static-redirect',
          method: request.method(),
          path: url.pathname,
          status: proxyResult.status,
        });
        persistLedger();
      }
    } catch (error) {
      securityFailures.push({
        kind: 'pinned-browser-proxy-failure',
        method: request.method(),
        path: url.pathname,
        reason: safeError(error, token),
      });
      persistLedger();
      await route.abort('failed');
    }
  });
  await browserContext.routeWebSocket(/.*/, async (webSocket) => {
    const rawUrl = webSocket.url();
    let url;
    try {
      url = new URL(rawUrl);
    } catch {
      securityFailures.push({
        kind: 'invalid-browser-websocket-url',
        url: sanitizeText(rawUrl, token).slice(0, 300),
      });
      await webSocket.close({ code: 1008, reason: 'Invalid certification target' });
      return;
    }
    securityFailures.push({
      kind: 'unexpected-browser-websocket',
      url: `${url.origin}${url.pathname}`.slice(0, 300),
    });
    await webSocket.close({ code: 1008, reason: 'WebSockets are outside the certification allowlist' });
  });
  page = await browserContext.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleFailures.push({
        type: 'console',
        text: sanitizeText(message.text(), token).slice(0, 500),
        location: sanitizeBrowserLocation(message.location(), token),
        at: new Date().toISOString(),
      });
    }
  });
  page.on('pageerror', (error) => consoleFailures.push({
    type: 'pageerror',
    text: sanitizeText(error.message, token).slice(0, 500),
    location: sanitizeBrowserLocation({}, token),
    at: new Date().toISOString(),
  }));
  page.on('response', (response) => {
    if (response.status() >= 400) {
      browserHttpFailures.push({
        method: response.request().method(),
        status: response.status(),
        path: sanitizeBrowserPath(response.url(), token),
        at: new Date().toISOString(),
      });
    }
  });
  page.on('requestfailed', (request) => {
    browserRequestFailures.push({
      method: request.method(),
      path: sanitizeBrowserPath(request.url(), token),
      failure: sanitizeText(request.failure()?.errorText ?? 'unknown browser request failure', token).slice(0, 500),
      at: new Date().toISOString(),
    });
  });

  await check('create exactly one guarded stopped zero-IP VPS through the real UI', createVpsThroughUi);
  await check('start the guarded VPS through the real UI', () => runUiPowerAction('start', true));
  await check('restart the guarded VPS through the real UI', () => runUiPowerAction('restart', true));
  await check('stop the guarded VPS through the real UI', () => runUiPowerAction('stop', false));
  await check('prove the exact create/start/restart/stop browser mutation sequence', async () => {
    browserMutationGuard.assertComplete();
    ledger.uiMutationAttempts = browserMutationGuard.snapshot();
    persistLedger();
  });
} catch (error) {
  testError = error;
} finally {
  cleanupInProgress = true;
  try {
    if (apiContext) await cleanupOwnedVps();
  } catch (error) {
    cleanupError = error;
  }
  ledger.testStatus = testError || cleanupError ? 'failed' : 'passed';
  ledger.testError = testError ? safeError(testError, token) : null;
  ledger.cleanupError = cleanupError ? safeError(cleanupError, token) : null;
  persistLedger();
  try {
    await browserContext?.close();
  } catch (error) {
    artifactFailures.push({ name: 'browser-context-close', error: safeError(error, token) });
  }
  try {
    await browser?.close();
  } catch (error) {
    artifactFailures.push({ name: 'browser-close', error: safeError(error, token) });
  }
  await apiContext?.dispose().catch((error) => artifactFailures.push({ name: 'api-context-close', error: safeError(error, token) }));
  await publicContext?.dispose().catch((error) => artifactFailures.push({ name: 'public-context-close', error: safeError(error, token) }));
  ledger.testStatus = (
    testError ||
    cleanupError ||
    browserHttpFailures.length > 0 ||
    browserRequestFailures.length > 0 ||
    consoleFailures.length > 0 ||
    artifactFailures.length > 0 ||
    securityFailures.length > 0 ||
    !cleanup.objectAbsent
  ) ? 'failed' : 'passed';
  persistLedger();
  hardenArtifactTree(runDirectory);
  writeReport();
  process.removeListener('SIGINT', onSigint);
  process.removeListener('SIGTERM', onSigterm);
}

const failed = Boolean(
  testError ||
  cleanupError ||
  browserHttpFailures.length > 0 ||
  browserRequestFailures.length > 0 ||
  consoleFailures.length > 0 ||
  artifactFailures.length > 0 ||
  securityFailures.length > 0 ||
  !cleanup.objectAbsent
);

console.log(JSON.stringify({
  runId: identity.runId,
  outDir: runDirectory,
  checks: checks.length,
  failedChecks: checks.filter((entry) => entry.status === 'failed').length,
  cleanup,
  api5xx: browserHttpFailures.filter((entry) => entry.status >= 500).length,
  browserHttpErrors: browserHttpFailures.length,
  browserRequestErrors: browserRequestFailures.length,
  consoleErrors: consoleFailures.length,
  artifactErrors: artifactFailures.length,
  securityErrors: securityFailures.length,
  failed,
}, null, 2));

if (failed) process.exitCode = 1;
