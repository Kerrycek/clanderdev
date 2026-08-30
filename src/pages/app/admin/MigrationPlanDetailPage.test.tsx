import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMigrationPlanVpsMigration, startMigrationPlan } from '../../../lib/api/migrations';
import type { LocalLock } from '../../../lib/localLocks';
import { preflightMigrationPlanNotBusy } from './adminPreflight';
import { MigrationPlanDetailPageRoute } from './MigrationPlanDetailPageRoute';

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
vi.mock('../../../lib/refreshTiers', () => ({ useTierBIntervalMs: () => false }));
vi.mock('../../../lib/gates/migrationPlan', () => ({
  gateMigrationPlanAction: () => ({ allowed: true }),
}));

vi.mock('../../../lib/api/migrations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api/migrations')>();
  return {
    ...actual,
    fetchMigrationPlan: vi.fn(async (planId: number) => ({
      data: { id: planId, state: 'staged' },
      meta: {},
    })),
    fetchMigrationPlanVpsMigrations: vi.fn().mockResolvedValue({ data: [], meta: {} }),
    createMigrationPlanVpsMigration: vi.fn(),
    startMigrationPlan: vi.fn(),
    cancelMigrationPlan: vi.fn(),
    deleteMigrationPlan: vi.fn(),
  };
});

vi.mock('../../../lib/api/nodes', () => ({
  fetchNodes: vi.fn().mockResolvedValue({ data: [{ id: 7, name: 'node-7' }], meta: {} }),
}));

vi.mock('../../../lib/api/transactions', () => ({
  fetchActiveTransactionChains: vi.fn().mockResolvedValue([]),
}));

vi.mock('./adminPreflight', () => ({
  preflightMigrationPlanNotBusy: vi.fn().mockResolvedValue(undefined),
}));

const startMock = vi.mocked(startMigrationPlan);
const scheduleMock = vi.mocked(createMigrationPlanVpsMigration);
const preflightMock = vi.mocked(preflightMigrationPlanNotBusy);

