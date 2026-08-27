import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { useI18n } from '../../../app/i18n';
import type { Vps } from '../../../lib/api/vps';
import { fetchVpsStatuses } from '../../../lib/api/vps';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { buttonClassName } from '../../../components/ui/buttonStyles';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { Spinner } from '../../../components/ui/Spinner';
import { TimeSeriesChart } from '../../../components/ui/TimeSeriesChart';
import { formatMiB } from '../../../lib/format';
import { formatErrorMessage } from '../../../lib/errors';
import { useTierSlowIntervalMs } from '../../../lib/refreshTiers';
import {
  fmtLoad,
  metricsLimitForWindow,
  metricsWindowMs,
  parseMetricsWindow,
  safePercent,
  sortStatusesByTimeAsc,
} from './VpsOverviewModel';

export function VpsOverviewMetricsCard(props: { vps: Vps }) {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const tierSlowRefetchMs = useTierSlowIntervalMs();

  const metricsWindow = parseMetricsWindow(searchParams.get('metrics_window'));
  const metricsLimit = metricsLimitForWindow(metricsWindow);

  const setMetricsWindow = (w: typeof metricsWindow) => {
    const next = new URLSearchParams(searchParams);
    next.set('metrics_window', w);
    setSearchParams(next, { replace: true });
  };

  const metricsQ = useQuery({
    queryKey: ['vps', 'metrics', { vpsId: props.vps.id, window: metricsWindow, limit: metricsLimit }],
    queryFn: async () => {
      const now = Date.now();
      const from = new Date(now - metricsWindowMs(metricsWindow)).toISOString();
      const to = new Date(now).toISOString();

      try {
        return (await fetchVpsStatuses(props.vps.id, { limit: metricsLimit, from, to })).data;
      } catch {
        return (await fetchVpsStatuses(props.vps.id, { limit: metricsLimit })).data;
      }
    },
    enabled: Number.isFinite(props.vps.id) && props.vps.id > 0,
    refetchInterval: tierSlowRefetchMs,
  });

  const metricsRows = React.useMemo(() => sortStatusesByTimeAsc(metricsQ.data ?? []), [metricsQ.data]);
  const metricsLast = metricsRows.length > 0 ? metricsRows[metricsRows.length - 1] : null;

  const load1Points = React.useMemo(() => {
    const out: { x: number; y: number }[] = [];
    for (const s of metricsRows) {
      const ts = s.created_at ? new Date(s.created_at) : null;
      if (!ts || !Number.isFinite(ts.getTime())) continue;
      const y = typeof s.loadavg1 === 'number' ? s.loadavg1 : Number.NaN;
      if (!Number.isFinite(y)) continue;
      out.push({ x: ts.getTime() / 1000, y });
    }
    return out;
  }, [metricsRows]);

  const load5Points = React.useMemo(() => {
    const out: { x: number; y: number }[] = [];
    for (const s of metricsRows) {
      const ts = s.created_at ? new Date(s.created_at) : null;
      if (!ts || !Number.isFinite(ts.getTime())) continue;
      const y = typeof s.loadavg5 === 'number' ? s.loadavg5 : Number.NaN;
      if (!Number.isFinite(y)) continue;
      out.push({ x: ts.getTime() / 1000, y });
    }
    return out;
  }, [metricsRows]);

  const memUsedPercentPoints = React.useMemo(() => {
    const out: { x: number; y: number }[] = [];
    for (const s of metricsRows) {
      const ts = s.created_at ? new Date(s.created_at) : null;
      if (!ts || !Number.isFinite(ts.getTime())) continue;
      const total = typeof s.total_memory === 'number' ? s.total_memory : props.vps.memory;
      const p = safePercent(s.used_memory, total);
      if (p == null) continue;
      out.push({ x: ts.getTime() / 1000, y: p });
    }
    return out;
  }, [metricsRows, props.vps.memory]);

  const diskUsedPercentPoints = React.useMemo(() => {
    const out: { x: number; y: number }[] = [];
    for (const s of metricsRows) {
      const ts = s.created_at ? new Date(s.created_at) : null;
      if (!ts || !Number.isFinite(ts.getTime())) continue;
      const total = typeof s.total_diskspace === 'number' ? s.total_diskspace : props.vps.diskspace;
      const p = safePercent(s.used_diskspace, total);
      if (p == null) continue;
      out.push({ x: ts.getTime() / 1000, y: p });
    }
    return out;
  }, [metricsRows, props.vps.diskspace]);

  const body = (() => {
    if (metricsQ.isLoading) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> {t('common.loading')}
        </div>
      );
    }

    if (metricsQ.isError) {
      return (
        <Alert title={t('vps.overview.metrics.error')} variant="danger">
          {formatErrorMessage(metricsQ.error)}
        </Alert>
      );
    }

    if (metricsRows.length === 0) {
      return <div className="text-sm text-muted">{t('vps.overview.metrics.empty')}</div>;
    }

    const memUsedNow = metricsLast?.used_memory ?? props.vps.used_memory;
    const memTotal = metricsLast?.total_memory ?? props.vps.memory;
    const memPct = safePercent(memUsedNow, memTotal);

    const diskUsedNow = metricsLast?.used_diskspace ?? props.vps.used_diskspace;
    const diskTotal = metricsLast?.total_diskspace ?? props.vps.diskspace;
    const diskPct = safePercent(diskUsedNow, diskTotal);

    const loadNow1 = metricsLast?.loadavg1 ?? props.vps.loadavg1;
    const loadNow5 = metricsLast?.loadavg5 ?? props.vps.loadavg5;

    return (
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2" data-testid="vps.overview.metrics.grid">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-sm font-medium">{t('vps.overview.metrics.chart.load1')}</div>
            <div className="text-xs text-muted">{fmtLoad(loadNow1)}</div>
          </div>
          <TimeSeriesChart
            testId="vps.overview.metrics.chart.load1"
            ariaLabel={t('vps.overview.chart.loadavg1_aria', { window: metricsWindow })}
            points={load1Points}
            variant="cpu"
            formatValue={(n) => n.toFixed(2)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-sm font-medium">{t('vps.overview.metrics.chart.load5')}</div>
            <div className="text-xs text-muted">{fmtLoad(loadNow5)}</div>
          </div>
          <TimeSeriesChart
            testId="vps.overview.metrics.chart.load5"
            ariaLabel={t('vps.overview.chart.loadavg5_aria', { window: metricsWindow })}
            points={load5Points}
            variant="cpu"
            formatValue={(n) => n.toFixed(2)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-sm font-medium">{t('vps.overview.metrics.chart.mem_used')}</div>
            <div className="text-xs text-muted">
              {formatMiB(memUsedNow)} <span className="text-faint">/ {formatMiB(memTotal)}</span>
              {memPct != null ? ` (${memPct.toFixed(1)}%)` : ''}
            </div>
          </div>
          <TimeSeriesChart
            testId="vps.overview.metrics.chart.mem_used"
            ariaLabel={t('vps.overview.chart.memory_used_percent_aria', { window: metricsWindow })}
            points={memUsedPercentPoints}
            variant="memory"
            yMin={0}
            yMax={100}
            thresholds={[
              { value: 90, label: '90%', variant: 'warn' },
              { value: 98, label: '98%', variant: 'danger' },
            ]}
            formatValue={(n) => `${n.toFixed(1)}%`}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-sm font-medium">{t('vps.overview.metrics.chart.disk_used')}</div>
            <div className="text-xs text-muted">
              {formatMiB(diskUsedNow)} <span className="text-faint">/ {formatMiB(diskTotal)}</span>
              {diskPct != null ? ` (${diskPct.toFixed(1)}%)` : ''}
            </div>
          </div>
          <TimeSeriesChart
            testId="vps.overview.metrics.chart.disk_used"
            ariaLabel={t('vps.overview.chart.disk_used_percent_aria', { window: metricsWindow })}
            points={diskUsedPercentPoints}
            variant="disk"
            yMin={0}
            yMax={100}
            thresholds={[
              { value: 90, label: '90%', variant: 'warn' },
              { value: 98, label: '98%', variant: 'danger' },
            ]}
            formatValue={(n) => `${n.toFixed(1)}%`}
          />
        </div>
      </div>
    );
  })();

  return (
    <Card className="lg:col-span-12" testId="vps.overview.metrics.card">
      <CardHeader
        title={t('vps.overview.metrics.title')}
        subtitle={t('vps.overview.metrics.subtitle', { window: metricsWindow, samples: metricsRows.length })}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              {(['24h', '7d', '30d'] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  data-testid={`vps.overview.metrics.window.${w}`}
                  className={buttonClassName({
                    size: 'sm',
                    variant: metricsWindow === w ? 'primary' : 'secondary',
                  })}
                  aria-pressed={metricsWindow === w}
                  onClick={() => setMetricsWindow(w)}
                >
                  {w}
                </button>
              ))}
            </div>
            <Button
              testId="vps.overview.metrics.refresh"
              variant="secondary"
              size="sm"
              onClick={() => metricsQ.refetch()}
              disabled={metricsQ.isFetching}
            >
              {t('common.refresh')}
            </Button>
          </div>
        )}
      />
      <CardBody>{body}</CardBody>
    </Card>
  );
}
