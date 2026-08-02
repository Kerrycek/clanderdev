import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useI18n } from '../../../app/i18n';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { LoadingState } from '../../../components/ui/LoadingState';
import { Select } from '../../../components/ui/Select';
import { StatCard } from '../../../components/ui/StatCard';
import { StatusDot } from '../../../components/ui/StatusDot';
import { TableCard } from '../../../components/ui/TableCard';
import { TimeSeriesChart } from '../../../components/ui/TimeSeriesChart';
import type { ResourceRef } from '../../../lib/api/appTypes';
import type { NetworkInterface } from '../../../lib/api/networkInterfaces';
import {
  fetchNetworkInterfaceMonitor,
  type NetworkInterfaceMonitorRow,
} from '../../../lib/api/networking';
import { formatBytesIec } from '../../../lib/bytes';
import { formatDateTime } from '../../../lib/format';
import { TIER_A_VISIBLE_MS } from '../../../lib/refreshTiers';
import { useDocumentVisibility } from '../../../lib/useDocumentVisibility';
import type { Vps } from '../../../lib/api/vps';
import { resourceId } from './IpAddressAssignmentModel';

type LiveSample = {
  timestamp: number;
  bytesIn: number;
  bytesOut: number;
};

const LIVE_HISTORY_POINTS = 60;

function networkInterface(row: NetworkInterfaceMonitorRow): NetworkInterface | ResourceRef | null {
  const value = row.network_interface;
  return value && typeof value === 'object' ? value : null;
}

function rowVps(row: NetworkInterfaceMonitorRow): Vps | ResourceRef | null {
  const ni = networkInterface(row);
  if (!ni || typeof ni !== 'object') return null;
  const value = (ni as NetworkInterface).vps;
  return value && typeof value === 'object' ? value as Vps | ResourceRef : null;
}

function rowVpsLabel(row: NetworkInterfaceMonitorRow): string {
  const vps = rowVps(row);
  const id = resourceId(vps);
  if (vps && typeof vps === 'object') {
    const label = String((vps as Vps).hostname ?? (vps as ResourceRef).label ?? '').trim();
    if (label) return label;
  }
  return id ? `#${id}` : '—';
}

function rowInterfaceLabel(row: NetworkInterfaceMonitorRow): string {
  const ni = networkInterface(row);
  const id = resourceId(ni);
  if (ni && typeof ni === 'object') {
    const label = String((ni as NetworkInterface).name ?? (ni as ResourceRef).label ?? '').trim();
    if (label) return label;
  }
  return id ? `#${id}` : '—';
}

function rowKey(row: NetworkInterfaceMonitorRow): string {
  return `${resourceId(rowVps(row)) ?? 'vps'}:${resourceId(networkInterface(row)) ?? row.id}`;
}

function perSecond(value: number | undefined, delta: number | undefined): number {
  const amount = Number(value ?? 0);
  const seconds = Number(delta ?? 1);
  if (!Number.isFinite(amount)) return 0;
  if (!Number.isFinite(seconds) || seconds <= 0) return amount;
  return amount / seconds;
}

function byteRate(value: number): string {
  return `${formatBytesIec(value)}/s`;
}

function packetRate(value: number): string {
  return `${Math.round(value).toLocaleString()}/s`;
}

