#!/usr/bin/env node
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const baseURL = process.env.E2E_BASE_URL ?? 'https://dev.crucio.cz';
const token =
  process.env.E2E_LIVE_SESSION_TOKEN ??
  (process.env.E2E_LIVE_SESSION_TOKEN_FILE
    ? fs.readFileSync(process.env.E2E_LIVE_SESSION_TOKEN_FILE, 'utf8').trim()
    : '');
const apiUrl = process.env.E2E_LIVE_API_URL ?? baseURL;
const apiVersion = process.env.E2E_LIVE_API_VERSION ?? '7.0';
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(process.env.E2E_LIVE_AUDIT_OUT_DIR ?? path.join('work', 'live-audits', `regression-${runId}`));

if (!token) {
  console.error('Set E2E_LIVE_SESSION_TOKEN or E2E_LIVE_SESSION_TOKEN_FILE.');
  process.exit(2);
}

fs.mkdirSync(path.join(outDir, 'screens'), { recursive: true });

const configBody = [
  'window.vpsAdmin = window.vpsAdmin || {};',
  `window.vpsAdmin.api = ${JSON.stringify({ url: apiUrl, version: apiVersion })};`,
  `window.vpsAdmin.sessionToken = ${JSON.stringify(token)};`,
  'window.vpsAdmin.webuiNext = { haveApi: { authHeader: "X-HaveAPI-Auth-Token", metaNamespace: "_meta" }, uiSettings: { persistence: "local" } };',
  '',
].join('\n');

const routes = [
  ['dashboard', '/app'],
  ['vps list', '/app/vps'],
  ['vps create', '/app/vps/new'],
  ['datasets', '/app/datasets'],
  ['dns zones', '/app/dns'],
  ['transactions', '/app/transactions'],
  ['transaction items', '/app/transactions/items'],
  ['action states', '/app/action-states'],
  ['incidents', '/app/incidents?limit=50'],
  ['oom reports', '/app/oom-reports?limit=50'],
  ['payments', '/app/payments'],
  ['admin users', '/admin/users?limit=50'],
  ['admin requests', '/admin/requests?limit=50'],
  ['admin incoming payments', '/admin/payments/incoming?limit=50'],
  ['admin ip addresses', '/admin/networking/ip-addresses?limit=50'],
  ['admin audit', '/admin/audit?limit=50'],
  ['admin cluster', '/admin/cluster'],
];

const viewports = [
  ['desktop', { width: 1680, height: 1100 }],
  ['narrow', { width: 390, height: 844 }],
];

