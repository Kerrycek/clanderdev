import React from 'react';
import { Link } from 'react-router-dom';

import type { KeysetPaginationState } from '../../../lib/hooks/useKeysetPagination';
import { formatMiB, formatUptimeSeconds } from '../../../lib/format';

import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { LockBadge } from '../../../components/ui/LockBadge';
import { StatusDot } from '../../../components/ui/StatusDot';
import { toneSurfaceClass } from '../../../components/ui/tone';
import { UsageBar } from '../../../components/ui/UsageBar';
import { KeysetPagination } from '../../../components/ui/KeysetPagination';

import { VpsListRowActions } from './VpsListRowActions';
import type { VpsListRecord, VpsListTranslator } from './vpsListSemantics';

interface VpsListMobileProps {
  rows: VpsListRecord[];
  basePath: string;
  t: VpsListTranslator;
  pagination: KeysetPaginationState;
  canPaginate: boolean;
  hasMore: boolean;
  pageCursor: number | null;
  showOwnerContext: boolean;
  onStart: (row: VpsListRecord) => void;
  onRequestStop: (row: VpsListRecord) => void;
  onRequestRestart: (row: VpsListRecord) => void;
  onRequestDelete: (row: VpsListRecord) => void;
}

export function VpsListMobile({
  rows,
  basePath,
  t,
  pagination,
  canPaginate,
  hasMore,
  pageCursor,
  showOwnerContext,
  onStart,
  onRequestStop,
  onRequestRestart,
  onRequestDelete,
}: VpsListMobileProps) {
  return (
    <>
      <div className="grid gap-3 md:hidden">
        {rows.map((row) => {
          const { vps } = row;
          const failureId = row.recentFailureChainIds[0];

          return (
            <Card key={vps.id} testId={`vps.card.${vps.id}`} className={toneSurfaceClass(row.rowVariant)}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusDot variant={row.dotVariant} testId={`vps.card.${vps.id}.dot`} ariaLabel={row.runtimeBadge.label} />
                      <Link to={`${basePath}/vps/${vps.id}`} className="text-base font-semibold text-fg underline">
                        {vps.hostname}
                      </Link>
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {t('common.id')} {vps.id}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={row.runtimeBadge.variant}>{row.runtimeBadge.label}</Badge>
                    <Badge variant={row.objectBadge.variant}>{row.objectBadge.label}</Badge>
                    {row.memoryRisk ? <Badge variant={row.memoryRisk}>{t('vps.list.state.ram_high')}</Badge> : null}
                    {row.diskRisk ? <Badge variant={row.diskRisk}>{t('vps.list.state.disk_high')}</Badge> : null}
                    {failureId !== undefined ? <Badge variant="danger">{t('vps.list.state.recent_failure', { id: failureId })}</Badge> : null}
                    {row.busyTx ? (
                      <LockBadge kind="transaction" t={t} chainIds={row.busyChains} showDetails />
                    ) : row.busyLocalLock ? (
                      <LockBadge kind="local" t={t} />
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  {showOwnerContext ? (
                    <div>
                      <div className="text-xs text-muted">{t('vps.list.context.owner')}</div>
                      <div className="truncate">{row.ownerLabel}</div>
                    </div>
                  ) : null}
                  <div>
                    <div className="text-xs text-muted">{t('vps.list.context.location')}</div>
                    <div className="truncate">{row.locationLabel}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">{t('common.node')}</div>
                    <div className="truncate">{row.nodeLabel}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">{t('vps.overview.config.memory')}</div>
                    <div>{formatMiB(vps.memory)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">{t('vps.overview.config.diskspace')}</div>
                    <div>{formatMiB(vps.diskspace)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">{t('vps.overview.usage.uptime')}</div>
                    <div>{formatUptimeSeconds(vps.uptime)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">{t('vps.list.resources.load', { value: row.loadLabel })}</div>
                    <div>{vps.cpu ? t('vps.list.resources.cpu', { count: vps.cpu }) : t('common.na')}</div>
                  </div>
                </div>

                {(row.memUsed !== undefined && row.memMax !== undefined && row.memMax > 0) ||
                (row.diskUsed !== undefined && row.diskMax !== undefined && row.diskMax > 0) ? (
                  <div className="mt-3 space-y-2 text-xs text-muted">
                    {row.memUsed !== undefined && row.memMax !== undefined && row.memMax > 0 ? (
                      <UsageBar label={t('vps.list.usage.ram')} used={row.memUsed} max={row.memMax} formatValue={formatMiB} />
                    ) : null}
                    {row.diskUsed !== undefined && row.diskMax !== undefined && row.diskMax > 0 ? (
                      <UsageBar label={t('vps.list.usage.disk')} used={row.diskUsed} max={row.diskMax} formatValue={formatMiB} />
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-4">
                  <VpsListRowActions
                    row={row}
                    basePath={basePath}
                    t={t}
                    testIdPrefix={`vps.card.${vps.id}`}
                    showLabels
                    onStart={onStart}
                    onRequestStop={onRequestStop}
                    onRequestRestart={onRequestRestart}
                    onRequestDelete={onRequestDelete}
                  />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {canPaginate ? (
        <div className="md:hidden">
          <KeysetPagination
            page={pagination.page}
            pageCount={pagination.stack.length}
            canPrev={pagination.canPrev}
            canNext={pagination.hasForward || hasMore}
            onPrev={pagination.goPrev}
            onNext={() => pagination.goNext(pageCursor)}
            onGoToPage={pagination.goToPage}
            limit={pagination.limit}
            allowedLimits={pagination.allowedLimits}
            onLimitChange={pagination.setLimit}
            testId="vps.pagination.mobile"
          />
        </div>
      ) : null}
    </>
  );
}
