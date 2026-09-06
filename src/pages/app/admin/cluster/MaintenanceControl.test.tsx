// i18n-ignore-file
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HaveApiError } from '../../../../lib/api/haveapi';
import {
  canManageClusterMaintenance,
  MaintenanceControl,
  parseMaintenanceState,
  reconcileMaintenanceAttempt,
} from './MaintenanceControl';

vi.mock('../../../../app/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('../../../../app/toasts', () => ({ useToasts: () => ({ pushToast: vi.fn() }) }));

describe('maintenance state', () => {
  it('distinguishes owned and inherited locks', () => {
    expect(parseMaintenanceState('no')).toBe('no');
    expect(parseMaintenanceState('lock')).toBe('lock');
    expect(parseMaintenanceState('master_lock')).toBe('master_lock');
  });

  it('settles ambiguous lock read-backs only from exact state and reason evidence', () => {
    const attempt = {
      lock: true,
      reason: 'Disk replacement',
      previousState: 'no' as const,
    };

    expect(reconcileMaintenanceAttempt(attempt, { value: 'lock', reason: 'Disk replacement' })).toBe('applied');
    expect(reconcileMaintenanceAttempt(attempt, { value: 'no', reason: '' })).toBe('not_applied');
    expect(reconcileMaintenanceAttempt(attempt, { value: 'lock', reason: 'Different work' })).toBe('unknown');
    expect(reconcileMaintenanceAttempt(attempt, { value: 'unexpected', reason: 'Disk replacement' })).toBe('unknown');
    expect(reconcileMaintenanceAttempt(
      { lock: true, previousState: 'no' },
      { value: 'no', reason: null },
    )).toBe('not_applied');
  });

  it('recognizes a removed direct lock even when inherited maintenance becomes visible', () => {
    const attempt = {
      lock: false,
      previousState: 'lock' as const,
      previousReason: 'Disk replacement',
    };

    expect(reconcileMaintenanceAttempt(attempt, { value: 'no', reason: '' })).toBe('applied');
    expect(reconcileMaintenanceAttempt(attempt, { value: 'master_lock', reason: 'Node maintenance' })).toBe('applied');
    expect(reconcileMaintenanceAttempt(attempt, { value: 'lock', reason: 'Disk replacement' })).toBe('not_applied');
    expect(reconcileMaintenanceAttempt(attempt, { value: 'lock', reason: 'Different work' })).toBe('unknown');
  });

  it('exposes maintenance state and mutations only to API admins', () => {
    expect(canManageClusterMaintenance('admin')).toBe(true);
    expect(canManageClusterMaintenance('support')).toBe(false);
    expect(canManageClusterMaintenance('user')).toBe(false);
  });

  it('shows an inherited lock without an unlock action', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MaintenanceControl
          value="master_lock"
          label="Prague"
          testId="maintenance"
          setMaintenance={vi.fn()}
          onChanged={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText('admin.cluster.maintenance.state.master_lock')).toBeVisible();
    expect(screen.queryByTestId('maintenance.unlock')).not.toBeInTheDocument();
  });

  it.each([
    ['network error', new TypeError('network connection lost')],
    ['HTTP 503', new HaveApiError({ status: false, message: 'server unavailable' }, 'server unavailable', 503)],
  ])('fails closed after an ambiguous %s when no exact read-back is available', async (_label, error) => {
    const setMaintenance = vi.fn().mockRejectedValue(error);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MaintenanceControl
          value="no"
          label="Prague"
          testId="maintenance"
          setMaintenance={setMaintenance}
          onChanged={vi.fn()}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('maintenance.lock'));
    fireEvent.click(screen.getByTestId('maintenance.lock_dialog.confirm'));

    await waitFor(() => expect(screen.getByTestId('maintenance.verification_required')).toBeVisible());
    expect(screen.getByTestId('maintenance.lock_dialog.confirm')).toBeDisabled();
    expect(screen.getByTestId('maintenance.lock')).toBeDisabled();
    fireEvent.click(screen.getByTestId('maintenance.lock_dialog.confirm'));
    expect(setMaintenance).toHaveBeenCalledTimes(1);
  });
});
