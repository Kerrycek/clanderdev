import React, { type ComponentProps } from 'react';

import { Button } from '../../../../components/ui/Button';
import { NodeEvacuationCard } from './NodeEvacuationCard';
import { NodeMaintenanceCard } from './NodeMaintenanceCard';
import { NodeMetricsCard } from './NodeMetricsCard';
import { NodeOverviewCards } from './NodeOverviewCards';
import { NodeStatusSamplesCard } from './NodeStatusSamplesCard';
import { NodeTransactionsCard } from './NodeTransactionsCard';
import type { NodeDetailSection } from './NodeStorageModel';

type Translate = ComponentProps<typeof NodeOverviewCards>['t'];

const SECTION_TABS: Array<{
  id: NodeDetailSection;
  label: 'admin.node.tabs.overview' | 'admin.node.tabs.storage' | 'admin.node.tabs.maintenance';
}> = [
  { id: 'overview', label: 'admin.node.tabs.overview' },
  { id: 'storage', label: 'admin.node.tabs.storage' },
  { id: 'maintenance', label: 'admin.node.tabs.maintenance' },
];

export function NodeDetailTabs(props: {
  active: NodeDetailSection;
  onChange: (section: NodeDetailSection) => void;
  t: Translate;
}) {
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const currentIndex = SECTION_TABS.findIndex((section) => section.id === props.active);
    let nextIndex: number | undefined;

    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % SECTION_TABS.length;
    if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + SECTION_TABS.length) % SECTION_TABS.length;
    }
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = SECTION_TABS.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    const nextSection = SECTION_TABS[nextIndex];
    if (!nextSection) return;
    props.onChange(nextSection.id);
    document.getElementById(`admin-node-tab-${nextSection.id}`)?.focus();
  }

  return (
    <div
      className="flex flex-wrap gap-2 rounded-lg border border-border bg-surface p-2"
      role="tablist"
      aria-label={props.t('admin.node.tabs.aria')}
      data-testid="admin.node.tabs"
      onKeyDown={handleKeyDown}
    >
      {SECTION_TABS.map((section) => (
        <Button
          key={section.id}
          id={`admin-node-tab-${section.id}`}
          testId={`admin.node.tab.${section.id}`}
          variant={props.active === section.id ? 'secondary' : 'ghost'}
          role="tab"
          aria-selected={props.active === section.id}
          aria-controls={`admin-node-panel-${section.id}`}
          tabIndex={props.active === section.id ? 0 : -1}
          onClick={() => props.onChange(section.id)}
        >
          {props.t(section.label)}
        </Button>
      ))}
    </div>
  );
}

export function NodeOverviewSection(props: {
  overview: ComponentProps<typeof NodeOverviewCards>;
  metrics: ComponentProps<typeof NodeMetricsCard>;
  statuses: ComponentProps<typeof NodeStatusSamplesCard>;
  transactions: ComponentProps<typeof NodeTransactionsCard>;
}) {
  return (
    <div
      id="admin-node-panel-overview"
      role="tabpanel"
      aria-labelledby="admin-node-tab-overview"
      className="space-y-4"
      data-testid="admin.node.panel.overview"
    >
      <NodeOverviewCards {...props.overview} />
      <NodeMetricsCard {...props.metrics} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <NodeStatusSamplesCard {...props.statuses} />
        <NodeTransactionsCard {...props.transactions} />
      </div>
    </div>
  );
}

export function NodeMaintenanceSection(props: {
  maintenance: ComponentProps<typeof NodeMaintenanceCard>;
  evacuation: ComponentProps<typeof NodeEvacuationCard>;
}) {
  return (
    <div
      id="admin-node-panel-maintenance"
      role="tabpanel"
      aria-labelledby="admin-node-tab-maintenance"
      className="space-y-4"
      data-testid="admin.node.panel.maintenance"
    >
      <NodeMaintenanceCard {...props.maintenance} />
      <NodeEvacuationCard {...props.evacuation} />
    </div>
  );
}
