#!/usr/bin/env node
import { chromium } from '@playwright/test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  assertCleanupResourceIdentity,
  assertMutationAdmin,
  assertLiveMutationConfig,
  assertNoSymlinkAncestors,
  cleanupOwnedObjects,
  createLiveRunIdentity,
  createObjectLedger,
  ensurePrivateDirectory,
  extractHaveApiResourceId,
  matchesHaveApiMutation,
  registerOwnedObject,
  writeLedgerAtomic,
} from './live-mutations.mjs';

// Ensure artifacts are private from the moment they are created, including
// Playwright video files that are finalized only when the context closes.
process.umask(0o077);

const baseURL = process.env.E2E_BASE_URL ?? 'https://dev.crucio.cz';
const apiVersion = process.env.E2E_LIVE_API_VERSION ?? '7.0';
const recordArtifacts = process.env.E2E_RECORD_ARTIFACTS === '1';
const chromiumExecutablePath = process.env.E2E_CHROMIUM_EXECUTABLE_PATH?.trim() || undefined;

function readSessionToken() {
  if (process.env.E2E_LIVE_SESSION_TOKEN?.trim()) return process.env.E2E_LIVE_SESSION_TOKEN.trim();
  const tokenFile = process.env.E2E_LIVE_SESSION_TOKEN_FILE?.trim();
  if (!tokenFile) return '';
  try {
    return fs.readFileSync(tokenFile, 'utf8').trim();
  } catch {
    throw new Error('Unable to read E2E_LIVE_SESSION_TOKEN_FILE.');
  }
}

const token = readSessionToken();
const liveConfig = assertLiveMutationConfig({
  baseURL,
  mutationsEnabled: process.env.E2E_LIVE_MUTATIONS,
  token,
});

if (!/^\d+\.\d+$/.test(apiVersion)) {
  throw new Error('E2E_LIVE_API_VERSION must be a numeric HaveAPI version, e.g. 7.0.');
}

const identity = createLiveRunIdentity({
  now: new Date(),
  randomSuffix: crypto.randomBytes(4).toString('hex'),
});
const outputRoot = path.resolve(process.env.E2E_LIVE_MUTATION_OUT_DIR ?? path.join('work', 'live-mutations'));
const runDirectory = path.join(outputRoot, identity.runId);
const ledgerPath = path.join(runDirectory, 'objects.json');
const reportPath = path.join(runDirectory, 'report.json');
const zoneName = `${identity.prefix}.dev.crucio.cz`;
const recordName = `probe-${identity.runId.slice(-8)}`;
const apiBaseURL = `${liveConfig.baseURL}/v${apiVersion}`;

const ledger = createObjectLedger({
  ...identity,
  baseURL: liveConfig.baseURL,
});
ledger.execution = { mode: 'serial', workers: 1 };
writeLedgerAtomic(ledgerPath, ledger);

let browser;
let context;
let page;
let zoneId;
let recordId;
let testError = null;
let cleanupResult = { cleaned: [], failures: [] };
const checks = [];
const responseFailures = [];
const consoleFailures = [];
const artifactFailures = [];

function safeError(error) {
  return sanitizeText(error instanceof Error ? error.message : String(error));
}

function sanitizeText(value) {
  let sanitized = String(value ?? '');
  if (token) sanitized = sanitized.split(token).join('[REDACTED]');
  return sanitized
    .replace(/X-HaveAPI-Auth-Token\s*[:=]\s*[^\s,;]+/gi, '[REDACTED AUTH HEADER]')
    .replace(/Authorization\s*[:=]\s*Bearer\s+[^\s,;]+/gi, '[REDACTED AUTH HEADER]');
}

function hardenArtifactTree(directory) {
  if (!fs.existsSync(directory)) return;
  assertNoSymlinkAncestors(directory);
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink()) throw new Error(`Refusing to chmod symlinked artifact path: ${directory}`);
  if (stat.isDirectory()) {
    fs.chmodSync(directory, 0o700);
    for (const entry of fs.readdirSync(directory)) hardenArtifactTree(path.join(directory, entry));
    return;
  }
  if (stat.isFile()) fs.chmodSync(directory, 0o600);
}

