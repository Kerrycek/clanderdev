import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { vpsStop } from '../../../lib/api/vps';
import { VpsLifecyclePage } from './VpsLifecyclePage';
import { preflightVpsNotBusy } from './vpsPreflight';

const testState = vi.hoisted(() => ({
  vpsId: 101,
  acquireLocalLock: vi.fn(),
  settleLocalLock: vi.fn(),
  trackActionState: vi.fn(),
  openTasks: vi.fn(),
  refreshVps: vi.fn(),
  refreshChains: vi.fn(),
}));

vi.mock('../../../app/auth', () => ({
  useAuth: () => ({ role: 'admin' }),
}));

vi.mock('../../../app/appMode', () => ({
  useAppMode: () => ({ mode: 'admin', basePath: '/admin' }),
}));

vi.mock('../../../app/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../components/layout/ChromeContext', () => ({
  useChrome: () => ({
    acquireLocalLock: testState.acquireLocalLock,
    settleLocalLock: testState.settleLocalLock,
    trackActionState: testState.trackActionState,
    openTasks: testState.openTasks,
  }),
}));

vi.mock('../../../lib/gates/vps', () => ({
  gateVpsAction: () => ({ allowed: true }),
  gateVpsMutation: () => ({ allowed: true }),
}));

vi.mock('../../../lib/api/vps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api/vps')>();
  return { ...actual, vpsStop: vi.fn() };
});

vi.mock('./vpsPreflight', () => ({
  preflightVpsNotBusy: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./VpsContext', () => ({
  useVps: () => ({
    vps: {
      id: testState.vpsId,
      hostname: `vps-${testState.vpsId}`,
      object_state: 'active',
      is_running: true,
      user: { id: 9 },
      node: { id: 11, location: { id: 3 } },
      os_template: { id: 1 },
    },
    refetch: testState.refreshVps,
    refetchChains: testState.refreshChains,
    vpsRef: { kind: 'Vps', id: testState.vpsId },
    busyTransaction: false,
    busyLocalLock: false,
    ipAddresses: [],
    ipAddressesLoading: false,
    ipAddressesError: false,
  }),
}));

const vpsStopMock = vi.mocked(vpsStop);
const preflightMock = vi.mocked(preflightVpsNotBusy);

describe('VpsLifecyclePage durable mutation snapshots', () => {
  beforeEach(() => {
    testState.vpsId = 101;
    vi.clearAllMocks();
    vpsStopMock.mockResolvedValue({ data: {}, meta: {} } as never);
    preflightMock.mockResolvedValue(undefined);
  });

  it('keeps the submitted VPS and force payload while onMutate awaits across a route/form rerender', async () => {
    const user = userEvent.setup();
    let resolveAcquire: ((generation: never) => void) | undefined;
    const generation = {} as never;
    testState.acquireLocalLock.mockImplementation(() => new Promise((resolve) => {
      resolveAcquire = resolve;
    }));

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const router = createMemoryRouter([
      {
        path: '/admin/vps/:vpsId/lifecycle/:lifecycleAction',
        element: <VpsLifecyclePage />,
      },
    ], { initialEntries: ['/admin/vps/101/lifecycle/stop'] });

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByTestId('vps.lifecycle.stop.force'));
    await user.click(screen.getByTestId('vps.lifecycle.stop.confirm'));
    await user.click(screen.getByTestId('vps.lifecycle.stop.submit'));

    await waitFor(() => expect(testState.acquireLocalLock).toHaveBeenCalledWith(
      { kind: 'Vps', id: 101 },
      { durable: true },
    ));
    expect(vpsStopMock).not.toHaveBeenCalled();

    testState.vpsId = 202;
    await act(async () => {
      await router.navigate('/admin/vps/202/lifecycle/stop');
    });
    await user.click(screen.getByTestId('vps.lifecycle.stop.force'));
    expect(screen.getByTestId('vps.lifecycle.stop.force')).not.toBeChecked();

    await act(async () => {
      resolveAcquire?.(generation);
    });

    await waitFor(() => expect(vpsStopMock).toHaveBeenCalledWith(101, { force: true }));
    expect(preflightMock).toHaveBeenCalledWith(expect.objectContaining({
      vpsId: 101,
      knownBusy: false,
    }));
    await waitFor(() => expect(testState.settleLocalLock).toHaveBeenCalledWith(
      { kind: 'Vps', id: 101 },
      null,
      generation,
    ));
  });
});
