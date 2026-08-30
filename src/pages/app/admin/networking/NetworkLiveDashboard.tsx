import React, { useEffect, useMemo, useState } from 'react';

import { useI18n } from '../../../../app/i18n';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../../components/ui/Card';
import { ChipLink } from '../../../../components/ui/ChipLink';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { StackedBar } from '../../../../components/ui/StackedBar';
import { StatCard } from '../../../../components/ui/StatCard';
import { StatusDot } from '../../../../components/ui/StatusDot';
import { TableCard } from '../../../../components/ui/TableCard';
import { TimeSeriesChart } from '../../../../components/ui/TimeSeriesChart';
import type { NetworkInterfaceMonitorRow } from '../../../../lib/api/networking';
import { formatBytesIec } from '../../../../lib/bytes';
import { formatDateTime } from '../../../../lib/format';
import {
  monitorDataIsStale,
  monitorInterface,
  monitorNode,
  monitorUser,
  monitorVps,
  objectLabel,
  oldestMonitorTimestamp,
  perSecond,
  staleMonitorCount,
  topTalkers,
  trafficTotals,
  type LiveTrafficTalker,
} from './networkLiveModel';

export type AdminLiveSample = {
  timestamp: number;
  bytesIn: number;
  bytesOut: number;
};

function byteRate(value: number): string {
  return `${formatBytesIec(value)}/s`;
}

function packetRate(value: number): string {
  return `${Math.round(value).toLocaleString()}/s`;
}

