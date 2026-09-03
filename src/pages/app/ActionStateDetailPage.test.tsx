import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';

import { ActionStateDetailPage } from './ActionStateDetailPage';

const mocks = vi.hoisted(() => ({
  fetchActionState: vi.fn(),
  fetchTransactionChain: vi.fn(),
  fetchTransactions: vi.fn(),
  cancelActionState: vi.fn(),
  chrome: {
    syncStatus: 'ok',
    syncError: null,
    retrySync: vi.fn(),
    openTasks: vi.fn(),
    closeTasks: vi.fn(),
    toggleTasks: vi.fn(),
    pinnedActionStates: [] as number[],
    pinnedTransactionChains: [] as number[],
    togglePinnedActionState: vi.fn(),
    togglePinnedTransactionChain: vi.fn(),
    trackActionState: vi.fn(),
    dismissActionState: vi.fn(),
    trackedActionStates: [] as any[],
    highlightActionStateId: null,
    localLocks: [] as any[],
    acquireLocalLock: vi.fn(),
    settleLocalLock: vi.fn(),
    releaseLocalLock: vi.fn(),
    acknowledgeUncertainLocalLock: vi.fn(),
    releaseLocalLocksByActionStateId: vi.fn(),
    isLocallyLocked: vi.fn(() => false),
  },
}));

vi.mock('../../lib/api/actionStates', () => ({
  fetchActionState: mocks.fetchActionState,
  cancelActionState: mocks.cancelActionState,
}));

vi.mock('../../lib/api/transactions', () => ({
  fetchTransactionChain: mocks.fetchTransactionChain,
  fetchTransactions: mocks.fetchTransactions,
}));

vi.mock('../../app/appMode', () => ({
  useAppMode: () => ({ mode: 'admin', basePath: '/admin' }),
}));

vi.mock('../../app/i18n', () => ({
  useI18n: () => ({
    lang: 'en',
    preference: 'en',
    preferredLanguageCodes: ['en', 'cs'],
    t: (key: string, vars?: Record<string, unknown>) => {
      if (key === 'operation.raw_name' && vars?.['name']) return `Backend name: ${vars['name']}`;
      let out = key;
      for (const [k, v] of Object.entries(vars ?? {})) out = out.replace(`{${k}}`, String(v));
      return out;
    },
    tc: (key: string, count: number) => `${key}:${count}`,
  }),
}));

vi.mock('../../components/layout/ChromeContext', () => ({
  useChrome: () => mocks.chrome,
}));

function renderPage(path = '/admin/action-states/900') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/action-states/:actionStateId" element={<ActionStateDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ActionStateDetailPage', () => {
  test('loads related transaction chain and expands a transaction debug row', async () => {
    mocks.fetchActionState.mockResolvedValue({
      data: {
        id: 900,
        label: 'Restart VPS',
        finished: false,
        status: true,
        current: 1,
        total: 2,
        transaction_chain: { id: 42, label: 'Restart chain' },
        output: { note: 'queued' },
      },
    });
    mocks.fetchTransactionChain.mockResolvedValue({ data: { id: 42, label: 'Restart chain', state: 'queued' } });
    mocks.fetchTransactions.mockResolvedValue({
      data: [
        {
          id: 501,
          transaction_chain: { id: 42 },
          name: 'Vps::Start',
          done: 'done',
          success: 0,
          node: { id: 3, name: 'node3' },
          vps: { id: 123 },
          user: { id: 7 },
          created_at: '2026-05-28T10:00:00Z',
          started_at: '2026-05-28T10:00:05Z',
          finished_at: '2026-05-28T10:00:10Z',
          input: { vps_id: 123 },
          output: { error: 'boom' },
        },
      ],
    });

    renderPage();

    await screen.findByText('Restart VPS');
    expect(mocks.fetchActionState).toHaveBeenCalledWith(900);
    expect(mocks.fetchTransactionChain).toHaveBeenCalledWith(42);
    expect(mocks.fetchTransactions).toHaveBeenCalledWith({ transactionChainId: 42, limit: 500 });
    expect(await screen.findByText(/Vps::Start/)).toBeInTheDocument();
    expect(screen.getByTestId('action_state.detail.transactions.table')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('action_state.detail.tx.toggle.501'));

    await waitFor(() => expect(screen.getByTestId('action_state.detail.tx.expanded.501')).toBeInTheDocument());
    const expandedRow = screen.getByTestId('action_state.detail.tx.expanded.501');
    expect(within(expandedRow).getAllByText(/boom/).length).toBeGreaterThanOrEqual(2);
    expect(within(expandedRow).getAllByText(/vps_id/)).toHaveLength(2);
  });
});
