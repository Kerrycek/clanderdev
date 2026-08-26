import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertCleanupResourceIdentity,
  assertMutationAdmin,
  assertLiveMutationConfig,
  assertNoSymlinkAncestors,
  assertOwnedObject,
  cleanupOwnedObjects,
  createLiveRunIdentity,
  createObjectLedger,
  extractHaveApiResourceId,
  matchesHaveApiMutation,
  registerOwnedObject,
  writeLedgerAtomic,
} from './live-mutations.mjs';

function fixtureLedger() {
  return createObjectLedger({
    runId: '20260826t120000z-abcdef',
    prefix: 'webui-next-live-20260826t120000z-abcdef',
    baseURL: 'https://dev.crucio.cz',
    createdAt: '2026-08-26T12:00:00.000Z',
  });
}

function realTmpPrefix(prefix) {
  return path.join(fs.realpathSync(os.tmpdir()), prefix);
}

test('live mutation guard accepts only the exact dev origin and explicit opt-in', () => {
  const accepted = assertLiveMutationConfig({
    baseURL: 'https://dev.crucio.cz/',
    mutationsEnabled: '1',
    token: 'redacted-test-token',
  });
  assert.equal(accepted.baseURL, 'https://dev.crucio.cz');

  for (const baseURL of [
    'http://dev.crucio.cz',
    'https://clankerdev.vpsfree.cz',
    'https://dev.crucio.cz.evil.example',
    'https://dev.crucio.cz/app',
    'https://dev.crucio.cz?unsafe=1',
    'https://user@dev.crucio.cz',
    'https://dev.crucio.cz:8443',
  ]) {
    assert.throws(
      () => assertLiveMutationConfig({ baseURL, mutationsEnabled: '1', token: 'redacted-test-token' }),
      /exactly https:\/\/dev\.crucio\.cz/
    );
  }

  assert.throws(
    () => assertLiveMutationConfig({ baseURL: 'https://dev.crucio.cz', mutationsEnabled: '0', token: 'token' }),
    /disabled/
  );
  assert.throws(
    () => assertLiveMutationConfig({ baseURL: 'https://dev.crucio.cz', mutationsEnabled: '1', token: '' }),
    /non-empty/
  );
});

test('run identity is unique-friendly and DNS-label safe', () => {
  const identity = createLiveRunIdentity({
    now: new Date('2026-08-26T12:34:56.789Z'),
    randomSuffix: 'a1b2c3d4',
  });
  assert.equal(identity.runId, '20260826t123456z-a1b2c3d4');
  assert.equal(identity.prefix, 'webui-next-live-20260826t123456z-a1b2c3d4');
  assert.match(identity.prefix, /^[a-z0-9-]+$/);
  assert.ok(identity.prefix.length <= 63);
});

test('live mutation role guard accepts only a valid administrator response', () => {
  assert.deepEqual(
    assertMutationAdmin({ status: true, response: { user: { id: '42', level: '90', login: 'not-persisted' } } }),
    { id: 42, role: 'admin' }
  );
  assert.throws(
    () => assertMutationAdmin({ status: true, response: { user: { id: 21, level: 21 } } }),
    /administrator token/
  );
  assert.throws(
    () => assertMutationAdmin({ status: false, response: null }),
    /rejected by users\/current/
  );
  assert.throws(
    () => assertMutationAdmin({ response: { user: { id: 42, level: 90 } } }),
    /rejected by users\/current/
  );
  assert.throws(
    () => assertMutationAdmin({ status: true, response: { user: { id: null, level: 90 } } }),
    /positive integer/
  );
});

test('ledger rejects objects outside the run allowlist and records atomically', () => {
  const ledger = fixtureLedger();
  assert.throws(
    () => registerOwnedObject(ledger, { kind: 'dns_zone', id: 10, label: 'production.example' }),
    /outside run prefix/
  );
  assert.throws(
    () => registerOwnedObject(ledger, {
      kind: 'dns_record',
      id: 11,
      parentId: 10,
      label: `${ledger.prefix}.dev.crucio.cz/probe`,
    }),
    /parent zone is not owned/
  );

  registerOwnedObject(ledger, {
    kind: 'dns_zone',
    id: 10,
    label: `${ledger.prefix}.dev.crucio.cz`,
  });
  registerOwnedObject(ledger, {
    kind: 'dns_record',
    id: 11,
    parentId: 10,
    label: `${ledger.prefix}.dev.crucio.cz/probe`,
  });

  assert.equal(assertOwnedObject(ledger, { kind: 'dns_zone', id: 10 }).id, 10);
  assert.throws(() => assertOwnedObject(ledger, { kind: 'dns_zone', id: 999 }), /unowned/);

  const directory = fs.mkdtempSync(realTmpPrefix('clanker-live-ledger-'));
  const filePath = path.join(directory, 'objects.json');
  writeLedgerAtomic(filePath, ledger);
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')).objects.map((entry) => entry.id), [10, 11]);
  assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
});

