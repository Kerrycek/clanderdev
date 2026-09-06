import { describe, expect, it, vi } from 'vitest';

import { isAmbiguousMutationError } from '../../../lib/api/haveapi';
import type { DatasetSnapshotRollbackChainReadback } from '../../../lib/api/transactions';
import {
  createDatasetSnapshotRollbackIntent,
  prepareDatasetSnapshotRollbackIntent,
  reconcileDatasetSnapshotRollback,
} from './DatasetSnapshotRollbackReconciliation';

function success(data: unknown) {
  return Promise.resolve({ data, isError: false, fetchStatus: 'idle' });
}

const matchingReadback: DatasetSnapshotRollbackChainReadback = {
  rollback: [{ id: 70, name: 'rollback', state: 'done' }],
  restore: [{ id: 80, name: 'restore', state: 'failed' }],
};
const intent = createDatasetSnapshotRollbackIntent(200, [{ id: 80, state: 'done' }])!;

function reconcile(overrides: Partial<Parameters<typeof reconcileDatasetSnapshotRollback>[0]> = {}) {
  return reconcileDatasetSnapshotRollback({
    datasetId: 10,
    intent,
    fetchActiveChains: () => Promise.resolve([]),
    fetchMatchingChains: () => Promise.resolve({
      ...matchingReadback,
      rollback: [...matchingReadback.rollback, { id: 81, name: 'rollback', state: 'done' }],
    }),
    refetchChains: () => success([{ id: 79, state: 'done' }]),
    refetchDataset: () => success({ id: 10 }),
    refetchSnapshots: () => success({ data: [{ id: 200 }] }),
    ...overrides,
  });
}

describe('reconcileDatasetSnapshotRollback', () => {
  it('captures the global Dataset chain high-water mark with the exact snapshot', () => {
    expect(intent).toEqual({
      type: 'dataset-snapshot-rollback',
      snapshotId: 200,
      baselineTransactionChainId: 80,
    });
    expect(createDatasetSnapshotRollbackIntent(0, [{ id: 80 }])).toBeNull();
    expect(createDatasetSnapshotRollbackIntent(200, [{ id: 0 }])).toBeNull();
  });

  it('runs active preflight before the last high-water read and marks read failures as not submitted', async () => {
    const order: string[] = [];
    await expect(prepareDatasetSnapshotRollbackIntent({
      snapshotId: 200,
      preflight: async () => { order.push('preflight'); },
      fetchBaselineChains: async () => { order.push('baseline'); return [{ id: 80, state: 'done' }]; },
      errorMessage: 'baseline failed',
    })).resolves.toEqual(intent);
    expect(order).toEqual(['preflight', 'baseline']);

    const error = await prepareDatasetSnapshotRollbackIntent({
      snapshotId: 200,
      preflight: async () => undefined,
      fetchBaselineChains: async () => { throw new TypeError('network lost'); },
      errorMessage: 'baseline failed',
    }).catch((caught) => caught);
    expect(error).toMatchObject({ code: 'ROLLBACK_PREPARATION_FAILED' });
    expect(isAmbiguousMutationError(error)).toBe(false);
  });

  it('requires successful chain, dataset and snapshot read-backs', async () => {
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

  it('clears for a new finished rollback proof even when recent history is stale', async () => {
    await expect(reconcile()).resolves.toBe('clear');
  });

  it('unions the recent feed with active reads to close an interleaving race', async () => {
    await expect(reconcile({
      refetchChains: () => success([{ id: 81, state: 'queued' }]),
    })).resolves.toBe('busy');
  });

  it('does not clear on empty delayed visibility, then clears on new finished proof', async () => {
    let visible = false;
    const fetchMatchingChains = () => Promise.resolve(visible ? {
      ...matchingReadback,
      restore: [...matchingReadback.restore, { id: 81, name: 'restore', state: 'done' }],
    } : matchingReadback);

    await expect(reconcile({ fetchMatchingChains })).resolves.toBe('error');
    visible = true;
    await expect(reconcile({ fetchMatchingChains })).resolves.toBe('clear');
  });

  it('keeps new matching chains with active or unknown state busy', async () => {
    for (const state of ['queued', undefined]) {
      await expect(reconcile({
        fetchMatchingChains: () => Promise.resolve({
          ...matchingReadback,
          rollback: [...matchingReadback.rollback, { id: 81, name: 'rollback', state }],
        }),
      })).resolves.toBe('busy');
    }
  });

  it('rejects a missing or malformed persisted rollback intent', async () => {
    await expect(reconcile({ intent: undefined })).resolves.toBe('error');
    await expect(reconcile({
      intent: { type: 'dataset-snapshot-rollback', snapshotId: 200, baselineTransactionChainId: -1 },
    })).resolves.toBe('error');
  });
});
