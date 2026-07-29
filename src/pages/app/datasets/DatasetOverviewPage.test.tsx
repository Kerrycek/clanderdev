import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

import { DatasetOverviewPage } from './DatasetOverviewPage';
import { DatasetContextProvider } from './DatasetContext';

vi.mock('../../../app/auth', () => ({
  useAuth: () => ({ role: 'user' }),
}));

vi.mock('../../../app/appMode', () => ({
  useAppMode: () => ({ mode: 'user', basePath: '/ui-next' }),
}));

vi.mock('../../../app/i18n', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      let out = key;
      for (const [k, v] of Object.entries(vars ?? {})) out = out.replace(`{${k}}`, String(v));
      return out;
    },
    tc: (key: string, count: number) => `${key}:${count}`,
  }),
}));

vi.mock('../../../app/objectScope', () => ({
  useObjectScope: () => ({ scope: 'own' }),
}));

vi.mock('../../../components/layout/ChromeContext', () => ({
  useChrome: () => ({
    acquireLocalLock: vi.fn(),
    releaseLocalLock: vi.fn(),
    trackActionState: vi.fn(),
    openTasks: vi.fn(),
  }),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DatasetContextProvider
          value={{
            dataset: {
              id: 10402,
              name: '10802',
              full_name: 'mail.kerrycze.net/10802',
              quota: 10 * 1024,
              refquota: 240 * 1024,
              used: 33 * 1024,
              avail: 210 * 1024,
              referenced: 30 * 1024,
              compression: true,
              atime: false,
              relatime: false,
              recordsize: 128 * 1024,
              sync: 'standard',
            },
            refetch: vi.fn(),
            section: 'datasets',
            listPath: '/datasets',
            detailPath: '/datasets/10402',
            datasetRef: { kind: 'Dataset', id: 10402 },
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
          <DatasetOverviewPage />
        </DatasetContextProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('DatasetOverviewPage', () => {
  it('keeps advanced ZFS dataset properties collapsed by default', async () => {
    const user = userEvent.setup();

    renderPage();

    expect(screen.getByTestId('dataset.manage.quota')).toBeVisible();
    expect(screen.getByTestId('dataset.manage.refquota')).toBeVisible();
    expect(screen.getByTestId('dataset.manage.compression')).toBeVisible();

    expect(screen.getByTestId('dataset.manage.advanced_properties')).not.toHaveAttribute('open');
    expect(screen.getByTestId('dataset.manage.recordsize')).not.toBeVisible();
    expect(screen.getByTestId('dataset.manage.sync')).not.toBeVisible();
    expect(screen.getByTestId('dataset.manage.atime')).not.toBeVisible();
    expect(screen.getByTestId('dataset.manage.relatime')).not.toBeVisible();

    await user.click(screen.getByTestId('dataset.manage.advanced_properties.summary'));

    expect(screen.getByTestId('dataset.manage.recordsize')).toBeVisible();
    expect(screen.getByTestId('dataset.manage.sync')).toBeVisible();
    expect(screen.getByTestId('dataset.manage.atime')).toBeVisible();
    expect(screen.getByTestId('dataset.manage.relatime')).toBeVisible();
  });
});
