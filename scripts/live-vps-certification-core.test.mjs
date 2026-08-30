import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  EXPECTED_VPSADMIN_API_FINGERPRINT,
  assertFixtureManifest,
  assertFixtureResources,
  assertHardDeleteAllowed,
  assertLiveVpsCertificationConfig,
  assertNoSymlinkedVpsArtifactPath,
  assertRuntimeApiFingerprint,
  assertSafeVpsCreatePayload,
  assertVpsIdentity,
  beginVpsCleanup,
  canonicalPayloadSha256,
  classifyBoundedOperationOutcome,
  createLiveVpsRunIdentity,
  createVpsCertificationLedger,
  markVpsCleanupComplete,
  reconcileUniqueCreatedVps,
  registerCreatedVps,
  verifyCreatedVps,
  writeVpsCertificationLedgerAtomic,
} from './live-vps-certification-core.mjs';

const START = new Date('2026-08-29T20:00:00.000Z');
const OBSERVED = new Date('2026-08-29T20:02:00.000Z');

function fixtureManifest() {
  return {
    owner: { id: 101, expectedLabelPrefix: 'webui-live-owner-' },
    node: { id: 202, expectedLabel: 'node-live.test' },
    osTemplate: { id: 303, expectedLabelPrefix: 'NixOS test ' },
    environment: { id: 404, expectedLabel: 'Test environment' },
    location: { id: 505, expectedLabel: 'Test location' },
  };
}

function fixtureResources() {
  return {
    owner: { id: 101, login: 'webui-live-owner-101' },
    node: { id: 202, name: 'node-live.test', location: { id: 505 } },
    osTemplate: { id: 303, name: 'NixOS test 25.05' },
    environment: { id: 404, label: 'Test environment' },
    location: { id: 505, label: 'Test location', environment: { id: 404 } },
  };
}

function runIdentity() {
  return createLiveVpsRunIdentity({ now: START, randomSuffix: 'a1b2c3d4' });
}

function safeCreatePayload() {
  const identity = runIdentity();
  return {
    hostname: identity.hostname,
    info: identity.infoMarker,
    user: 101,
    node: 202,
    os_template: 303,
    start: false,
    ipv4: 0,
    ipv6: 0,
    ipv4_private: 0,
    cpu: 1,
    memory: 512,
    swap: 512,
    diskspace: 8192,
  };
}

function intentLedger() {
  return createVpsCertificationLedger({
    identity: runIdentity(),
    fixtureManifest: fixtureManifest(),
    createPayload: safeCreatePayload(),
    baseURL: 'https://dev.crucio.cz',
    createdAt: START,
    creationWindowMs: 10 * 60 * 1000,
  });
}

function createdLedger() {
  const ledger = intentLedger();
  registerCreatedVps(ledger, { id: 606, observedAt: new Date('2026-08-29T20:01:00.000Z') });
  return ledger;
}

function ownedVps(overrides = {}) {
  const identity = runIdentity();
  return {
    id: 606,
    hostname: identity.hostname,
    info: identity.infoMarker,
    user: { id: 101 },
    node: {
      id: 202,
      location: {
        id: 505,
        environment: { id: 404 },
      },
    },
    os_template: { id: 303 },
    created_at: '2026-08-29T20:00:30.000Z',
    is_running: false,
    ...overrides,
  };
}

function ownedObservation(overrides = {}) {
  return {
    resource: ownedVps(overrides.resource),
    ipAssignments: overrides.ipAssignments ?? [],
    observedAt: overrides.observedAt ?? OBSERVED,
  };
}

function realTmpPrefix(prefix) {
  return path.join(fs.realpathSync(os.tmpdir()), prefix);
}

