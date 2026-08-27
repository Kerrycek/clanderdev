import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { useAppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';
import { fetchDnsRecordLogs } from '../../../lib/api/dns';
import { cursorFromDescendingPage } from '../../../lib/lockIndex';
import { formatDateTime } from '../../../lib/format';
import { useKeysetPagination } from '../../../lib/hooks/useKeysetPagination';

import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Input } from '../../../components/ui/Input';
import { KeysetPagination } from '../../../components/ui/KeysetPagination';
import { LoadingState } from '../../../components/ui/LoadingState';

import { useDnsZoneContext } from './DnsZoneContext';

export function DnsZoneLogsPage() {
  const { basePath } = useAppMode();
  const { t } = useI18n();
  const { zone } = useDnsZoneContext();
  const changeBadge = (changeType: unknown) => {
    const ct = String(changeType ?? '');
    if (ct === 'create') return <Badge variant="ok">{t('common.created')}</Badge>;
    if (ct === 'update') return <Badge variant="warn">{t('common.updated')}</Badge>;
    if (ct === 'delete') return <Badge variant="neutral">{t('common.deleted')}</Badge>;
    return <Badge variant="neutral">{ct || t('common.na')}</Badge>;
  };

  const [searchParams, setSearchParams] = useSearchParams();
  const [qstr, setQstr] = useState(() => searchParams.get('q') ?? '');

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const trimmed = qstr.trim();
    if (trimmed) next.set('q', trimmed);
    else next.delete('q');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [qstr, searchParams, setSearchParams]);

  const pagination = useKeysetPagination({
    id: 'dns.logs.list',
    filterKey: JSON.stringify({ zoneId: zone.id, q: qstr.trim() }),
    searchParams,
    setSearchParams,
    defaultLimit: 50,
    allowedLimits: [25, 50, 100],
  });

  const logsQ = useQuery({
    queryKey: ['dns_record_logs', 'index', { dns_zone: zone.id, limit: pagination.limit, fromId: pagination.fromId, q: qstr.trim() }],
    queryFn: async () =>
      fetchDnsRecordLogs({
        dns_zone: zone.id,
        limit: pagination.limit,
        fromId: pagination.fromId,
        q: qstr.trim() || undefined,
      }),
  });

  const pageData = logsQ.data?.data ?? [];
  const totalCount =
    typeof logsQ.data?.meta?.['total_count'] === 'number' ? Number(logsQ.data.meta['total_count']) : pageData.length;
  const rows = pageData;

  const pageCursor = useMemo(() => cursorFromDescendingPage(pageData as any), [pageData]);
  const hasMore = pageData.length >= pagination.limit;
  const filtersActive = Boolean(qstr.trim());

  return (
    <div className="space-y-6" data-testid="dns.logs.list">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-fg">{t('dns.zone.logs.page.title')}</h2>
          <p className="mt-1 text-sm text-muted">{t('dns.zone.logs.page.description')}</p>
          {filtersActive ? <p className="mt-1 text-xs text-faint">{t('list.meta.filters_active')}</p> : null}
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
          <div className="w-full sm:w-72">
            <Input
              value={qstr}
              onChange={(e) => setQstr(e.target.value)}
              placeholder={t('dns.zone.logs.search.placeholder')}
              autoComplete="off"
              testId="dns.logs.search.input"
            />
            <div className="mt-1 text-xs text-faint">
              {t('common.showing_n_of_m', { shown: rows.length, total: totalCount })}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => logsQ.refetch()}
              disabled={logsQ.isFetching}
              testId="dns.logs.refresh"
            >
              {t('common.refresh')}
            </Button>
          </div>
        </div>
      </div>

      {logsQ.isLoading ? (
        <Card>
          <LoadingState testId="dns.logs.loading" />
        </Card>
      ) : logsQ.isError ? (
        <ErrorState
          testId="dns.logs.error"
          title={t('dns.zone.logs.load_failed')}
          error={logsQ.error}
          onRetry={() => void logsQ.refetch()}
          showBack={false}
          detailsExtra={{ page: 'dns.logs', zoneId: zone.id }}
        />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {rows.length === 0 ? (
              <Card>
                <div className="p-4 text-center text-sm text-muted">{t('dns.zone.logs.empty')}</div>
              </Card>
            ) : (
              rows.map((l) => {
                const chainId =
                  l.transaction_chain && typeof l.transaction_chain === 'object' && 'id' in l.transaction_chain
                    ? Number((l.transaction_chain as any).id)
                    : undefined;

                return (
                  <Card key={l.id} testId={`dns.logs.card.${l.id}`}>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {changeBadge(l.change_type)}
                            <div className="truncate text-base font-semibold text-fg">{String(l.name ?? '')}</div>
                            <Badge variant="neutral">{String(l.type ?? t('common.na'))}</Badge>
                          </div>
                          <div className="mt-1 text-xs text-faint">#{l.id}</div>
                          <div className="mt-1 text-xs text-faint">
                            {l.created_at ? formatDateTime(String(l.created_at)) : t('common.na')}
                          </div>
                        </div>

                        {chainId ? (
                          <Link
                            className="text-sm font-medium text-accent hover:underline"
                            to={`${basePath}/transactions/${chainId}`}
                          >
                            #{chainId}
                          </Link>
                        ) : null}
                      </div>

                      {l.attr_changes ? (
                        <details className="mt-3">
                          <summary className="cursor-pointer text-sm text-muted">{t('dns.zone.logs.table.changes')}</summary>
                          <pre className="mt-2 max-w-content-lg overflow-x-auto whitespace-pre-wrap text-xs text-muted">
                            {JSON.stringify(l.attr_changes, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  </Card>
                );
              })
            )}
          </div>

          {/* Desktop table */}
          <Card className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-list">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-faint">
                    <th className="py-2 pl-4 pr-3">{t('common.time')}</th>
                    <th className="py-2 pr-3">{t('dns.zone.logs.table.change')}</th>
                    <th className="py-2 pr-3">{t('common.name')}</th>
                    <th className="py-2 pr-3">{t('common.type')}</th>
                    <th className="py-2 pr-3">{t('dns.zone.logs.table.transaction')}</th>
                    <th className="py-2 pr-4">{t('dns.zone.logs.table.changes')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-sm text-muted">
                        {t('dns.zone.logs.empty')}
                      </td>
                    </tr>
                  ) : (
                    rows.map((l) => {
                      const chainId =
                        l.transaction_chain && typeof l.transaction_chain === 'object' && 'id' in l.transaction_chain
                          ? Number((l.transaction_chain as any).id)
                          : undefined;

                      return (
                        <tr key={l.id} className="border-t border-border" data-testid={`dns.logs.row.${l.id}`}>
                          <td className="py-2 pl-4 pr-3">
                            {l.created_at ? formatDateTime(String(l.created_at)) : t('common.na')}
                          </td>
                          <td className="py-2 pr-3">{changeBadge(l.change_type)}</td>
                          <td className="py-2 pr-3">
                            <div className="font-medium text-fg">{String(l.name ?? '')}</div>
                            {l.dns_zone_name ? (
                              <div className="mt-1 text-xs text-muted">{String(l.dns_zone_name)}</div>
                            ) : null}
                            <div className="mt-1 text-xs text-faint">#{l.id}</div>
                          </td>
                          <td className="py-2 pr-3">{String(l.type ?? t('common.na'))}</td>
                          <td className="py-2 pr-3">
                            {chainId ? (
                              <Link
                                className="text-sm font-medium text-accent hover:underline"
                                to={`${basePath}/transactions/${chainId}`}
                              >
                                #{chainId}
                              </Link>
                            ) : (
                              t('common.na')
                            )}
                          </td>
                          <td className="py-2 pr-4">
                            <pre className="max-w-content-lg overflow-x-auto whitespace-pre-wrap text-xs text-muted">
                              {l.attr_changes ? JSON.stringify(l.attr_changes, null, 2) : t('common.na')}
                            </pre>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <KeysetPagination
              page={pagination.page}
              pageCount={pagination.stack.length}
              canPrev={pagination.canPrev}
              canNext={hasMore}
              onPrev={pagination.goPrev}
              onNext={() => pagination.goNext(pageCursor)}
              onGoToPage={pagination.goToPage}
              limit={pagination.limit}
              allowedLimits={pagination.allowedLimits}
              onLimitChange={pagination.setLimit}
              testId="dns.logs.pagination.desktop"
            />
          </Card>

          {/* Mobile pagination */}
          <div className="md:hidden">
            <Card>
              <KeysetPagination
                page={pagination.page}
                pageCount={pagination.stack.length}
                canPrev={pagination.canPrev}
                canNext={hasMore}
                onPrev={pagination.goPrev}
                onNext={() => pagination.goNext(pageCursor)}
                onGoToPage={pagination.goToPage}
                limit={pagination.limit}
                allowedLimits={pagination.allowedLimits}
                onLimitChange={pagination.setLimit}
                testId="dns.logs.pagination.mobile"
                className="border-t-0"
              />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
