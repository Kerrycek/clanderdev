import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BackupCenterPage } from './BackupCenterPage';
import { fetchDatasets, fetchSnapshotDownloads } from '../../../lib/api/datasets';

vi.mock('../../../app/i18n', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      let value = key;
      for (const [name, replacement] of Object.entries(vars ?? {})) {
        value = value.replace(`{${name}}`, String(replacement));
      }
      return value;
    },
  }),
}));

vi.mock('../../../lib/api/datasets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api/datasets')>();
  return {
    ...actual,
    fetchDatasets: vi.fn(),
    fetchSnapshotDownloads: vi.fn(),
  };
});

const datasetsMock = vi.mocked(fetchDatasets);
const downloadsMock = vi.mocked(fetchSnapshotDownloads);

function renderPage(path = '/app/backups') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <BackupCenterPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('BackupCenterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    datasetsMock.mockResolvedValue({
      data: [
        { id: 10, name: 'root', vps: { id: 20, hostname: 'mail.example' }, snapshots_count: 3 },
        { id: 11, name: 'archive', snapshots_count: 0 },
      ],
      meta: { total_count: 2 },
    } as never);
    downloadsMock.mockResolvedValue({
      data: [{ id: 1, state: 'ready', url: '/download/1', snapshot: { id: 8, dataset: { id: 10, vps: { id: 20 } } } }],
      meta: { total_count: 1 },
    } as never);
  });

  it('shows a useful overview from two bounded API requests', async () => {
    renderPage();

    expect(await screen.findByTestId('backups.overview')).toBeVisible();
    expect(screen.getByText('3')).toBeVisible();
    expect(screen.getByTestId('backups.downloads.row.1')).toBeVisible();
    expect(datasetsMock).toHaveBeenCalledWith({ limit: 100, includes: 'vps,parent' });
    expect(downloadsMock).toHaveBeenCalledWith({ limit: 100, includes: 'snapshot__dataset' });
  });

  it('opens the snapshot inventory without calling every nested snapshots endpoint', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('backups.overview');

    await user.click(screen.getByTestId('backups.tab.snapshots'));

    expect(await screen.findByTestId('backups.snapshots')).toBeVisible();
    expect(screen.getByTestId('backups.snapshots.row.10')).toBeVisible();
    expect(screen.getByTestId('backups.snapshots.row.11')).toBeVisible();
    await waitFor(() => expect(datasetsMock).toHaveBeenCalledTimes(1));
    expect(downloadsMock).toHaveBeenCalledTimes(1);
  });

  it('loads the global download view without loading datasets', async () => {
    renderPage('/app/backups?tab=downloads');

    expect(await screen.findByTestId('backups.downloads')).toBeVisible();
    expect(downloadsMock).toHaveBeenCalledTimes(1);
    expect(datasetsMock).not.toHaveBeenCalled();
  });
});