test('guard accepts only exact dev origin, explicit VPS opt-in, token, API fingerprint, and manifest', () => {
  const accepted = assertLiveVpsCertificationConfig({
    baseURL: 'https://dev.crucio.cz/',
    mutationsEnabled: '1',
    adminToken: 'not-persisted-test-token',
    apiFingerprint: { ...EXPECTED_VPSADMIN_API_FINGERPRINT },
    fixtureManifest: fixtureManifest(),
  });
  assert.equal(accepted.origin, 'https://dev.crucio.cz');
  assert.equal(accepted.manifest.owner.id, 101);

  for (const baseURL of [
    'http://dev.crucio.cz',
    'https://clankerdev.vpsfree.cz',
    'https://dev.crucio.cz.evil.example',
    'https://dev.crucio.cz/app',
    'https://dev.crucio.cz?unsafe=1',
    'https://user@dev.crucio.cz',
    'https://dev.crucio.cz:8443',
    ' https://dev.crucio.cz',
  ]) {
    assert.throws(
      () => assertLiveVpsCertificationConfig({
        baseURL,
        mutationsEnabled: '1',
        adminToken: 'token',
        apiFingerprint: EXPECTED_VPSADMIN_API_FINGERPRINT,
        fixtureManifest: fixtureManifest(),
      }),
      /exactly https:\/\/dev\.crucio\.cz/
    );
  }
  assert.throws(
    () => assertLiveVpsCertificationConfig({
      baseURL: 'https://dev.crucio.cz',
      mutationsEnabled: '0',
      adminToken: 'token',
      apiFingerprint: EXPECTED_VPSADMIN_API_FINGERPRINT,
      fixtureManifest: fixtureManifest(),
    }),
    /E2E_LIVE_VPS_MUTATIONS=1/
  );
  assert.throws(
    () => assertLiveVpsCertificationConfig({
      baseURL: 'https://dev.crucio.cz',
      mutationsEnabled: '1',
      adminToken: '',
      apiFingerprint: EXPECTED_VPSADMIN_API_FINGERPRINT,
      fixtureManifest: fixtureManifest(),
    }),
    /non-empty/
  );
});

test('runtime API fingerprint is exact and does not accept lookalikes', () => {
  assert.deepEqual(
    assertRuntimeApiFingerprint({ version: '4.2.1', revision: '4a397464d945772bafe0328d2f2c512381f7400c' }),
    EXPECTED_VPSADMIN_API_FINGERPRINT
  );
  for (const fingerprint of [
    { version: '4.2.0', revision: EXPECTED_VPSADMIN_API_FINGERPRINT.revision },
    { version: '4.2.1', revision: '4A397464D945772BAFE0328D2F2C512381F7400C' },
    { version: '4.2.1', revision: `${EXPECTED_VPSADMIN_API_FINGERPRINT.revision}0` },
    { version: '4.2.1' },
  ]) {
    assert.throws(() => assertRuntimeApiFingerprint(fingerprint), /fingerprint|non-empty/);
  }
});

test('fixture manifest is explicit and fixture resources must match IDs, labels, and topology', () => {
  const normalized = assertFixtureManifest(fixtureManifest());
  assert.deepEqual(normalized.owner, { id: 101, match: { kind: 'prefix', value: 'webui-live-owner-' } });
  assert.equal(assertFixtureResources(fixtureManifest(), fixtureResources()).node.id, 202);

  const missing = fixtureManifest();
  delete missing.location;
  assert.throws(() => assertFixtureManifest(missing), /plain object/);
  assert.throws(
    () => assertFixtureManifest({ ...fixtureManifest(), owner: { id: 101 } }),
    /exactly one/
  );
  assert.throws(
    () => assertFixtureManifest({
      ...fixtureManifest(),
      owner: { id: 101, expectedLabel: 'owner', expectedLabelPrefix: 'owner-' },
    }),
    /exactly one/
  );

  assert.throws(
    () => assertFixtureResources(fixtureManifest(), {
      ...fixtureResources(),
      owner: { id: 999, login: 'webui-live-owner-999' },
    }),
    /ID mismatch/
  );
  assert.throws(
    () => assertFixtureResources(fixtureManifest(), {
      ...fixtureResources(),
      node: { id: 202, name: 'production-node', location: { id: 505 } },
    }),
    /label does not match/
  );
  assert.throws(
    () => assertFixtureResources(fixtureManifest(), {
      ...fixtureResources(),
      node: { id: 202, name: 'node-live.test' },
    }),
    /allowlisted location/
  );
  assert.throws(
    () => assertFixtureResources(fixtureManifest(), {
      ...fixtureResources(),
      location: { id: 505, label: 'Test location', environment: { id: 999 } },
    }),
    /allowlisted environment/
  );
});

