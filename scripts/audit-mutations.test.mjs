import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

test('mutation audit accepts durable settle and extracted local-lock guards', async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    'scripts/audit-mutations.mjs',
    '--root',
    'scripts/fixtures/audit-mutations',
    '--json',
    '--fail-on-warn',
  ], { cwd: repoRoot });
  const report = JSON.parse(stdout);
  const entries = report.mutations.filter((entry) => entry.file.endsWith('guardPatterns.tsx'));

  assert.equal(entries.length, 3);
  for (const entry of entries) {
    assert.deepEqual(entry.warnings, []);
    assert.equal(entry.facts.acquireLocalLock, true);
    assert.equal(entry.facts.releaseLocalLock, true);
    assert.equal(entry.facts.trackActionStateWithObject, true);
  }
});

test('mutation audit rejects async onMutate hooks without request snapshots', async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    'scripts/audit-mutations.mjs',
    '--root',
    'scripts/fixtures/audit-mutations-warnings',
    '--json',
  ], { cwd: repoRoot });
  const report = JSON.parse(stdout);
  const entries = report.mutations.filter((entry) => entry.file.endsWith('snapshotPatterns.tsx'));

  assert.equal(entries.length, 3);
  assert.deepEqual(
    entries.map((entry) => entry.warnings.map((warning) => warning.code)),
    [['async-onMutate-without-snapshot-variables'], [], []]
  );
  assert.equal(entries[0].facts.asyncOnMutateWithoutSnapshotVariables, true);
  assert.equal(entries[1].facts.asyncOnMutateWithoutSnapshotVariables, false);
  assert.equal(entries[2].ignore.tags.includes('async-onMutate-without-snapshot-variables'), true);
});
