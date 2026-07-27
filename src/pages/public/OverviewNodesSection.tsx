import React from 'react';

import { useI18n } from '../../app/i18n';
import { ClusterLocationPanel } from '../../components/cluster/ClusterLocationPanel';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { Table } from '../../components/ui/Table';
import type { PublicNodeLocationGroup, PublicNodeSummary } from './OverviewModel';

function nodeStorageLabel(node: PublicNodeLocationGroup['nodes'][number]): string {
  const scan = typeof node['pool_scan'] === 'string' ? node['pool_scan'] : '';
  const pct = typeof node['pool_scan_percent'] === 'number' && Number.isFinite(node['pool_scan_percent'])
    ? `${node['pool_scan_percent'].toFixed(1)} %`
    : '—';
  if (scan === 'scrub' || scan === 'resilver') return `${scan} ${pct}`;

  const state = typeof node['pool_state'] === 'string' ? node['pool_state'].trim() : '';
  return state || '—';
}

function nodeStorageVariant(node: PublicNodeLocationGroup['nodes'][number]): 'neutral' | 'ok' | 'warn' | 'danger' {
  const scan = typeof node['pool_scan'] === 'string' ? node['pool_scan'] : '';
  if (scan === 'scrub' || scan === 'resilver') return 'warn';
  if (node['pool_status'] === false) return 'danger';
  const state = typeof node['pool_state'] === 'string' ? node['pool_state'].trim().toLowerCase() : '';
  if (!state) return 'neutral';
  return state === 'online' ? 'ok' : 'warn';
}

function cpuUsedLabel(node: PublicNodeLocationGroup['nodes'][number]): string {
  if (typeof node.cpu_idle !== 'number' || !Number.isFinite(node.cpu_idle)) return '—';
  const used = Math.max(0, Math.min(100, 100 - node.cpu_idle));
  return `${used.toFixed(1)}%`;
}

function cgroupVersionLabel(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';
  return raw.replace(/^cgroup_/, '');
}

function NodeStatusBadge(props: { up: boolean }) {
  const i18n = useI18n();
  return (
    <span className="inline-flex min-w-24 justify-center">
      {props.up ? <Badge variant="ok">{i18n.t('state.up')}</Badge> : <Badge variant="danger">{i18n.t('state.down')}</Badge>}
    </span>
  );
}

function NodeStorageBadge(props: { node: PublicNodeLocationGroup['nodes'][number] }) {
  return (
    <span className="inline-flex min-w-20 justify-center">
      <Badge variant={nodeStorageVariant(props.node)}>{nodeStorageLabel(props.node)}</Badge>
    </span>
  );
}