test('run identity stays unique, namespaced, and DNS-label safe', () => {
  const identity = runIdentity();
  assert.equal(identity.runId, '20260829t200000z-a1b2c3d4');
  assert.equal(identity.hostname, 'webui-next-live-vps-20260829t200000z-a1b2c3d4');
  assert.equal(identity.infoMarker, 'webui-next-live-vps:20260829t200000z-a1b2c3d4');
  assert.match(identity.hostname, /^[a-z0-9-]+$/);
  assert.ok(identity.hostname.length <= 63);
});

test('canonical payload digest is stable and refuses secret-bearing payloads', () => {
  const left = { z: 1, nested: { b: true, a: ['x', 2] } };
  const right = { nested: { a: ['x', 2], b: true }, z: 1 };
  assert.equal(canonicalPayloadSha256(left), canonicalPayloadSha256(right));
  assert.match(canonicalPayloadSha256(left), /^[a-f0-9]{64}$/);
  assert.throws(() => canonicalPayloadSha256({ session_token: 'must-not-persist' }), /forbidden secret field/);
  assert.throws(() => canonicalPayloadSha256({ adminToken: 'must-not-persist' }), /forbidden secret field/);
  assert.throws(() => canonicalPayloadSha256({ value: Number.POSITIVE_INFINITY }), /non-finite/);
});

test('safe VPS create payload is exact, stopped, IP-free, and allowlisted', () => {
  assert.equal(
    assertSafeVpsCreatePayload(safeCreatePayload(), {
      identity: runIdentity(),
      fixtureManifest: fixtureManifest(),
    }).ipv4,
    0
  );
  assert.equal(
    assertSafeVpsCreatePayload({ ...safeCreatePayload(), swap: 0 }, {
      identity: runIdentity(),
      fixtureManifest: fixtureManifest(),
    }).swap,
    0
  );
  for (const unsafe of [
    { ...safeCreatePayload(), hostname: 'production-vps' },
    { ...safeCreatePayload(), start: true },
    { ...safeCreatePayload(), ipv4: 1 },
    { ...safeCreatePayload(), user: 999 },
    { ...safeCreatePayload(), node: 999 },
    { ...safeCreatePayload(), os_template: 999 },
    { ...safeCreatePayload(), migrate: true },
    { ...safeCreatePayload(), swap: -1 },
  ]) {
    assert.throws(
      () => assertSafeVpsCreatePayload(unsafe, {
        identity: runIdentity(),
        fixtureManifest: fixtureManifest(),
      }),
      /guarded run value|unsupported fields|non-negative integer/
    );
  }
});

test('ledger stores intent and canonical digest without persisting the create payload or token', () => {
  const ledger = intentLedger();
  assert.equal(ledger.vps.state, 'intent');
  assert.equal(ledger.vps.createPayloadSha256, canonicalPayloadSha256(safeCreatePayload()));
  const serialized = JSON.stringify(ledger);
  assert.equal(serialized.includes('not-persisted-test-token'), false);
  assert.equal(serialized.includes('"memory":512'), false);
  assert.deepEqual(ledger.history.map((entry) => entry.state), ['intent']);
});

test('VPS identity requires exact owned relations, creation window, marker, and zero IP assignments', () => {
  const ledger = createdLedger();
  assert.equal(assertVpsIdentity(ledger, ownedObservation()).id, 606);

  const invalidObservations = [
    ownedObservation({ resource: { id: 607 } }),
    ownedObservation({ resource: { hostname: 'foreign' } }),
    ownedObservation({ resource: { info: '' } }),
    ownedObservation({ resource: { user: { id: 999 } } }),
    ownedObservation({ resource: { node: { id: 999, location: { id: 505, environment: { id: 404 } } } } }),
    ownedObservation({ resource: { os_template: undefined } }),
    ownedObservation({
      resource: { node: { id: 202, location: { id: 999, environment: { id: 404 } } } },
    }),
    ownedObservation({
      resource: { node: { id: 202, location: { id: 505, environment: { id: 999 } } } },
    }),
    ownedObservation({ resource: { created_at: '2026-08-29T19:59:59.000Z' } }),
    ownedObservation({ resource: { created_at: '2026-08-29T20:11:00.000Z' } }),
    ownedObservation({ ipAssignments: [{ id: 1, address: '192.0.2.1' }] }),
  ];
  for (const observation of invalidObservations) {
    assert.throws(() => assertVpsIdentity(ledger, observation), /VPS/);
  }
  assert.throws(
    () => assertVpsIdentity(ledger, { resource: ownedVps(), observedAt: OBSERVED }),
    /IP assignments must be supplied explicitly/
  );
});