describe('MigrationPlanDetailPage durable mutation snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.localLocks = [];
    testState.acquireLocalLock.mockResolvedValue({} as never);
    scheduleMock.mockReset();
    startMock.mockResolvedValue({ data: { id: 101 }, meta: { action_state_id: 601 } } as never);
    preflightMock.mockResolvedValue(undefined);
  });

  it('keeps the submitted plan and exact lock while onMutate awaits across a route rerender', async () => {
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
      { path: '/admin/migration-plans/:planId', element: <MigrationPlanDetailPageRoute /> },
    ], { initialEntries: ['/admin/migration-plans/101'] });

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByTestId('admin.migration_plan.start'));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'common.start' }));

    await waitFor(() => expect(testState.acquireLocalLock).toHaveBeenCalledWith(
      { kind: 'MigrationPlan', id: 101 },
      { durable: true },
    ));
    expect(startMock).not.toHaveBeenCalled();

    await act(async () => {
      await router.navigate('/admin/migration-plans/202');
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('#202')).toBeInTheDocument());

    await act(async () => {
      resolveAcquire?.(generation);
    });

    await waitFor(() => expect(startMock).toHaveBeenCalledWith(101));
    expect(preflightMock).toHaveBeenCalledWith(expect.objectContaining({ planId: 101, knownBusy: false }));
    expect(testState.trackActionState).toHaveBeenCalledWith(601, expect.objectContaining({
      object: { kind: 'MigrationPlan', id: 101 },
      objectLabel: '#101',
      mutationGeneration: generation,
    }));
    await waitFor(() => expect(testState.settleLocalLock).toHaveBeenCalledWith(
      { kind: 'MigrationPlan', id: 101 },
      null,
      generation,
    ));
  });

  it('drops an unsubmitted source-plan dialog and scheduling draft when the route id changes', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createMemoryRouter([
      { path: '/admin/migration-plans/:planId', element: <MigrationPlanDetailPageRoute /> },
    ], { initialEntries: ['/admin/migration-plans/101'] });

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    const vpsDraft = await screen.findByPlaceholderText('admin.migration_plan.migrations.schedule.vps_id_placeholder');
    await user.type(vpsDraft, '909');
    await user.click(screen.getByTestId('admin.migration_plan.start'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await act(async () => {
      await router.navigate('/admin/migration-plans/202');
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByPlaceholderText('admin.migration_plan.migrations.schedule.vps_id_placeholder')).toHaveValue(null);
    expect(startMock).not.toHaveBeenCalled();
    expect(testState.acquireLocalLock).not.toHaveBeenCalled();
  });

  it('settles the exact plan generation as uncertain when any batch POST is ambiguous', async () => {
    const user = userEvent.setup();
    const generation = {} as never;
    const ambiguousError = new TypeError('connection lost after submit');
    testState.acquireLocalLock.mockResolvedValue(generation);
    scheduleMock
      .mockResolvedValueOnce({ data: { id: 1 }, meta: { action_state_id: 7010 } } as never)
      .mockRejectedValueOnce(ambiguousError);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const router = createMemoryRouter([
      { path: '/admin/migration-plans/:planId', element: <MigrationPlanDetailPageRoute /> },
    ], { initialEntries: ['/admin/migration-plans/101'] });

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await user.selectOptions(await screen.findByRole('combobox'), '7');
    await user.click(screen.getByText('admin.migration_plan.migrations.schedule.batch.title'));
    await user.type(
      screen.getByPlaceholderText('admin.migration_plan.migrations.schedule.batch.textarea_placeholder'),
      '701 702',
    );
    await user.click(screen.getByRole('button', {
      name: 'admin.migration_plan.migrations.schedule.batch.schedule',
    }));

    await waitFor(() => expect(scheduleMock).toHaveBeenNthCalledWith(2, 101, expect.objectContaining({
      vps: 702,
      dst_node: 7,
    })));
    expect(testState.trackActionState).toHaveBeenCalledWith(7010, expect.objectContaining({
      object: { kind: 'Vps', id: 701 },
    }));
    await waitFor(() => expect(testState.settleLocalLock).toHaveBeenCalledWith(
      { kind: 'MigrationPlan', id: 101 },
      ambiguousError,
      generation,
    ));
    expect(testState.settleLocalLock).not.toHaveBeenCalledWith(
      { kind: 'MigrationPlan', id: 101 },
      null,
      generation,
    );
  });

  it('exposes exact uncertain-plan recovery and acknowledges its exact generation after two fresh idle proofs', async () => {
    const user = userEvent.setup();
    testState.localLocks = [{
      key: 'MigrationPlan:101', kind: 'MigrationPlan', id: 101, acquiredAt: 1, expiresAt: 1,
      uncertain: true, uncertaintyId: 'plan-generation-101',
    }];
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createMemoryRouter([
      { path: '/admin/migration-plans/:planId', element: <MigrationPlanDetailPageRoute /> },
    ], { initialEntries: ['/admin/migration-plans/101'] });

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId('admin.migration_plan.mutation.recovery.uncertain')).toBeInTheDocument();
    await user.click(screen.getByTestId('admin.migration_plan.mutation.recovery.open_tasks'));
    await user.click(screen.getByTestId('admin.migration_plan.mutation.recovery.verify'));
    await waitFor(() => expect(screen.getByTestId('admin.migration_plan.mutation.recovery.acknowledge')).toBeEnabled());
    await user.click(screen.getByTestId('admin.migration_plan.mutation.recovery.acknowledge'));
    await waitFor(() => expect(testState.acknowledgeUncertainLocalLock).toHaveBeenCalledWith(
      { kind: 'MigrationPlan', id: 101 },
      'plan-generation-101',
    ));
  });
});
