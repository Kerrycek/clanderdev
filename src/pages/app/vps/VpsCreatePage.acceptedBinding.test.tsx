import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LocalMutationGeneration } from '../../../lib/localLocks';
import { VpsCreatePage } from './VpsCreatePage';

const testState = vi.hoisted(() => ({
  userId: 9,
  acquireLocalLock: vi.fn(),
  settleLocalLock: vi.fn(),
  releaseLocalLock: vi.fn(),
  trackActionState: vi.fn(),
  openTasks: vi.fn(),
  createVps: vi.fn(),
  beginOutcome: vi.fn(),
  markAccepted: vi.fn(),
  readLatest: vi.fn(),
}));

vi.mock('../../../app/appMode', () => ({
  useAppMode: () => ({ mode: 'user', basePath: '/app' }),
}));

vi.mock('../../../app/auth', () => ({
  useAuth: () => ({ role: 'user', user: { id: testState.userId } }),
}));

vi.mock('../../../app/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../components/layout/ChromeContext', () => ({
  useChrome: () => ({
    syncStatus: 'ok',
    syncError: null,
    retrySync: vi.fn(),
    acquireLocalLock: testState.acquireLocalLock,
    settleLocalLock: testState.settleLocalLock,
    releaseLocalLock: testState.releaseLocalLock,
    trackActionState: testState.trackActionState,
    openTasks: testState.openTasks,
  }),
}));

vi.mock('../../../lib/api/infra', () => ({
  fetchLocations: vi.fn().mockResolvedValue({ data: [{ id: 3, label: 'Test location' }], meta: {} }),
}));

vi.mock('../../../lib/api/nodes', () => ({ fetchNodes: vi.fn() }));

vi.mock('../../../lib/api/osTemplates', () => ({
  fetchOsTemplates: vi.fn().mockResolvedValue({ data: [{ id: 6, label: 'Debian' }], meta: {} }),
}));

vi.mock('../../../lib/api/clusterResources', () => ({
  fetchDefaultObjectClusterResources: vi.fn().mockResolvedValue({ data: [], meta: {} }),
}));

vi.mock('../../../lib/api/vps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api/vps')>();
  return { ...actual, createVps: testState.createVps };
});

vi.mock('../../../lib/vpsCreateOutcomeGuard', () => ({
  beginVpsCreateOutcomeGuard: testState.beginOutcome,
  clearVpsCreateOutcomeMarker: vi.fn(),
  markVpsCreateOutcomeAccepted: testState.markAccepted,
  markVpsCreateOutcomeUncertain: vi.fn(),
  readLatestVpsCreateOutcomeMarker: testState.readLatest,
  vpsCreateOutcomeEntryPrefix: () => 'test.vps-create.',
}));

vi.mock('../../../lib/vpsCreateOutcomeReconcile', () => ({
  reconcileVpsCreateOutcome: vi.fn(),
}));

