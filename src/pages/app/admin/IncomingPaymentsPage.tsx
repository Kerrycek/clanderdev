import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';

import { fetchIncomingPayments, updateIncomingPaymentState } from '../../../lib/api/payments';
import { getMetaTotalCount } from '../../../lib/api/haveapi';
import { useCountedKeysetPagination } from '../../../lib/hooks/useCountedKeysetPagination';
import { useKeysetPagination } from '../../../lib/hooks/useKeysetPagination';
import { useTierSlowIntervalMs } from '../../../lib/refreshTiers';
import { formatErrorMessage } from '../../../lib/errors';
import { useToasts } from '../../../app/toasts';

import { ListShell } from '../../../components/layout/ListShell';
import { PageHeader } from '../../../components/layout/PageHeader';

import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { LoadingState } from '../../../components/ui/LoadingState';
import { IncomingPaymentsFilters } from './IncomingPaymentsFilters';
import { IncomingPaymentsBulkActions } from './IncomingPaymentsBulkActions';
import { IncomingPaymentsListContent } from './IncomingPaymentsListContent';
import { IncomingPaymentsReconciliationSummary } from './IncomingPaymentsReconciliationCards';
import { incomingPaymentStateFilterOptions } from './IncomingPaymentsModel';
import { type IncomingPaymentBulkAction, type IncomingPaymentBulkReview } from './IncomingPaymentsBulkModel';
import { AdminFinanceTabs } from './AdminFinanceTabs';

async function fetchIncomingPaymentStateTotal(input: {
  state: 'queued' | 'unmatched' | 'processed' | 'ignored';
}): Promise<number | undefined> {
  try {
    const res = await fetchIncomingPayments({
      limit: 1,
      state: input.state,
      count: true,
    });

    return getMetaTotalCount(res.meta);
  } catch {
    return undefined;
  }
}

