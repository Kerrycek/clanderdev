#!/usr/bin/env node
import { chromium, request as playwrightRequest } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

import {
  ADMIN_STATIC_ROUTES,
  DETAIL_ROUTE_SPECS,
  PUBLIC_ROUTES,
  USER_STATIC_ROUTES,
  assertExactDevOrigin,
  assertLiveRouteSweepConfig,
  assertUniqueManifestRoutes,
  appIdEnvironmentName,
  buildDetailRoutes,
  discoveryRequirement,
  extractFirstOwnedPositiveId,
  extractFirstPositiveId,
  filterRoutesForRole,
  isAdminCapableLevel,
} from './live-route-sweep-manifest.mjs';
import { ensurePrivateDirectory, writePrivateFile } from './live-route-sweep-privacy.mjs';

const rawBaseURL = process.env.E2E_BASE_URL ?? 'https://dev.crucio.cz';
const rawApiUrl = process.env.E2E_LIVE_API_URL ?? rawBaseURL;
const apiVersion = String(process.env.E2E_LIVE_API_VERSION ?? '7.0').replace(/^v/, '');
const publicOnly = process.env.E2E_LIVE_SWEEP_PUBLIC_ONLY === '1';
const reloadEnabled = process.env.E2E_LIVE_SWEEP_RELOAD !== '0';
const authenticatedScreenshots = process.env.E2E_LIVE_SWEEP_AUTH_SCREENSHOTS === '1';
const chromiumExecutablePath = process.env.E2E_CHROMIUM_EXECUTABLE_PATH?.trim();
const token = readToken();
const baseURL = assertExactDevOrigin(rawBaseURL, 'E2E_BASE_URL');
const apiUrl = assertExactDevOrigin(rawApiUrl, 'E2E_LIVE_API_URL');

if (!/^\d+(?:\.\d+)*$/.test(apiVersion)) {
  throw new Error('E2E_LIVE_API_VERSION must contain only numeric version segments.');
}

if (!publicOnly) assertLiveRouteSweepConfig({ baseURL, apiUrl, token });

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(
  process.env.E2E_LIVE_AUDIT_OUT_DIR ?? path.join('work', 'live-audits', `route-sweep-${runId}`),
);
const screensDir = path.join(outDir, 'screens');
ensurePrivateDirectory(outDir);
ensurePrivateDirectory(screensDir, outDir);

const viewports = [
  ['desktop', { width: 1680, height: 1100 }],
  ['mobile', { width: 390, height: 844 }],
];
const localeRuns = [
  ['en', 'en-US'],
  ['cs', 'cs-CZ'],
];
const results = [];
const discovery = { app: {}, admin: {}, public: {}, failures: [] };

function recordDiscoveryFailure(spec, scope, details = {}) {
  const requirement = discoveryRequirement(spec, scope);
  discovery.failures.push({
    key: spec.key,
    scope,
    requirement,
    blocking: requirement === 'required',
    ...details,
  });
}

function readToken() {
  if (process.env.E2E_LIVE_SESSION_TOKEN) return process.env.E2E_LIVE_SESSION_TOKEN.trim();
  const file = process.env.E2E_LIVE_SESSION_TOKEN_FILE;
  if (!file) return '';
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch (error) {
    throw new Error(`Unable to read E2E_LIVE_SESSION_TOKEN_FILE: ${error?.code ?? 'read failed'}`);
  }
}

function configBody(sessionToken = '') {
  const lines = [
    'window.vpsAdmin = window.vpsAdmin || {};',
    `window.vpsAdmin.api = ${JSON.stringify({ url: apiUrl, version: apiVersion })};`,
  ];
  if (sessionToken) lines.push(`window.vpsAdmin.sessionToken = ${JSON.stringify(sessionToken)};`);
  lines.push(
    'window.vpsAdmin.webuiNext = { haveApi: { authHeader: "X-HaveAPI-Auth-Token", metaNamespace: "_meta" }, uiSettings: { persistence: "local" } };',
    '',
  );
  return lines.join('\n');
}

