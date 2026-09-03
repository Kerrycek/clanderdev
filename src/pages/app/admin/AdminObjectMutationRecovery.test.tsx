import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HaveApiError } from '../../../lib/api/haveapi';
import type { LocalLock } from '../../../lib/localLocks';
import type { ObjectRef } from '../../../lib/objectRef';
import { AdminObjectMutationRecovery } from './AdminObjectMutationRecovery';

const testState = vi.hoisted(() => ({
  localLocks: [] as LocalLock[],
  openTasks: vi.fn(),
  acknowledge: vi.fn(),
}));

vi.mock('../../../app/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../components/layout/ChromeContext', () => ({
  useChrome: () => ({
    localLocks: testState.localLocks,
    openTasks: testState.openTasks,
    acknowledgeUncertainLocalLock: testState.acknowledge,
  }),
}));

function guard(object: ObjectRef, phase: 'pending' | 'uncertain', generation = `${phase}-generation`): LocalLock {
  return {
    key: `${object.kind}:${object.id}`,
    kind: object.kind,
    id: object.id,
    acquiredAt: 1,
    expiresAt: 1,
    [phase]: true,
    uncertaintyId: generation,
  };
}

function renderPanel(args?: {
  object?: ObjectRef;
  refetchObject?: () => Promise<{ data?: unknown; error?: unknown; isError: boolean }>;
  refetchChains?: () => Promise<{ data?: unknown; error?: unknown; isError: boolean }>;
  allowTerminalNotFound?: boolean;
  online?: boolean;
}) {
  const object = args?.object ?? { kind: 'Node', id: 41 };
  const refetchObject = args?.refetchObject ?? vi.fn().mockResolvedValue({ data: { id: object.id }, isError: false });
  const refetchChains = args?.refetchChains ?? vi.fn().mockResolvedValue({ data: [], isError: false });
  render(
    <AdminObjectMutationRecovery
      object={object}
      refetchObject={refetchObject}
      refetchChains={refetchChains}
      online={args?.online ?? true}
      allowTerminalNotFound={args?.allowTerminalNotFound}
      testIdPrefix="recovery"
    />,
  );
  return { refetchObject, refetchChains };
}

async function reviewAndVerify() {
  const user = userEvent.setup();
  await user.click(screen.getByTestId('recovery.open_tasks'));
  await user.click(screen.getByTestId('recovery.verify'));
  return user;
}

