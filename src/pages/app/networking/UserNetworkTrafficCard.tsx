import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useI18n } from '../../../app/i18n';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { clsx } from '../../../components/ui/clsx';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { LoadingState } from '../../../components/ui/LoadingState';
import { StatCard } from '../../../components/ui/StatCard';
import { TableCard } from '../../../components/ui/TableCard';
import { TimeSeriesChart } from '../../../components/ui/TimeSeriesChart';
import { formatBytesIec } from '../../../lib/bytes';
import type { ResourceRef } from '../../../lib/api/appTypes';
import {
  fetchNetworkInterfaceAccountings,
  type NetworkInterface,
  type NetworkInterfaceAccounting,
} from '../../../lib/api/networkInterfaces';
import type { Vps } from '../../../lib/api/vps';
import { resourceId } from './IpAddressAssignmentModel';

type MonthRef = { year: number; month: number };

type MonthlyTraffic = MonthRef & {
  key: string;
  timestamp: number;
  bytesIn: number;
  bytesOut: number;
  total: number;
};

type InterfaceTraffic = {
  key: string;
  vpsId: number | null;
  vpsLabel: string;
  interfaceLabel: string;
  bytesIn: number;
  bytesOut: number;
  total: number;
};

type TrafficTab = 'overview' | 'breakdown';

