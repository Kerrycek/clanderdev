import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AppModeProvider } from '../../app/appMode';
import { ClusterHealthCard, summarizeNodes } from './DashboardOperationalCards';

vi.mock('../../app/i18n', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      if (key === 'dashboard.section.cluster.location_summary') {
        return `Up: ${vars?.['up']} · Maintenance: ${vars?.['maintenance']} · Down: ${vars?.['down']} · Total: ${vars?.['total']}`;
      }
      if (key === 'dashboard.section.cluster.location_summary_compact') {
        return `${vars?.['up']}/${vars?.['total']} online`;
      }
      if (key === 'dashboard.section.cluster.location_bar_aria') return `Node status in ${vars?.['location']}`;
      if (key === 'dashboard.section.cluster.status_summary.up') return `${vars?.['count']} online`;
      if (key === 'dashboard.section.cluster.status_summary.maintenance') return `${vars?.['count']} maintenance`;
      if (key === 'dashboard.section.cluster.status_summary.down') return `${vars?.['count']} down`;
      if (key === 'dashboard.section.cluster.status_summary.unknown') return `${vars?.['count']} unknown`;
      if (key === 'dashboard.section.cluster.status.up') return 'Online';
      if (key === 'dashboard.section.cluster.status.maintenance') return 'Maintenance';
      if (key === 'dashboard.section.cluster.status.down') return 'Down';
      if (key === 'dashboard.section.cluster.status.unknown') return 'Unknown';
      return key;
    },
  }),
}));

describe('ClusterHealthCard', () => {
  it('renders authenticated locations with the shared separated panel layout', () => {
    const nodeData = summarizeNodes(
      [
        { name: 'brq-node', status: false, location: { label: 'Brno' } },
        { name: 'prg-node', status: true, location: { label: 'Praha' } },
      ],
      'Unknown',
    );

    render(
      <MemoryRouter>
        <AppModeProvider mode="user">
          <ClusterHealthCard isLoading={false} isError={false} nodeData={nodeData} nodeIssueCount={1} />
        </AppModeProvider>
      </MemoryRouter>,
    );

    const praguePanel = screen.getByTestId('app.dashboard.cluster.location.Praha');
    const brnoPanel = screen.getByTestId('app.dashboard.cluster.location.Brno');

    for (const panel of [praguePanel, brnoPanel]) {
      expect(panel).toHaveAttribute('data-cluster-location-layout', 'panel');
      expect(panel).toHaveClass('rounded-lg', 'border-info-border', 'bg-surface', 'shadow-card');
      expect(within(panel).getByRole('img')).toBeInTheDocument();
    }

    expect(within(praguePanel).getAllByText('prg-node')).toHaveLength(2);
    expect(within(praguePanel).queryAllByText('brq-node')).toHaveLength(0);
    expect(within(brnoPanel).getAllByText('brq-node')).toHaveLength(2);
    expect(within(brnoPanel).queryAllByText('prg-node')).toHaveLength(0);
    expect(within(praguePanel).getAllByText('Up: 1 · Maintenance: 0 · Down: 0 · Total: 1')).toHaveLength(1);
    expect(within(brnoPanel).getAllByText('Up: 0 · Maintenance: 0 · Down: 1 · Total: 1')).toHaveLength(1);
    expect(within(praguePanel).getByTestId('app.dashboard.cluster.mobile.Praha')).toContainElement(
      within(praguePanel).getByTestId('app.dashboard.cluster.mobile-node.Praha.prg-node'),
    );
    expect(within(brnoPanel).getByTestId('app.dashboard.cluster.mobile.Brno')).toContainElement(
      within(brnoPanel).getByTestId('app.dashboard.cluster.mobile-node.Brno.brq-node'),
    );
  });
});