function writeReport() {
  ensurePrivateDirectory(runDirectory);
  const report = {
    runId: identity.runId,
    prefix: identity.prefix,
    baseURL: liveConfig.baseURL,
    execution: { mode: 'serial', workers: 1 },
    coverage: [
      'admin authentication',
      'DNS zone create through UI',
      'DNS record create through UI with inherited TTL',
      'DNS record update through UI',
      'DNS record delete through UI',
      'DNS zone delete through UI',
      'allowlisted finally cleanup through HaveAPI',
    ],
    checks,
    testError: testError ? safeError(testError) : null,
    cleanup: cleanupResult,
    responseFailures,
    consoleFailures,
    artifactFailures,
    ledgerPath,
  };
  assertNoSymlinkAncestors(reportPath);
  fs.writeFileSync(reportPath, `${sanitizeText(JSON.stringify(report, null, 2))}\n`, { mode: 0o600 });
  assertNoSymlinkAncestors(reportPath);
  fs.chmodSync(reportPath, 0o600);
}

async function screenshot(name, { bestEffort = false } = {}) {
  if (!recordArtifacts || !page) return;
  const screenshotPath = path.join(runDirectory, `${name}.png`);
  try {
    assertNoSymlinkAncestors(screenshotPath);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    assertNoSymlinkAncestors(screenshotPath);
    fs.chmodSync(screenshotPath, 0o600);
  } catch (error) {
    artifactFailures.push({ artifact: name, error: safeError(error) });
    if (!bestEffort) throw error;
  }
}

async function check(name, callback) {
  const startedAt = new Date().toISOString();
  try {
    await callback();
    checks.push({ name, status: 'passed', startedAt, finishedAt: new Date().toISOString() });
  } catch (error) {
    checks.push({ name, status: 'failed', startedAt, finishedAt: new Date().toISOString(), error: safeError(error) });
    await screenshot(`error-${String(checks.length).padStart(2, '0')}`, { bestEffort: true });
    throw error;
  }
}

function matchesMutation(response, method, resource) {
  return matchesHaveApiMutation(
    { method: response.request().method(), url: response.url() },
    { expectedMethod: method, resource, apiVersion }
  );
}

async function captureMutation(method, resource, action) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) => matchesMutation(candidate, method, resource),
      { timeout: 45_000 }
    ),
    action(),
  ]);
  const envelope = await response.json().catch(() => ({ status: false, message: `Invalid JSON (HTTP ${response.status()})` }));
  if (!response.ok() || envelope?.status === false) {
    throw new Error(`${method} ${resource} failed (HTTP ${response.status()}): ${String(envelope?.message ?? 'request failed')}`);
  }
  return envelope;
}

function isNotFoundResponse(status, envelope) {
  if (status === 404) return true;
  const message = String(envelope?.message ?? '').toLowerCase();
  return (
    message.includes('not found') ||
    message.includes('does not exist') ||
    message.includes('unable to find') ||
    message.includes('no such')
  );
}