function currentYearMonth(): MonthRef {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function monthKey(month: MonthRef): string {
  return `${month.year}-${String(month.month).padStart(2, '0')}`;
}

function monthStartTimestamp(month: MonthRef): number {
  return Math.floor(new Date(month.year, month.month - 1, 1).getTime() / 1000);
}

function previousMonths(count: number, from = currentYearMonth()): MonthRef[] {
  return Array.from({ length: count }, (_, idx) => {
    const d = new Date(from.year, from.month - 1 - (count - 1 - idx), 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
}

function sumBytes(row: NetworkInterfaceAccounting): { in: number; out: number; total: number } {
  const bytesIn = Number(row.bytes_in ?? 0);
  const bytesOut = Number(row.bytes_out ?? 0);
  const total = Number(row.bytes ?? bytesIn + bytesOut);
  return {
    in: Number.isFinite(bytesIn) ? bytesIn : 0,
    out: Number.isFinite(bytesOut) ? bytesOut : 0,
    total: Number.isFinite(total) ? total : 0,
  };
}

function rowNetworkInterface(row: NetworkInterfaceAccounting): NetworkInterface | ResourceRef | null {
  const ni = row.network_interface;
  if (!ni || typeof ni !== 'object') return null;
  return ni;
}

function rowVps(row: NetworkInterfaceAccounting): Vps | ResourceRef | null {
  const ni = rowNetworkInterface(row);
  if (!ni || typeof ni !== 'object') return null;
  const vps = (ni as NetworkInterface).vps;
  if (!vps || typeof vps !== 'object') return null;
  return vps as Vps | ResourceRef;
}

function rowVpsId(row: NetworkInterfaceAccounting): number | null {
  return resourceId(rowVps(row));
}

function rowVpsLabel(row: NetworkInterfaceAccounting): string {
  const vps = rowVps(row);
  const id = rowVpsId(row);
  if (vps && typeof vps === 'object') {
    const hostname = String((vps as Vps).hostname ?? (vps as ResourceRef).label ?? '').trim();
    if (hostname) return hostname;
  }
  return id ? `#${id}` : '—';
}

function rowInterfaceLabel(row: NetworkInterfaceAccounting): string {
  const ni = rowNetworkInterface(row);
  if (ni && typeof ni === 'object') {
    const name = String((ni as NetworkInterface).name ?? (ni as ResourceRef).label ?? '').trim();
    if (name) return name;
  }
  const id = resourceId(ni as ResourceRef | null);
  return id ? `#${id}` : '—';
}

function aggregateByMonth(rows: NetworkInterfaceAccounting[], months: MonthRef[]): MonthlyTraffic[] {
  const byMonth = new Map<string, MonthlyTraffic>();
  for (const month of months) {
    const key = monthKey(month);
    byMonth.set(key, {
      ...month,
      key,
      timestamp: monthStartTimestamp(month),
      bytesIn: 0,
      bytesOut: 0,
      total: 0,
    });
  }

  for (const row of rows) {
    const year = Number(row.year);
    const month = Number(row.month);
    if (!Number.isFinite(year) || !Number.isFinite(month)) continue;
    const key = monthKey({ year, month });
    const bucket = byMonth.get(key);
    if (!bucket) continue;

    const bytes = sumBytes(row);
    bucket.bytesIn += bytes.in;
    bucket.bytesOut += bytes.out;
    bucket.total += bytes.total;
  }

  return [...byMonth.values()].sort((a, b) => a.timestamp - b.timestamp);
}

function aggregateCurrentInterfaces(rows: NetworkInterfaceAccounting[], current: MonthRef): InterfaceTraffic[] {
  const key = monthKey(current);
  const byInterface = new Map<string, InterfaceTraffic>();

  for (const row of rows) {
    if (monthKey({ year: Number(row.year), month: Number(row.month) }) !== key) continue;

    const interfaceId = resourceId(row.network_interface as ResourceRef | number | string | null | undefined);
    const vpsId = rowVpsId(row);
    const rowKey = `${vpsId ?? 'vps'}:${interfaceId ?? row.id}`;
    const existing = byInterface.get(rowKey) ?? {
      key: rowKey,
      vpsId,
      vpsLabel: rowVpsLabel(row),
      interfaceLabel: rowInterfaceLabel(row),
      bytesIn: 0,
      bytesOut: 0,
      total: 0,
    };
    const bytes = sumBytes(row);
    existing.bytesIn += bytes.in;
    existing.bytesOut += bytes.out;
    existing.total += bytes.total;
    byInterface.set(rowKey, existing);
  }

  return [...byInterface.values()].sort((a, b) => b.total - a.total);
}

function maxTotal(rows: MonthlyTraffic[]): number {
  return Math.max(1, ...rows.map((row) => row.total));
}

function TrafficTabButton(props: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={props.active}
      className={clsx(
        'inline-flex items-center rounded-md px-3 py-2 text-sm font-medium transition',
        props.active
          ? 'bg-surface-2 text-fg ring-1 ring-border'
          : 'text-muted hover:bg-surface-2 hover:text-fg'
      )}
      onClick={props.onClick}
      data-testid={props.testId}
    >
      {props.children}
    </button>
  );
}

export function UserNetworkTrafficCard(props: { userId: number | null; isAdmin: boolean }) {
  const { t } = useI18n();
  const [tab, setTab] = React.useState<TrafficTab>('overview');
  const current = useMemo(() => currentYearMonth(), []);
  const months = useMemo(() => previousMonths(6, current), [current]);

  const trafficQ = useQuery({
    queryKey: ['network_interface_accountings', 'user-network', { userId: props.userId, isAdmin: props.isAdmin, months }],
    queryFn: async () => {
      const responses = await Promise.all(
        months.map(async (month) => (
          await fetchNetworkInterfaceAccountings({
            user: props.isAdmin ? props.userId ?? undefined : undefined,
            year: month.year,
            month: month.month,
            limit: 250,
            order: 'descending',
            includes: 'network_interface,network_interface.vps',
          })
        ).data)
      );
      return responses.flat();
    },
    enabled: props.userId !== null,
    staleTime: 30_000,
  });

  const rows = trafficQ.data ?? [];
  const monthly = useMemo(() => aggregateByMonth(rows, months), [rows, months]);
  const currentTraffic = monthly[monthly.length - 1] ?? null;
  const interfaceRows = useMemo(() => aggregateCurrentInterfaces(rows, current), [rows, current]);
  const chartMax = maxTotal(monthly);

  return (
    <Card testId="network.user.traffic">
      <CardHeader
        title={t('network.user.traffic.title')}
        subtitle={t('network.user.traffic.subtitle')}
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted">{current.year}/{current.month}</span>
            <Button variant="secondary" size="sm" onClick={() => void trafficQ.refetch()}>
              {t('common.refresh')}
            </Button>
          </div>
        }
      />
      <CardBody>
        {trafficQ.isLoading ? (
          <LoadingState testId="network.user.traffic.loading" />
        ) : trafficQ.isError ? (
          <ErrorState
            error={trafficQ.error}
            testId="network.user.traffic.error"
            title={t('network.user.traffic.error')}
            onRetry={() => void trafficQ.refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            testId="network.user.traffic.empty"
            title={t('network.user.traffic.empty')}
            body={t('network.user.traffic.empty_body')}
          />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <StatCard
                testId="network.user.traffic.stat.total"
                title={t('network.user.traffic.total')}
                value={formatBytesIec(currentTraffic?.total)}
                subtitle={t('network.user.traffic.current_month')}
                variant="compact"
              />
              <StatCard
                testId="network.user.traffic.stat.in"
                title={t('network.user.traffic.in')}
                value={formatBytesIec(currentTraffic?.bytesIn)}
                subtitle={t('network.user.traffic.current_month')}
                variant="compact"
              />
              <StatCard
                testId="network.user.traffic.stat.out"
                title={t('network.user.traffic.out')}
                value={formatBytesIec(currentTraffic?.bytesOut)}
                subtitle={t('network.user.traffic.current_month')}
                variant="compact"
              />
            </div>

            <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('network.user.traffic.tabs.aria')}>
              <TrafficTabButton
                active={tab === 'overview'}
                onClick={() => setTab('overview')}
                testId="network.user.traffic.tab.overview"
              >
                {t('network.user.traffic.tab.overview')}
              </TrafficTabButton>
              <TrafficTabButton
                active={tab === 'breakdown'}
                onClick={() => setTab('breakdown')}
                testId="network.user.traffic.tab.breakdown"
              >
                {t('network.user.traffic.tab.breakdown')}
              </TrafficTabButton>
            </div>

            {tab === 'overview' ? (
              <div className="space-y-4" role="tabpanel" data-testid="network.user.traffic.panel.overview">
                <div className="rounded-lg border border-border bg-surface-2/60 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{t('network.user.traffic.chart.title')}</div>
                      <div className="text-xs text-muted">{t('network.user.traffic.chart.subtitle')}</div>
                    </div>
                  </div>
                  <TimeSeriesChart
                    testId="network.user.traffic.chart"
                    ariaLabel={t('network.user.traffic.chart.aria')}
                    points={monthly.map((row) => ({ x: row.timestamp, y: row.total }))}
                    yMin={0}
                    yMax={chartMax}
                    variant="netIn"
                    className="h-52 sm:h-64"
                    formatValue={(value) => formatBytesIec(value)}
                    formatTime={(unixSeconds) => {
                      const d = new Date(unixSeconds * 1000);
                      return `${d.getFullYear()}/${d.getMonth() + 1}`;
                    }}
                  />
                </div>

                <div className="rounded-lg border border-border bg-surface-2/60 p-4">
                  <div className="mb-3 font-medium">{t('network.user.traffic.months.title')}</div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {monthly.map((row) => {
                      const pct = Math.max(2, Math.round((row.total / chartMax) * 100));
                      return (
                        <div key={row.key} className="space-y-1" data-testid={`network.user.traffic.month.${row.key}`}>
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="font-medium tabular-nums">{row.year}/{row.month}</span>
                            <span className="text-muted tabular-nums">{formatBytesIec(row.total)}</span>
                          </div>
                          <div className="h-2 rounded-full bg-border/70">
                            <div className="h-2 rounded-full bg-chart-green" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div role="tabpanel" data-testid="network.user.traffic.panel.breakdown">
                {interfaceRows.length > 0 ? (
                  <TableCard minWidth="md" tableTestId="network.user.traffic.table">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted">
                        <th className="px-4 py-2">{t('network.user.traffic.field.vps')}</th>
                        <th className="px-4 py-2">{t('network.user.traffic.field.interface')}</th>
                        <th className="px-4 py-2 text-right">{t('network.user.traffic.in')}</th>
                        <th className="px-4 py-2 text-right">{t('network.user.traffic.out')}</th>
                        <th className="px-4 py-2 text-right">{t('network.user.traffic.total')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {interfaceRows.map((row) => (
                        <tr key={row.key} className="border-b border-border/60 last:border-0" data-testid={`network.user.traffic.row.${row.key}`}>
                          <td className="px-4 py-3 text-sm font-medium">{row.vpsLabel}</td>
                          <td className="px-4 py-3 font-mono text-sm text-muted">{row.interfaceLabel}</td>
                          <td className="px-4 py-3 text-right text-sm tabular-nums">{formatBytesIec(row.bytesIn)}</td>
                          <td className="px-4 py-3 text-right text-sm tabular-nums">{formatBytesIec(row.bytesOut)}</td>
                          <td className="px-4 py-3 text-right text-sm font-medium tabular-nums">{formatBytesIec(row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </TableCard>
                ) : (
                  <EmptyState
                    testId="network.user.traffic.breakdown.empty"
                    title={t('network.user.traffic.breakdown.empty')}
                    body={t('network.user.traffic.breakdown.empty_body')}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