function safeFilePart(value) {
  return String(value).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

function redact(value) {
  let text = String(value ?? '');
  if (token) text = text.replaceAll(token, '[REDACTED]');
  return text
    .replace(/([?&](?:token|access_token|password|secret)=)[^&\s]+/gi, '$1[REDACTED]')
    .slice(0, 2_000);
}

function safeResponseUrl(raw) {
  try {
    const url = new URL(raw);
    const pathname = url.pathname
      .split('/')
      .map((segment) => /^\d+$/.test(segment) ? '{id}' : segment)
      .join('/');
    return `${url.origin}${pathname}`;
  } catch {
    return redact(raw);
  }
}

function safePathname(raw) {
  try {
    return new URL(raw, baseURL).pathname
      .split('/')
      .map((segment) => /^\d+$/.test(segment) ? '{id}' : segment)
      .join('/');
  } catch {
    return '[unavailable]';
  }
}

function roleFromLevel(level) {
  const value = Number(level);
  if (value >= 90) return 'admin';
  if (value >= 21) return 'support';
  if (value >= 1) return 'user';
  return 'unknown';
}

let apiRequestContext;

async function apiGet(apiPath, namespace, params = {}, sessionToken = token) {
  if (!apiRequestContext) throw new Error('Live API request context is not initialized.');
  const url = new URL(`/v${apiVersion}${apiPath}`, apiUrl);
  if (namespace) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(`${namespace}[${key}]`, String(value));
    }
  }
  const headers = { Accept: 'application/json' };
  if (sessionToken) headers['X-HaveAPI-Auth-Token'] = sessionToken;
  const response = await apiRequestContext.get(url.toString(), { headers });
  const envelope = await response.json().catch(() => null);
  return {
    response: { ok: response.ok(), status: response.status() },
    envelope,
  };
}

async function discoverPublicRoutes() {
  const publicSpecs = DETAIL_ROUTE_SPECS.filter((spec) =>
    spec.paths.some((template) => !template.startsWith('/app/') && !template.startsWith('/admin/')),
  );
  await Promise.all(publicSpecs.map(async (spec) => {
    const explicit = Number(process.env[spec.env]);
    if (Number.isSafeInteger(explicit) && explicit > 0) {
      discovery.public[spec.key] = explicit;
      return;
    }
    try {
      const namespace = spec.namespaces[0];
      const found = await apiGet(spec.apiPath, namespace, { limit: 1 }, '');
      if (!found.response.ok || found.envelope?.status === false) {
        recordDiscoveryFailure(spec, 'public', { status: found.response.status });
        return;
      }
      const id = extractFirstPositiveId(found.envelope, spec.namespaces);
      if (id) discovery.public[spec.key] = id;
    } catch (error) {
      recordDiscoveryFailure(spec, 'public', { error: error?.name ?? 'Error' });
    }
  }));

  const dynamic = buildDetailRoutes({
    env: process.env,
    publicDiscovered: discovery.public,
    adminCapable: false,
  }).filter((item) => !item.path.startsWith('/app/') && !item.path.startsWith('/admin/'));
  return assertUniqueManifestRoutes([...PUBLIC_ROUTES, ...dynamic]);
}

