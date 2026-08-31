// i18n-ignore-file
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MaintenanceControl, parseMaintenanceState } from './MaintenanceControl';

vi.mock('../../../../app/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('../../../../app/toasts', () => ({ useToasts: () => ({ pushToast: vi.fn() }) }));

describe('maintenance state', () => {
  it('distinguishes owned and inherited locks', () => {
    expect(parseMaintenanceState('no')).toBe('no');
    expect(parseMaintenanceState('lock')).toBe('lock');
    expect(parseMaintenanceState('master_lock')).toBe('master_lock');
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
});