async function apiFetch(pathname, options = {}) {
  if (!context) throw new Error('Playwright context is not available for cleanup.');
  return context.request.fetch(`${apiBaseURL}${pathname}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      'X-HaveAPI-Auth-Token': token,
      ...(options.method && options.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(options.method && options.method !== 'GET' ? { data: options.data ?? {} } : {}),
    failOnStatusCode: false,
  });
}

function envelopeRows(envelope, namespace) {
  const response = envelope?.response;
  if (Array.isArray(response)) return response;
  const namespaced = response?.[namespace];
  if (Array.isArray(namespaced)) return namespaced;
  if (namespaced && typeof namespaced === 'object') return [namespaced];
  return [];
}

function envelopeResource(envelope, namespace) {
  const response = envelope?.response;
  const namespaced = response?.[namespace];
  if (namespaced && typeof namespaced === 'object' && !Array.isArray(namespaced)) return namespaced;
  if (response && typeof response === 'object' && !Array.isArray(response) && Object.hasOwn(response, 'id')) {
    return response;
  }
  return null;
}

async function fetchIndexRows(resource, namespace, params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    query.set(`${namespace}[${key}]`, String(value));
  }
  const response = await apiFetch(`/${resource}?${query.toString()}`);
  const envelope = await response.json().catch(() => null);
  if (!response.ok() || envelope?.status === false) {
    throw new Error(`Unable to reconcile ${resource} after a failed live step (HTTP ${response.status()}).`);
  }
  return envelopeRows(envelope, namespace);
}

async function findExactIndexRow(resource, namespace, params, predicate) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const rows = await fetchIndexRows(resource, namespace, params);
    const match = rows.find(predicate);
    if (match) return match;
    if (attempt < 9) await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  return null;
}

function markPendingCreate(kind, label, parentId) {
  ledger.pendingCreates = [
    ...(ledger.pendingCreates ?? []).filter((entry) => entry.kind !== kind),
    { kind, label, ...(parentId ? { parentId } : {}), markedAt: new Date().toISOString() },
  ];
  writeLedgerAtomic(ledgerPath, ledger);
}

function clearPendingCreate(kind) {
  ledger.pendingCreates = (ledger.pendingCreates ?? []).filter((entry) => entry.kind !== kind);
  writeLedgerAtomic(ledgerPath, ledger);
}

async function reconcilePendingDnsCreates() {
  if (!(ledger.pendingCreates?.length > 0)) return;

  const matchingZone = await findExactIndexRow(
    'dns_zones',
    'dns_zone',
    { q: zoneName, limit: 100 },
    (row) => String(row?.name ?? '') === zoneName
  );
  const reconciledZoneId = Number(matchingZone?.id);
  if (!Number.isSafeInteger(reconciledZoneId) || reconciledZoneId <= 0) return;

  if (!ledger.objects.some((entry) => entry.kind === 'dns_zone' && entry.id === reconciledZoneId)) {
    registerOwnedObject(ledger, { kind: 'dns_zone', id: reconciledZoneId, label: zoneName });
  }
  zoneId = reconciledZoneId;
  ledger.pendingCreates = (ledger.pendingCreates ?? []).filter((entry) => entry.kind !== 'dns_zone');
  writeLedgerAtomic(ledgerPath, ledger);

  if (!ledger.pendingCreates.some((entry) => entry.kind === 'dns_record')) return;
  const matchingRecord = await findExactIndexRow(
    'dns_records',
    'dns_record',
    { dns_zone: reconciledZoneId, q: recordName, limit: 100 },
    (row) => String(row?.name ?? '') === recordName
  );
  const reconciledRecordId = Number(matchingRecord?.id);
  if (!Number.isSafeInteger(reconciledRecordId) || reconciledRecordId <= 0) return;

  if (!ledger.objects.some((entry) => entry.kind === 'dns_record' && entry.id === reconciledRecordId)) {
    registerOwnedObject(ledger, {
      kind: 'dns_record',
      id: reconciledRecordId,
      parentId: reconciledZoneId,
      label: `${zoneName}/${recordName}`,
    });
  }
  recordId = reconciledRecordId;
  ledger.pendingCreates = (ledger.pendingCreates ?? []).filter((entry) => entry.kind !== 'dns_record');
  writeLedgerAtomic(ledgerPath, ledger);
}

async function fetchResourceState(resource, namespace, id) {
  const response = await apiFetch(`/${resource}/${id}`);
  const envelope = await response.json().catch(() => ({ status: false, message: '' }));
  if (isNotFoundResponse(response.status(), envelope)) return { exists: false, resource: null };
  if (!response.ok() || envelope?.status === false) {
    throw new Error(`Unable to verify ${resource} #${id} during cleanup (HTTP ${response.status()}).`);
  }
  const resolvedResource = envelopeResource(envelope, namespace);
  if (!resolvedResource) {
    throw new Error(`Unable to verify ${resource} #${id}: HaveAPI omitted the ${namespace} identity.`);
  }
  return { exists: true, resource: resolvedResource };
}

async function resourceExists(resource, namespace, id) {
  return (await fetchResourceState(resource, namespace, id)).exists;
}