test('ledger enforces intent -> created -> verified -> cleanup -> cleaned transitions', () => {
  const ledger = intentLedger();
  assert.throws(() => verifyCreatedVps(ledger, ownedObservation()), /state intent/);
  registerCreatedVps(ledger, { id: 606, observedAt: new Date('2026-08-29T20:01:00.000Z') });
  verifyCreatedVps(ledger, ownedObservation());
  assert.equal(ledger.vps.state, 'verified');
  beginVpsCleanup(ledger, ownedObservation(), { hardDelete: true, at: new Date('2026-08-29T20:03:00.000Z') });
  assert.equal(ledger.vps.state, 'cleanup');
  markVpsCleanupComplete(ledger, { at: new Date('2026-08-29T20:04:00.000Z') });
  assert.equal(ledger.vps.state, 'cleaned');
  assert.deepEqual(
    ledger.history.map((entry) => entry.state),
    ['intent', 'created', 'verified', 'cleanup', 'cleaned']
  );
});

test('reconciliation fails closed when no candidate or multiple exact candidates match', () => {
  const noMatchLedger = intentLedger();
  assert.throws(
    () => reconcileUniqueCreatedVps(noMatchLedger, [ownedObservation({ resource: { hostname: 'foreign' } })]),
    /no exact guarded candidate/
  );

  const ambiguousLedger = intentLedger();
  assert.throws(
    () => reconcileUniqueCreatedVps(ambiguousLedger, [
      ownedObservation(),
      ownedObservation({ resource: { id: 607 } }),
    ]),
    /ambiguous/
  );

  const exactLedger = intentLedger();
  const selected = reconcileUniqueCreatedVps(exactLedger, [
    ownedObservation({ resource: { hostname: 'foreign' } }),
    ownedObservation(),
  ]);
  assert.equal(selected.identity.id, 606);

  registerCreatedVps(exactLedger, { id: selected.identity.id, observedAt: OBSERVED });
  assert.equal(reconcileUniqueCreatedVps(exactLedger, [ownedObservation()]).identity.id, 606);
});

test('hard-delete gate accepts only the exact verified owned VPS', () => {
  const unverified = createdLedger();
  assert.throws(() => assertHardDeleteAllowed(unverified, ownedObservation()), /owned verified VPS/);

  const verified = createdLedger();
  verifyCreatedVps(verified, ownedObservation());
  assert.equal(
    assertHardDeleteAllowed(verified, ownedObservation(), {
      now: new Date('2026-08-29T20:02:30.000Z'),
    }).id,
    606
  );
  assert.throws(
    () => assertHardDeleteAllowed(
      verified,
      ownedObservation({ resource: { info: 'foreign' } }),
      { now: new Date('2026-08-29T20:02:30.000Z') }
    ),
    /info marker/
  );
  assert.throws(
    () => assertHardDeleteAllowed(
      verified,
      ownedObservation({ resource: { is_running: true } }),
      { now: new Date('2026-08-29T20:02:30.000Z') }
    ),
    /explicitly stopped/
  );
  assert.throws(
    () => assertHardDeleteAllowed(
      verified,
      ownedObservation({ resource: { is_running: undefined } }),
      { now: new Date('2026-08-29T20:02:30.000Z') }
    ),
    /explicitly stopped/
  );
  assert.throws(
    () => assertHardDeleteAllowed(
      verified,
      ownedObservation(),
      { now: new Date('2026-08-29T20:03:01.000Z') }
    ),
    /fresh VPS observation/
  );
  assert.throws(
    () => assertHardDeleteAllowed(
      verified,
      { resource: ownedVps(), ipAssignments: [] },
      { now: new Date('2026-08-29T20:02:30.000Z') }
    ),
    /explicit fresh VPS observation timestamp/
  );
  assert.throws(
    () => beginVpsCleanup(verified, ownedObservation(), { hardDelete: false }),
    /hardDelete=true/
  );
});

