import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import { chromium } from '@playwright/test';

import { findSystemChromium } from './e2e-harness.mjs';
import { proxyPinnedLiveVpsBrowserRequest } from './live-vps-certification-browser-proxy.mjs';

const TEST_TOKEN = 'redirect-regression-token';
const TEST_BODY = JSON.stringify({ vps: { hostname: 'must-not-be-replayed' } });

async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    server,
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function redirectResponse(status, location) {
  return {
    status: () => status,
    headers: () => ({ location, 'content-type': 'text/plain' }),
    body: async () => Buffer.from('redirect must never reach Chromium'),
  };
}

test('real Playwright route blocks API and static redirects before foreign or changed-path targets see a request', async () => {
  const sourceHits = [];
  const foreignHits = [];
  const sameOriginRedirectTargets = new Set();
  const source = await listen((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      if (request.url !== '/') {
        sourceHits.push({ url: request.url, headers: request.headers, body: Buffer.concat(chunks).toString('utf8') });
      }
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<!doctype html><link rel="icon" href="data:,"><title>redirect regression</title>');
    });
  });
  const foreign = await listen((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      foreignHits.push({ url: request.url, headers: request.headers, body: Buffer.concat(chunks).toString('utf8') });
      response.writeHead(204);
      response.end();
    });
  });
  const executablePath = process.env.E2E_CHROMIUM_EXECUTABLE_PATH?.trim() || findSystemChromium() || undefined;
  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
    const page = await browser.newPage();
    await page.goto(`${source.origin}/`);

    for (const status of [302, 307, 308]) {
      for (const targetKind of ['same-origin', 'foreign-origin']) {
        const originalPath = `/v7.0/vpses/42/restart-${status}-${targetKind}`;
        const targetPath = `/redirect-target-${status}-${targetKind}`;
        const location = targetKind === 'same-origin'
          ? `${source.origin}${targetPath}`
          : `${foreign.origin}${targetPath}`;
        if (targetKind === 'same-origin') sameOriginRedirectTargets.add(targetPath);
        let proxyCalls = 0;
        await page.route(`${source.origin}${originalPath}`, async (route) => {
          await proxyPinnedLiveVpsBrowserRequest({
            route,
            client: {
              fetch: async (pathname, options) => {
                proxyCalls += 1;
                assert.equal(pathname, originalPath);
                assert.equal(options.method, 'POST');
                assert.equal(options.maxRedirects, 0);
                assert.deepEqual(options.data, JSON.parse(TEST_BODY));
                return redirectResponse(status, location);
              },
            },
            pathname: originalPath,
            method: 'POST',
            data: JSON.parse(TEST_BODY),
          });
        });

        const fetchResult = await page.evaluate(async ({ url, token, body }) => {
          try {
            await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-HaveAPI-Auth-Token': token,
              },
              body,
            });
            return 'resolved';
          } catch {
            return 'blocked';
          }
        }, { url: `${source.origin}${originalPath}`, token: TEST_TOKEN, body: TEST_BODY });

        assert.equal(fetchResult, 'blocked');
        assert.equal(proxyCalls, 1);
        await page.unroute(`${source.origin}${originalPath}`);
      }
    }

    const staticPath = '/assets/redirecting-app.js';
    await page.route(`${source.origin}${staticPath}`, async (route) => {
      await proxyPinnedLiveVpsBrowserRequest({
        route,
        client: {
          fetch: async (pathname, options) => {
            assert.equal(pathname, staticPath);
            assert.equal(options.method, 'GET');
            assert.equal(options.maxRedirects, 0);
            assert.equal(options.data, undefined);
            return redirectResponse(302, `${foreign.origin}/static-redirect-target`);
          },
        },
        pathname: staticPath,
        method: 'GET',
      });
    });
    assert.equal(
      await page.evaluate(async (url) => {
        try {
          await fetch(url);
          return 'resolved';
        } catch {
          return 'blocked';
        }
      }, `${source.origin}${staticPath}`),
      'blocked'
    );

    assert.deepEqual(
      sourceHits.filter((hit) => sameOriginRedirectTargets.has(hit.url)),
      [],
      'same-origin changed paths must not receive any redirected request'
    );
    assert.deepEqual(foreignHits, [], 'foreign origins must not receive any redirected request');
  } finally {
    try {
      await browser?.close();
    } finally {
      await Promise.all([source.close(), foreign.close()]);
    }
  }
});
