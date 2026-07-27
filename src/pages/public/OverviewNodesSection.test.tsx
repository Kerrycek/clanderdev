import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { OverviewNodesSection } from './OverviewNodesSection';
import type { PublicNodeLocationGroup } from './OverviewModel';

vi.mock('../../app/i18n', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      if (key === 'public.overview.nodes.location_summary') {
        return `Up: ${vars?.['ok']} · Down: ${vars?.['down']} · Total: ${vars?.['total']}`;
      }
      if (key === 'public.overview.nodes.location_bar_aria') {
        return `Node status in ${vars?.['location']}`;
      }
      if (key === 'state.up') return 'Up';
      if (key === 'state.down') return 'Down';
      return key;
    },
  }),
}));

function group(location: string, status: boolean): PublicNodeLocationGroup {
  return {
    location,
    ok: status ? 1 : 0,
    down: status ? 0 : 1,
    total: 1,
    nodes: [
      {
        name: `${location}-node`,
        status,
        pool_state: 'online',
        vps_count: 3,
        cpu_idle: 75,
        kernel: '6.1',
        cgroup_version: 'cgroup_v2',
      },
    ],
  };
}

describe('OverviewNodesSection', () => {
  it('renders each location as a visually separated section', () => {
    const { container } = render(
      <OverviewNodesSection
        groups={[group('Praha', true), group('Brno', false)]}
        summary={{ ok: 1, down: 1, total: 2 }}
        loading={false}
        error={false}
      />,
    );

    const praguePanels = screen.getAllByTestId('public.nodes.location.Praha');
    const brnoPanels = screen.getAllByTestId('public.nodes.location.Brno');

    expect(praguePanels).toHaveLength(2);
    expect(brnoPanels).toHaveLength(2);
    expect(screen.getAllByText('Up: 1 · Down: 0 · Total: 1')).toHaveLength(2);
    expect(screen.getAllByText('Up: 0 · Down: 1 · Total: 1')).toHaveLength(2);

    for (const panel of [...praguePanels, ...brnoPanels]) {
      expect(panel).toHaveAttribute('data-cluster-location-layout', 'panel');
      expect(panel).toHaveClass('rounded-lg', 'border-info-border', 'bg-surface', 'shadow-card');
    }

    expect(container.querySelector('[data-testid="public.nodes.location.Praha"] summary')).toHaveClass(
      'border-l-4',
      'border-info',
      'bg-info-bg',
    );
    expect(container.querySelector('[data-testid="public.nodes.table.Praha"]')).toHaveTextContent('Praha-node');
    expect(container.querySelector('[data-testid="public.nodes.table.Praha"]')).not.toHaveTextContent('Brno-node');
    expect(container.querySelector('[data-testid="public.nodes.table.Brno"]')).toHaveTextContent('Brno-node');
  });
});