test('bounded operation classifier reports success, failure, ambiguity, pending, and timeout', () => {
  const base = {
    startedAt: '2026-08-29T20:00:00.000Z',
    deadline: '2026-08-29T20:10:00.000Z',
    now: new Date('2026-08-29T20:05:00.000Z'),
  };
  assert.equal(
    classifyBoundedOperationOutcome({
      ...base,
      actionState: { finished: true, status: true },
      transactionChain: { state: 'done' },
    }).kind,
    'success'
  );
  assert.equal(
    classifyBoundedOperationOutcome({ ...base, actionState: { finished: true, status: true } }).kind,
    'pending'
  );
  assert.equal(
    classifyBoundedOperationOutcome({ ...base, transactionChain: { state: 'done' } }).kind,
    'pending'
  );
  assert.equal(
    classifyBoundedOperationOutcome({
      ...base,
      actionState: { finished: true, status: true },
      transactionChain: { state: 'running' },
    }).kind,
    'pending'
  );
  assert.equal(
    classifyBoundedOperationOutcome({
      ...base,
      actionState: { finished: false, status: true },
      transactionChain: { state: 'done' },
    }).kind,
    'pending'
  );
  assert.equal(
    classifyBoundedOperationOutcome({ ...base, transactionChain: { state: 'failed' } }).kind,
    'failure'
  );
  assert.equal(
    classifyBoundedOperationOutcome({
      ...base,
      actionState: { finished: true, status: true },
      transactionChain: { state: 'fatal' },
    }).kind,
    'ambiguous'
  );
  assert.equal(
    classifyBoundedOperationOutcome({ ...base, transactionChain: { state: 'resolved' } }).kind,
    'ambiguous'
  );
  assert.equal(
    classifyBoundedOperationOutcome({ ...base, actionState: { finished: true } }).kind,
    'ambiguous'
  );
  assert.equal(
    classifyBoundedOperationOutcome({ ...base, actionState: { finished: false, status: true } }).kind,
    'pending'
  );
  assert.equal(
    classifyBoundedOperationOutcome({
      ...base,
      now: new Date('2026-08-29T20:10:00.000Z'),
      actionState: { finished: true, status: true },
      transactionChain: { state: 'running' },
    }).kind,
    'timeout'
  );
  assert.throws(
    () => classifyBoundedOperationOutcome({
      ...base,
      deadline: '2026-08-29T22:00:00.000Z',
    }),
    /at most/
  );
});

test('atomic ledger writer creates private files and rejects symlinked paths', () => {
  const directory = fs.mkdtempSync(realTmpPrefix('clanker-live-vps-ledger-'));
  const filePath = path.join(directory, 'run', 'ledger.json');
  const written = writeVpsCertificationLedgerAtomic(filePath, intentLedger());
  assert.equal(written, path.resolve(filePath));
  assert.equal(fs.statSync(path.dirname(filePath)).mode & 0o777, 0o700);
  assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
  assert.equal(JSON.parse(fs.readFileSync(filePath, 'utf8')).vps.state, 'intent');

  const outside = fs.mkdtempSync(realTmpPrefix('clanker-live-vps-outside-'));
  const linkedDirectory = path.join(directory, 'linked');
  fs.symlinkSync(outside, linkedDirectory, 'dir');
  const escaped = path.join(linkedDirectory, 'ledger.json');
  assert.throws(() => assertNoSymlinkedVpsArtifactPath(escaped), /symlinked VPS certification artifact/);
  assert.throws(() => writeVpsCertificationLedgerAtomic(escaped, intentLedger()), /symlinked VPS certification artifact/);
  assert.equal(fs.existsSync(path.join(outside, 'ledger.json')), false);

  const directTarget = path.join(directory, 'direct.json');
  const outsideFile = path.join(outside, 'outside.json');
  fs.writeFileSync(outsideFile, '{}\n');
  fs.symlinkSync(outsideFile, directTarget, 'file');
  assert.throws(() => writeVpsCertificationLedgerAtomic(directTarget, intentLedger()), /symlinked VPS certification artifact/);
  assert.equal(fs.readFileSync(outsideFile, 'utf8'), '{}\n');
});

test('artifact paths canonicalize only the trusted macOS /var system alias', () => {
  if (process.platform !== 'darwin') return;
  if (!fs.lstatSync('/var').isSymbolicLink() || fs.realpathSync('/var') !== '/private/var') return;

  assert.equal(
    assertNoSymlinkedVpsArtifactPath('/var/tmp/webui-next-live-vps-artifact.json'),
    '/private/var/tmp/webui-next-live-vps-artifact.json'
  );
});