export function UserNetworkLiveCard(props: { userId: number | null; isAdmin: boolean }) {
  const { t } = useI18n();
  const documentVisible = useDocumentVisibility();
  const [selectedInterface, setSelectedInterface] = useState('all');
  const [history, setHistory] = useState<LiveSample[]>([]);

  const liveQ = useQuery({
    queryKey: ['network_interface_monitor', 'user-network', { userId: props.userId, isAdmin: props.isAdmin }],
    queryFn: async () => (
      await fetchNetworkInterfaceMonitor({
        user: props.isAdmin ? props.userId ?? undefined : undefined,
        order: '-bytes',
        limit: 250,
      })
    ).data,
    enabled: props.userId !== null,
    placeholderData: (previous) => previous,
    refetchInterval: documentVisible ? TIER_A_VISIBLE_MS : false,
    refetchOnWindowFocus: true,
    staleTime: 2_000,
  });

  const rows = liveQ.data ?? [];
  const visibleRows = useMemo(
    () => selectedInterface === 'all' ? rows : rows.filter((row) => rowKey(row) === selectedInterface),
    [rows, selectedInterface]
  );
  const totals = useMemo(() => visibleRows.reduce(
    (sum, row) => ({
      bytesIn: sum.bytesIn + perSecond(row.bytes_in, row.delta),
      bytesOut: sum.bytesOut + perSecond(row.bytes_out, row.delta),
      packetsIn: sum.packetsIn + perSecond(row.packets_in, row.delta),
      packetsOut: sum.packetsOut + perSecond(row.packets_out, row.delta),
    }),
    { bytesIn: 0, bytesOut: 0, packetsIn: 0, packetsOut: 0 }
  ), [visibleRows]);

  useEffect(() => {
    if (!liveQ.dataUpdatedAt || rows.length === 0) return;
    const sample = {
      timestamp: Math.floor(liveQ.dataUpdatedAt / 1000),
      bytesIn: totals.bytesIn,
      bytesOut: totals.bytesOut,
    };
    setHistory((previous) => {
      const withoutSameTimestamp = previous.filter((item) => item.timestamp !== sample.timestamp);
      if (withoutSameTimestamp.length === 0) {
        return [
          { ...sample, timestamp: sample.timestamp - Math.ceil(TIER_A_VISIBLE_MS / 1000) },
          sample,
        ];
      }
      return [...withoutSameTimestamp, sample].slice(-LIVE_HISTORY_POINTS);
    });
  }, [liveQ.dataUpdatedAt, rows.length, totals.bytesIn, totals.bytesOut]);

  const interfaceOptions = useMemo(() => [
    { value: 'all', label: t('network.user.live.filter.all') },
    ...rows.map((row) => ({
      value: rowKey(row),
      label: `${rowVpsLabel(row)} · ${rowInterfaceLabel(row)}`,
    })),
  ], [rows, t]);

  const latestUpdate = visibleRows.reduce<string | undefined>((latest, row) => {
    if (!row.updated_at) return latest;
    if (!latest || new Date(row.updated_at).getTime() > new Date(latest).getTime()) return row.updated_at;
    return latest;
  }, undefined);
  const chartMax = Math.max(1, ...history.flatMap((sample) => [sample.bytesIn, sample.bytesOut]));

  return (
    <Card testId="network.user.live">
      <CardHeader
        title={t('network.user.live.title')}
        subtitle={t('network.user.live.subtitle')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 text-xs text-muted" data-testid="network.user.live.status">
              <StatusDot variant={documentVisible ? 'ok' : 'neutral'} />
              {documentVisible ? t('network.user.live.status.active') : t('network.user.live.status.paused')}
            </span>
            <Button variant="secondary" size="sm" onClick={() => void liveQ.refetch()}>
              {t('common.refresh')}
            </Button>
          </div>
        }
      />
      <CardBody>
        {liveQ.isLoading ? (
          <LoadingState testId="network.user.live.loading" />
        ) : liveQ.isError ? (
          <ErrorState
            error={liveQ.error}
            testId="network.user.live.error"
            title={t('network.user.live.error')}
            onRetry={() => void liveQ.refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            testId="network.user.live.empty"
            title={t('network.user.live.empty')}
            body={t('network.user.live.empty_body')}
          />
        ) : (
          <div className="space-y-5">
            <div className="max-w-md">
              <Select
                label={t('network.user.live.filter.interface')}
                testId="network.user.live.filter.interface"
                value={selectedInterface}
                onChange={(event) => {
                  setHistory([]);
                  setSelectedInterface(event.target.value);
                }}
                options={interfaceOptions}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                title={t('network.user.live.in')}
                value={byteRate(totals.bytesIn)}
                subtitle={t('network.user.live.current')}
                variant="compact"
                testId="network.user.live.stat.in"
              />
              <StatCard
                title={t('network.user.live.out')}
                value={byteRate(totals.bytesOut)}
                subtitle={t('network.user.live.current')}
                variant="compact"
                testId="network.user.live.stat.out"
              />
              <StatCard
                title={t('network.user.live.packets_in')}
                value={packetRate(totals.packetsIn)}
                subtitle={t('network.user.live.current')}
                variant="compact"
              />
              <StatCard
                title={t('network.user.live.packets_out')}
                value={packetRate(totals.packetsOut)}
                subtitle={latestUpdate ? formatDateTime(latestUpdate) : t('network.user.live.current')}
                variant="compact"
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-lg border border-border bg-surface-2/60 p-4">
                <div className="mb-3 font-medium">{t('network.user.live.chart.in')}</div>
                <TimeSeriesChart
                  points={history.map((sample) => ({ x: sample.timestamp, y: sample.bytesIn }))}
                  ariaLabel={t('network.user.live.chart.in')}
                  formatValue={byteRate}
                  yMin={0}
                  yMax={chartMax}
                  variant="netIn"
                  className="h-56 sm:h-64"
                  testId="network.user.live.chart.in"
                />
              </div>
              <div className="rounded-lg border border-border bg-surface-2/60 p-4">
                <div className="mb-3 font-medium">{t('network.user.live.chart.out')}</div>
                <TimeSeriesChart
                  points={history.map((sample) => ({ x: sample.timestamp, y: sample.bytesOut }))}
                  ariaLabel={t('network.user.live.chart.out')}
                  formatValue={byteRate}
                  yMin={0}
                  yMax={chartMax}
                  variant="netOut"
                  className="h-56 sm:h-64"
                  testId="network.user.live.chart.out"
                />
              </div>
            </div>

            <TableCard minWidth="md" tableTestId="network.user.live.table">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-4 py-2">{t('network.user.field.vps')}</th>
                  <th className="px-4 py-2">{t('network.user.field.interface')}</th>
                  <th className="px-4 py-2 text-right">{t('network.user.live.in')}</th>
                  <th className="px-4 py-2 text-right">{t('network.user.live.out')}</th>
                  <th className="px-4 py-2 text-right">{t('network.user.live.updated')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={rowKey(row)} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 text-sm font-medium">{rowVpsLabel(row)}</td>
                    <td className="px-4 py-3 font-mono text-sm text-muted">{rowInterfaceLabel(row)}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums">{byteRate(perSecond(row.bytes_in, row.delta))}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums">{byteRate(perSecond(row.bytes_out, row.delta))}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-muted">{formatDateTime(row.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