async function discoverAuthenticatedRoutes() {
  const current = await apiGet('/users/current');
  if (!current.response.ok || !current.envelope || current.envelope.status === false) {
    throw new Error(`Live token was rejected by /users/current (HTTP ${current.response.status}).`);
  }
  const currentUser = current.envelope.response?.user ?? current.envelope.response;
  const currentUserId = Number(currentUser?.id);
  if (!Number.isSafeInteger(currentUserId) || currentUserId <= 0) {
    throw new Error('Live token current user response did not contain a valid user id.');
  }
  const level = Number(currentUser?.level);
  const adminCapable = isAdminCapableLevel(level);
  const currentRole = roleFromLevel(level);

  await Promise.all(DETAIL_ROUTE_SPECS.map(async (spec) => {
    const namespace = spec.namespaces[0];
    const baseParams = { limit: 10, ...(spec.key === 'nas-dataset' ? { role: 'primary' } : {}) };
    const hasAppPath = spec.paths.some((template) => template.startsWith('/app/'));
    const hasAdminPath = spec.paths.some((template) => template.startsWith('/admin/'));

    if (hasAppPath) {
      try {
        const explicitAppId = Number(process.env[appIdEnvironmentName(spec)]);
        const expectedId = Number.isSafeInteger(explicitAppId) && explicitAppId > 0 ? explicitAppId : undefined;
        const params = { ...baseParams, user: currentUserId, ...(expectedId ? { id: expectedId } : {}) };
        const found = await apiGet(spec.apiPath, namespace, params);
        if (!found.response.ok || found.envelope?.status === false) {
          recordDiscoveryFailure(spec, 'app', { status: found.response.status });
        } else {
          const id = extractFirstOwnedPositiveId(found.envelope, spec.namespaces, currentUserId, expectedId);
          if (id) discovery.app[spec.key] = id;
        }
      } catch (error) {
        recordDiscoveryFailure(spec, 'app', { error: error?.name ?? 'Error' });
      }
    }

    if (hasAdminPath && spec.adminRoles.includes(currentRole)) {
      const explicitAdminId = Number(process.env[spec.env]);
      if (Number.isSafeInteger(explicitAdminId) && explicitAdminId > 0) {
        discovery.admin[spec.key] = explicitAdminId;
      } else {
        try {
          const found = await apiGet(spec.apiPath, namespace, { ...baseParams, limit: 1 });
          if (!found.response.ok || found.envelope?.status === false) {
            recordDiscoveryFailure(spec, 'admin', { status: found.response.status });
          } else {
            const id = extractFirstPositiveId(found.envelope, spec.namespaces);
            if (id) discovery.admin[spec.key] = id;
          }
        } catch (error) {
          recordDiscoveryFailure(spec, 'admin', { error: error?.name ?? 'Error' });
        }
      }
    }

  }));

  const dynamicRoutes = buildDetailRoutes({
    env: process.env,
    appDiscovered: discovery.app,
    adminDiscovered: discovery.admin,
    adminCapable,
    currentRole,
  }).filter((item) => item.path.startsWith('/app/') || item.path.startsWith('/admin/'));
  const staticRoutes = [
    ...filterRoutesForRole(USER_STATIC_ROUTES, currentRole),
    ...filterRoutesForRole(ADMIN_STATIC_ROUTES, currentRole),
  ];
  return {
    currentUser: { role: currentRole, adminCapable },
    routes: assertUniqueManifestRoutes([...staticRoutes, ...dynamicRoutes]),
  };
}

function observePage(page) {
  const responses = [];
  const consoleMessages = [];
  const blockedMutations = [];
  page.on('pageerror', (error) => consoleMessages.push({ type: 'pageerror', text: redact(error.message) }));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleMessages.push({ type: message.type(), text: redact(message.text()) });
    }
  });
  page.on('response', (response) => {
    const url = response.url();
    if (!url.includes('/assets/') && !url.includes(`/v${apiVersion}`) && !url.includes('/api/')) return;
    responses.push({
      url: safeResponseUrl(url),
      status: response.status(),
      contentType: response.headers()['content-type'] ?? '',
    });
  });
  return { responses, consoleMessages, blockedMutations };
}

function isDescriptionProbe(item) {
  try {
    const pathname = new URL(item.url).pathname.replace(/\/$/, '');
    return pathname === `/v${apiVersion}`;
  } catch {
    return false;
  }
}

const LOADING_SELECTOR = '[aria-busy="true"], [data-testid$=".loading"], [data-loading="true"]';

