import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createLocalLock,
  type LocalLock,
  type LocalMutationIntent,
} from '../../../lib/localLocks';
import { objectRef } from '../../../lib/objectRef';
import { DatasetSnapshotRollbackUncertaintyPanel } from './DatasetSnapshotRollbackUncertaintyPanel';

const chrome = vi.hoisted(() => ({
  acknowledgeUncertainLocalLock: vi.fn(),
  openTasks: vi.fn(),
}));

vi.mock('../../../components/layout/ChromeContext', () => ({
  useChrome: () => chrome,
}));

vi.mock('../../../app/i18n', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      const values = vars ? Object.values(vars).join(' ') : '';
      return `${key}${values ? ` ${values}` : ''}`;
    },
  }),
}));

const ref = objectRef('Dataset', 10);
const intent = {
  type: 'dataset-snapshot-rollback' as const,
  snapshotId: 91,
  snapshotLabel: 'before-upgrade',
};

function uncertainLock(nextIntent: LocalMutationIntent | null = intent): LocalLock {
  return {
    ...createLocalLock(ref, Date.now(), {
      uncertain: true,
      uncertaintyId: 'rollback-generation-1',
    }),
    intent: nextIntent ?? undefined,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DatasetSnapshotRollbackUncertaintyPanel', () => {
  it('requires Tasks review, exact snapshot ID and a second fresh read before exact-generation unlock', async () => {
    const user = userEvent.setup();
    const reconcile = vi.fn().mockResolvedValue('manual');
    render(
      <DatasetSnapshotRollbackUncertaintyPanel
        object={ref}
        lock={uncertainLock()}
        reconcile={reconcile}
      />
    );

    const review = screen.getByTestId('dataset.snapshots.rollback_uncertain.acknowledge');
    expect(review).toBeDisabled();
    await user.click(screen.getByTestId('dataset.snapshots.rollback_uncertain.open_tasks'));
    expect(chrome.openTasks).toHaveBeenCalledOnce();
    await user.click(review);

    const modal = await screen.findByTestId('dataset.snapshots.rollback_guard.confirm');
    expect(modal).toHaveTextContent('before-upgrade');
    expect(modal).toHaveTextContent('91');
    expect(chrome.acknowledgeUncertainLocalLock).not.toHaveBeenCalled();
    expect(reconcile).toHaveBeenCalledOnce();

    const input = screen.getByTestId('dataset.snapshots.rollback_guard.input');
    const unlock = screen.getByTestId('dataset.snapshots.rollback_guard.unlock');
    await user.type(input, '92');
    expect(unlock).toBeDisabled();
    await user.clear(input);
    await user.type(input, '91');
    expect(unlock).toBeEnabled();
    await user.click(unlock);

    await waitFor(() => expect(chrome.acknowledgeUncertainLocalLock)
      .toHaveBeenCalledWith(ref, 'rollback-generation-1'));
    expect(reconcile).toHaveBeenCalledTimes(2);
  });

  it('keeps the manual override blocked when the final fresh read is busy or fails', async () => {
    const user = userEvent.setup();
    const reconcile = vi.fn()
      .mockResolvedValueOnce('manual')
      .mockResolvedValueOnce('busy')
      .mockResolvedValueOnce('error');
    render(
      <DatasetSnapshotRollbackUncertaintyPanel
        object={ref}
        lock={uncertainLock()}
        reconcile={reconcile}
      />
    );

    await user.click(screen.getByTestId('dataset.snapshots.rollback_uncertain.open_tasks'));
    await user.click(screen.getByTestId('dataset.snapshots.rollback_uncertain.acknowledge'));
    fireEvent.change(await screen.findByTestId('dataset.snapshots.rollback_guard.input'), {
      target: { value: '91' },
    });
    await user.click(screen.getByTestId('dataset.snapshots.rollback_guard.unlock'));
    expect(await screen.findByTestId('dataset.snapshots.rollback_guard.error'))
      .toHaveTextContent('still_busy');
    expect(chrome.acknowledgeUncertainLocalLock).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('dataset.snapshots.rollback_guard.unlock'));
    expect(await screen.findByTestId('dataset.snapshots.rollback_guard.error'))
      .toHaveTextContent('refresh_failed');
    expect(chrome.acknowledgeUncertainLocalLock).not.toHaveBeenCalled();
    expect(reconcile).toHaveBeenCalledTimes(3);
  });

  it('does not offer the manual confirmation when the persisted intent is missing', async () => {
    const user = userEvent.setup();
    render(
      <DatasetSnapshotRollbackUncertaintyPanel
        object={ref}
        lock={uncertainLock(null)}
        reconcile={() => Promise.resolve('error')}
      />
    );

    await user.click(screen.getByTestId('dataset.snapshots.rollback_uncertain.open_tasks'));
    await user.click(screen.getByTestId('dataset.snapshots.rollback_uncertain.acknowledge'));
    expect(screen.queryByTestId('dataset.snapshots.rollback_guard.confirm')).not.toBeInTheDocument();
    expect(screen.getByTestId('dataset.snapshots.rollback_uncertain.error')).toHaveTextContent('refresh_failed');
    expect(chrome.acknowledgeUncertainLocalLock).not.toHaveBeenCalled();
  });
});