async function verifyOwnedResourceBeforeDelete(object) {
  if (!object) throw new Error('Refusing DELETE: resource is not registered in the run ledger.');
  const resource = object.kind === 'dns_record' ? 'dns_records' : 'dns_zones';
  const namespace = object.kind === 'dns_record' ? 'dns_record' : 'dns_zone';
  const current = await fetchResourceState(resource, namespace, object.id);
  if (!current.exists) {
    throw new Error(`Refusing DELETE ${resource} #${object.id}: owned resource no longer exists.`);
  }
  assertCleanupResourceIdentity(ledger, object, { namespace, resource: current.resource });
}

async function cleanupResource(object) {
  const resource = object.kind === 'dns_record' ? 'dns_records' : 'dns_zones';
  const namespace = object.kind === 'dns_record' ? 'dns_record' : 'dns_zone';
  let lastError;

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const current = await fetchResourceState(resource, namespace, object.id);
      if (!current.exists) return;
      assertCleanupResourceIdentity(ledger, object, { namespace, resource: current.resource });

      const response = await apiFetch(`/${resource}/${object.id}`, { method: 'DELETE', data: {} });
      const envelope = await response.json().catch(() => ({ status: false, message: '' }));
      if (isNotFoundResponse(response.status(), envelope)) return;
      if (!response.ok() || envelope?.status === false) {
        throw new Error(`DELETE ${resource} #${object.id} failed (HTTP ${response.status()}): ${String(envelope?.message ?? 'request failed')}`);
      }

      for (let poll = 0; poll < 15; poll += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        if (!(await resourceExists(resource, namespace, object.id))) return;
      }
      throw new Error(`${resource} #${object.id} still exists after delete request.`);
    } catch (error) {
      lastError = error;
      if (attempt < 6) await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
  }

  throw lastError ?? new Error(`Unable to clean ${resource} #${object.id}.`);
}

