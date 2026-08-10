import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BackupCenterPage } from './BackupCenterPage';
import { fetchDatasets, fetchSnapshotDownloads } from '../../../lib/api/datasets';

const objectScopeMock = vi.hoisted(() => ({
  value: {
    scope: 'mine' as const,
    mineUserId: undefined as number | undefined,
    canSwitchScope: false,
  },
}));

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

vi.mock('../../../app/objectScope', () => ({
  useObjectScope: () => objectScopeMock.value,
}));

vi.mock('../../../lib/api/datasets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api/datasets')>();
  return {
    ...actual,
    fetchDatasets: vi.fn(),
    fetchSnapshotDownloads: vi.fn(),
  };
});

vi.mock('./BackupCenterDatasetWorkspace', () => ({
  BackupCenterDatasetWorkspace: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="backups.workspace.provider">{children}</div>
  ),
}));

vi.mock('../datasets/DatasetSnapshotsPage', () => ({
  DatasetSnapshotsPage: ({ queryParamPrefix }: { queryParamPrefix?: string }) => (
    <div data-testid="backups.workspace.snapshots">{queryParamPrefix}</div>
  ),
}));

vi.mock('../datasets/DatasetPlansPage', () => ({
  DatasetPlansPage: () => <div data-testid="backups.workspace.plans" />,
}));

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
    objectScopeMock.value = {
      scope: 'mine',
      mineUserId: undefined,
      canSwitchScope: false,
    };
    datasetsMock.mockResolvedValue({
      data: [
        { id: 10, name: 'root', vps: { id: 20, hostname: 'mail.example' } },
        { id: 11, name: 'archive' },
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
    expect(screen.getByTestId('backups.stats.datasets')).toHaveTextContent('2');
    expect(screen.getByTestId('backups.stats.downloads')).toHaveTextContent('1');
    expect(screen.getByTestId('backups.downloads.row.1')).toBeVisible();
    expect(datasetsMock).toHaveBeenCalledWith({
      limit: 100,
      includes: 'vps,parent,environment,user',
      user: undefined,
      count: true,
    });
    expect(downloadsMock).toHaveBeenCalledWith({
      limit: 100,
      includes: 'snapshot__dataset',
      count: true,
    });
  });

  it('loads snapshot tools only after selecting one dataset', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('backups.overview');

    await user.click(screen.getByTestId('backups.tab.snapshots'));

    expect(await screen.findByTestId('backups.snapshots')).toBeVisible();
    expect(screen.getByTestId('backups.snapshots.row.10')).toBeVisible();
    expect(screen.getByTestId('backups.snapshots.row.11')).toBeVisible();
    expect(screen.getByTestId('backups.workspace.empty')).toBeVisible();
    expect(screen.queryByTestId('backups.workspace.snapshots')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('backups.snapshots.row.10'));

    expect(await screen.findByTestId('backups.workspace.snapshots')).toHaveTextContent('backup_snapshot_');
    expect(screen.getByTestId('backups.snapshots.row.10')).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(datasetsMock).toHaveBeenCalledTimes(1));
    expect(downloadsMock).toHaveBeenCalledTimes(1);
  });

  it('does not render tools for a dataset outside the loaded account scope', async () => {
    renderPage('/app/backups?tab=snapshots&dataset=999');

    expect(await screen.findByTestId('backups.workspace.invalid')).toBeVisible();
    expect(screen.queryByTestId('backups.workspace.provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('backups.workspace.snapshots')).not.toBeInTheDocument();
  });

  it('supports the standard keyboard model for its tabs', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('backups.overview');

    screen.getByTestId('backups.tab.overview').focus();
    await user.keyboard('{ArrowRight}');

    expect(await screen.findByTestId('backups.snapshots')).toBeVisible();
    expect(screen.getByTestId('backups.tab.snapshots')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'backups-tab-snapshots');
  });

  it('loads the global download view without loading datasets', async () => {
    renderPage('/app/backups?tab=downloads');

    expect(await screen.findByTestId('backups.downloads')).toBeVisible();
    expect(downloadsMock).toHaveBeenCalledTimes(1);
    expect(datasetsMock).not.toHaveBeenCalled();
  });

  it('keeps an administrator My view scoped to their own datasets', async () => {
    objectScopeMock.value = {
      scope: 'mine',
      mineUserId: 42,
      canSwitchScope: true,
    };

    renderPage();

    expect(await screen.findByTestId('backups.overview')).toBeVisible();
    expect(datasetsMock).toHaveBeenCalledWith({
      limit: 100,
      includes: 'vps,parent,environment,user',
      user: 42,
      count: true,
    });
    expect(downloadsMock).not.toHaveBeenCalled();
    expect(screen.getByText('backups.downloads.mine_scope.body')).toBeVisible();
  });
});
