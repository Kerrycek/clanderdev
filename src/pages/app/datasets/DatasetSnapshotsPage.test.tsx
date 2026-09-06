import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { Dataset } from '../../../lib/api/datasets';
import { DatasetContextProvider } from './DatasetContext';
import {
  DatasetSnapshotsPage,
  datasetSnapshotQueryParamKeys,
} from './DatasetSnapshotsPage';

const api = vi.hoisted(() => ({
  fetchDatasetSnapshots: vi.fn(),
}));

vi.mock('../../../app/auth', () => ({
  useAuth: () => ({ role: 'user', user: { id: 1, login: 'member' } }),
}));

vi.mock('../../../app/config', () => ({
  getRuntimeConfig: () => ({ webuiUrl: undefined }),
}));

vi.mock('../../../app/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../../components/layout/ChromeContext', () => ({
  useChrome: () => ({
    acquireLocalLock: vi.fn(),
    releaseLocalLock: vi.fn(),
    trackActionState: vi.fn(),
    openTasks: vi.fn(),
  }),
}));

vi.mock('../../../lib/api/transactions', () => ({
  fetchTransactionChains: vi.fn(),
}));

vi.mock('../../../lib/api/datasets', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../lib/api/datasets')>();
  return {
    ...original,
    fetchDatasetSnapshots: api.fetchDatasetSnapshots,
    createDatasetSnapshot: vi.fn(),
    createSnapshotDownload: vi.fn(),
    deleteDatasetSnapshot: vi.fn(),
    rollbackDatasetSnapshot: vi.fn(),
  };
});

function renderPage(options: {
  prefix?: string;
  initialEntry?: string;
  initialEntries?: string[];
  initialIndex?: number;
  ownerId?: number | null;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const dataset = {
    id: 10402,
    name: 'member-data',
    object_state: 'active',
    ...(options.ownerId === null
      ? {}
      : { user: { id: options.ownerId ?? 1, login: 'member' } }),
  } satisfies Dataset;

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={options.initialEntries ?? [options.initialEntry ?? '/']}
        initialIndex={options.initialIndex}
      >
        <HistoryControls />
        <DatasetContextProvider
          value={{
            dataset,
            refetch: vi.fn(),
            section: 'datasets',
            listPath: '/datasets',
            detailPath: '/datasets/10402',
            datasetRef: { kind: 'Dataset', id: dataset.id },
            busyLocalLock: false,
            chains: [],
            chainsLoading: false,
            chainsError: null,
            busyTransaction: false,
            chainsStale: false,
            activeChainIds: [],
            refetchChains: vi.fn(),
          }}
        >
          <DatasetSnapshotsPage queryParamPrefix={options.prefix} />
        </DatasetContextProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function HistoryControls() {
  const navigate = useNavigate();
  return (
    <button type="button" data-testid="history.back" onClick={() => navigate(-1)}>
      Back
    </button>
  );
}

describe('DatasetSnapshotsPage', () => {
  it('keeps detail query parameters unchanged by default and namespaces embedded state', () => {
    expect(datasetSnapshotQueryParamKeys()).toEqual({ search: 'q', action: 'action' });
    expect(datasetSnapshotQueryParamKeys('backup_snapshot_')).toEqual({
      search: 'backup_snapshot_q',
      action: 'backup_snapshot_action',
    });
  });

  it('reads the namespaced search without consuming the detail-page search', async () => {
    api.fetchDatasetSnapshots.mockResolvedValue({ data: [], meta: { total_count: 0 } });

    renderPage({
      prefix: 'backup_snapshot_',
      initialEntry: '/?q=detail-search&backup_snapshot_q=embedded-search',
    });

    await waitFor(() =>
      expect(api.fetchDatasetSnapshots).toHaveBeenCalledWith(
        10402,
        expect.objectContaining({ q: 'embedded-search' })
      )
    );
    expect(screen.getByTestId('dataset.snapshots.search.input')).toHaveValue('embedded-search');
  });

  it('restores the namespaced search when browser history changes', async () => {
    api.fetchDatasetSnapshots.mockResolvedValue({ data: [], meta: { total_count: 0 } });

    renderPage({
      prefix: 'backup_snapshot_',
      initialEntries: [
        '/?backup_snapshot_q=first',
        '/?backup_snapshot_q=second',
      ],
      initialIndex: 1,
    });

    expect(await screen.findByTestId('dataset.snapshots.search.input')).toHaveValue('second');
    screen.getByTestId('history.back').click();
    await waitFor(() =>
      expect(screen.getByTestId('dataset.snapshots.search.input')).toHaveValue('first')
    );
    await waitFor(() =>
      expect(api.fetchDatasetSnapshots).toHaveBeenLastCalledWith(
        10402,
        expect.objectContaining({ q: 'first' })
      )
    );
  });

  it('shows rollback and delete actions to a regular owner when gates allow them', async () => {
    api.fetchDatasetSnapshots.mockResolvedValue({
      data: [{ id: 91, name: 'snap-91', label: 'Before update', created_at: '2026-08-10T10:00:00Z' }],
      meta: { total_count: 1 },
    });

    renderPage();

    expect(await screen.findByTestId('dataset.snapshots.row.91.rollback')).toBeEnabled();
    expect(screen.getByTestId('dataset.snapshots.row.91.delete')).toBeEnabled();
  });

  it('requires the exact snapshot label before enabling rollback confirmation', async () => {
    const user = userEvent.setup();
    api.fetchDatasetSnapshots.mockResolvedValue({
      data: [{ id: 91, name: 'snap-91', label: 'Before update', created_at: '2026-08-10T10:00:00Z' }],
      meta: { total_count: 1 },
    });

    renderPage();

    await user.click(await screen.findByTestId('dataset.snapshots.row.91.rollback'));
    const confirm = screen.getByTestId('dataset.snapshots.rollback_confirm.confirm');
    const input = screen.getByTestId('dataset.snapshots.rollback_confirm.input');

    expect(confirm).toBeDisabled();
    await user.type(input, 'before update');
    expect(confirm).toBeDisabled();
    await user.clear(input);
    await user.type(input, 'Before update');
    expect(confirm).toBeEnabled();
  });

  it.each([
    ['a foreign owner', 99],
    ['missing ownership metadata', null],
  ])('fails closed for %s', async (_label, ownerId) => {
    api.fetchDatasetSnapshots.mockResolvedValue({
      data: [{ id: 91, name: 'snap-91', label: 'Before update' }],
      meta: { total_count: 1 },
    });

    renderPage({ ownerId });

    expect(await screen.findByTestId('dataset.snapshots.row.91.rollback')).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByTestId('dataset.snapshots.row.91.delete')).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });
});