test('ledger and artifact guards reject symlinked targets and every symlinked ancestor', () => {
  const root = fs.mkdtempSync(realTmpPrefix('clanker-live-symlink-'));
  const outside = fs.mkdtempSync(realTmpPrefix('clanker-live-outside-'));
  const linkedDirectory = path.join(root, 'linked');
  fs.symlinkSync(outside, linkedDirectory, 'dir');

  const escapedLedger = path.join(linkedDirectory, 'nested', 'objects.json');
  assert.throws(() => assertNoSymlinkAncestors(escapedLedger), /symlinked artifact path component/);
  assert.throws(() => writeLedgerAtomic(escapedLedger, fixtureLedger()), /symlinked artifact path component/);
  assert.equal(fs.existsSync(path.join(outside, 'nested', 'objects.json')), false);

  const directTarget = path.join(root, 'objects.json');
  const outsideFile = path.join(outside, 'outside.json');
  fs.writeFileSync(outsideFile, '{}\n');
  fs.symlinkSync(outsideFile, directTarget, 'file');
  assert.throws(() => writeLedgerAtomic(directTarget, fixtureLedger()), /symlinked artifact path component/);
  assert.equal(fs.readFileSync(outsideFile, 'utf8'), '{}\n');
});

test('cleanup identity check fails closed on changed DNS resource identity', () => {
  const ledger = fixtureLedger();
  const zone = registerOwnedObject(ledger, {
    kind: 'dns_zone',
    id: 10,
    label: `${ledger.prefix}.dev.crucio.cz`,
  });
  const record = registerOwnedObject(ledger, {
    kind: 'dns_record',
    id: 11,
    parentId: 10,
    label: `${ledger.prefix}.dev.crucio.cz/probe-a`,
  });

  assert.equal(
    assertCleanupResourceIdentity(ledger, zone, {
      namespace: 'dns_zone',
      resource: { id: '10', name: zone.label },
    }).id,
    10
  );
  assert.equal(
    assertCleanupResourceIdentity(ledger, record, {
      namespace: 'dns_record',
      resource: { id: 11, name: 'probe-a', type: 'A', dns_zone: { id: '10' } },
    }).id,
    11
  );

  const validRecord = { id: 11, name: 'probe-a', type: 'A', dns_zone: 10 };
  for (const [label, namespace, resource] of [
    ['type', 'dns_zone', validRecord],
    ['id', 'dns_record', { ...validRecord, id: 12 }],
    ['name', 'dns_record', { ...validRecord, name: 'production' }],
    ['record type', 'dns_record', { ...validRecord, type: 'AAAA' }],
    ['parent', 'dns_record', { ...validRecord, dns_zone: 99 }],
    ['missing parent', 'dns_record', { id: 11, name: 'probe-a', type: 'A' }],
  ]) {
    assert.throws(
      () => assertCleanupResourceIdentity(ledger, record, { namespace, resource }),
      /Refusing cleanup/,
      label
    );
  }
});

test('cleanup never deletes a parent zone after an owned child cleanup failure', async () => {
  const ledger = fixtureLedger();
  registerOwnedObject(ledger, {
    kind: 'dns_zone',
    id: 10,
    label: `${ledger.prefix}.dev.crucio.cz`,
  });
  registerOwnedObject(ledger, {
    kind: 'dns_record',
    id: 11,
    parentId: 10,
    label: `${ledger.prefix}.dev.crucio.cz/probe-a`,
  });
  registerOwnedObject(ledger, {
    kind: 'dns_record',
    id: 12,
    parentId: 10,
    label: `${ledger.prefix}.dev.crucio.cz/probe-b`,
  });

  const calls = [];
  const result = await cleanupOwnedObjects(ledger, {
    dns_record: async (object) => {
      calls.push(`record:${object.id}`);
      if (object.id === 11) throw new Error('synthetic cleanup failure');
    },
    dns_zone: async (object) => calls.push(`zone:${object.id}`),
  });

  assert.deepEqual(calls, ['record:12', 'record:11']);
  assert.deepEqual(result.cleaned, [{ kind: 'dns_record', id: 12 }]);
  assert.deepEqual(result.failures, [
    { kind: 'dns_record', id: 11, error: 'synthetic cleanup failure' },
    {
      kind: 'dns_zone',
      id: 10,
      error: 'Blocked parent cleanup: owned children are not clean (dns_record #11).',
      blocked: true,
    },
  ]);
  assert.equal(ledger.status, 'cleanup_failed');
  assert.equal(ledger.objects.find((entry) => entry.id === 11).cleanup.attempts, 1);
  assert.equal(ledger.objects.find((entry) => entry.id === 10).cleanup.status, 'blocked');
  assert.equal(ledger.objects.find((entry) => entry.id === 10).cleanup.attempts, 0);
});

