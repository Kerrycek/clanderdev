import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ADMIN_STATIC_ROUTES,
  DETAIL_ROUTE_SPECS,
  LIVE_ROUTE_MANIFEST,
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

test('live route sweep accepts only the exact dev.crucio.cz origin', () => {
  assert.equal(assertExactDevOrigin('https://dev.crucio.cz/'), 'https://dev.crucio.cz');
  assert.deepEqual(
    assertLiveRouteSweepConfig({
      baseURL: 'https://dev.crucio.cz',
      apiUrl: 'https://dev.crucio.cz/',
      token: ' test-token ',
    }),
    { baseURL: 'https://dev.crucio.cz', apiUrl: 'https://dev.crucio.cz', token: 'test-token' },
  );

  for (const unsafe of [
    'http://dev.crucio.cz',
    'https://dev.crucio.cz.evil.test',
    'https://dev.crucio.cz/app',
    'https://dev.crucio.cz?token=x',
    'https://user@dev.crucio.cz',
    'https://dev.crucio.cz:8443',
    'https://clankerdev.vpsfree.cz',
  ]) {
    assert.throws(() => assertExactDevOrigin(unsafe), /exactly https:\/\/dev\.crucio\.cz/);
  }
  assert.throws(
    () => assertLiveRouteSweepConfig({ baseURL: 'https://dev.crucio.cz', apiUrl: 'https://dev.crucio.cz', token: '' }),
    /non-empty token/,
  );
});

test('manifest covers public, user and broad admin static surfaces without duplicates', () => {
  assert.ok(PUBLIC_ROUTES.length >= 5);
  assert.ok(USER_STATIC_ROUTES.length >= 30);
  assert.ok(ADMIN_STATIC_ROUTES.length >= 45);
  assert.ok(DETAIL_ROUTE_SPECS.length >= 20);
  assert.equal(LIVE_ROUTE_MANIFEST.length, PUBLIC_ROUTES.length + USER_STATIC_ROUTES.length + ADMIN_STATIC_ROUTES.length);
  assert.equal(new Set(LIVE_ROUTE_MANIFEST.map((item) => item.id)).size, LIVE_ROUTE_MANIFEST.length);
  assert.equal(new Set(LIVE_ROUTE_MANIFEST.map((item) => item.path)).size, LIVE_ROUTE_MANIFEST.length);
  assert.ok(LIVE_ROUTE_MANIFEST.some((item) => item.path === '/admin/networking/live'));
  assert.ok(LIVE_ROUTE_MANIFEST.some((item) => item.path === '/app/profile/mfa'));
  assert.ok(LIVE_ROUTE_MANIFEST.some((item) => item.path === '/admin/cluster/dns-tsig-keys'));
});

test('user incident creation route certifies its explicit forbidden surface', () => {
  const route = USER_STATIC_ROUTES.find((item) => item.id === 'app.incidents.new');
  assert.ok(route);
  assert.equal(route.path, '/app/incidents/new');
  assert.equal(route.expectedTestId, 'incidents.new.forbidden');
});

test('manifest validator rejects duplicate ids and paths', () => {
  assert.throws(
    () => assertUniqueManifestRoutes([{ id: 'one', path: '/one' }, { id: 'one', path: '/two' }]),
    /Duplicate live sweep route id/,
  );
  assert.throws(
    () => assertUniqueManifestRoutes([{ id: 'one', path: '/one' }, { id: 'two', path: '/one' }]),
    /Duplicate live sweep route path/,
  );
});

test('detail routes separate app ownership from unrestricted admin discovery', () => {
  const ordinary = buildDetailRoutes({
    env: { E2E_LIVE_VPS_ID: '42' },
    appDiscovered: { dataset: 88 },
    adminDiscovered: { vps: 99 },
    adminCapable: false,
  });
  assert.ok(ordinary.every((item) => item.path !== '/app/vps/42'));
  assert.ok(ordinary.every((item) => item.path !== '/app/vps/99'));
  assert.ok(ordinary.some((item) => item.path === '/app/datasets/88'));
  assert.ok(ordinary.every((item) => !item.path.startsWith('/admin/')));

  const admin = buildDetailRoutes({
    env: { E2E_LIVE_VPS_ID: '42' },
    appDiscovered: {},
    adminDiscovered: { dataset: 88 },
    adminCapable: true,
  });
  assert.ok(admin.some((item) => item.path === '/admin/vps/42/config'));
  assert.ok(admin.some((item) => item.path === '/admin/datasets/88'));
  assert.ok(admin.every((item) => item.path !== '/app/vps/42'));
  assert.ok(admin.every((item) => item.path !== '/app/datasets/88'));
});

test('route roles deny support-only access to administrator security advisories', () => {
  const supportStatic = filterRoutesForRole(ADMIN_STATIC_ROUTES, 'support');
  const adminStatic = filterRoutesForRole(ADMIN_STATIC_ROUTES, 'admin');
  assert.equal(supportStatic.some((item) => item.path === '/admin/security-advisories'), false);
  assert.equal(adminStatic.some((item) => item.path === '/admin/security-advisories'), true);

  const supportDetails = buildDetailRoutes({
    adminDiscovered: { 'security-advisory': 42, outage: 43 },
    currentRole: 'support',
  });
  assert.equal(supportDetails.some((item) => item.path === '/admin/security-advisories/42'), false);
  assert.equal(supportDetails.some((item) => item.path === '/admin/outages/43'), true);

  const adminDetails = buildDetailRoutes({
    adminDiscovered: { 'security-advisory': 42 },
    currentRole: 'admin',
  });
  assert.equal(adminDetails.some((item) => item.path === '/admin/security-advisories/42'), true);
  assert.deepEqual(
    adminDetails.find((item) => item.path === '/admin/security-advisories/42').roles,
    ['admin'],
  );
});