function TalkerList(props: {
  title: string;
  empty: string;
  rows: LiveTrafficTalker[];
  href: (id: number) => string;
  testId: string;
}) {
  const max = Math.max(1, ...props.rows.map((row) => row.total));

  return (
    <Card testId={props.testId}>
      <CardHeader title={props.title} />
      <CardBody className="space-y-3">
        {props.rows.length === 0 ? (
          <div className="text-sm text-muted">{props.empty}</div>
        ) : props.rows.map((row) => (
          <div key={row.id} className="space-y-1.5" data-testid={`${props.testId}.${row.id}`}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <ChipLink to={props.href(row.id)} className="min-w-0 truncate text-fg">
                {row.label}
              </ChipLink>
              <span className="shrink-0 font-medium tabular-nums">{byteRate(row.total)}</span>
            </div>
            <StackedBar
              ariaLabel={`${row.label}: ${byteRate(row.total)}`}
              segments={[
                { value: row.total, variant: 'accent' },
                { value: Math.max(0, max - row.total), variant: 'neutral' },
              ]}
            />
            <div className="flex justify-between text-xs tabular-nums text-muted">
              <span>↓ {byteRate(row.bytesIn)}</span>
              <span>↑ {byteRate(row.bytesOut)}</span>
            </div>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

export function NetworkLiveDashboard(props: {
  rows: NetworkInterfaceMonitorRow[];
  history: AdminLiveSample[];
  paused: boolean;
  documentVisible: boolean;
  isFetching: boolean;
  onTogglePaused: () => void;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  const totals = useMemo(() => trafficTotals(props.rows), [props.rows]);
  const topVps = useMemo(() => topTalkers(props.rows, 'vps'), [props.rows]);
  const topUsers = useMemo(() => topTalkers(props.rows, 'user'), [props.rows]);
  const oldestTimestamp = useMemo(() => oldestMonitorTimestamp(props.rows), [props.rows]);
  const staleCount = useMemo(() => staleMonitorCount(props.rows, now), [now, props.rows]);
  const stale = monitorDataIsStale(oldestTimestamp, now) || staleCount > 0;
  const active = !props.paused && props.documentVisible;
  const chartMax = Math.max(1, ...props.history.flatMap((sample) => [sample.bytesIn, sample.bytesOut]));
  const oldestLabel = oldestTimestamp === null
    ? t('admin.network_live.freshness.unknown')
    : formatDateTime(new Date(oldestTimestamp).toISOString());

  return (
    <div className="space-y-4" data-testid="admin.network_live.dashboard">
      <Card testId="admin.network_live.status">
        <CardBody className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
            <StatusDot variant={stale ? 'warn' : active ? 'ok' : 'neutral'} />
            <span className="font-medium">
              {props.paused
                ? t('admin.network_live.status.paused')
                : props.documentVisible
                  ? t('admin.network_live.status.active')
                  : t('admin.network_live.status.hidden')}
            </span>
            <Badge variant={stale ? 'warn' : 'ok'} testId="admin.network_live.freshness">
              {stale ? t('admin.network_live.freshness.stale') : t('admin.network_live.freshness.fresh')}
            </Badge>
            <span className="truncate text-xs text-muted">
              {t('admin.network_live.freshness.updated', { value: oldestLabel })}
            </span>
            {staleCount > 0 ? (
              <span className="shrink-0 text-xs font-medium text-warn">
                {t('admin.network_live.freshness.stale_count', { count: staleCount })}
              </span>
            ) : null}
            <span className="shrink-0 text-xs text-muted">
              {t('admin.network_live.status.sample', { count: props.rows.length })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              testId="admin.network_live.toggle"
              onClick={props.onTogglePaused}
            >
              {props.paused ? t('admin.network_live.action.resume') : t('admin.network_live.action.pause')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={props.isFetching}
              testId="admin.network_live.refresh"
              onClick={props.onRefresh}
            >
              {t('common.refresh')}
            </Button>
          </div>
        </CardBody>
      </Card>

      {props.rows.length === 0 ? (
        <EmptyState
          title={t('admin.network_live.empty')}
          testId="admin.network_live.empty"
        />
      ) : (
        <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={t('admin.network_live.kpi.in')}
          value={byteRate(totals.bytesIn)}
          subtitle={t('admin.network_live.kpi.current')}
          variant="compact"
          testId="admin.network_live.kpi.in"
        />
        <StatCard
          title={t('admin.network_live.kpi.out')}
          value={byteRate(totals.bytesOut)}
          subtitle={t('admin.network_live.kpi.current')}
          variant="compact"
          testId="admin.network_live.kpi.out"
        />
        <StatCard
          title={t('admin.network_live.kpi.packets_in')}
          value={packetRate(totals.packetsIn)}
          subtitle={t('admin.network_live.kpi.current')}
          variant="compact"
          testId="admin.network_live.kpi.packets_in"
        />
        <StatCard
          title={t('admin.network_live.kpi.packets_out')}
          value={packetRate(totals.packetsOut)}
          subtitle={t('admin.network_live.kpi.current')}
          variant="compact"
          testId="admin.network_live.kpi.packets_out"
        />
      </div>

      <Card testId="admin.network_live.charts">
        <CardHeader
          title={t('admin.network_live.chart.title')}
          subtitle={t('admin.network_live.chart.session_hint')}
        />
        <CardBody className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface-2/60 p-4">
            <div className="mb-3 font-medium">{t('admin.network_live.chart.in')}</div>
            <TimeSeriesChart
              points={props.history.map((sample) => ({ x: sample.timestamp, y: sample.bytesIn }))}
              ariaLabel={t('admin.network_live.chart.in')}
              formatValue={byteRate}
              yMin={0}
              yMax={chartMax}
              variant="netIn"
              className="h-56 sm:h-64"
              testId="admin.network_live.chart.in"
            />
          </div>
          <div className="rounded-lg border border-border bg-surface-2/60 p-4">
            <div className="mb-3 font-medium">{t('admin.network_live.chart.out')}</div>
            <TimeSeriesChart
              points={props.history.map((sample) => ({ x: sample.timestamp, y: sample.bytesOut }))}
              ariaLabel={t('admin.network_live.chart.out')}
              formatValue={byteRate}
              yMin={0}
              yMax={chartMax}
              variant="netOut"
              className="h-56 sm:h-64"
              testId="admin.network_live.chart.out"
            />
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <TalkerList
          title={t('admin.network_live.top.vps')}
          empty={t('admin.network_live.top.empty')}
          rows={topVps}
          href={(id) => `/admin/vps/${id}`}
          testId="admin.network_live.top.vps"
        />
        <TalkerList
          title={t('admin.network_live.top.users')}
          empty={t('admin.network_live.top.empty')}
          rows={topUsers}
          href={(id) => `/admin/users/${id}`}
          testId="admin.network_live.top.users"
        />
      </div>

      <TableCard testId="admin.network_live.table" minWidth="xl">
        <thead>
          <tr>
            <th>{t('admin.network_live.field.interface')}</th>
            <th>{t('admin.network_live.field.vps')}</th>
            <th>{t('admin.network_live.field.user')}</th>
            <th>{t('admin.network_live.field.node')}</th>
            <th>{t('admin.network_live.field.updated')}</th>
            <th>{t('admin.network_live.field.in')}</th>
            <th>{t('admin.network_live.field.out')}</th>
            <th>{t('admin.network_live.field.packets_in')}</th>
            <th>{t('admin.network_live.field.packets_out')}</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => {
            const networkInterface = monitorInterface(row);
            const vps = monitorVps(row);
            const user = monitorUser(row);
            const node = monitorNode(row);
            const id = Number(row.id);
            return (
              <tr key={id} data-testid={`admin.network_live.row.${id}`}>
                <td>
                  <span className="font-mono text-sm">
                    {objectLabel(networkInterface, ['name', 'label'])}
                  </span>
                  {networkInterface?.id ? <span className="ml-1 text-xs text-muted">#{networkInterface.id}</span> : null}
                </td>
                <td>
                  {vps?.id ? (
                    <ChipLink to={`/admin/vps/${vps.id}`}>
                      {objectLabel(vps, ['hostname', 'name', 'label'])}
                    </ChipLink>
                  ) : '—'}
                </td>
                <td>
                  {user?.id ? (
                    <ChipLink to={`/admin/users/${user.id}`}>
                      {objectLabel(user, ['login', 'name', 'label'])}
                    </ChipLink>
                  ) : '—'}
                </td>
                <td>
                  {node?.id ? (
                    <ChipLink to={`/admin/nodes/${node.id}`}>
                      {objectLabel(node, ['domain_name', 'name', 'label'])}
                    </ChipLink>
                  ) : '—'}
                </td>
                <td className="tabular-nums text-sm">{formatDateTime(row.updated_at)}</td>
                <td className="tabular-nums">{byteRate(perSecond(row.bytes_in, row.delta))}</td>
                <td className="tabular-nums">{byteRate(perSecond(row.bytes_out, row.delta))}</td>
                <td className="tabular-nums">{packetRate(perSecond(row.packets_in, row.delta))}</td>
                <td className="tabular-nums">{packetRate(perSecond(row.packets_out, row.delta))}</td>
              </tr>
            );
          })}
        </tbody>
      </TableCard>
        </>
      )}
    </div>
  );
}
