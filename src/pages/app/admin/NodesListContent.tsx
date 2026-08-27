import React from 'react';
import { Server } from 'lucide-react';
import { Link } from 'react-router-dom';

import { formatDateTime } from '../../../lib/format';
import type { KeysetPaginationState } from '../../../lib/hooks/useKeysetPagination';
import { isMaintenanceLocked } from '../../../lib/nodeMaintenance';

import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { CopyButton } from '../../../components/ui/CopyButton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { KeysetPagination } from '../../../components/ui/KeysetPagination';
import { LinkButton } from '../../../components/ui/LinkButton';
import { LoadingState } from '../../../components/ui/LoadingState';
import { LockBadge } from '../../../components/ui/LockBadge';
import { StatCard } from '../../../components/ui/StatCard';
import { StatusDot } from '../../../components/ui/StatusDot';
import { SummaryGrid } from '../../../components/layout/SummaryGrid';
import { TableCard } from '../../../components/ui/TableCard';
import { TableRowLink } from '../../../components/ui/TableRowLink';
import { toneSurfaceClass } from '../../../components/ui/tone';

import {
  maintenanceReason,
  nodeDotVariant,
  nodeRowKey,
  nodeRowVariant,
  nodeSecondaryLabel,
  nodeStatusBadge,
  type NodeRow,
  type NodeStats,
} from './NodesModel';
import type { NodesPageTranslator } from './NodesFilters';

