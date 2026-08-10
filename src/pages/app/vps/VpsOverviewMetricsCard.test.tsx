import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Vps } from '../../../lib/api/vps';
import { fetchVpsStatuses } from '../../../lib/api/vps';
import { VpsOverviewMetricsCard } from './VpsOverviewMetricsCard';

vi.mock('../../../app/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../../lib/refreshTiers', () => ({
  useTierSlowIntervalMs: () => false,
}));

vi.mock('../../../lib/api/vps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api/vps')>();
  return {
    ...actual,
    fetchVpsStatuses: vi.fn(),
  };
});

vi.mock('../../../components/ui/TimeSeriesChart', () => ({
  TimeSeriesChart: (props: { points: Array<{ x: number; y: number }>; testId?: string }) => (
    <div data-testid={props.testId} data-points={JSON.stringify(props.points)} />
  ),
}));

const statusesMock = vi.mocked(fetchVpsStatuses);

function renderCard(path = '/app/vps/42') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <VpsOverviewMetricsCard
          vps={{ id: 42, hostname: 'example', memory: 1024, diskspace: 4096 } as Vps}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('VpsOverviewMetricsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statusesMock.mockResolvedValue({
      data: [
        {
          id: 1,
          created_at: '2026-08-10T10:00:00.000Z',
          loadavg1: 0.5,
          loadavg5: 0.25,
          total_memory: 1024,
          used_memory: 512,
          total_diskspace: 4096,
          used_diskspace: 1024,
        },
        {
          id: 2,
          created_at: '2026-08-10T10:05:00.000Z',
          loadavg1: 0.75,
          loadavg5: 0.5,
          total_memory: 1024,
          used_memory: 640,
          total_diskspace: 4096,
          used_diskspace: 1536,
        },
      ],
      meta: {},
    } as never);
  });

  it('passes Unix seconds to charts and exposes the selected window as a pressed button', async () => {
    const user = userEvent.setup();
    renderCard();

    const chart = await screen.findByTestId('vps.overview.metrics.chart.load1');
    const points = JSON.parse(chart.getAttribute('data-points') ?? '[]') as Array<{ x: number; y: number }>;

    expect(points).toEqual([
      { x: Date.parse('2026-08-10T10:00:00.000Z') / 1000, y: 0.5 },
      { x: Date.parse('2026-08-10T10:05:00.000Z') / 1000, y: 0.75 },
    ]);
    expect(points[0]?.x).toBeLessThan(10_000_000_000);

    const window24h = screen.getByTestId('vps.overview.metrics.window.24h');
    const window7d = screen.getByTestId('vps.overview.metrics.window.7d');
    expect(window24h).toHaveAttribute('aria-pressed', 'true');
    expect(window7d).toHaveAttribute('aria-pressed', 'false');

    await user.click(window7d);

    expect(window24h).toHaveAttribute('aria-pressed', 'false');
    expect(window7d).toHaveAttribute('aria-pressed', 'true');
  });
});
