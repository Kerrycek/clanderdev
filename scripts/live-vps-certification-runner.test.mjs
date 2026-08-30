import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  PINNED_LIVE_VPS_LEAF_DER_SHA256,
  PINNED_LIVE_VPS_SPKI_SHA256_BASE64,
  PINNED_LIVE_VPS_TLS_AUTHORIZATION_ERROR,
  PinnedLiveVpsHttpsClient,
  assertAuditedLiveVpsTlsTrustState,
  assertPinnedLiveVpsTlsPeer,
} from './live-vps-certification-tls.mjs';
import { createLiveVpsBrowserMutationGuard } from './live-vps-certification-browser-guard.mjs';
import { classifyLiveVpsBrowserAuthentication } from './live-vps-certification-browser-proxy.mjs';
import {
  buildExactLiveVpsPresenceUrl,
  buildLiveVpsReconciliationUrl,
  buildOwnerVpsCountUrl,
  classifyExactLiveVpsPresenceEnvelope,
  classifyExactLiveVpsPresenceResponse,
  classifyExactVpsCandidateSet,
  classifyLiveVpsHardDeleteEvidence,
  classifyOwnerVpsCountResponse,
} from './live-vps-certification-reconciliation.mjs';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.dirname(SCRIPT_DIRECTORY);
const RUNNER_PATH = path.join(SCRIPT_DIRECTORY, 'live-vps-certification.mjs');
const TEST_TOKEN = 'runner-test-secret-that-must-not-be-printed';

function privateFixture(directory, fileName = 'fixture.json', mutate = () => {}) {
  const fixturePath = path.join(directory, fileName);
  const fixture = {
    apiProtocolVersion: '7.0',
    apiFingerprint: {
      version: '4.2.1',
      revision: '4a397464d945772bafe0328d2f2c512381f7400c',
    },
    fixtures: {
      owner: { id: 1, expectedLabel: 'live-cert-owner' },
      node: { id: 2, expectedLabel: 'live-cert-node' },
      osTemplate: { id: 3, expectedLabel: 'live-cert-template' },
      environment: { id: 4, expectedLabel: 'live-cert-environment' },
      location: { id: 5, expectedLabel: 'live-cert-location' },
    },
    resources: {
      cpu: 1,
      memory: 1024,
      diskspace: 1024,
      swap: 0,
    },
  };
  mutate(fixture);
  fs.writeFileSync(fixturePath, `${JSON.stringify(fixture)}\n`, { mode: 0o600 });
  fs.chmodSync(fixturePath, 0o600);
  return fixturePath;
}

function cleanEnvironment(fixturePath, overrides = {}) {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (key.startsWith('E2E_LIVE_') || key === 'E2E_BASE_URL' || key === 'E2E_RECORD_ARTIFACTS') {
      delete environment[key];
    }
  }
  return {
    ...environment,
    E2E_BASE_URL: 'https://dev.crucio.cz',
    E2E_LIVE_ADMIN_TOKEN: TEST_TOKEN,
    E2E_LIVE_VPS_FIXTURE_FILE: fixturePath,
    ...overrides,
  };
}

function runPreflight(fixturePath, overrides) {
  return spawnSync(process.execPath, [RUNNER_PATH], {
    cwd: REPOSITORY_ROOT,
    env: cleanEnvironment(fixturePath, overrides),
    encoding: 'utf8',
    timeout: 30_000,
  });
}