describe('AdminObjectMutationRecovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.localLocks = [];
  });

  it('shows an exact pending marker but never offers a path to clear it', async () => {
    const object = { kind: 'Node', id: 41 } as const;
    testState.localLocks = [guard(object, 'pending')];
    const { refetchObject, refetchChains } = renderPanel({ object });

    expect(screen.getByTestId('recovery.pending')).toBeInTheDocument();
    expect(screen.queryByTestId('recovery.verify')).not.toBeInTheDocument();
    expect(screen.getByTestId('recovery.acknowledge')).toBeDisabled();
    await userEvent.click(screen.getByTestId('recovery.open_tasks'));
    expect(refetchObject).not.toHaveBeenCalled();
    expect(refetchChains).not.toHaveBeenCalled();
    expect(testState.acknowledge).not.toHaveBeenCalled();
  });

  it('keeps acknowledgement disabled when the exact fresh refetch fails', async () => {
    const object = { kind: 'Node', id: 41 } as const;
    testState.localLocks = [guard(object, 'uncertain')];
    renderPanel({
      object,
      refetchObject: vi.fn().mockResolvedValue({ data: undefined, error: new Error('load failed'), isError: true }),
    });

    await reviewAndVerify();
    expect(await screen.findByTestId('recovery.error')).toHaveTextContent('vps.mutation.uncertain.refresh_failed');
    expect(screen.getByTestId('recovery.acknowledge')).toBeDisabled();
    expect(testState.acknowledge).not.toHaveBeenCalled();
  });

  it('refuses cached-looking proof while the browser is offline', async () => {
    const object = { kind: 'Node', id: 41 } as const;
    testState.localLocks = [guard(object, 'uncertain')];
    const { refetchObject, refetchChains } = renderPanel({ object, online: false });

    await reviewAndVerify();
    expect(await screen.findByTestId('recovery.error')).toHaveTextContent('vps.mutation.uncertain.refresh_failed');
    expect(screen.getByTestId('recovery.acknowledge')).toBeDisabled();
    expect(refetchObject).not.toHaveBeenCalled();
    expect(refetchChains).not.toHaveBeenCalled();
  });

  it('surfaces an active exact-object chain and keeps the lock', async () => {
    const object = { kind: 'Node', id: 41 } as const;
    testState.localLocks = [guard(object, 'uncertain')];
    renderPanel({
      object,
      refetchChains: vi.fn().mockResolvedValue({ data: [{ id: 90, state: 'queued' }], isError: false }),
    });

    await reviewAndVerify();
    expect(await screen.findByTestId('recovery.error')).toHaveTextContent('vps.mutation.uncertain.still_busy');
    expect(screen.getByTestId('recovery.acknowledge')).toBeDisabled();
    expect(testState.openTasks).toHaveBeenCalledTimes(2);
    expect(testState.acknowledge).not.toHaveBeenCalled();
  });

  it('acknowledges only the exact uncertain generation after fresh exact object and idle-chain proof', async () => {
    const object = { kind: 'Node', id: 41 } as const;
    testState.localLocks = [guard(object, 'uncertain', 'node-generation-41')];
    const user = await reviewAndVerifyAfterRender({ object });

    await waitFor(() => expect(screen.getByTestId('recovery.acknowledge')).toBeEnabled());
    await user.click(screen.getByTestId('recovery.acknowledge'));
    expect(testState.acknowledge).toHaveBeenCalledWith(object, 'node-generation-41');
  });

  it('accepts an exact MigrationPlan 404 as terminal only after fresh idle-chain proof', async () => {
    const object = { kind: 'MigrationPlan', id: 77 } as const;
    testState.localLocks = [guard(object, 'uncertain', 'plan-delete-generation')];
    const notFound = new HaveApiError({ status: false, message: 'missing' }, 'HTTP 404', 404);
    const user = await reviewAndVerifyAfterRender({
      object,
      allowTerminalNotFound: true,
      refetchObject: vi.fn().mockResolvedValue({ data: undefined, error: notFound, isError: true }),
    });

    await waitFor(() => expect(screen.getByTestId('recovery.acknowledge')).toBeEnabled());
    await user.click(screen.getByTestId('recovery.acknowledge'));
    expect(testState.acknowledge).toHaveBeenCalledWith(object, 'plan-delete-generation');
  });

  it('rechecks immediately before acknowledgement and keeps the generation when a chain became busy', async () => {
    const object = { kind: 'Node', id: 41 } as const;
    testState.localLocks = [guard(object, 'uncertain', 'node-generation-41')];
    const refetchChains = vi.fn()
      .mockResolvedValueOnce({ data: [], isError: false })
      .mockResolvedValueOnce({ data: [{ id: 91, state: 'queued' }], isError: false });
    const user = await reviewAndVerifyAfterRender({ object, refetchChains });

    await waitFor(() => expect(screen.getByTestId('recovery.acknowledge')).toBeEnabled());
    await user.click(screen.getByTestId('recovery.acknowledge'));
    expect(await screen.findByTestId('recovery.error')).toHaveTextContent('vps.mutation.uncertain.still_busy');
    expect(testState.acknowledge).not.toHaveBeenCalled();
    expect(refetchChains).toHaveBeenCalledTimes(2);
  });

  it('ignores a guarded marker belonging to another route object', () => {
    testState.localLocks = [guard({ kind: 'Node', id: 99 }, 'uncertain')];
    renderPanel({ object: { kind: 'Node', id: 41 } });
    expect(screen.queryByTestId('recovery.uncertain')).not.toBeInTheDocument();
  });
});

async function reviewAndVerifyAfterRender(args: Parameters<typeof renderPanel>[0]) {
  renderPanel(args);
  return reviewAndVerify();
}