export function IncomingPaymentsPage() {
  const { basePath } = useAppMode();
  const { t } = useI18n();
  const toasts = useToasts();
  const qc = useQueryClient();
  const tierSlowMs = useTierSlowIntervalMs();

  const [sp, setSp] = useSearchParams();

  const state = useMemo(() => {
    const raw = String(sp.get('state') ?? '').trim().toLowerCase();
    if (!raw) return '';
    return incomingPaymentStateFilterOptions().includes(raw) ? raw : '';
  }, [sp]);

  useEffect(() => {
    // Remove stale links created before we aligned the UI with the API contract.
    if (!sp.has('q') && !sp.has('user')) return;
    const next = new URLSearchParams(sp);
    next.delete('q');
    next.delete('user');
    setSp(next, { replace: true });
  }, [sp, setSp]);

  const setStateFilter = (nextState: string) => {
    const st = String(nextState ?? '').trim().toLowerCase();
    setSp((prev) => {
      const p = new URLSearchParams(prev);
      if (st && incomingPaymentStateFilterOptions().includes(st)) p.set('state', st);
      else p.delete('state');
      return p;
    });
  };

  const pagination = useKeysetPagination({
    id: 'admin.payments.incoming.list',
    filterKey: JSON.stringify({ scope: basePath, state }),
    searchParams: sp,
    setSearchParams: setSp,
    defaultLimit: 50,
    allowedLimits: [25, 50, 100, 200],
  });

  const paymentsQ = useQuery({
    queryKey: [
      'incoming_payments',
      'index',
      { limit: pagination.limit, fromId: pagination.fromId, state: state || undefined },
    ],
    queryFn: async () =>
      fetchIncomingPayments({
        limit: pagination.limit,
        fromId: pagination.fromId,
        state: state || undefined,
        count: true,
      }),
    refetchInterval: tierSlowMs,
  });

  const reconciliationTotalsQ = useQuery({
    queryKey: ['incoming_payments', 'reconciliation_totals'],
    queryFn: async () => {
      const [queued, unmatched, processed, ignored] = await Promise.all([
        fetchIncomingPaymentStateTotal({ state: 'queued' }),
        fetchIncomingPaymentStateTotal({ state: 'unmatched' }),
        fetchIncomingPaymentStateTotal({ state: 'processed' }),
        fetchIncomingPaymentStateTotal({ state: 'ignored' }),
      ]);

      return { queued, unmatched, processed, ignored };
    },
    refetchInterval: tierSlowMs,
  });

  const rows = paymentsQ.data?.data ?? [];
  const totalCount = getMetaTotalCount(paymentsQ.data?.meta);
  const loadPaymentsPage = useCallback(async (fromId: number | undefined) => (
    await fetchIncomingPayments({
      limit: pagination.limit,
      fromId,
      state: state || undefined,
    })
  ).data, [pagination.limit, state]);
  const countedPagination = useCountedKeysetPagination({
    pagination,
    totalCount,
    rows,
    loadPage: loadPaymentsPage,
    direction: 'desc',
  });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [bulkAction, setBulkAction] = useState<IncomingPaymentBulkAction>('mark_unmatched');
  const [bulkApplying, setBulkApplying] = useState(false);

  useEffect(() => {
    const visibleIds = new Set(rows.map((row) => row.id));
    setSelectedIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const replaceSelection = useCallback((ids: number[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const toggleSelected = useCallback((id: number, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleAllVisible = useCallback((selected: boolean) => {
    setSelectedIds(selected ? new Set(rows.map((row) => row.id)) : new Set());
  }, [rows]);

  const applyBulkReview = useCallback(async (review: IncomingPaymentBulkReview) => {
    if (!review.canSubmit || review.eligibleIds.length === 0) return;

    setBulkApplying(true);
    let succeeded = 0;
    let failed = 0;
    let firstError: unknown;

    try {
      for (const id of review.eligibleIds) {
        try {
          await updateIncomingPaymentState(id, review.targetState);
          succeeded += 1;
        } catch (error: unknown) {
          failed += 1;
          firstError ??= error;
        }
      }

      if (succeeded > 0) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const id of review.eligibleIds) next.delete(id);
          return next;
        });
        await paymentsQ.refetch();
        qc.invalidateQueries({ queryKey: ['incoming_payments', 'index'] });
      }

      if (failed === 0) {
        toasts.pushToast({
          variant: 'ok',
          title: t('payments.incoming.bulk.toast.success.title'),
          body: t('payments.incoming.bulk.toast.success.body', { count: succeeded }),
        });
      } else {
        toasts.pushToast({
          variant: succeeded > 0 ? 'warn' : 'danger',
          title: t('payments.incoming.bulk.toast.partial.title'),
          body: t('payments.incoming.bulk.toast.partial.body', {
            succeeded,
            failed,
            error: firstError ? formatErrorMessage(firstError) : t('common.unknown_error'),
          }),
          autoDismissMs: false,
        });
      }
    } finally {
      setBulkApplying(false);
    }
  }, [paymentsQ, qc, t, toasts]);

  const shareUrl = useMemo(() => (typeof window !== 'undefined' ? window.location.href : ''), [sp]);

  return (
    <ListShell
      testId="admin.payments.incoming.list"
      header={(
        <div className="space-y-4">
          <PageHeader title={t('payments.incoming.list.title')} description={t('payments.incoming.list.description')} />
          <AdminFinanceTabs />
        </div>
      )}
      filters={
        <IncomingPaymentsFilters
          basePath={basePath}
          state={state}
          setSearchParams={setSp}
          onRefresh={() => paymentsQ.refetch()}
          shareUrl={shareUrl}
        />
      }
    >
      {paymentsQ.isLoading ? (
        <LoadingState testId="admin.payments.incoming.loading" />
      ) : paymentsQ.isError ? (
        <ErrorState
          testId="admin.payments.incoming.error"
          title={t('payments.incoming.list.load_error.title')}
          error={paymentsQ.error}
        />
      ) : rows.length === 0 ? (
        <EmptyState testId="admin.payments.incoming.empty" title={t('payments.incoming.list.empty')} />
      ) : (
        <div className="space-y-3">
          <IncomingPaymentsBulkActions
            rows={rows}
            selectedIds={selectedIds}
            action={bulkAction}
            applying={bulkApplying}
            onActionChange={setBulkAction}
            onReplaceSelection={replaceSelection}
            onClearSelection={clearSelection}
            onApply={applyBulkReview}
          />
          <IncomingPaymentsReconciliationSummary
            rows={rows}
            activeState={state}
            onSetState={setStateFilter}
            stateTotals={reconciliationTotalsQ.data}
          />
          <IncomingPaymentsListContent
            rows={rows}
            basePath={basePath}
            pagination={pagination}
            pageCount={countedPagination.pageCount}
            totalPagesKnown={countedPagination.totalPagesKnown}
            onGoToPage={countedPagination.goToPage}
            maxDirectPage={countedPagination.maxDirectPage}
            jumpPending={countedPagination.isJumping}
            pageCursor={countedPagination.pageCursor}
            canNext={countedPagination.canNext}
            selectedIds={selectedIds}
            onToggleSelected={toggleSelected}
            onToggleAllVisible={toggleAllVisible}
          />
        </div>
      )}
    </ListShell>
  );
}