function safeFilePart(value) {
  return String(value).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

function isIgnorableApiFailure(item) {
  try {
    const p = new URL(item.url).pathname;
    if (p === '/v7.0' || p === '/v7.0/') return true;
  } catch {
    return false;
  }
  return false;
}

async function runViewport(browser, viewportName, viewport) {
  const context = await browser.newContext({
    baseURL,
    ignoreHTTPSErrors: process.env.E2E_IGNORE_HTTPS_ERRORS !== '0',
    viewport,
  });
  const page = await context.newPage();
  const responses = [];
  const consoleMessages = [];
  const checks = [];

  await page.route('**/config.js', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: configBody })
  );

  page.on('pageerror', (err) => consoleMessages.push({ type: 'pageerror', text: err.message, url: page.url() }));
  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) {
      consoleMessages.push({ type: msg.type(), text: msg.text(), url: page.url() });
    }
  });
  page.on('response', async (res) => {
    const url = res.url();
    const contentType = res.headers()['content-type'] || '';
    if (!url.includes('/assets/') && !url.includes('/v7.0') && !url.includes('/api/')) return;
    responses.push({
      url,
      status: res.status(),
      contentType,
      body: res.status() >= 400 ? (await res.text().catch(() => '')).slice(0, 1000) : '',
    });
  });

  for (let i = 0; i < routes.length; i += 1) {
    const [name, url] = routes[i];
    const beforeResponses = responses.length;
    const beforeConsole = consoleMessages.length;
    const check = { viewport: viewportName, name, url, ok: true, issues: [] };

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(250);

      const bodyText = await page.locator('body').innerText({ timeout: 5_000 }).catch(() => '');
      const visibleErrors = [
        /Něco se pokazilo/i,
        /Something went wrong/i,
        /HaveApiError/i,
        /Internal Server Error/i,
        /Relace vypršela/i,
      ].filter((rx) => rx.test(bodyText));
      if (visibleErrors.length > 0) {
        check.issues.push({ kind: 'visible-error', patterns: visibleErrors.map(String) });
      }

      const overflow = await page.evaluate(() => ({
        width: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body?.scrollWidth ?? 0,
      }));
      const maxScrollWidth = Math.max(overflow.scrollWidth, overflow.bodyScrollWidth);
      if (maxScrollWidth > overflow.width + 2) {
        check.issues.push({ kind: 'horizontal-overflow', ...overflow, maxScrollWidth });
      }

      const invalidJs = responses
        .slice(beforeResponses)
        .filter((r) => /\/assets\/.*\.js($|\?)/.test(r.url) && (r.status >= 400 || r.contentType.includes('text/html')));
      if (invalidJs.length > 0) check.issues.push({ kind: 'invalid-js', invalidJs });

      const apiFailures = responses
        .slice(beforeResponses)
        .filter((r) => r.status >= 500 && (r.url.includes('/v7.0') || r.url.includes('/api/')) && !isIgnorableApiFailure(r));
      if (apiFailures.length > 0) check.issues.push({ kind: 'api-5xx', apiFailures });

      const hardConsole = consoleMessages
        .slice(beforeConsole)
        .filter((m) => m.type === 'pageerror' || /ChunkLoadError|not a valid JavaScript MIME|Uncaught/i.test(m.text));
      if (hardConsole.length > 0) check.issues.push({ kind: 'console', console: hardConsole });
    } catch (err) {
      check.issues.push({ kind: 'exception', message: err?.message ?? String(err) });
    }

    check.ok = check.issues.length === 0;
    const shot = `${viewportName}-${String(i + 1).padStart(2, '0')}-${safeFilePart(name)}.png`;
    await page.screenshot({ path: path.join(outDir, 'screens', shot), fullPage: true }).catch(() => {});
    checks.push(check);
  }

  await context.close();
  return { checks, responses, consoleMessages };
}

const browser = await chromium.launch({ headless: true });
const results = [];
for (const [viewportName, viewport] of viewports) {
  results.push(await runViewport(browser, viewportName, viewport));
}
await browser.close();

const checks = results.flatMap((r) => r.checks);
const responses = results.flatMap((r) => r.responses);
const consoleMessages = results.flatMap((r) => r.consoleMessages);
const invalidJs = responses.filter((r) => /\/assets\/.*\.js($|\?)/.test(r.url) && (r.status >= 400 || r.contentType.includes('text/html')));
const apiFailures = responses.filter((r) => r.status >= 500 && (r.url.includes('/v7.0') || r.url.includes('/api/')) && !isIgnorableApiFailure(r));
const failedChecks = checks.filter((c) => !c.ok);

const report = {
  baseURL,
  outDir,
  checks,
  failedChecks,
  invalidJs,
  apiFailures,
  responses: responses.slice(-300),
  consoleMessages: consoleMessages.slice(-200),
};
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));

console.log(
  JSON.stringify(
    {
      outDir,
      checks: checks.length,
      failedChecks: failedChecks.length,
      invalidJs: invalidJs.length,
      apiFailures: apiFailures.length,
      console: consoleMessages.length,
    },
    null,
    2
  )
);

process.exit(failedChecks.length > 0 || invalidJs.length > 0 || apiFailures.length > 0 ? 1 : 0);