test('detail discovery has explicit required and optional semantics', () => {
  const spec = DETAIL_ROUTE_SPECS.find((item) => item.key === 'security-advisory');
  assert.equal(discoveryRequirement(spec, 'public'), 'optional');
  assert.equal(discoveryRequirement(spec, 'app'), 'required');
  assert.equal(discoveryRequirement(spec, 'admin'), 'required');
  assert.throws(() => discoveryRequirement(spec, 'unknown'), /Invalid unknown discovery requirement/);
});

test('app detail routes are fail-closed, private to authenticated roles and report templates only', () => {
  const routes = buildDetailRoutes({
    env: { E2E_LIVE_VPS_ID: '999', E2E_LIVE_APP_VPS_ID: '777' },
    appDiscovered: { vps: 17 },
    adminDiscovered: { vps: 99 },
    adminCapable: true,
  });
  const appRoute = routes.find((item) => item.path === '/app/vps/17');
  assert.ok(appRoute);
  assert.deepEqual(appRoute.roles, ['user', 'support', 'admin']);
  assert.equal(appRoute.roles.includes('anonymous'), false);
  assert.equal(appRoute.reportPath, '/app/vps/{id}');
  assert.equal(routes.some((item) => item.path === '/app/vps/777'), false);
  assert.equal(routes.some((item) => item.path === '/app/vps/999'), false);
  assert.equal(routes.some((item) => item.path === '/admin/vps/999'), true);
  assert.equal(appIdEnvironmentName(DETAIL_ROUTE_SPECS.find((item) => item.key === 'vps')), 'E2E_LIVE_APP_VPS_ID');
});

test('HaveAPI discovery extracts only positive integer resource ids', () => {
  assert.equal(extractFirstPositiveId({ status: true, response: { vps: [{ id: '17' }] } }, ['vps']), 17);
  assert.equal(extractFirstPositiveId({ status: true, response: [{ id: 18 }] }, []), 18);
  assert.equal(extractFirstPositiveId({ status: true, response: { _meta: {}, vps: [{ id: 0 }] } }, ['vps']), undefined);
  assert.equal(extractFirstPositiveId({ status: false, response: { vps: [{ id: 19 }] } }, ['vps']), undefined);
});

test('app discovery accepts only rows owned by the current user and matching an explicit id', () => {
  const envelope = {
    status: true,
    response: {
      vps: [
        { id: 11, user: { id: 7 }, hostname: 'owned' },
        { id: 12, user: { id: 8 }, hostname: 'foreign' },
        { id: 13, hostname: 'unverifiable' },
      ],
    },
  };
  assert.equal(extractFirstOwnedPositiveId(envelope, ['vps'], 7), 11);
  assert.equal(extractFirstOwnedPositiveId(envelope, ['vps'], 8, 12), 12);
  assert.equal(extractFirstOwnedPositiveId(envelope, ['vps'], 7, 12), undefined);
  assert.equal(extractFirstOwnedPositiveId(envelope, ['vps'], 7, 13), undefined);
  assert.equal(extractFirstOwnedPositiveId(envelope, ['vps'], 7, 999), undefined);
});

test('live route sweep artifacts are private and refuse symlinks', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'live-route-sweep-')));
  try {
    ensurePrivateDirectory(path.join(root, 'audit'), root);
    const directory = ensurePrivateDirectory(path.join(root, 'audit', 'screens'), root);
    const report = writePrivateFile(path.join(root, 'audit', 'report.json'), '{}\n', root);
    assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(report).mode & 0o777, 0o600);

    const target = path.join(root, 'target');
    fs.mkdirSync(target);
    const link = path.join(root, 'linked');
    fs.symlinkSync(target, link);
    assert.throws(() => ensurePrivateDirectory(path.join(link, 'screens'), root), /Refusing symlinked/);

    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'live-route-outside-')));
    const linkedRoot = path.join(root, 'linked-root');
    fs.symlinkSync(outside, linkedRoot);
    assert.throws(
      () => ensurePrivateDirectory(path.join(linkedRoot, 'audit'), path.join(linkedRoot, 'audit')),
      /Refusing symlinked/,
    );
    fs.rmSync(outside, { recursive: true, force: true });

    const regular = path.join(root, 'regular');
    fs.writeFileSync(regular, 'safe');
    const fileLink = path.join(root, 'audit', 'linked-report.json');
    fs.symlinkSync(regular, fileLink);
    assert.throws(() => writePrivateFile(fileLink, 'unsafe', root), /Refusing symlinked/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('admin-capable role level matches WebUI role boundaries', () => {
  assert.equal(isAdminCapableLevel(1), false);
  assert.equal(isAdminCapableLevel(20), false);
  assert.equal(isAdminCapableLevel(21), true);
  assert.equal(isAdminCapableLevel(90), true);
});
