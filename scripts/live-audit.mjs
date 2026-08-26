#!/usr/bin/env node
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const baseURL = process.env.E2E_BASE_URL ?? 'https://dev.crucio.cz';
const token = process.env.E2E_LIVE_SESSION_TOKEN
  ?? (process.env.E2E_LIVE_SESSION_TOKEN_FILE
    ? fs.readFileSync(process.env.E2E_LIVE_SESSION_TOKEN_FILE, 'utf8').trim()
    : '');
const apiUrl = process.env.E2E_LIVE_API_URL ?? baseURL;
const apiVersion = process.env.E2E_LIVE_API_VERSION ?? '7.0';
const vpsId = process.env.E2E_LIVE_VPS_ID;
const swapTargetVpsId = process.env.E2E_LIVE_SWAP_TARGET_VPS_ID;
const datasetId = process.env.E2E_LIVE_DATASET_ID;
const actionStateId = process.env.E2E_LIVE_ACTION_STATE_ID;
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(process.env.E2E_LIVE_AUDIT_OUT_DIR ?? path.join('work', 'live-audits', runId));

if (!token) {
  console.error('Set E2E_LIVE_SESSION_TOKEN or E2E_LIVE_SESSION_TOKEN_FILE.');
  process.exit(2);
}

fs.mkdirSync(outDir, { recursive: true });

const configBody = [
  'window.vpsAdmin = window.vpsAdmin || {};',
  `window.vpsAdmin.api = ${JSON.stringify({ url: apiUrl, version: apiVersion })};`,
  `window.vpsAdmin.sessionToken = ${JSON.stringify(token)};`,
  'window.vpsAdmin.webuiNext = { haveApi: { authHeader: "X-HaveAPI-Auth-Token", metaNamespace: "_meta" }, uiSettings: { persistence: "local" } };',
  '',
].join('\n');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  baseURL,
  ignoreHTTPSErrors: process.env.E2E_IGNORE_HTTPS_ERRORS !== '0',
  viewport: { width: 1680, height: 1200 },
  recordVideo: { dir: path.join(outDir, 'videos'), size: { width: 1680, height: 1200 } },
});
const page = await context.newPage();
const checks = [];
const responses = [];
const consoleMessages = [];
let authRejected = false;

page.on('pageerror', (err) => consoleMessages.push({ type: 'pageerror', text: err.message }));
page.on('console', (msg) => {
  if (['error', 'warning'].includes(msg.type())) consoleMessages.push({ type: msg.type(), text: msg.text() });
});
page.on('response', async (res) => {
  const url = res.url();
  const contentType = res.headers()['content-type'] || '';
  if (res.status() === 401 && url.includes('/users/current')) authRejected = true;
  if (url.includes('/assets/') || url.includes('/v7.0') || url.includes('/api/')) {
    responses.push({
      url,
      status: res.status(),
      contentType,
      body: res.status() >= 400 ? await res.text().catch(() => '') : '',
    });
  }
});
await page.route('**/config.js', (route) =>
  route.fulfill({ status: 200, contentType: 'application/javascript', body: configBody })
);

async function ready() {
  await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {});
}

async function shot(name) {
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
}

async function goto(name, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await ready();
  await shot(name);
}

async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, ok: true });
  } catch (err) {
    checks.push({ name, ok: false, error: err?.message ?? String(err) });
    await shot(`error-${String(checks.length).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`).catch(() => {});
  }
}

async function writeReportAndExit(exitCode = 0) {
  const invalidJs = responses.filter((res) =>
    /\/assets\/.*\.js($|\?)/.test(res.url) && (res.status >= 400 || res.contentType.includes('text/html'))
  );
  const apiFailures = responses.filter((res) => {
    if (res.status < 400) return false;
    if (/\/v7\.0\/?$/.test(new URL(res.url).pathname)) return false;
    return res.url.includes('/v7.0') || res.url.includes('/api/');
  });
  const failedChecks = checks.filter((c) => !c.ok);
  const report = {
    baseURL,
    outDir,
    checks,
    failedChecks,
    invalidJs,
    apiFailures,
    responses: responses.slice(-120),
    consoleMessages: consoleMessages.slice(-120),
  };

  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  await context.close();
  await browser.close();

  console.log(JSON.stringify({
    outDir,
    checks: checks.length,
    failedChecks: failedChecks.length,
    invalidJs: invalidJs.length,
    apiFailures: apiFailures.length,
    console: consoleMessages.length,
  }, null, 2));

  process.exit(exitCode || (failedChecks.length > 0 || invalidJs.length > 0 ? 1 : 0));
}