describe('VpsCreatePage accepted action binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.userId = 9;
    const pending = { id: 'receipt-1', createdAt: 1, phase: 'pending', identity: { hostname: 'accepted-vps' } };
    testState.readLatest.mockReturnValue(null);
    testState.beginOutcome.mockResolvedValue(pending);
    testState.markAccepted.mockResolvedValue({ ...pending, phase: 'accepted', candidateVpsId: 123, actionStateId: 456 });
    testState.createVps.mockResolvedValue({ data: { id: 123 }, meta: { action_state_id: 456 } });
  });

  it('retries a silent partial bind with the exact accepted VPS generation and action id', async () => {
    const user = userEvent.setup();
    const generation = Object.freeze({}) as LocalMutationGeneration;
    testState.acquireLocalLock.mockResolvedValue(generation);
    // The first call models a storage bind that returned without persisting all state.
    testState.trackActionState.mockImplementationOnce(() => undefined);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const router = createMemoryRouter([
      { path: '/app/vps/new', element: <VpsCreatePage /> },
      { path: '/app/vps/:vpsId', element: <div data-testid="created-vps" /> },
    ], { initialEntries: ['/app/vps/new'] });

    render(
      <React.StrictMode>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </React.StrictMode>,
    );

    await user.selectOptions(await screen.findByTestId('vps.create.location'), '3');
    await user.selectOptions(screen.getByTestId('vps.create.os_template'), '6');
    await user.type(screen.getByTestId('vps.create.hostname'), 'accepted-vps');
    await user.click(screen.getByTestId('vps.create.submit'));

    await waitFor(() => expect(testState.trackActionState).toHaveBeenCalledTimes(2));
    expect(testState.acquireLocalLock).toHaveBeenCalledTimes(1);
    expect(testState.acquireLocalLock).toHaveBeenCalledWith({ kind: 'Vps', id: 123 }, { durable: true });
    const firstCall = testState.trackActionState.mock.calls.at(0);
    const retryCall = testState.trackActionState.mock.calls.at(1);
    if (!firstCall || !retryCall) throw new Error('Expected the accepted binding and its retry');
    const [firstActionId, firstBinding] = firstCall;
    const [retryActionId, retryBinding] = retryCall;
    expect(firstActionId).toBe(456);
    expect(retryActionId).toBe(456);
    expect(firstBinding.object).toEqual({ kind: 'Vps', id: 123 });
    expect(retryBinding.object).toBe(firstBinding.object);
    expect(firstBinding.mutationGeneration).toBe(generation);
    expect(retryBinding.mutationGeneration).toBe(generation);
    expect(firstBinding.objectLabel).toBe('accepted-vps');
    expect(retryBinding.objectLabel).toBe('accepted-vps');
    expect(testState.settleLocalLock).not.toHaveBeenCalled();
    expect(testState.releaseLocalLock).not.toHaveBeenCalled();
    expect(await screen.findByTestId('created-vps')).toBeInTheDocument();
    expect(router.state.location.state).toEqual({
      pendingVpsCreate: { vpsId: 123, actionStateId: 456 },
    });
  });

  it('persists an accepted A receipt without projecting a deferred response into user B', async () => {
    const user = userEvent.setup();
    let resolveCreate: ((value: never) => void) | undefined;
    testState.createVps.mockImplementation(() => new Promise((resolve) => { resolveCreate = resolve; }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const router = createMemoryRouter([
      { path: '/app/vps/new', element: <VpsCreatePage /> },
      { path: '/app/vps/:vpsId', element: <div data-testid="created-vps" /> },
    ], { initialEntries: ['/app/vps/new'] });
    const app = () => (
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );
    render(app());

    await user.selectOptions(await screen.findByTestId('vps.create.location'), '3');
    await user.selectOptions(screen.getByTestId('vps.create.os_template'), '6');
    await user.type(screen.getByTestId('vps.create.hostname'), 'accepted-vps');
    await user.click(screen.getByTestId('vps.create.submit'));
    await waitFor(() => expect(testState.createVps).toHaveBeenCalledTimes(1));

    testState.userId = 10;
    await act(async () => { await router.navigate('/app/vps/new?scope=10'); });
    await waitFor(() => expect(testState.readLatest).toHaveBeenCalledWith(10));
    await act(async () => resolveCreate?.({ data: { id: 123 }, meta: { action_state_id: 456 } } as never));

    await waitFor(() => expect(testState.markAccepted).toHaveBeenCalledWith(expect.objectContaining({
      userId: 9,
      actionStateId: 456,
      candidateVpsId: 123,
    })));
    expect(testState.acquireLocalLock).not.toHaveBeenCalled();
    expect(testState.trackActionState).not.toHaveBeenCalled();
    expect(testState.openTasks).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe('/app/vps/new');
    expect(screen.queryByTestId('created-vps')).not.toBeInTheDocument();
    expect(screen.queryByTestId('vps.create.accepted')).not.toBeInTheDocument();
  });

  it('finishes the exact A lock bind without exposing Tasks or navigation when scope changes during acquire', async () => {
    const user = userEvent.setup();
    const generation = Object.freeze({}) as LocalMutationGeneration;
    let resolveAcquire: ((value: LocalMutationGeneration) => void) | undefined;
    testState.acquireLocalLock.mockImplementation((_ref: unknown, options?: { durable?: boolean }) => {
      if (options?.durable) return new Promise((resolve) => { resolveAcquire = resolve; });
      return undefined;
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const router = createMemoryRouter([
      { path: '/app/vps/new', element: <VpsCreatePage /> },
      { path: '/app/vps/:vpsId', element: <div data-testid="created-vps" /> },
    ], { initialEntries: ['/app/vps/new'] });
    const app = () => (
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );
    render(app());

    await user.selectOptions(await screen.findByTestId('vps.create.location'), '3');
    await user.selectOptions(screen.getByTestId('vps.create.os_template'), '6');
    await user.type(screen.getByTestId('vps.create.hostname'), 'accepted-vps');
    await user.click(screen.getByTestId('vps.create.submit'));
    await waitFor(() => expect(testState.acquireLocalLock).toHaveBeenCalledWith(
      { kind: 'Vps', id: 123 },
      { durable: true },
    ));

    testState.userId = 10;
    await act(async () => { await router.navigate('/app/vps/new?scope=10'); });
    await waitFor(() => expect(testState.readLatest).toHaveBeenCalledWith(10));
    await act(async () => resolveAcquire?.(generation));

    await waitFor(() => expect(testState.acquireLocalLock).toHaveBeenCalledTimes(3));
    expect(testState.acquireLocalLock).toHaveBeenNthCalledWith(2, { kind: 'Vps', id: 123 }, {
      actionStateId: 456,
      generation,
    });
    expect(testState.acquireLocalLock).toHaveBeenNthCalledWith(3, { kind: 'Vps', id: 123 }, {
      actionStateId: 456,
      generation,
    });
    expect(testState.trackActionState).not.toHaveBeenCalled();
    expect(testState.openTasks).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe('/app/vps/new');
    expect(screen.queryByTestId('created-vps')).not.toBeInTheDocument();
    expect(screen.queryByTestId('vps.create.accepted')).not.toBeInTheDocument();
  });
});