interface NodesListContentProps {
  t: NodesPageTranslator;
  basePath: string;
  rows: NodeRow[];
  stats: NodeStats;
  statsScopeLabel: string;
  filtersActive: boolean;
  onClearFilters: () => void;
  onRetry: () => void;
  isBlockingError: boolean;
  nodesError: unknown;
  statusError: unknown;
  showAuthIndexUnavailable: boolean;
  showPublicStatusUnavailable: boolean;
  isLoading: boolean;
  canPaginate: boolean;
  canNext: boolean;
  pageCursor: number | null;
  pagination: KeysetPaginationState;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function NodeStatusBadge(props: { row: NodeRow; t: NodesPageTranslator }) {
  const badge = nodeStatusBadge(props.row.status);
  return <Badge variant={badge.variant}>{props.t(badge.labelKey)}</Badge>;
}

function NodesRowActions(props: { row: NodeRow; basePath: string; t: NodesPageTranslator; compact?: boolean }) {
  const { row, basePath, t, compact = false } = props;
  const copyValue = row.fqdn || row.name;

  if (compact) {
    return (
      <div className="flex items-center justify-end gap-1">
        {copyValue ? (
          <CopyButton
            text={copyValue}
            variant="ghost"
            size="sm"
            className="h-8 w-8 px-0"
            iconOnly
            testId={typeof row.id === 'number' ? `admin.nodes.row.${row.id}.copy` : undefined}
          />
        ) : null}
        {typeof row.id === 'number' ? (
          <Button
            to={`${basePath}/vps?node=${row.id}`}
            variant="ghost"
            size="sm"
            className="h-8 w-8 px-0"
            title={t('admin.node.action.show_vps.title')}
            ariaLabel={t('admin.nodes.action.vpses')}
            testId={`admin.nodes.row.${row.id}.vps`}
          >
            <Server className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {row.fqdn ? <CopyButton text={row.fqdn} /> : row.name ? <CopyButton text={row.name} /> : null}
      {typeof row.id === 'number' ? (
        <LinkButton to={`${basePath}/nodes/${row.id}`} variant="secondary" size="sm">
          {t('common.details')}
        </LinkButton>
      ) : null}
      {typeof row.id === 'number' ? (
        <LinkButton
          to={`${basePath}/vps?node=${row.id}`}
          variant="secondary"
          size="sm"
          title={t('admin.node.action.show_vps.title')}
        >
          {t('admin.nodes.action.vpses')}
        </LinkButton>
      ) : null}
    </div>
  );
}

function NodesPagination(props: {
  pagination: KeysetPaginationState;
  canNext: boolean;
  pageCursor: number | null;
  testId: string;
}) {
  const { pagination, canNext, pageCursor, testId } = props;

  return (
    <KeysetPagination
      page={pagination.page}
      pageCount={pagination.stack.length}
      canPrev={pagination.canPrev}
      canNext={canNext}
      onPrev={pagination.goPrev}
      onNext={() => pagination.goNext(pageCursor)}
      onGoToPage={pagination.goToPage}
      limit={pagination.limit}
      allowedLimits={pagination.allowedLimits}
      onLimitChange={pagination.setLimit}
      testId={testId}
    />
  );
}

function NodesSummary(props: { stats: NodeStats; statsScopeLabel: string; t: NodesPageTranslator }) {
  const { stats, statsScopeLabel, t } = props;

  return (
    <SummaryGrid testId="admin.nodes.summary">
      <StatCard
        className="md:col-span-4"
        testId="admin.nodes.summary.total"
        title={t('admin.nodes.stats.total')}
        value={stats.total}
        subtitle={statsScopeLabel}
        variant="standard"
      />

      <StatCard
        className="md:col-span-4"
        testId="admin.nodes.summary.down"
        title={t('admin.nodes.stats.down')}
        value={<span className={stats.down > 0 ? 'text-danger' : undefined}>{stats.down}</span>}
        subtitle={statsScopeLabel}
        variant={stats.down > 0 ? 'featured' : 'standard'}
      />

      <StatCard
        className="md:col-span-4"
        testId="admin.nodes.summary.maintenance"
        title={t('admin.nodes.stats.maintenance')}
        value={<span className={stats.locked > 0 ? 'text-warn' : undefined}>{stats.locked}</span>}
        subtitle={statsScopeLabel}
        variant="standard"
      />
    </SummaryGrid>
  );
}

function NodesMobileList(props: { rows: NodeRow[]; basePath: string; t: NodesPageTranslator }) {
  const { rows, basePath, t } = props;

  return (
    <div className="space-y-3 md:hidden">
      {rows.map((row, idx) => {
        const rowVariant = nodeRowVariant(row);
        const reason = maintenanceReason(row);
        const showMaintenance = isMaintenanceLocked(row.maintenance_lock);

        return (
          <Card
            key={nodeRowKey(row, idx)}
            testId={typeof row.id === 'number' ? `admin.nodes.card.${row.id}` : undefined}
            className={toneSurfaceClass(rowVariant)}
          >
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusDot
                      variant={nodeDotVariant(row)}
                      testId={typeof row.id === 'number' ? `admin.nodes.card.${row.id}.dot` : undefined}
                    />
                    <div className="truncate text-base font-semibold text-fg">{row.name}</div>
                  </div>
                  <div className="mt-0.5 text-xs text-faint">{nodeSecondaryLabel(row, t('common.na'))}</div>
                </div>
                <NodeStatusBadge row={row} t={t} />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
                <div>
                  <span className="text-faint">{t('admin.node.field.location')}:</span>{' '}
                  {row.locationLabel ?? t('common.na')}
                </div>
                <div>
                  <span className="text-faint">{t('common.vps')}:</span>{' '}
                  {typeof row.vps_count === 'number' ? row.vps_count : t('common.na')}
                  {typeof row.vps_free === 'number' ? (
                    <span className="text-faint"> · {t('common.free_count', { count: row.vps_free })}</span>
                  ) : null}
                </div>
                <div>
                  <span className="text-faint">{t('admin.node.field.cpu_idle')}:</span>{' '}
                  {typeof row.cpu_idle === 'number' ? `${row.cpu_idle}%` : t('common.na')}
                </div>
                <div>
                  <span className="text-faint">{t('admin.node.field.last_report')}:</span>{' '}
                  {formatDateTime(row.last_report)}
                </div>
              </div>

              {showMaintenance ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <LockBadge kind="maintenance" maintenanceReason={reason} t={t} />
                  {reason ? <div className="min-w-0 truncate text-xs text-danger">{reason}</div> : null}
                </div>
              ) : null}

              <div className="mt-4">
                <NodesRowActions row={row} basePath={basePath} t={t} />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function NodesTable(props: {
  rows: NodeRow[];
  basePath: string;
  t: NodesPageTranslator;
  canPaginate: boolean;
  canNext: boolean;
  pageCursor: number | null;
  pagination: KeysetPaginationState;
}) {
  const { rows, basePath, t, canPaginate, canNext, pageCursor, pagination } = props;

  return (
    <TableCard
      className="hidden md:block"
      minWidth="lg"
      tableTestId="admin.nodes.table"
      footer={
        canPaginate ? (
          <NodesPagination
            pagination={pagination}
            canNext={canNext}
            pageCursor={pageCursor}
            testId="admin.nodes.pagination.desktop"
          />
        ) : null
      }
    >
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted">
          <th className="w-8 px-2 py-2"><span className="sr-only">{t('common.state')}</span></th>
          <th className="px-3 py-2">{t('common.node')}</th>
          <th className="px-3 py-2">{t('admin.node.field.location')}</th>
          <th className="px-3 py-2">{t('admin.node.field.status')}</th>
          <th className="px-3 py-2">{t('common.vps')}</th>
          <th className="px-3 py-2">{t('admin.node.field.cpu_idle')}</th>
          <th className="px-3 py-2">{t('admin.node.field.last_report')}</th>
          <th className="px-3 py-2">{t('admin.node.maintenance.title')}</th>
          <th className="px-2 py-2 text-right">{t('common.actions')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => {
          const reason = maintenanceReason(row);
          const showMaintenance = isMaintenanceLocked(row.maintenance_lock);
          const badge = nodeStatusBadge(row.status);

          return (
            <TableRowLink
              key={nodeRowKey(row, idx)}
              testId={typeof row.id === 'number' ? `admin.nodes.row.${row.id}` : undefined}
              to={typeof row.id === 'number' ? `${basePath}/nodes/${row.id}` : undefined}
              variant={nodeRowVariant(row)}
              className="border-b border-border/60 last:border-b-0"
            >
              <td className="px-2 py-2">
                <StatusDot
                  variant={nodeDotVariant(row)}
                  testId={typeof row.id === 'number' ? `admin.nodes.row.${row.id}.dot` : undefined}
                  ariaLabel={t(badge.labelKey)}
                />
              </td>
              <td className="px-3 py-2">
                {typeof row.id === 'number' ? (
                  <Link
                    to={`${basePath}/nodes/${row.id}`}
                    className="font-medium text-link hover:underline"
                    data-testid={`admin.nodes.row.${row.id}.detail`}
                  >
                    {row.name}
                  </Link>
                ) : (
                  <div className="font-medium text-fg">{row.name}</div>
                )}
                <div className="mt-1 text-xs text-faint">{nodeSecondaryLabel(row, t('common.na'))}</div>
              </td>
              <td className="px-3 py-2 text-xs text-muted">{row.locationLabel ?? t('common.na')}</td>
              <td className="px-3 py-2">
                <Badge variant={badge.variant}>{t(badge.labelKey)}</Badge>
              </td>
              <td className="px-3 py-2 text-xs text-muted">
                {typeof row.vps_count === 'number' ? row.vps_count : t('common.na')}
                {typeof row.vps_free === 'number' ? (
                  <span className="text-faint"> · {t('common.free_count', { count: row.vps_free })}</span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-xs text-muted">
                {typeof row.cpu_idle === 'number' ? `${row.cpu_idle}%` : t('common.na')}
              </td>
              <td className="px-3 py-2 text-xs text-muted">{formatDateTime(row.last_report)}</td>
              <td className="px-3 py-2 text-xs">
                {showMaintenance ? (
                  <LockBadge kind="maintenance" maintenanceReason={reason} t={t} />
                ) : (
                  <span className="text-faint">{t('common.na')}</span>
                )}
              </td>
              <td className="px-2 py-2">
                <NodesRowActions row={row} basePath={basePath} t={t} compact />
              </td>
            </TableRowLink>
          );
        })}
      </tbody>
    </TableCard>
  );
}

export function NodesListContent({
  t,
  basePath,
  rows,
  stats,
  statsScopeLabel,
  filtersActive,
  onClearFilters,
  onRetry,
  isBlockingError,
  nodesError,
  statusError,
  showAuthIndexUnavailable,
  showPublicStatusUnavailable,
  isLoading,
  canPaginate,
  canNext,
  pageCursor,
  pagination,
}: NodesListContentProps) {
  if (isBlockingError) {
    return (
      <ErrorState
        testId="admin.nodes.error"
        title={t('admin.nodes.alert.load_failed.title')}
        body={t('admin.nodes.alert.load_failed.body')}
        error={nodesError}
        onRetry={onRetry}
        showBack={false}
        detailsExtra={{
          page: 'admin.nodes',
          nodesError: errorMessage(nodesError),
          statusError: errorMessage(statusError),
        }}
      />
    );
  }

  return (
    <>
      {showAuthIndexUnavailable ? (
        <Alert title={t('admin.nodes.alert.auth_index_unavailable.title')} variant="warn">
          <div>{t('admin.nodes.alert.auth_index_unavailable.body')}</div>
          <div className="mt-2 text-xs text-muted">{errorMessage(nodesError)}</div>
        </Alert>
      ) : null}

      {showPublicStatusUnavailable ? (
        <Alert title={t('admin.nodes.alert.public_status_unavailable.title')} variant="warn">
          <div>{t('admin.nodes.alert.public_status_unavailable.body')}</div>
          <div className="mt-2 text-xs text-muted">{errorMessage(statusError)}</div>
        </Alert>
      ) : null}

      {isLoading ? (
        <LoadingState testId="admin.nodes.loading" />
      ) : (
        <>
          <NodesSummary stats={stats} statsScopeLabel={statsScopeLabel} t={t} />

          {rows.length === 0 ? (
            <EmptyState
              testId="admin.nodes.empty"
              title={filtersActive ? t('empty.list.no_matches.title') : t('admin.nodes.empty.none.title')}
              body={filtersActive ? t('empty.list.no_matches.body') : t('admin.nodes.empty.none.body')}
              actionLabel={filtersActive ? t('common.clear_filters') : t('common.refresh')}
              onAction={filtersActive ? onClearFilters : onRetry}
            />
          ) : (
            <>
              <NodesMobileList rows={rows} basePath={basePath} t={t} />

              {canPaginate ? (
                <Card className="md:hidden">
                  <NodesPagination
                    pagination={pagination}
                    canNext={canNext}
                    pageCursor={pageCursor}
                    testId="admin.nodes.pagination.mobile"
                  />
                </Card>
              ) : null}

              <NodesTable
                rows={rows}
                basePath={basePath}
                t={t}
                pagination={pagination}
                canPaginate={canPaginate}
                canNext={canNext}
                pageCursor={pageCursor}
              />
            </>
          )}
        </>
      )}
    </>
  );
}