test('live VPS executable refuses mutations unless every destructive gate is explicit', async (t) => {
  // On macOS /var is a symlink to /private/var. Use the canonical temp root so
  // the production symlink guard is exercised without tripping over that OS
  // compatibility alias before the intended preflight assertion.
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'live-vps-runner-test-'));
  fs.chmodSync(directory, 0o700);
  const fixturePath = privateFixture(directory);

  try {
    await t.test('mutation opt-in is mandatory', () => {
      const result = runPreflight(fixturePath);
      const output = `${result.stdout}\n${result.stderr}`;
      assert.notEqual(result.status, 0);
      assert.match(output, /Live VPS mutations are disabled/);
      assert.doesNotMatch(output, new RegExp(TEST_TOKEN));
    });

    await t.test('the target must be exactly dev.crucio.cz', () => {
      const result = runPreflight(fixturePath, {
        E2E_LIVE_VPS_MUTATIONS: '1',
        E2E_BASE_URL: 'https://dev.crucio.cz.example.invalid',
      });
      const output = `${result.stdout}\n${result.stderr}`;
      assert.notEqual(result.status, 0);
      assert.match(output, /E2E_BASE_URL must be exactly https:\/\/dev\.crucio\.cz/);
      assert.doesNotMatch(output, new RegExp(TEST_TOKEN));
    });

    await t.test('an operator cannot self-attest an arbitrary API description hash', () => {
      const selfAttestedFixture = privateFixture(directory, 'self-attested-fixture.json', (fixture) => {
        fixture.apiFingerprint.descriptionSha256 = 'a'.repeat(64);
      });
      const result = runPreflight(selfAttestedFixture, {
        E2E_LIVE_VPS_MUTATIONS: '1',
      });
      const output = `${result.stdout}\n${result.stderr}`;
      assert.notEqual(result.status, 0);
      assert.match(output, /apiFingerprint contains unsupported fields: descriptionSha256/);
      assert.doesNotMatch(output, new RegExp(TEST_TOKEN));
    });
  } finally {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

test('failed running VPS cleanup proves identity before stop and gates delete only after stop', () => {
  const source = fs.readFileSync(RUNNER_PATH, 'utf8');
  const cleanupStart = source.indexOf('async function cleanupOwnedVps()');
  const cleanupEnd = source.indexOf('\nfunction writeReport()', cleanupStart);
  assert.ok(cleanupStart >= 0 && cleanupEnd > cleanupStart, 'cleanup implementation must remain inspectable');
  const cleanupSource = source.slice(cleanupStart, cleanupEnd);

  const identityGate = cleanupSource.indexOf('assertVpsIdentity(ledger, observation);');
  const runningBranch = cleanupSource.indexOf('if (observedRunningState === true)');
  const safetyStop = cleanupSource.indexOf("apiEnvelope(`/vpses/${createdVpsId}/stop`");
  const stoppedObservation = cleanupSource.indexOf('currentState.resource.is_running !== false');
  const hardDeleteGate = cleanupSource.lastIndexOf('assertHardDeleteAllowed(ledger, observation);');
  const deleteRequest = cleanupSource.indexOf("method: 'DELETE'");

  assert.ok(identityGate >= 0 && identityGate < runningBranch);
  assert.ok(runningBranch < safetyStop);
  assert.ok(safetyStop < stoppedObservation);
  assert.ok(stoppedObservation < hardDeleteGate);
  assert.ok(hardDeleteGate < deleteRequest);
  assert.doesNotMatch(
    cleanupSource.slice(0, runningBranch),
    /assertHardDeleteAllowed\(ledger, observation\)/,
    'a running VPS must not be rejected by the stopped-only hard-delete gate before the safety stop'
  );
});

test('operator signals enter the guarded cleanup path instead of terminating immediately', () => {
  const source = fs.readFileSync(RUNNER_PATH, 'utf8');
  const signalSetup = source.indexOf("process.once('SIGINT', onSigint)");
  const guardedCheck = source.indexOf('throwIfInterrupted();', source.indexOf('async function check'));
  const catchBlock = source.indexOf('} catch (error) {\n  testError = error;', guardedCheck);
  const cleanupMode = source.indexOf('cleanupInProgress = true;', catchBlock);
  const cleanupCall = source.indexOf('await cleanupOwnedVps();', cleanupMode);

  assert.ok(signalSetup >= 0, 'SIGINT must be handled gracefully');
  assert.match(source, /process\.once\('SIGTERM', onSigterm\)/);
  assert.ok(guardedCheck > signalSetup && catchBlock > guardedCheck);
  assert.ok(cleanupMode > catchBlock && cleanupCall > cleanupMode);
  assert.match(source, /if \(cleanupInProgress\) return new Promise/);
});

test('TLS exception is code-pinned and a wrong leaf cannot reach token-context construction', () => {
  assert.equal(
    PINNED_LIVE_VPS_LEAF_DER_SHA256,
    '6eded8338f574cb7169bc66a51dca334338b2cca8e68650bf31a2aa36783658f'
  );
  assert.equal(PINNED_LIVE_VPS_SPKI_SHA256_BASE64, 'KuTsL27vrsGaAUVeUdq8XAHdQnYbvdmNOLMpZRe9ZEI=');
  assert.throws(
    () => assertPinnedLiveVpsTlsPeer({
      certificate: {
        raw: Buffer.from('wrong-leaf-certificate'),
        valid_from: 'Aug  1 00:00:00 2026 GMT',
        valid_to: 'Aug  1 00:00:00 2027 GMT',
      },
      authorized: false,
      authorizationError: 'DEPTH_ZERO_SELF_SIGNED_CERT',
      now: new Date('2026-08-29T00:00:00Z'),
    }),
    /does not match the code-owned certification pin/
  );

  const source = fs.readFileSync(RUNNER_PATH, 'utf8');
  assert.doesNotMatch(source, /process\.env\.[A-Z0-9_]*(?:TLS|CERT)[A-Z0-9_]*(?:PIN|SHA|FINGERPRINT)/);
  const pinGate = source.indexOf('tlsProof = await verifyPinnedLiveVpsTlsCertificate();');
  const publicContext = source.indexOf('publicContext = new PinnedLiveVpsHttpsClient()', pinGate);
  const tokenContext = source.indexOf('apiContext = new PinnedLiveVpsHttpsClient({ adminToken: token })', pinGate);
  assert.ok(pinGate >= 0 && pinGate < publicContext && publicContext < tokenContext);
  assert.doesNotMatch(source, /playwrightRequest|ignoreHTTPSErrors\s*:\s*true/);
  assert.match(source, /--ignore-certificate-errors-spki-list=\$\{PINNED_LIVE_VPS_SPKI_SHA256_BASE64\}/);
});

test('TLS exception accepts only the independently audited self-signed trust state', () => {
  assert.equal(PINNED_LIVE_VPS_TLS_AUTHORIZATION_ERROR, 'DEPTH_ZERO_SELF_SIGNED_CERT');
  assert.equal(
    assertAuditedLiveVpsTlsTrustState({
      authorized: false,
      authorizationError: 'DEPTH_ZERO_SELF_SIGNED_CERT',
    }),
    'DEPTH_ZERO_SELF_SIGNED_CERT'
  );
  for (const candidate of [undefined, '', 'SELF_SIGNED_CERT_IN_CHAIN', 'ERR_TLS_CERT_ALTNAME_INVALID']) {
    assert.throws(
      () => assertAuditedLiveVpsTlsTrustState({ authorized: false, authorizationError: candidate }),
      /no longer has the audited self-signed trust state/
    );
  }
  assert.throws(
    () => assertAuditedLiveVpsTlsTrustState({
      authorized: true,
      authorizationError: 'DEPTH_ZERO_SELF_SIGNED_CERT',
    }),
    /no longer has the audited self-signed trust state/
  );
});

test('token transport pins the same socket before headers and rejects foreign targets', async () => {
  const client = new PinnedLiveVpsHttpsClient({ adminToken: TEST_TOKEN });
  for (const target of [
    'https://dev.crucio.cz/v7.0/users/current',
    '//example.invalid/v7.0/users/current',
    '/v7.0/users/current#fragment',
  ]) {
    await assert.rejects(
      client.get(target, { maxRedirects: 0 }),
      /exact audited origin|cannot change origin/
    );
  }
  await assert.rejects(
    client.get('/v7.0/users/current', { maxRedirects: 1 }),
    /never follows redirects/
  );

  const tlsSource = fs.readFileSync(path.join(SCRIPT_DIRECTORY, 'live-vps-certification-tls.mjs'), 'utf8');
  const socketPin = tlsSource.indexOf('const { socket } = await connectPinnedLiveVpsTlsSocket');
  const authHeader = tlsSource.indexOf("'X-HaveAPI-Auth-Token': this.adminToken", socketPin);
  const requestConstruction = tlsSource.indexOf('request = https.request({', authHeader);
  assert.ok(socketPin >= 0 && socketPin < authHeader && authHeader < requestConstruction);
  assert.doesNotMatch(tlsSource, /X-HaveAPI-OAuth2-Token/i);
  assert.match(tlsSource, /deadlineTimer = setTimeout[\s\S]*clearTimeout\(deadlineTimer\)/);
  assert.match(tlsSource, /remainingMs = timeoutMs - \(Date\.now\(\) - requestStartedAt\)/);
});

function testBrowserMutationGuard() {
  const payload = { hostname: 'guarded-vps', start: false, ipv4: 0, ipv6: 0, ipv4_private: 0 };
  const digest = (value) => JSON.stringify(value);
  return createLiveVpsBrowserMutationGuard({
    origin: 'https://dev.crucio.cz',
    apiVersion: '7.0',
    expectedCreatePayloadSha256: 'a'.repeat(64),
    assertCreatePayload: (candidate) => {
      assert.deepEqual(candidate, payload);
      return candidate;
    },
    payloadSha256: (candidate) => {
      assert.equal(digest(candidate), digest(payload));
      return 'a'.repeat(64);
    },
  });
}

test('browser mutation guard blocks a double create and arbitrary same-origin writes before network', () => {
  const guard = testBrowserMutationGuard();
  assert.equal(guard.inspect({
    method: 'GET',
    url: 'https://dev.crucio.cz/v7.0/vpses',
    body: {},
  }).allow, true);
  assert.equal(guard.inspect({
    method: 'POST',
    url: 'https://dev.crucio.cz/v7.0/vpses',
    body: { vps: { hostname: 'guarded-vps', start: false, ipv4: 0, ipv6: 0, ipv4_private: 0 } },
  }).allow, true);
  assert.equal(guard.inspect({
    method: 'POST',
    url: 'https://dev.crucio.cz/v7.0/vpses',
    body: { vps: { hostname: 'guarded-vps', start: false, ipv4: 0, ipv6: 0, ipv4_private: 0 } },
  }).allow, false, 'a second create is rejected after the first guarded request');
  assert.equal(guard.inspect({
    method: 'DELETE',
    url: 'https://dev.crucio.cz/v7.0/users/1',
    body: {},
  }).allow, false);
  assert.equal(guard.inspect({
    method: 'PUT',
    url: 'https://dev.crucio.cz/v7.0/vpses/9',
    body: { vps: { hostname: 'foreign' } },
  }).allow, false);
  assert.throws(() => guard.assertComplete(), /blocked mutation attempt|incomplete/);

  const source = fs.readFileSync(RUNNER_PATH, 'utf8');
  const inspect = source.indexOf('const mutationDecision = browserMutationGuard.inspect');
  const pinnedProxy = source.indexOf('await proxyPinnedLiveVpsBrowserRequest({', inspect);
  assert.ok(inspect >= 0 && inspect < pinnedProxy, 'route policy must decide before the pinned request reaches the network');
  assert.doesNotMatch(source, /route\.continue\(/, 'certification browser requests must never bypass the pinned proxy');
});

test('browser mutation guard rejects create envelope extensions and credentialed exact-origin URLs', () => {
  const extraKeyGuard = testBrowserMutationGuard();
  const extraKey = extraKeyGuard.inspect({
    method: 'POST',
    url: 'https://dev.crucio.cz/v7.0/vpses',
    body: {
      vps: { hostname: 'guarded-vps', start: false, ipv4: 0, ipv6: 0, ipv4_private: 0 },
      extra: { destructive: true },
    },
  });
  assert.equal(extraKey.allow, false);
  assert.match(extraKey.reason, /must contain exactly: vps/);

  const credentialGuard = testBrowserMutationGuard();
  const credentialed = credentialGuard.inspect({
    method: 'POST',
    url: 'https://operator:secret@dev.crucio.cz/v7.0/vpses',
    body: { vps: { hostname: 'guarded-vps', start: false, ipv4: 0, ipv6: 0, ipv4_private: 0 } },
  });
  assert.equal(credentialed.allow, false);
  assert.match(credentialed.reason, /foreign origin/);

  const runnerSource = fs.readFileSync(RUNNER_PATH, 'utf8');
  assert.match(
    runnerSource,
    /url\.origin !== config\.origin \|\| url\.username !== '' \|\| url\.password !== ''/
  );
  const tlsSource = fs.readFileSync(path.join(SCRIPT_DIRECTORY, 'live-vps-certification-tls.mjs'), 'utf8');
  assert.match(tlsSource, /parsed\.username !== ''/);
  assert.match(tlsSource, /parsed\.password !== ''/);
});

test('browser API and static traffic are single-hop pinned proxies with fail-closed redirects', () => {
  const runnerSource = fs.readFileSync(RUNNER_PATH, 'utf8');
  const proxySource = fs.readFileSync(
    path.join(SCRIPT_DIRECTORY, 'live-vps-certification-browser-proxy.mjs'),
    'utf8'
  );
  const tlsSource = fs.readFileSync(path.join(SCRIPT_DIRECTORY, 'live-vps-certification-tls.mjs'), 'utf8');

  assert.match(runnerSource, /client: isApiRequest \? apiContext : publicContext/);
  assert.match(runnerSource, /classifyLiveVpsBrowserAuthentication/);
  assert.match(runnerSource, /X-HaveAPI-Auth-Token/);
  assert.doesNotMatch(runnerSource, /authHeader:\s*"X-HaveAPI-OAuth2-Token"/);
  assert.doesNotMatch(runnerSource, /route\.continue\(/);
  assert.match(proxySource, /maxRedirects: 0/);
  const redirectGate = proxySource.indexOf('if (isLiveVpsRedirectStatus(status))');
  const abort = proxySource.indexOf("await route.abort('blockedbyclient')", redirectGate);
  const fulfill = proxySource.indexOf('await route.fulfill({', redirectGate);
  assert.ok(redirectGate >= 0 && redirectGate < abort && abort < fulfill);
  assert.doesNotMatch(proxySource, /headers:\s*request|route\.continue|location\s*\)/i);
  assert.doesNotMatch(tlsSource, /followRedirect|new URL\([^\n]*location/i);
});

test('detached-session auth header is exact and API-only', () => {
  const token = 'detached-session-token';
  const runnerSource = fs.readFileSync(RUNNER_PATH, 'utf8');
  assert.deepEqual(
    classifyLiveVpsBrowserAuthentication({
      headers: { 'x-haveapi-auth-token': token },
      isApiRequest: true,
      token,
    }),
    { allow: true, reason: 'exact detached-session API token' }
  );
  for (const candidate of [
    { headers: {}, isApiRequest: true },
    { headers: { 'x-haveapi-auth-token': token }, isApiRequest: false },
    { headers: { 'x-haveapi-auth-token': 'wrong' }, isApiRequest: true },
    { headers: { 'x-haveapi-oauth2-token': token }, isApiRequest: true },
    { headers: { 'x-haveapi-oauth2-token': token }, isApiRequest: false },
  ]) {
    assert.equal(
      classifyLiveVpsBrowserAuthentication({ ...candidate, token }).allow,
      false
    );
  }
  assert.equal(
    classifyLiveVpsBrowserAuthentication({ headers: {}, isApiRequest: false, token }).allow,
    true
  );
  const authGate = runnerSource.indexOf('const browserAuthentication = classifyLiveVpsBrowserAuthentication');
  const configFulfill = runnerSource.indexOf("if (url.pathname === '/config.js')", authGate);
  assert.ok(authGate >= 0 && configFulfill > authGate, 'static authentication must be classified before local config fulfillment');
});

test('browser mutation guard permits exactly one ordered create/start/restart/stop sequence', () => {
  const guard = testBrowserMutationGuard();
  const create = guard.inspect({
    method: 'POST',
    url: 'https://dev.crucio.cz/v7.0/vpses',
    body: { vps: { hostname: 'guarded-vps', start: false, ipv4: 0, ipv6: 0, ipv4_private: 0 } },
  });
  assert.deepEqual({ allow: create.allow, kind: create.kind }, { allow: true, kind: 'create' });
  guard.registerOwnedVpsId(42);
  for (const kind of ['start', 'restart', 'stop']) {
    const result = guard.inspect({
      method: 'POST',
      url: `https://dev.crucio.cz/v7.0/vpses/42/${kind}`,
      body: {},
    });
    assert.deepEqual({ allow: result.allow, kind: result.kind }, { allow: true, kind });
  }
  assert.equal(guard.assertComplete(), true);
  assert.equal(guard.snapshot().length, 4);
});

test('browser certification blocks every WebSocket before it can reach a server', () => {
  const source = fs.readFileSync(RUNNER_PATH, 'utf8');
  assert.match(source, /kind: 'unexpected-browser-websocket'/);
  assert.match(source, /WebSockets are outside the certification allowlist/);
  assert.doesNotMatch(source, /webSocket\.connectToServer\(/);
});

test('normal create proves stable global run-marker uniqueness before verification', () => {
  const source = fs.readFileSync(RUNNER_PATH, 'utf8');
  const createStart = source.indexOf('async function createVpsThroughUi()');
  const createEnd = source.indexOf('\nasync function runUiPowerAction', createStart);
  const createSource = source.slice(createStart, createEnd);
  const normalReconcile = createSource.lastIndexOf('const observation = await reconcileCreatedVps();');
  const verification = createSource.lastIndexOf('verifyCreatedVps(ledger, observation);');
  assert.ok(normalReconcile >= 0 && normalReconcile < verification);
  assert.match(source, /CREATE_UNIQUENESS_STABLE_OBSERVATIONS = 3/);
  assert.match(source, /classifyExactVpsCandidateSet\(matches/);
  assert.match(source, /totalCount === null \|\| totalCount !== rows\.length/);
  assert.match(source, /manualReview = \{[\s\S]*candidateIds/);
});

test('global run-marker reconciliation requests an exact non-truncated count proof', () => {
  const url = buildLiveVpsReconciliationUrl({
    apiVersion: '7.0',
    hostname: 'live-cert-20260829-a1b2c3',
    ownerId: 17,
    nodeId: 23,
  });
  assert.equal(
    url,
    '/v7.0/vpses?' +
      'vps%5Bhostname_exact%5D=live-cert-20260829-a1b2c3&' +
      'vps%5Buser%5D=17&' +
      'vps%5Bnode%5D=23&' +
      'vps%5Blimit%5D=100&' +
      '_meta%5Bincludes%5D=node__location__environment%2Cuser%2Cos_template&' +
      '_meta%5Bcount%5D=true'
  );

  const parsed = new URL(url, 'https://dev.crucio.cz');
  assert.equal(parsed.searchParams.get('_meta[count]'), 'true');
  assert.equal(parsed.searchParams.get('vps[limit]'), '100');
  assert.equal(parsed.searchParams.get('vps[hostname_exact]'), 'live-cert-20260829-a1b2c3');
});

test('owner environment-limit preflight requests an explicit total count', () => {
  const url = buildOwnerVpsCountUrl({
    apiVersion: '7.0',
    ownerId: 17,
    environmentId: 11,
  });
  const parsed = new URL(url, 'https://dev.crucio.cz');
  assert.equal(parsed.pathname, '/v7.0/vpses');
  assert.equal(parsed.searchParams.get('vps[user]'), '17');
  assert.equal(parsed.searchParams.get('vps[environment]'), '11');
  assert.equal(parsed.searchParams.get('vps[limit]'), '1');
  assert.equal(parsed.searchParams.get('_meta[count]'), 'true');
});

test('owner environment-limit preflight accepts only a complete one-row count proof', () => {
  assert.equal(
    classifyOwnerVpsCountResponse({
      httpStatus: 200,
      envelope: { status: true, response: { vpses: [], _meta: { total_count: 0 } } },
    }),
    0
  );
  assert.equal(
    classifyOwnerVpsCountResponse({
      httpStatus: 200,
      envelope: { status: true, response: { vpses: [{ id: 42 }], _meta: { total_count: 7 } } },
    }),
    7
  );
});

test('owner environment-limit preflight rejects HTTP, malformed, missing and mismatched count proofs', () => {
  assert.throws(
    () => classifyOwnerVpsCountResponse({
      httpStatus: 503,
      envelope: { status: true, response: { vpses: [], _meta: { total_count: 0 } } },
    }),
    /must return HTTP 2xx/
  );

  const malformedOrMissing = [
    null,
    '<html>error</html>',
    { status: false, response: { vpses: [], _meta: { total_count: 0 } } },
    { response: { vpses: [], _meta: { total_count: 0 } } },
    { status: true, response: {} },
    { status: true, response: { vpses: null, _meta: { total_count: 0 } } },
    { status: true, response: { vpses: [], _meta: {} } },
    { status: true, response: { vpses: [], _meta: { total_count: '0' } } },
    { status: true, response: { vpses: [], _meta: { total_count: -1 } } },
    { status: true, response: { vpses: [], _meta: { total_count: Number.MAX_SAFE_INTEGER + 1 } } },
  ];
  for (const envelope of malformedOrMissing) {
    assert.throws(
      () => classifyOwnerVpsCountResponse({ httpStatus: 200, envelope }),
      /Owner VPS-count proof/
    );
  }

  const mismatched = [
    { status: true, response: { vpses: [{ id: 42 }], _meta: { total_count: 0 } } },
    { status: true, response: { vpses: [], _meta: { total_count: 1 } } },
    { status: true, response: { vpses: [], _meta: { total_count: 7 } } },
    { status: true, response: { vpses: [{ id: 42 }, { id: 43 }], _meta: { total_count: 2 } } },
  ];
  for (const envelope of mismatched) {
    assert.throws(
      () => classifyOwnerVpsCountResponse({ httpStatus: 200, envelope }),
      /rows do not match/
    );
  }
});

test('cleanup absence proof uses an authenticated exact guarded-identity list pinned to the expected ID', () => {
  const url = buildExactLiveVpsPresenceUrl({
    apiVersion: '7.0',
    vpsId: 42,
    hostname: 'live-cert-20260830-abcd1234',
    ownerId: 17,
    nodeId: 23,
  });
  const parsed = new URL(url, 'https://dev.crucio.cz');
  assert.equal(parsed.pathname, '/v7.0/vpses');
  assert.equal(parsed.searchParams.get('vps[id]'), null, 'the deployed VPS index does not expose an id input');
  assert.equal(parsed.searchParams.get('vps[hostname_exact]'), 'live-cert-20260830-abcd1234');
  assert.equal(parsed.searchParams.get('vps[user]'), '17');
  assert.equal(parsed.searchParams.get('vps[node]'), '23');
  assert.equal(parsed.searchParams.get('vps[limit]'), '2');
  assert.equal(parsed.searchParams.get('_meta[count]'), 'true');

  assert.deepEqual(
    classifyExactLiveVpsPresenceEnvelope({
      status: true,
      response: { vpses: [], _meta: { total_count: 0 } },
    }, { vpsId: 42 }),
    { exists: false, resource: null }
  );
  assert.deepEqual(
    classifyExactLiveVpsPresenceEnvelope({
      status: true,
      response: { vpses: [{ id: 42, is_running: false }], _meta: { total_count: 1 } },
    }, { vpsId: 42 }),
    { exists: true, resource: { id: 42, is_running: false } }
  );
});

test('cleanup absence proof rejects every unauthenticated, malformed, truncated or foreign result', () => {
  const invalidEnvelopes = [
    null,
    '<html>404</html>',
    { status: false, response: { vpses: [], _meta: { total_count: 0 } } },
    { response: { vpses: [], _meta: { total_count: 0 } } },
    { status: true, response: { vpses: [] } },
    { status: true, response: { vpses: [], _meta: { total_count: '0' } } },
    { status: true, response: { vpses: [{ id: 42 }], _meta: { total_count: 0 } } },
    { status: true, response: { vpses: [{ id: 43 }], _meta: { total_count: 1 } } },
    { status: true, response: { vpses: [{ id: 42 }, { id: 42 }], _meta: { total_count: 2 } } },
  ];
  for (const envelope of invalidEnvelopes) {
    assert.throws(
      () => classifyExactLiveVpsPresenceEnvelope(envelope, { vpsId: 42 }),
      /Exact .*VPS/
    );
  }
  for (const httpStatus of [401, 403, 404, 500, 503]) {
    assert.throws(
      () => classifyExactLiveVpsPresenceResponse({
        httpStatus,
        envelope: httpStatus === 404
          ? '<html><title>not found</title></html>'
          : { status: true, response: { vpses: [], _meta: { total_count: 0 } } },
        vpsId: 42,
      }),
      /must return HTTP 2xx/
    );
  }
  assert.throws(
    () => classifyExactLiveVpsPresenceResponse({
      httpStatus: 200,
      envelope: { status: false, response: { vpses: [], _meta: { total_count: 0 } } },
      vpsId: 42,
    }),
    /status:true/
  );

  const source = fs.readFileSync(RUNNER_PATH, 'utf8');
  const stateStart = source.indexOf('async function fetchVpsState(vpsId)');
  const stateEnd = source.indexOf('\nasync function verifyPublicRuntime()', stateStart);
  const stateSource = source.slice(stateStart, stateEnd);
  assert.match(stateSource, /buildExactLiveVpsPresenceUrl/);
  assert.match(stateSource, /classifyExactLiveVpsPresenceResponse/);
  assert.doesNotMatch(stateSource, /isNotFound|status\(\) === 404/);

  const absenceStart = source.indexOf('async function waitForVpsAbsent(vpsId)');
  const absenceEnd = source.indexOf('\nasync function fetchReconciliationObservations()', absenceStart);
  const absenceSource = source.slice(absenceStart, absenceEnd);
  assert.match(absenceSource, /manualReview/);
  assert.match(absenceSource, /authenticated exact VPS absence proof failed during cleanup/);
});

test('zero-row absence cannot complete cleanup when terminal delete proof failed', () => {
  const exactPresence = classifyExactLiveVpsPresenceResponse({
    httpStatus: 200,
    envelope: { status: true, response: { vpses: [], _meta: { total_count: 0 } } },
    vpsId: 42,
  });
  assert.deepEqual(exactPresence, { exists: false, resource: null });
  assert.deepEqual(
    classifyLiveVpsHardDeleteEvidence({ terminalProofSucceeded: false, exactPresence }),
    {
      kind: 'manual-review',
      canMarkCleaned: false,
      reason: 'terminal delete proof failed even though the exact query returned zero rows',
    }
  );

  const source = fs.readFileSync(RUNNER_PATH, 'utf8');
  const cleanupStart = source.indexOf('async function cleanupOwnedVps()');
  const cleanupEnd = source.indexOf('\nfunction writeReport()', cleanupStart);
  const cleanupSource = source.slice(cleanupStart, cleanupEnd);
  const failedProofBranch = cleanupSource.indexOf('if (deleteProofError) {');
  const manualReview = cleanupSource.indexOf('ledger.vps.manualReview = {', failedProofBranch);
  const failedProofThrow = cleanupSource.indexOf('throw deleteProofError;', manualReview);
  const markDeleted = cleanupSource.indexOf('cleanup.deleted = true;', failedProofThrow);
  const markCleaned = cleanupSource.indexOf('markVpsCleanupComplete(ledger);', failedProofThrow);
  assert.ok(failedProofBranch >= 0 && failedProofBranch < manualReview);
  assert.ok(manualReview < failedProofThrow && failedProofThrow < markDeleted && markDeleted < markCleaned);
  assert.doesNotMatch(
    cleanupSource.slice(failedProofBranch, failedProofThrow),
    /cleanup\.(?:deleted|objectAbsent)\s*=\s*true|markVpsCleanupComplete/
  );
});

test('two exact run-marker candidates force manual review and preserve every observed ID', () => {
  const result = classifyExactVpsCandidateSet([
    { identity: { id: 71 } },
    { identity: { id: 72 } },
  ], { registeredId: 71 });
  assert.equal(result.kind, 'manual-review');
  assert.deepEqual(result.candidateIds, [71, 72]);
  assert.equal(result.match, null);
});