test('cleanup retries a previously blocked parent after all owned children are clean', async () => {
  const ledger = fixtureLedger();
  const zone = registerOwnedObject(ledger, {
    kind: 'dns_zone',
    id: 10,
    label: `${ledger.prefix}.dev.crucio.cz`,
  });
  const record = registerOwnedObject(ledger, {
    kind: 'dns_record',
    id: 11,
    parentId: 10,
    label: `${ledger.prefix}.dev.crucio.cz/probe-a`,
  });
  zone.cleanup.status = 'blocked';
  record.cleanup.status = 'cleaned';

  const calls = [];
  const result = await cleanupOwnedObjects(ledger, {
    dns_record: async () => calls.push('record'),
    dns_zone: async () => calls.push('zone'),
  });

  assert.deepEqual(calls, ['zone']);
  assert.deepEqual(result.failures, []);
  assert.equal(zone.cleanup.status, 'cleaned');
});

test('HaveAPI mutation matching requires exact method, dev origin, version and DNS resource', () => {
  assert.equal(
    matchesHaveApiMutation(
      { method: 'POST', url: 'https://dev.crucio.cz/v7.0/dns_zones' },
      { expectedMethod: 'POST', resource: 'dns_zones' }
    ),
    true
  );
  assert.equal(
    matchesHaveApiMutation(
      { method: 'PUT', url: 'https://dev.crucio.cz/api/v7.0/dns_records/123' },
      { expectedMethod: 'PUT', resource: 'dns_records/123' }
    ),
    true
  );

  for (const candidate of [
    { method: 'GET', url: 'https://dev.crucio.cz/v7.0/dns_zones' },
    { method: 'POST', url: 'https://clankerdev.vpsfree.cz/v7.0/dns_zones' },
    { method: 'POST', url: 'https://dev.crucio.cz/v6.0/dns_zones' },
    { method: 'POST', url: 'https://dev.crucio.cz/v7.0/users' },
    { method: 'POST', url: 'https://dev.crucio.cz/unexpected/v7.0/dns_zones' },
    { method: 'POST', url: 'https://dev.crucio.cz/v7.0/dns_zones/123' },
    { method: 'POST', url: 'https://dev.crucio.cz/7.0/dns_zones' },
  ]) {
    assert.equal(
      matchesHaveApiMutation(candidate, { expectedMethod: 'POST', resource: 'dns_zones' }),
      false
    );
  }
});

test('cleanup sanitizes handler failures before persisting them in the ledger', async () => {
  const ledger = fixtureLedger();
  registerOwnedObject(ledger, {
    kind: 'dns_zone',
    id: 10,
    label: `${ledger.prefix}.dev.crucio.cz`,
  });

  const persistedErrors = [];
  const result = await cleanupOwnedObjects(
    ledger,
    { dns_zone: async () => { throw new Error('Authorization: Bearer secret-value'); } },
    {
      sanitizeError: (message) => message.replace('secret-value', '[REDACTED]'),
      onChange: async (nextLedger) => {
        const error = nextLedger.objects[0].cleanup.error;
        if (error) persistedErrors.push(error);
      },
    }
  );

  assert.ok(persistedErrors.length >= 1);
  assert.ok(persistedErrors.every((error) => error === 'Authorization: Bearer [REDACTED]'));
  assert.equal(result.failures[0].error, 'Authorization: Bearer [REDACTED]');
  assert.equal(ledger.objects[0].cleanup.error, 'Authorization: Bearer [REDACTED]');
});

test('HaveAPI resource IDs are validated before entering the ledger', () => {
  assert.equal(extractHaveApiResourceId({ response: { dns_zone: { id: '42' } } }, 'dns_zone'), 42);
  assert.throws(() => extractHaveApiResourceId({ response: { dns_zone: {} } }, 'dns_zone'), /positive integer/);
});