async function waitForResource(resource, id, expectedPresent) {
  const namespace = resource === 'dns_records' ? 'dns_record' : 'dns_zone';
  let lastError;
  for (let attempt = 0; attempt < 45; attempt += 1) {
    try {
      const exists = await resourceExists(resource, namespace, id);
      if (exists === expectedPresent) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw lastError ?? new Error(`${resource} #${id} did not reach expected state.`);
}

try {
  ensurePrivateDirectory(runDirectory);
  browser = await chromium.launch({
    headless: process.env.E2E_HEADLESS !== '0',
    ...(chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {}),
  });
  if (recordArtifacts) ensurePrivateDirectory(path.join(runDirectory, 'videos'));
  context = await browser.newContext({
    baseURL: liveConfig.baseURL,
    ignoreHTTPSErrors: true,
    viewport: { width: 1680, height: 1100 },
    ...(recordArtifacts ? { recordVideo: { dir: path.join(runDirectory, 'videos'), size: { width: 1680, height: 1100 } } } : {}),
  });
  page = await context.newPage();

  const configBody = [
    'window.vpsAdmin = window.vpsAdmin || {};',
    `window.vpsAdmin.api = ${JSON.stringify({ url: liveConfig.baseURL, version: apiVersion })};`,
    `window.vpsAdmin.sessionToken = ${JSON.stringify(token)};`,
    'window.vpsAdmin.webuiNext = { haveApi: { authHeader: "X-HaveAPI-Auth-Token", metaNamespace: "_meta" }, uiSettings: { persistence: "local" } };',
    '',
  ].join('\n');
  await page.route('**/config.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: configBody }));

  page.on('console', (message) => {
    if (message.type() === 'error') consoleFailures.push({ type: 'console', text: sanitizeText(message.text()).slice(0, 500) });
  });
  page.on('pageerror', (error) => consoleFailures.push({ type: 'pageerror', text: sanitizeText(error.message).slice(0, 500) }));
  page.on('response', (response) => {
    if (response.status() >= 500) {
      const responseUrl = new URL(response.url());
      responseFailures.push({
        method: response.request().method(),
        status: response.status(),
        url: `${responseUrl.origin}${responseUrl.pathname}`,
      });
    }
  });

  await check('verify the token is an administrator via users/current', async () => {
    const response = await apiFetch('/users/current');
    const envelope = await response.json().catch(() => null);
    if (!response.ok()) {
      throw new Error(`Live mutation token was rejected by users/current (HTTP ${response.status()}).`);
    }
    assertMutationAdmin(envelope);
  });

  await check('authenticate as an administrator and open DNS zones', async () => {
    await page.goto('/admin/dns', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('dns.zones.list').waitFor({ timeout: 30_000 });
    const tasks = page.getByRole('button', { name: /Tasks|Úlohy/i }).first();
    if (!(await tasks.isVisible().catch(() => false))) {
      throw new Error('Live session token was rejected, expired, or is not an administrator token.');
    }
    await screenshot('01-dns-zones-before');
  });

  await check('create an isolated DNS zone through the real form', async () => {
    await page.getByTestId('dns.zones.create.open').click();
    await page.getByTestId('dns.zones.create.modal').waitFor();
    await page.getByTestId('dns.zones.create.name').fill(zoneName);
    await page.getByTestId('dns.zones.create.email').fill('hostmaster@dev.crucio.cz');
    await page.getByTestId('dns.zones.create.ttl').selectOption('3600');
    markPendingCreate('dns_zone', zoneName);

    const envelope = await captureMutation('POST', 'dns_zones', () => page.getByTestId('dns.zones.create.submit').click());
    zoneId = extractHaveApiResourceId(envelope, 'dns_zone');
    registerOwnedObject(ledger, { kind: 'dns_zone', id: zoneId, label: zoneName });
    clearPendingCreate('dns_zone');

    await waitForResource('dns_zones', zoneId, true);
    await page.goto(`/admin/dns/zones/${zoneId}`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('dns.records.list').waitFor({ timeout: 45_000 });
    await screenshot('02-zone-created');
  });

  await check('create a DNS record with the zone default TTL through the real form', async () => {
    await page.getByTestId('dns.records.create.open').click();
    await page.getByTestId('dns.records.create.modal').waitFor();
    await page.getByTestId('dns.records.create.name').fill(recordName);
    await page.getByTestId('dns.records.create.type').selectOption('A');
    await page.getByTestId('dns.records.create.content').fill('192.0.2.123');
    await page.getByTestId('dns.records.create.comment').fill(identity.prefix);
    if ((await page.getByTestId('dns.records.create.ttl').inputValue()) !== '') {
      throw new Error('DNS record TTL is not empty; the zone default would be overridden.');
    }
    markPendingCreate('dns_record', `${zoneName}/${recordName}`, zoneId);

    const envelope = await captureMutation('POST', 'dns_records', () => page.getByTestId('dns.records.create.submit').click());
    recordId = extractHaveApiResourceId(envelope, 'dns_record');
    registerOwnedObject(ledger, {
      kind: 'dns_record',
      id: recordId,
      parentId: zoneId,
      label: `${zoneName}/${recordName}`,
    });
    clearPendingCreate('dns_record');

    await waitForResource('dns_records', recordId, true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByTestId(`dns.record.row.${recordId}`).waitFor({ timeout: 45_000 });
    await page.getByTestId(`dns.record.row.${recordId}`).scrollIntoViewIfNeeded();
    await screenshot('03-record-created');
  });

  await check('edit the owned DNS record through the real form', async () => {
    await page.getByTestId(`dns.record.row.${recordId}.edit`).click();
    await page.getByTestId('dns.records.edit.modal').waitFor();
    await page.getByTestId('dns.records.edit.content').fill('192.0.2.124');
    await captureMutation('PUT', `dns_records/${recordId}`, () => page.getByTestId('dns.records.edit.submit').click());
    await page.getByTestId(`dns.record.row.${recordId}`).waitFor({ timeout: 45_000 });
    await page.getByTestId(`dns.record.row.${recordId}`).filter({ hasText: '192.0.2.124' }).waitFor({ timeout: 45_000 });
    await screenshot('04-record-updated');
  });

  await check('delete the owned DNS record through the real confirmation', async () => {
    await page.getByTestId(`dns.record.row.${recordId}.delete`).click();
    await page.getByTestId('dns.records.delete_confirm').waitFor();
    const ownedRecord = ledger.objects.find((entry) => entry.kind === 'dns_record' && entry.id === recordId);
    await verifyOwnedResourceBeforeDelete(ownedRecord);
    await captureMutation('DELETE', `dns_records/${recordId}`, () =>
      page.getByTestId('dns.records.delete_confirm.confirm').click()
    );
    await waitForResource('dns_records', recordId, false);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByTestId('dns.records.list').waitFor({ timeout: 45_000 });
    if (await page.getByTestId(`dns.record.row.${recordId}`).count()) {
      throw new Error(`Deleted DNS record #${recordId} is still rendered.`);
    }
    await screenshot('05-record-deleted');
  });

  await check('delete the owned DNS zone through the real confirmation', async () => {
    await page.goto(`/admin/dns/zones/${zoneId}/settings`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('dns.settings.form').waitFor({ timeout: 45_000 });
    await page.getByTestId('dns.settings.delete.open').click();
    await page.getByTestId('dns.settings.delete_confirm').waitFor();
    const ownedZone = ledger.objects.find((entry) => entry.kind === 'dns_zone' && entry.id === zoneId);
    await verifyOwnedResourceBeforeDelete(ownedZone);
    await captureMutation('DELETE', `dns_zones/${zoneId}`, () =>
      page.getByTestId('dns.settings.delete_confirm.confirm').click()
    );
    await waitForResource('dns_zones', zoneId, false);
    await page.getByTestId('dns.zones.list').waitFor({ timeout: 45_000 });
    await screenshot('06-zone-deleted');
  });
} catch (error) {
  testError = error;
  ledger.testStatus = 'failed';
  ledger.testError = safeError(error);
  writeLedgerAtomic(ledgerPath, ledger);
} finally {
  if (context) {
    let reconciliationFailure;
    if (testError && ledger.pendingCreates?.length > 0) {
      try {
        await reconcilePendingDnsCreates();
      } catch (error) {
        reconciliationFailure = { kind: 'reconciliation', id: 0, error: safeError(error) };
      }
    }
    cleanupResult = await cleanupOwnedObjects(
      ledger,
      {
        dns_record: cleanupResource,
        dns_zone: cleanupResource,
      },
      {
        onChange: async (nextLedger) => writeLedgerAtomic(ledgerPath, nextLedger),
        sanitizeError: sanitizeText,
      }
    ).catch((error) => ({ cleaned: [], failures: [{ kind: 'cleanup', id: 0, error: safeError(error) }] }));
    if (reconciliationFailure) cleanupResult.failures.unshift(reconciliationFailure);
  } else if (ledger.objects.length > 0) {
    cleanupResult = {
      cleaned: [],
      failures: [{ kind: 'cleanup', id: 0, error: 'Playwright context unavailable; cleanup could not run.' }],
    };
  }

  ledger.testStatus = testError ? 'failed' : 'passed';
  ledger.cleanupSummary = JSON.parse(sanitizeText(JSON.stringify(cleanupResult)));
  writeLedgerAtomic(ledgerPath, ledger);

  try {
    await context?.close();
  } catch (error) {
    artifactFailures.push({ artifact: 'browser-context-close', error: safeError(error) });
  }
  try {
    await browser?.close();
  } catch (error) {
    artifactFailures.push({ artifact: 'browser-close', error: safeError(error) });
  }
  hardenArtifactTree(runDirectory);
  writeReport();
}

const failed =
  Boolean(testError) ||
  cleanupResult.failures.length > 0 ||
  responseFailures.length > 0 ||
  consoleFailures.length > 0 ||
  artifactFailures.length > 0;
console.log(JSON.stringify({
  runId: identity.runId,
  outDir: runDirectory,
  checks: checks.length,
  failedChecks: checks.filter((entry) => entry.status === 'failed').length,
  cleanupFailures: cleanupResult.failures.length,
  api5xx: responseFailures.length,
  consoleErrors: consoleFailures.length,
  artifactErrors: artifactFailures.length,
}, null, 2));

if (failed) process.exitCode = 1;