async function visibleLoaderCount(page) {
  return page.locator(LOADING_SELECTOR).evaluateAll((elements) => elements.filter((element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity) !== 0
      && rect.width > 0
      && rect.height > 0;
  }).length).catch(() => 0);
}

async function waitForSettledSurface(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
  await page.waitForFunction((selector) => [...document.querySelectorAll(selector)].every((element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display === 'none'
      || style.visibility === 'hidden'
      || Number(style.opacity) === 0
      || rect.width === 0
      || rect.height === 0;
  }), LOADING_SELECTOR, { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(150);
}

async function inspectSurface(page, route, startResponses, startConsole, startMutations, observed, phase, expectedLanguage, authenticated) {
  const issues = [];
  const pathname = new URL(page.url()).pathname;
  const expectedPath = route.expectedPath;
  const expectedNotFound = route.id === 'public.not-found';

  if (!expectedNotFound && pathname !== expectedPath && !pathname.startsWith(`${expectedPath}/`)) {
    issues.push({
      kind: 'unexpected-redirect',
      expectedPath: route.reportPath,
      actualPath: safePathname(pathname),
      phase,
    });
  }

  const documentLanguage = await page.locator('html').getAttribute('lang').catch(() => null);
  if (expectedLanguage && documentLanguage !== expectedLanguage) {
    issues.push({ kind: 'unexpected-language', expected: expectedLanguage, actual: documentLanguage, phase });
  }

  const title = (await page.title().catch(() => '')).trim();
  const mainVisible = await page.locator('main, [role="main"]').first().isVisible().catch(() => false);
  const heading = page.locator('main h1, main h2, [role="main"] h1, [role="main"] h2').first();
  const headingVisible = await heading.isVisible().catch(() => false);
  const headingText = headingVisible
    ? (await heading.innerText({ timeout: 2_000 }).catch(() => '')).trim()
    : '';
  let expectedSurfaceVisible = false;
  if (route.expectedTestId) {
    expectedSurfaceVisible = await page.getByTestId(route.expectedTestId).first().isVisible().catch(() => false);
    if (!expectedSurfaceVisible) issues.push({ kind: 'missing-testid', testId: route.expectedTestId, phase });
  } else if (!mainVisible || !headingText) {
    issues.push({ kind: 'missing-surface', phase });
  }

  const lingeringLoaders = await visibleLoaderCount(page);
  if (lingeringLoaders > 0) {
    issues.push({ kind: 'loading-timeout', visibleLoaders: lingeringLoaders, phase });
  }

  const bodyText = await page.locator('body').innerText({ timeout: 5_000 }).catch(() => '');
  const visibleErrorPatterns = [
    /Something went wrong/i,
    /Něco se pokazilo/i,
    /HaveApiError/i,
    /Internal Server Error/i,
    /Relace vypršela/i,
    /Session expired/i,
    /ChunkLoadError/i,
  ].filter((pattern) => pattern.test(bodyText));
  if (visibleErrorPatterns.length) {
    issues.push({ kind: 'visible-error', patterns: visibleErrorPatterns.map(String), phase });
  }

  const overflow = await page.evaluate(() => ({
    width: window.innerWidth,
    html: document.documentElement.scrollWidth,
    body: document.body?.scrollWidth ?? 0,
  }));
  if (Math.max(overflow.html, overflow.body) > overflow.width + 2) {
    issues.push({ kind: 'horizontal-overflow', ...overflow, phase });
  }

  const routeResponses = observed.responses.slice(startResponses);
  const badHttp = routeResponses.filter((item) => item.status >= 400 && !isDescriptionProbe(item));
  if (badHttp.length) issues.push({ kind: 'http-error', responses: badHttp, phase });

  const badAssets = routeResponses.filter((item) => {
    if (!item.url.includes('/assets/')) return false;
    if (/\.js$/.test(item.url)) return item.status >= 400 || !/javascript|ecmascript/.test(item.contentType);
    if (/\.css$/.test(item.url)) return item.status >= 400 || !item.contentType.includes('text/css');
    return false;
  });
  if (badAssets.length) issues.push({ kind: 'invalid-asset-mime', assets: badAssets, phase });

  const routeConsole = observed.consoleMessages.slice(startConsole);
  const hardConsole = routeConsole.filter((item) =>
    item.type === 'pageerror' || item.type === 'error' || /ChunkLoadError|invalid JavaScript MIME|Uncaught/i.test(item.text),
  );
  if (hardConsole.length) {
    issues.push({
      kind: 'console',
      messages: authenticated ? hardConsole.map((item) => ({ type: item.type })) : hardConsole,
      phase,
    });
  }

  const blockedMutations = observed.blockedMutations.slice(startMutations);
  if (blockedMutations.length) issues.push({ kind: 'blocked-mutation', requests: blockedMutations, phase });

  return {
    issues,
    titlePresent: Boolean(title),
    headingPresent: Boolean(headingText),
    pathname: route.reportPath ?? safePathname(pathname),
    expectedSurfaceVisible,
  };
}

async function sweepContext(browser, options) {
  const context = await browser.newContext({
    baseURL,
    ignoreHTTPSErrors: process.env.E2E_IGNORE_HTTPS_ERRORS !== '0',
    viewport: options.viewport,
    locale: options.locale,
  });
  await context.addInitScript((language) => {
    localStorage.setItem('vpsadmin.uiSettings.v1', JSON.stringify({ language }));
  }, options.language);
  const page = await context.newPage();
  const observed = observePage(page);
  const blockApiMutation = (route) => {
    const method = route.request().method().toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return route.continue();
    observed.blockedMutations.push({ method, url: safeResponseUrl(route.request().url()) });
    return route.abort('blockedbyclient');
  };
  await page.route(`**/v${apiVersion}/**`, blockApiMutation);
  await page.route(`**/api/v${apiVersion}/**`, blockApiMutation);
  await page.route('**/config.js', (request) => request.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: configBody(options.authenticated ? token : ''),
  }));

  for (let index = 0; index < options.routes.length; index += 1) {
    const route = options.routes[index];
    const responseStart = observed.responses.length;
    const consoleStart = observed.consoleMessages.length;
    const mutationStart = observed.blockedMutations.length;
    const check = {
      id: route.id,
      path: route.reportPath,
      viewport: options.viewportName,
      language: options.language,
      authenticated: options.authenticated,
      ok: true,
      issues: [],
      phases: [],
    };
    try {
      const navigation = await page.goto(route.path, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      if (navigation && navigation.status() >= 400) {
        check.issues.push({ kind: 'document-http-error', status: navigation.status(), phase: 'direct' });
      }
      await waitForSettledSurface(page);
      const direct = await inspectSurface(page, route, responseStart, consoleStart, mutationStart, observed, 'direct', options.language, options.authenticated);
      check.phases.push(direct);
      check.issues.push(...direct.issues);

      if (reloadEnabled) {
        const reloadResponseStart = observed.responses.length;
        const reloadConsoleStart = observed.consoleMessages.length;
        const reloadMutationStart = observed.blockedMutations.length;
        const reload = await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
        if (reload && reload.status() >= 400) {
          check.issues.push({ kind: 'document-http-error', status: reload.status(), phase: 'reload' });
        }
        await waitForSettledSurface(page);
        const reloaded = await inspectSurface(page, route, reloadResponseStart, reloadConsoleStart, reloadMutationStart, observed, 'reload', options.language, options.authenticated);
        check.phases.push(reloaded);
        check.issues.push(...reloaded.issues);
      }
    } catch (error) {
      check.issues.push(options.authenticated
        ? { kind: 'exception', error: error?.name ?? 'Error' }
        : { kind: 'exception', message: redact(error?.message ?? error) });
    }

    const filename = [options.authenticated ? 'auth' : 'public', options.viewportName, options.language, String(index + 1).padStart(3, '0'), safeFilePart(route.id)].join('-');
    if (!options.authenticated || authenticatedScreenshots) {
      try {
        const screenshot = await page.screenshot({ fullPage: true });
        writePrivateFile(path.join(screensDir, `${filename}.png`), screenshot, outDir);
      } catch (error) {
        check.issues.push({ kind: 'screenshot-failed', error: error?.name ?? 'Error' });
      }
    }
    check.ok = check.issues.length === 0;
    results.push(check);
  }

  await context.close();
}

async function verifyRoleRedirect(browser, currentUser) {
  if (currentUser.adminCapable) return;
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, viewport: viewports[0][1] });
  const page = await context.newPage();
  await page.route('**/config.js', (request) => request.fulfill({ status: 200, contentType: 'application/javascript', body: configBody(token) }));
  const check = { id: 'auth.non-admin-role-redirect', path: '/admin/users', viewport: 'desktop', language: 'en', authenticated: true, issues: [] };
  try {
    await page.goto('/admin/users', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitForSettledSurface(page);
    const pathname = new URL(page.url()).pathname;
    if (!pathname.startsWith('/app')) check.issues.push({ kind: 'role-redirect-failed', actualPath: safePathname(pathname) });
  } catch (error) {
    check.issues.push({ kind: 'exception', error: error?.name ?? 'Error' });
  }
  check.ok = check.issues.length === 0;
  results.push(check);
  await context.close();
}

