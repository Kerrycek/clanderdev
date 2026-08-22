import React, { useMemo } from 'react';

import type { Node, NodePool } from '../../../../lib/api/nodes';
import { formatDateTime, formatMiB } from '../../../../lib/format';
import { Alert } from '../../../../components/ui/Alert';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../../components/ui/Card';
import { Spinner } from '../../../../components/ui/Spinner';
import { StackedBar } from '../../../../components/ui/StackedBar';
import { UsageBar } from '../../../../components/ui/UsageBar';
import { formatErrorMessage } from '../../../../lib/errors';
import {
  extractNodePoolDevices,
  nodeAggregatePool,
  nodePoolCapacity,
  nodePoolRoleValue,
  nodePoolScanValue,
  nodePoolStateValue,
  nodePoolTitle,
  summarizeNodePools,
} from './NodeStorageModel';

type T = (key: any, params?: Record<string, unknown>) => string;
type BadgeVariant = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'black';

const STATE_VARIANTS: Record<string, BadgeVariant> = {
  online: 'ok',
  degraded: 'warn',
  suspended: 'danger',
  faulted: 'danger',
  error: 'danger',
  unknown: 'neutral',
};

function normalizedDeviceState(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return text || fallback;
}

function stateLabel(t: T, state: unknown): string {
  const value = nodePoolStateValue(state);
  const labels: Record<string, string> = {
    online: t('admin.node.storage.state.online'),
    degraded: t('admin.node.storage.state.degraded'),
    suspended: t('admin.node.storage.state.suspended'),
    faulted: t('admin.node.storage.state.faulted'),
    error: t('admin.node.storage.state.error'),
    unknown: t('admin.node.storage.state.unknown'),
  };
  return labels[value] ?? t('admin.node.storage.state.unknown');
}

function scanLabel(t: T, scan: unknown): string {
  const value = nodePoolScanValue(scan);
  const labels: Record<string, string> = {
    none: t('admin.node.storage.scan.none'),
    scrub: t('admin.node.storage.scan.scrub'),
    resilver: t('admin.node.storage.scan.resilver'),
    error: t('admin.node.storage.scan.error'),
    unknown: t('admin.node.storage.scan.unknown'),
  };
  return labels[value] ?? t('admin.node.storage.scan.unknown');
}

function roleLabel(t: T, role: unknown): string {
  const value = nodePoolRoleValue(role);
  const labels: Record<string, string> = {
    hypervisor: t('admin.node.storage.role.hypervisor'),
    primary: t('admin.node.storage.role.primary'),
    backup: t('admin.node.storage.role.backup'),
    unknown: t('admin.node.storage.role.unknown'),
  };
  return labels[value] ?? t('admin.node.storage.role.unknown');
}

