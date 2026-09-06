import { describe, expect, it, vi } from 'vitest';

import { isAmbiguousMutationError } from '../../../lib/api/haveapi';
import {
  createDatasetSnapshotRollbackIntent,
  prepareDatasetSnapshotRollbackIntent,
  reconcileDatasetSnapshotRollback,
} from './DatasetSnapshotRollbackReconciliation';

function success(data: unknown) {
  return Promise.resolve({ data, isError: false, fetchStatus: 'idle' });
}

const intent = createDatasetSnapshotRollbackIntent(200, 'before-upgrade')!;

function reconcile(overrides: Partial<Parameters<typeof reconcileDatasetSnapshotRollback>[0]> = {}) {
  return reconcileDatasetSnapshotRollback({
    datasetId: 10,
    intent,
    fetchActiveChains: () => Promise.resolve([]),
    refetchChains: () => success([{ id: 79, state: 'done' }]),
    refetchDataset: () => success({ id: 10 }),
    refetchSnapshots: () => success({ data: [{ id: 200 }] }),
    ...overrides,
  });
}

describe('reconcileDatasetSnapshotRollback', () => {
  it('persists the exact snapshot identity without claiming transaction proof', () => {
    expect(intent).toEqual({
      type: 'dataset-snapshot-rollback',
      snapshotId: 200,
      snapshotLabel: 'before-upgrade',
    });
    expect(createDatasetSnapshotRollbackIntent(0, 'before-upgrade')).toBeNull();
    expect(createDatasetSnapshotRollbackIntent(200, ' ')).toBeNull();
  });

  it('runs the active preflight and classifies read failures as not submitted', async () => {
    const preflight = vi.fn().mockResolvedValue(undefined);
    await expect(prepareDatasetSnapshotRollbackIntent({
      snapshotId: 200,
      snapshotLabel: 'before-upgrade',
      preflight,
      errorMessage: 'preflight failed',
    })).resolves.toEqual(intent);
    expect(preflight).toHaveBeenCalledOnce();

    const error = await prepareDatasetSnapshotRollbackIntent({
      snapshotId: 200,
      snapshotLabel: 'before-upgrade',
      preflight: async () => { throw new TypeError('network lost'); },
      errorMessage: 'preflight failed',
    }).catch((caught) => caught);
    expect(error).toMatchObject({
      code: 'ROLLBACK_PREPARATION_FAILED',
      message: 'preflight failed',
    });
    expect(isAmbiguousMutationError(error)).toBe(false);
  });

  it('requires successful recent-chain, dataset and snapshot readbacks', async () => {
    const refetchSnapshots = vi.fn().mockResolvedValue({
      data: undefined,
      error: new Error('snapshot refresh failed'),
      isError: true,
      fetchStatus: 'idle',
    });

    await expect(reconcile({ refetchSnapshots })).resolves.toBe('error');
    expect(refetchSnapshots).toHaveBeenCalledOnce();
  });

  it('keeps the guard while an active chain is absent from the recent-ten feed', async () => {
    await expect(reconcile({
      fetchActiveChains: () => Promise.resolve([{ id: 82, state: 'rollbacking' }]),
      refetchChains: () => success(Array.from({ length: 10 }, (_, index) => ({
        id: 70 - index,
        state: 'done',
      }))),
    })).resolves.toBe('busy');
  });

  it('keeps the guard if an active chain appears only in the recent feed', async () => {
    await expect(reconcile({
      refetchChains: () => success([{ id: 81, state: 'queued' }]),
    })).resolves.toBe('busy');
  });

  it('never treats a newer finished rollback of another snapshot as exact proof', async () => {
    await expect(reconcile({
      refetchChains: () => success([{
        id: 999,
        name: 'rollback',
        state: 'done',
        snapshot_id: 201,
      }]),
    })).resolves.toBe('manual');
  });

  it('offers only explicit manual confirmation when fresh state is valid and idle', async () => {
    await expect(reconcile()).resolves.toBe('manual');
  });

  it('rejects a missing or malformed persisted rollback intent', async () => {
    await expect(reconcile({ intent: undefined })).resolves.toBe('error');
    await expect(reconcile({
      intent: { type: 'dataset-snapshot-rollback', snapshotId: 200, snapshotLabel: '' },
    })).resolves.toBe('error');
  });
});