apiRequestContext = await playwrightRequest.newContext({ ignoreHTTPSErrors: true });
const browser = await chromium.launch({
  headless: true,
  ...(chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {}),
});
try {
  const publicRoutes = await discoverPublicRoutes();
  for (const [viewportName, viewport] of viewports) {
    for (const [language, locale] of localeRuns) {
      await sweepContext(browser, {
        viewportName, viewport, language, locale, authenticated: false, routes: publicRoutes,
      });
    }
  }

  let authenticated;
  if (!publicOnly) {
    authenticated = await discoverAuthenticatedRoutes();
    for (const [viewportName, viewport] of viewports) {
      await sweepContext(browser, {
        viewportName, viewport, language: 'en', locale: 'en-US', authenticated: true, routes: authenticated.routes,
      });
    }
    await verifyRoleRedirect(browser, authenticated.currentUser);
  }

  const blockingDiscoveryFailures = discovery.failures.filter((item) => item.blocking);
  if (blockingDiscoveryFailures.length > 0) {
    results.push({
      id: 'discovery.complete',
      path: '[api-discovery]',
      viewport: 'n/a',
      language: 'n/a',
      authenticated: !publicOnly,
      ok: false,
      issues: blockingDiscoveryFailures.map((item) => ({
        kind: 'discovery-failed',
        key: item.key,
        scope: item.scope,
        requirement: item.requirement,
        status: item.status,
        error: item.error,
      })),
      phases: [],
    });
  }

  const failed = results.filter((item) => !item.ok);
  const report = {
    baseURL,
    apiUrl,
    apiVersion,
    publicOnly,
    reloadEnabled,
    authenticatedScreenshots,
    currentUser: authenticated?.currentUser,
    routeCounts: {
      public: publicRoutes.length,
      authenticated: authenticated?.routes.length ?? 0,
      checks: results.length,
      failed: failed.length,
    },
    discovery: {
      discoveredKinds: {
        app: Object.keys(discovery.app).sort(),
        admin: Object.keys(discovery.admin).sort(),
        public: Object.keys(discovery.public).sort(),
      },
      failures: discovery.failures,
    },
    results,
    failed,
  };
  writePrivateFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, outDir);
  console.log(JSON.stringify({ outDir, ...report.routeCounts, discovery: report.discovery }, null, 2));
  process.exitCode = failed.length ? 1 : 0;
} finally {
  await apiRequestContext.dispose();
  await browser.close();
}
