import React from 'react';
import { Link } from 'react-router-dom';

import type { KeysetPaginationState } from '../../../lib/hooks/useKeysetPagination';
import { formatMiB, formatUptimeSeconds } from '../../../lib/format';

import { Badge } from '../../../components/ui/Badge';
import { KeysetPagination } from '../../../components/ui/KeysetPagination';
import { LockBadge } from '../../../components/ui/LockBadge';
import { StatusDot } from '../../../components/ui/StatusDot';
import { TableCard } from '../../../components/ui/TableCard';
import { TableRowLink } from '../../../components/ui/TableRowLink';
import { UsageBar } from '../../../components/ui/UsageBar';

import { VpsListRowActions } from './VpsListRowActions';
import type { VpsListRecord, VpsListTranslator } from './vpsListSemantics';

interface VpsListTableProps {
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

export function VpsListTable({
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
}: VpsListTableProps) {
  return (
    <TableCard
      className="hidden md:block"
      minWidth="lg"
      tableClassName="table-fixed"
      tableTestId="vps.table"
      footer={
        canPaginate ? (
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
            testId="vps.pagination.desktop"
          />
        ) : null
      }
    >
      <colgroup>
        <col style={{ width: '3%' }} />
        <col style={{ width: '16%' }} />
        <col style={{ width: '17%' }} />
        <col style={{ width: '14%' }} />
        <col style={{ width: '21%' }} />
        <col style={{ width: '10%' }} />
        <col style={{ width: '19%' }} />
      </colgroup>
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted">
          <th className="px-3 py-2"><span className="sr-only">{t('common.state')}</span></th>
          <th className="px-3 py-2">{t('vps.list.col.vps')}</th>
          <th className="px-3 py-2">{t('common.state')}</th>
          <th className="px-3 py-2">
            {showOwnerContext ? t('vps.list.col.owner_location') : t('vps.list.col.location_node')}
          </th>
          <th className="px-3 py-2">{t('vps.overview.resources.title')}</th>
          <th className="px-3 py-2">{t('vps.list.col.activity')}</th>
          <th className="px-3 py-2 text-right">{t('common.actions')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const { vps } = row;
          const failureId = row.recentFailureChainIds[0];

          return (
            <TableRowLink
              key={vps.id}
              testId={`vps.row.${vps.id}`}
              to={`${basePath}/vps/${vps.id}`}
              variant={row.rowVariant}
              className="border-b border-border/60 last:border-b-0"
            >
              <td className="px-3 py-2 align-top">
                <StatusDot variant={row.dotVariant} testId={`vps.row.${vps.id}.dot`} ariaLabel={row.runtimeBadge.label} />
              </td>
              <td className="px-3 py-2 align-top">
                <div className="flex flex-col gap-1">
                  <Link to={`${basePath}/vps/${vps.id}`} className="font-medium text-fg underline">
                    {vps.hostname}
                  </Link>
                  <div className="text-xs text-muted">{t('common.id')} {vps.id}</div>
                </div>
              </td>
              <td className="px-3 py-2 align-top">
                <div className="flex flex-wrap items-center gap-2" data-testid={`vps.row.${vps.id}.state`}>
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
              </td>
              <td className="px-3 py-2 align-top text-xs">
                <div className="flex flex-col gap-1">
                  {showOwnerContext ? (
                    <div><span className="text-muted">{t('vps.list.context.owner')}:</span> {row.ownerLabel}</div>
                  ) : null}
                  <div><span className="text-muted">{t('vps.list.context.location')}:</span> {row.locationLabel}</div>
                  <div><span className="text-muted">{t('common.node')}:</span> {row.nodeLabel}</div>
                </div>
              </td>
              <td className="px-3 py-2 align-top text-xs text-muted">
                <div className="flex flex-col gap-1">
                  <div className="text-faint">
                    {vps.cpu ? t('vps.list.resources.cpu', { count: vps.cpu }) : t('common.na')} ·{' '}
                    {t('vps.list.resources.load', { value: row.loadLabel })}
                  </div>
                  {row.memUsed !== undefined && row.memMax !== undefined && row.memMax > 0 ? (
                    <UsageBar layout="row" label={t('vps.list.usage.ram')} used={row.memUsed} max={row.memMax} formatValue={formatMiB} />
                  ) : null}
                  {row.diskUsed !== undefined && row.diskMax !== undefined && row.diskMax > 0 ? (
                    <UsageBar layout="row" label={t('vps.list.usage.disk')} used={row.diskUsed} max={row.diskMax} formatValue={formatMiB} />
                  ) : null}
                </div>
              </td>
              <td className="px-3 py-2 align-top text-xs text-muted">
                <div className="flex flex-col gap-1">
                  <span>{formatUptimeSeconds(vps.uptime)}</span>
                  {row.busyTx ? <span>{t('vps.list.activity.busy')}</span> : null}
                </div>
              </td>
              <td className="px-3 py-2 align-top">
                <VpsListRowActions
                  row={row}
                  basePath={basePath}
                  t={t}
                  testIdPrefix={`vps.row.${vps.id}`}
                  showLabels={false}
                  onStart={onStart}
                  onRequestStop={onRequestStop}
                  onRequestRestart={onRequestRestart}
                  onRequestDelete={onRequestDelete}
                />
              </td>
            </TableRowLink>
          );
        })}
      </tbody>
    </TableCard>
  );
}