function PoolPanel(props: { pool: NodePool; t: T; aggregate?: boolean }) {
  const { pool, t } = props;
  const capacity = nodePoolCapacity(pool);
  const devices = extractNodePoolDevices(pool);
  const hasCapacity = capacity.total !== undefined && capacity.used !== undefined && capacity.available !== undefined;
  const hasPartialCapacity = capacity.total !== undefined || capacity.used !== undefined || capacity.available !== undefined;
  const state = nodePoolStateValue(pool.state);
  const scan = nodePoolScanValue(pool.scan);
  const scanPercentRaw = typeof pool.scan_percent === 'number' && Number.isFinite(pool.scan_percent) ? pool.scan_percent : undefined;
  const scanPercent = scanPercentRaw === undefined ? undefined : Math.max(0, Math.min(100, scanPercentRaw));
  const scanActive = scan === 'scrub' || scan === 'resilver';

  return (
    <div
      className="rounded-lg border border-border bg-surface-2 p-4"
      data-testid={props.aggregate ? 'admin.node.storage.aggregate' : `admin.node.storage.pool.${pool.id}`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate font-semibold text-fg">
              {props.aggregate ? t('admin.node.storage.aggregate.title') : nodePoolTitle(pool)}
            </div>
            <Badge variant={STATE_VARIANTS[state] ?? 'neutral'}>{stateLabel(t, state)}</Badge>
          </div>
          {!props.aggregate ? (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
              <span>#{pool.id}</span>
              <span>{roleLabel(t, pool.role)}</span>
              {pool.filesystem ? <span className="break-all">{pool.filesystem}</span> : null}
            </div>
          ) : (
            <div className="mt-1 text-xs text-muted">{t('admin.node.storage.aggregate.subtitle')}</div>
          )}
        </div>
        <div className="text-xs text-muted">
          {t('admin.node.storage.checked_at')}: {formatDateTime(pool.checked_at)}
        </div>
      </div>

      {!props.aggregate ? (
        <div className="mt-4">
          {hasCapacity ? (
            <UsageBar
              label={t('admin.node.storage.capacity.used')}
              used={capacity.used}
              max={capacity.total}
              formatValue={formatMiB}
              ariaLabel={t('admin.node.storage.capacity.aria', { pool: nodePoolTitle(pool) })}
              testId={`admin.node.storage.pool.${pool.id}.capacity`}
            />
          ) : (
            <div
              className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted"
              data-testid={`admin.node.storage.pool.${pool.id}.capacity-unavailable`}
            >
              {hasPartialCapacity
                ? t('admin.node.storage.capacity.incomplete')
                : t('admin.node.storage.capacity.unavailable')}
            </div>
          )}
          {hasCapacity || hasPartialCapacity ? (
            <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <div className="text-xs text-muted">{t('admin.node.storage.capacity.total')}</div>
                <div className="font-medium tabular-nums">{formatMiB(capacity.total)}</div>
              </div>
              <div>
                <div className="text-xs text-muted">{t('admin.node.storage.capacity.used')}</div>
                <div className="font-medium tabular-nums">{formatMiB(capacity.used)}</div>
              </div>
              <div>
                <div className="text-xs text-muted">{t('admin.node.storage.capacity.available')}</div>
                <div className="font-medium tabular-nums">{formatMiB(capacity.available)}</div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 border-t border-border pt-3">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">{t('admin.node.storage.scan.title')}</span>
          <span className="text-muted">
            {scanLabel(t, scan)}
            {scanActive && scanPercent !== undefined ? ` · ${scanPercent.toFixed(1)} %` : ''}
          </span>
        </div>
        {scanActive ? (
          scanPercent !== undefined ? (
            <StackedBar
              className="mt-2"
              ariaLabel={t('admin.node.storage.scan.aria', { scan: scanLabel(t, scan), percent: scanPercent.toFixed(1) })}
              segments={[
                { value: scanPercent, variant: 'warn' },
                { value: Math.max(0, 100 - scanPercent), variant: 'neutral' },
              ]}
              testId={`${props.aggregate ? 'admin.node.storage.aggregate' : `admin.node.storage.pool.${pool.id}`}.scan`}
            />
          ) : (
            <div className="mt-2 text-xs text-muted">{t('admin.node.storage.scan.progress_unknown')}</div>
          )
        ) : null}
      </div>

      {!props.aggregate ? (
        <div className="mt-4 border-t border-border pt-3">
          <div className="text-sm font-medium">{t('admin.node.storage.devices.title')}</div>
          {devices.length > 0 ? (
            <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2" data-testid={`admin.node.storage.pool.${pool.id}.devices`}>
              {devices.map((device) => (
                <div key={device.key} className="rounded-md border border-border bg-surface px-3 py-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-all font-mono text-xs text-fg">{device.name}</span>
                    {device.state ? (
                      <Badge variant={STATE_VARIANTS[normalizedDeviceState(device.state, 'unknown')] ?? 'neutral'}>
                        {stateLabel(t, device.state)}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-1 text-xs text-muted">{t('admin.node.storage.devices.unavailable')}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function NodeStorageCard(props: {
  t: T;
  node: Node;
  pools: NodePool[];
  loading: boolean;
  fetching: boolean;
  error: unknown;
  onRefresh: () => void;
}) {
  const { t, node, pools, loading, fetching, error, onRefresh } = props;
  const summary = useMemo(() => summarizeNodePools(pools), [pools]);
  const aggregate = useMemo(() => nodeAggregatePool(node), [node]);
  const summaryComplete = !loading && !error && pools.length > 0 && summary.measuredPools === pools.length;

  return (
    <Card testId="admin.node.storage.card">
      <CardHeader
        title={t('admin.node.storage.title')}
        subtitle={t('admin.node.storage.subtitle')}
        actions={
          <Button variant="secondary" size="sm" onClick={onRefresh} disabled={fetching} testId="admin.node.storage.refresh">
            {t('common.refresh')}
          </Button>
        }
      />
      <CardBody>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="admin.node.storage.summary">
          <div className="rounded-md border border-border bg-surface-2 p-3">
            <div className="text-xs text-muted">{t('admin.node.storage.summary.pools')}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{loading || error ? '—' : pools.length}</div>
          </div>
          <div className="rounded-md border border-border bg-surface-2 p-3">
            <div className="text-xs text-muted">{t('admin.node.storage.capacity.total')}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{formatMiB(summaryComplete ? summary.total : undefined)}</div>
          </div>
          <div className="rounded-md border border-border bg-surface-2 p-3">
            <div className="text-xs text-muted">{t('admin.node.storage.capacity.used')}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{formatMiB(summaryComplete ? summary.used : undefined)}</div>
          </div>
          <div className="rounded-md border border-border bg-surface-2 p-3">
            <div className="text-xs text-muted">{t('admin.node.storage.capacity.available')}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{formatMiB(summaryComplete ? summary.available : undefined)}</div>
          </div>
        </div>
        {!loading && !error && pools.length > 0 && !summaryComplete ? (
          <div
            className="mt-3 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted"
            data-testid="admin.node.storage.summary.capacity-unavailable"
          >
            {t('admin.node.storage.capacity.summary_unavailable')}
          </div>
        ) : null}

        <div className="mt-4">
          <PoolPanel pool={aggregate} aggregate t={t} />
        </div>

        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted">
            <Spinner /> {t('common.loading')}
          </div>
        ) : error ? (
          <div className="mt-4">
            <Alert testId="admin.node.storage.load_error" title={t('admin.node.storage.load_error.title')} variant="danger">
              {formatErrorMessage(error)}
            </Alert>
          </div>
        ) : pools.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center" data-testid="admin.node.storage.empty">
            <div className="text-sm font-semibold">{t('admin.node.storage.empty.title')}</div>
            <div className="mt-1 text-sm text-muted">{t('admin.node.storage.empty.body')}</div>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2" data-testid="admin.node.storage.pools">
            {pools.map((pool) => (
              <PoolPanel key={pool.id} pool={pool} t={t} />
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
