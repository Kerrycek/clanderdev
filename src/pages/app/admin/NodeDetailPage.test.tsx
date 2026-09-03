import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setNodeMaintenance } from '../../../lib/api/nodes';
import type { LocalLock } from '../../../lib/localLocks';
import { preflightNodeNotBusy } from './adminPreflight';
import { NodeDetailPageRoute } from './NodeDetailPageRoute';

const testState = vi.hoisted(() => ({
  localLocks: [] as LocalLock[],
  acquireLocalLock: vi.fn(),
  settleLocalLock: vi.fn(),
  trackActionState: vi.fn(),
  openTasks: vi.fn(),
  acknowledgeUncertainLocalLock: vi.fn(),
}));

vi.mock('../../../app/appMode', () => ({
  useAppMode: () => ({ mode: 'admin', basePath: '/admin' }),
}));

vi.mock('../../../app/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../components/layout/ChromeContext', () => ({
  useChrome: () => ({
    localLocks: testState.localLocks,
    acquireLocalLock: testState.acquireLocalLock,
    settleLocalLock: testState.settleLocalLock,
    trackActionState: testState.trackActionState,
    openTasks: testState.openTasks,
    acknowledgeUncertainLocalLock: testState.acknowledgeUncertainLocalLock,
    isLocallyLocked: () => false,
  }),
}));

vi.mock('../../../lib/useNetworkStatus', () => ({ useNetworkStatus: () => true }));
vi.mock('../../../lib/refreshTiers', () => ({
  useTierBIntervalMs: () => false,
  useTierCIntervalMs: () => false,
  useTierSlowIntervalMs: () => false,
}));
vi.mock('../../../lib/gates/node', () => ({ gateNodeAction: () => ({ allowed: true }) }));
vi.mock('./nodes/NodeLifecycleHeaderActions', () => ({ NodeLifecycleHeaderActions: () => null }));

vi.mock('../../../lib/api/nodes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api/nodes')>();
  return {
    ...actual,
    fetchNode: vi.fn(async (nodeId: number) => ({
      data: { id: nodeId, domain_name: `node-${nodeId}`, maintenance_lock: false },
      meta: {},
    })),
    fetchNodes: vi.fn().mockResolvedValue({ data: [], meta: {} }),
    fetchNodeStatuses: vi.fn().mockResolvedValue({ data: [], meta: {} }),
    fetchNodePools: vi.fn().mockResolvedValue({ data: [], meta: {} }),
    setNodeMaintenance: vi.fn(),
    evacuateNode: vi.fn(),
  };
});

vi.mock('../../../lib/api/public', () => ({
  fetchPublicNodeStatus: vi.fn().mockResolvedValue({ data: [], meta: {} }),
}));

vi.mock('../../../lib/api/transactions', () => ({
  fetchActiveTransactionChains: vi.fn().mockResolvedValue([]),
  fetchTransactions: vi.fn().mockResolvedValue({ data: [], meta: {} }),
}));

vi.mock('./adminPreflight', () => ({
  preflightNodeNotBusy: vi.fn().mockResolvedValue(undefined),
}));

const maintenanceMock = vi.mocked(setNodeMaintenance);
const preflightMock = vi.mocked(preflightNodeNotBusy);

describe('NodeDetailPage durable mutation snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.localLocks = [];
    testState.acquireLocalLock.mockResolvedValue({} as never);
    maintenanceMock.mockResolvedValue({ data: undefined, meta: { action_state_id: 501 } } as never);
    preflightMock.mockResolvedValue(undefined);
  });

  it('keeps the submitted node, reason and exact lock while onMutate awaits across a route/form rerender', async () => {
    const user = userEvent.setup();
    const generation = {} as never;
    let resolveAcquire: ((value: never) => void) | undefined;
    testState.acquireLocalLock.mockImplementation(() => new Promise((resolve) => {
      resolveAcquire = resolve;
    }));

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const router = createMemoryRouter([
      { path: '/admin/nodes/:nodeId', element: <NodeDetailPageRoute /> },
    ], { initialEntries: ['/admin/nodes/101?section=maintenance'] });

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    const reason = await screen.findByPlaceholderText('admin.node.maintenance.reason_placeholder');
    await user.type(reason, 'source reason');
    await user.click(screen.getByTestId('admin.node.maintenance.lock'));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'common.lock' }));

    await waitFor(() => expect(testState.acquireLocalLock).toHaveBeenCalledWith(
      { kind: 'Node', id: 101 },
      { durable: true },
    ));
    expect(maintenanceMock).not.toHaveBeenCalled();

    await act(async () => {
      await router.navigate('/admin/nodes/202?section=maintenance');
    });
    const rerenderedReason = await screen.findByPlaceholderText('admin.node.maintenance.reason_placeholder');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(rerenderedReason).toHaveValue('');
    fireEvent.change(rerenderedReason, { target: { value: 'destination reason' } });

    await act(async () => {
      resolveAcquire?.(generation);
    });

    await waitFor(() => expect(maintenanceMock).toHaveBeenCalledWith(101, {
      lock: true,
      reason: 'source reason',
    }));
    expect(preflightMock).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 101, knownBusy: false }));
    expect(testState.trackActionState).toHaveBeenCalledWith(501, expect.objectContaining({
      object: { kind: 'Node', id: 101 },
      objectLabel: 'node-101',
      mutationGeneration: generation,
    }));
    await waitFor(() => expect(testState.settleLocalLock).toHaveBeenCalledWith(
      { kind: 'Node', id: 101 },
      null,
      generation,
    ));
  });

  it('drops an unsubmitted source-node dialog and draft when the route id changes', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createMemoryRouter([
      { path: '/admin/nodes/:nodeId', element: <NodeDetailPageRoute /> },
    ], { initialEntries: ['/admin/nodes/101?section=maintenance'] });

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await user.type(await screen.findByPlaceholderText('admin.node.maintenance.reason_placeholder'), 'stale reason');
    await user.click(screen.getByTestId('admin.node.maintenance.lock'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await act(async () => {
      await router.navigate('/admin/nodes/202?section=maintenance');
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByPlaceholderText('admin.node.maintenance.reason_placeholder')).toHaveValue('');
    expect(maintenanceMock).not.toHaveBeenCalled();
    expect(testState.acquireLocalLock).not.toHaveBeenCalled();
  });

  it('exposes exact uncertain-node recovery and acknowledges its exact generation after two fresh idle proofs', async () => {
    const user = userEvent.setup();
    testState.localLocks = [{
      key: 'Node:101', kind: 'Node', id: 101, acquiredAt: 1, expiresAt: 1,
      uncertain: true, uncertaintyId: 'node-generation-101',
    }];
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createMemoryRouter([
      { path: '/admin/nodes/:nodeId', element: <NodeDetailPageRoute /> },
    ], { initialEntries: ['/admin/nodes/101'] });

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId('admin.node.mutation.recovery.uncertain')).toBeInTheDocument();
    await user.click(screen.getByTestId('admin.node.mutation.recovery.open_tasks'));
    await user.click(screen.getByTestId('admin.node.mutation.recovery.verify'));
    await waitFor(() => expect(screen.getByTestId('admin.node.mutation.recovery.acknowledge')).toBeEnabled());
    await user.click(screen.getByTestId('admin.node.mutation.recovery.acknowledge'));
    await waitFor(() => expect(testState.acknowledgeUncertainLocalLock).toHaveBeenCalledWith(
      { kind: 'Node', id: 101 },
      'node-generation-101',
    ));
  });
});