async function ensureAuthenticated() {
  const tasks = page.getByRole('button', { name: /Tasks|Úlohy/i });
  const login = page.getByRole('link', { name: /Log in|Přihlásit/i }).or(page.getByRole('button', { name: /Log in|Přihlásit/i }));

  await Promise.race([
    tasks.first().waitFor({ timeout: 15_000 }).then(() => 'tasks'),
    login.first().waitFor({ timeout: 15_000 }).then(() => 'login'),
  ]).catch(() => null);

  if (authRejected || !(await tasks.first().isVisible().catch(() => false))) {
    throw new Error('Live session token was rejected or expired. Refresh E2E_LIVE_SESSION_TOKEN_FILE/E2E_LIVE_SESSION_TOKEN and rerun the audit.');
  }
}

await check('dashboard and tasks drawer', async () => {
  await goto('01-dashboard', '/app');
  await ensureAuthenticated();
  await page.getByRole('button', { name: /Tasks|Úlohy/i }).click();
  await page.getByText(/Action states|Stavy akcí|Transactions|Transakce/i).first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(500);
  await shot('02-tasks-drawer');
});

if (authRejected || checks.some((checkResult) => checkResult.name === 'dashboard and tasks drawer' && !checkResult.ok)) {
  await writeReportAndExit(1);
}

if (actionStateId) {
  await check('action state detail', async () => {
    await goto('03-action-state-detail', `/admin/action-states/${actionStateId}`);
    await page.getByText(/transactions|transakce|items|položky|Create|Start|Stop|Swap/i).first().waitFor({ timeout: 20_000 });
  });
}

if (vpsId) {
  await check('VPS swap workflow preview', async () => {
    await goto('04-vps-swap', `/admin/vps/${vpsId}/lifecycle/swap`);
    await page.getByTestId('vps.lifecycle.swap').waitFor({ timeout: 20_000 });
    if (swapTargetVpsId) {
      const candidate = page.getByTestId(`vps.lifecycle.swap.candidate.${swapTargetVpsId}`);
      if (await candidate.count()) {
        await candidate.click();
      } else {
        await page.getByTestId('vps.lifecycle.swap.target').fill(`#${swapTargetVpsId}`);
        await page.getByTestId('vps.lifecycle.swap.target').blur();
      }
      await page.getByTestId('vps.lifecycle.swap.preview.after_table').waitFor({ timeout: 20_000 });
    }
    await shot('05-vps-swap-preview');
    const dialogs = await page.getByRole('dialog').count();
    if (dialogs > 0) throw new Error(`Swap workflow opened ${dialogs} dialog(s), expected inline page.`);
  });

  await check('VPS migrate workflow node lookup', async () => {
    await goto('06-vps-migrate', `/admin/vps/${vpsId}/lifecycle/migrate`);
    await page.getByTestId('vps.lifecycle.migrate').waitFor({ timeout: 20_000 });
    await page.getByTestId('vps.lifecycle.migrate.node').fill('vpsadmin');
    await page.getByTestId('vps.lifecycle.migrate.node.dropdown').waitFor({ timeout: 20_000 });
    await shot('07-vps-migrate-node-lookup');
  });

  await check('VPS storage workflow', async () => {
    await goto('08-vps-storage', `/admin/vps/${vpsId}/storage`);
    await page.getByText(/Dataset|Storage|Úložiště|Mount/i).first().waitFor({ timeout: 20_000 });
  });
}

await check('NAS page', async () => {
  await goto('09-nas', '/app/nas');
  await page.getByText(/NAS|Dataset|storage|úložiště/i).first().waitFor({ timeout: 20_000 });
});

if (datasetId) {
  await check('dataset detail', async () => {
    await goto('10-dataset-detail', `/admin/datasets/${datasetId}`);
    await page.getByText(/Dataset|Snapshots|Downloads|Stahování|Snapshoty/i).first().waitFor({ timeout: 20_000 });
  });
}

await check('requests expanded list', async () => {
  await goto('11-requests', '/app/requests?limit=50&page=1');
  const expand = page.getByRole('button', { name: /Expand all|Rozbalit vše|Rozbalit/i }).first();
  if (await expand.count()) await expand.click();
  await ready();
  await shot('12-requests-expanded');
});

await writeReportAndExit();
