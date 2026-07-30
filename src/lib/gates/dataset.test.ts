import { describe, expect, it } from 'vitest';

import { datasetCapabilities, gateDatasetAction } from './dataset';

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
    const dataset = { id: 10 } as any;
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

  it('blocks privileged snapshot and download actions for regular users', () => {
    const actions = [
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

  it('derives user create/delete/update access from scoped ownership and dataset structure', () => {
    const root = {
      ...baseDataset,
      user: { id: 42 },
    };
    const child = {
      ...root,
      id: 11,
      parent: { id: 10 },
    };

    const rootCapabilities = datasetCapabilities(root, { role: 'user', scope: 'mine', userId: 42 });
    expect(rootCapabilities).toMatchObject({
      canCreateSubdataset: true,
      canDelete: false,
      canUpdate: true,
      canUseAdminProperties: false,
    });

    const childCapabilities = datasetCapabilities(child, { role: 'user', scope: 'mine', userId: 42 });
    expect(childCapabilities.canDelete).toBe(true);
    expect(
      gateDatasetAction('dataset.create', {
        dataset: root,
        role: 'user',
        permission: rootCapabilities.canCreateSubdataset,
      }).allowed
    ).toBe(true);
    expect(
      gateDatasetAction('dataset.delete', {
        dataset: child,
        role: 'user',
        permission: childCapabilities.canDelete,
      }).allowed
    ).toBe(true);
  });

  it('denies foreign datasets even when loaded into the user view', () => {
    const foreign = {
      ...baseDataset,
      user: { id: 99 },
      parent: { id: 9 },
    };
    const denied = datasetCapabilities(foreign, { role: 'user', scope: 'mine', userId: 42 });
    expect(denied).toMatchObject({
      canCreateSubdataset: false,
      canDelete: false,
      canUpdate: false,
    });
  });

  it('fails closed when the API omits ownership metadata', () => {
    const withoutOwner = {
      ...baseDataset,
      parent: { id: 9 },
    };
    const denied = datasetCapabilities(withoutOwner, { role: 'user', scope: 'mine', userId: 42 });
    expect(denied).toMatchObject({
      canCreateSubdataset: false,
      canDelete: false,
      canUpdate: false,
    });
  });

  it('keeps regular-user create/delete fail-closed without an object permission decision', () => {
    expect(gateDatasetAction('dataset.create', { dataset: baseDataset, role: 'user' }).allowed).toBe(false);
    expect(gateDatasetAction('dataset.delete', { dataset: baseDataset, role: 'user' }).allowed).toBe(false);
  });
});
