import { describe, expect, it } from 'vitest';

import { gateDatasetAction } from './dataset';

const baseDataset: any = {
  id: 10,
  object_state: 'active',
};

describe('gateDatasetAction', () => {
  it('blocks actions when a transaction is in progress', () => {
    const r = gateDatasetAction('snapshot.create', { dataset: baseDataset, busyTransaction: true });
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.reason.titleKey).toBe('gate.busy.transaction.title');
    }
  });

  it('allows snapshot create when active and not busy', () => {
    const r = gateDatasetAction('snapshot.create', { dataset: baseDataset });
    expect(r.allowed).toBe(true);
  });

  it('does not block safe actions when the API omits dataset state', () => {
    const dataset = { id: 10, name: 'test' };
    expect(gateDatasetAction('snapshot.create', { dataset, role: 'user' }).allowed).toBe(true);
    expect(gateDatasetAction('download.create', { dataset, role: 'user' }).allowed).toBe(true);
  });

  it('blocks snapshot create when deleted', () => {
    const r = gateDatasetAction('snapshot.create', { dataset: { ...baseDataset, object_state: 'deleted' } });
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.reason.titleKey).toBe('gate.blocked.dataset.deleted.title');
    }
  });

  it('allows download delete even when deleted (still gated by busy)', () => {
    const r = gateDatasetAction('download.delete', { dataset: { ...baseDataset, object_state: 'deleted' } });
    expect(r.allowed).toBe(true);
  });

  it('keeps user-safe snapshot and backup actions available to regular users', () => {
    expect(gateDatasetAction('snapshot.create', { dataset: baseDataset, role: 'user' }).allowed).toBe(true);
    expect(gateDatasetAction('download.create', { dataset: baseDataset, role: 'user' }).allowed).toBe(true);
  });

  it('blocks destructive dataset and restore actions for regular users', () => {
    const actions = [
      'dataset.create',
      'dataset.delete',
      'snapshot.rollback',
      'snapshot.delete',
      'download.delete',
    ] as const;

    for (const action of actions) {
      const r = gateDatasetAction(action, { dataset: baseDataset, role: 'user' });
      expect(r.allowed, action).toBe(false);
      if (!r.allowed) {
        expect(r.reason.titleKey).toBe('gate.admin_only.title');
      }
    }
  });

  it('allows regular users to request dataset updates', () => {
    expect(gateDatasetAction('dataset.update', { dataset: baseDataset, role: 'user' }).allowed).toBe(true);
  });
});