function NodeLocationPanel(props: {
  group: PublicNodeLocationGroup;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const i18n = useI18n();
  const testId = `public.nodes.location.${props.group.location}`;

  return (
    <ClusterLocationPanel
      location={props.group.location}
      summary={i18n.t('public.overview.nodes.location_summary', {
        ok: props.group.ok,
        down: props.group.down,
        total: props.group.total,
      })}
      summaryVariant={props.group.down > 0 ? 'warn' : 'ok'}
      segments={[
        { value: props.group.ok, variant: 'ok', title: i18n.t('state.up') },
        { value: props.group.down, variant: 'danger', title: i18n.t('state.down') },
      ]}
      barAriaLabel={i18n.t('public.overview.nodes.location_bar_aria', { location: props.group.location })}
      defaultOpen={props.defaultOpen}
      testId={testId}
    >
      {props.children}
    </ClusterLocationPanel>
  );
}

function NodeMobileCards(props: { group: PublicNodeLocationGroup; open: boolean }) {
  const i18n = useI18n();

  return (
    <div className="md:hidden">
      <NodeLocationPanel group={props.group} defaultOpen={props.open}>
        <div className="space-y-2 p-3">
          {props.group.nodes.map((node) => (
            <div key={node.name} className="rounded-md border border-border bg-surface-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{node.name}</div>
                <NodeStatusBadge up={node.status} />
              </div>
              <div className="mt-2 text-xs text-muted">
                {i18n.t('public.overview.nodes.storage')}: <NodeStorageBadge node={node} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted">
                <div>
                  {i18n.t('public.overview.nodes.vps')}: {typeof node.vps_count === 'number' ? node.vps_count : '—'}
                </div>
                <div>{i18n.t('public.overview.nodes.cpu_used')}: {cpuUsedLabel(node)}</div>
                <div>{i18n.t('public.overview.nodes.kernel')}: {node.kernel ? String(node.kernel) : '—'}</div>
                <div>{i18n.t('public.overview.nodes.cgroups')}: {cgroupVersionLabel(node['cgroup_version'])}</div>
              </div>
            </div>
          ))}
        </div>
      </NodeLocationPanel>
    </div>
  );
}

function NodeDesktopTable(props: { group: PublicNodeLocationGroup }) {
  const i18n = useI18n();

  return (
    <div className="hidden overflow-auto md:block">
      <Table className="table-fixed" minWidth="md" testId={`public.nodes.table.${props.group.location}`}>
        <colgroup>
          <col style={{ width: '18%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '10%' }} />
        </colgroup>
        <thead className="bg-surface-2 text-left text-xs text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">{i18n.t('public.overview.nodes.table.node')}</th>
            <th className="px-3 py-2 text-center font-medium">{i18n.t('public.overview.nodes.table.status')}</th>
            <th className="px-3 py-2 text-center font-medium">{i18n.t('public.overview.nodes.table.storage')}</th>
            <th className="px-3 py-2 text-center font-medium">{i18n.t('public.overview.nodes.table.vps')}</th>
            <th className="px-3 py-2 text-center font-medium">{i18n.t('public.overview.nodes.table.cpu_used')}</th>
            <th className="px-3 py-2 text-center font-medium">{i18n.t('public.overview.nodes.table.kernel')}</th>
            <th className="px-3 py-2 text-center font-medium">{i18n.t('public.overview.nodes.table.cgroups')}</th>
          </tr>
        </thead>
        <tbody>
          {props.group.nodes.map((node) => (
            <tr key={node.name} className="border-t border-border" data-row-variant={node.status ? undefined : 'danger'}>
              <td className="px-3 py-2 font-medium">{node.name}</td>
              <td className="px-3 py-2 text-center"><NodeStatusBadge up={node.status} /></td>
              <td className="px-3 py-2 text-center"><NodeStorageBadge node={node} /></td>
              <td className="px-3 py-2 text-center text-muted">
                {typeof node.vps_count === 'number' ? node.vps_count : '—'}
              </td>
              <td className="px-3 py-2 text-center text-muted">{cpuUsedLabel(node)}</td>
              <td className="px-3 py-2 text-center text-muted">{node.kernel ? String(node.kernel) : '—'}</td>
              <td className="px-3 py-2 text-center text-muted">{cgroupVersionLabel(node['cgroup_version'])}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

export function OverviewNodesSection(props: {
  groups: PublicNodeLocationGroup[];
  summary: PublicNodeSummary;
  loading: boolean;
  error: boolean;
}) {
  const i18n = useI18n();

  return (
    <div data-testid="public.nodes.section">
      <Card>
        <CardHeader title={i18n.t('public.overview.nodes.title')} subtitle={i18n.t('public.overview.nodes.subtitle')} />
        <CardBody>
          {props.loading ? (
            <Spinner label={i18n.t('public.overview.nodes.loading')} />
          ) : props.error ? (
            <Alert title={i18n.t('public.overview.nodes.error')} variant="danger" />
          ) : props.groups.length === 0 ? (
            <div className="text-sm text-muted">{i18n.t('public.overview.nodes.empty')}</div>
          ) : (
            <div>
              <div className="space-y-3 md:hidden">
                {props.groups.map((group, index) => {
                  const openMobile = group.down > 0 || (props.summary.down === 0 && index === 0);
                  return <NodeMobileCards key={group.location} group={group} open={openMobile} />;
                })}
              </div>
              <div className="hidden space-y-4 md:block">
                {props.groups.map((group) => (
                  <NodeLocationPanel key={group.location} group={group}>
                    <NodeDesktopTable group={group} />
                  </NodeLocationPanel>
                ))}
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
