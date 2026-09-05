import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, RefreshCw } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

import { useAppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';
import { FilterBar } from '../../../components/layout/FilterBar';
import { ListShell } from '../../../components/layout/ListShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Input } from '../../../components/ui/Input';
import { KeysetPagination } from '../../../components/ui/KeysetPagination';
import { LoadingState } from '../../../components/ui/LoadingState';
import { TableCard } from '../../../components/ui/TableCard';
import { UserLookupInput } from '../../../components/ui/UserLookupInput';
import {
  FinancePeriodFilterUnsupportedError,
  fetchFinancePaymentHistoryPage,
} from '../../../lib/api/finance';
import {
  fetchUserPaymentIndexCapability,
  type ResourceRef,
  type UserPayment,
  userPaymentIndexSupportsPeriod,
} from '../../../lib/api/payments';
import { fetchSystemConfigs, type SystemConfigItem } from '../../../lib/api/systemConfig';
import { formatDate, formatDateTime } from '../../../lib/format';
import { useKeysetPagination } from '../../../lib/hooks/useKeysetPagination';
import { parseLookupIdLike } from '../../../lib/lookupInput';
import { safeInt } from '../../../lib/paymentsFormat';
import { AdminFinanceTabs } from './AdminFinanceTabs';
import { normalizeFinancePeriodFilters, parseFinancePeriodFilters } from './FinanceOverviewModel';
import { resourceRefLabel } from '../payments/PaymentsModel';

function defaultCurrency(configs: readonly SystemConfigItem[] | undefined): string | undefined {
  const raw = configs?.find((item) => (
    item.category === 'plugin_payments' && item.name === 'default_currency'
  ))?.value;
  if (typeof raw !== 'string') return undefined;
  const normalized = raw.trim().toUpperCase();
  return normalized || undefined;
}

function formatAmount(amount: unknown, locale: string, currency?: string): string {
  const value = safeInt(amount);
  if (value === undefined) return '—';
  const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
  return currency ? `${formatted} ${currency}` : formatted;
}

function refLabel(ref: ResourceRef | undefined): string {
  return ref ? resourceRefLabel(ref) : '—';
}

function monthRange(offset: number): { from: string; to: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

function ninetyDayRange(): { from: string; to: string } {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 89);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

function paymentUserLink(payment: UserPayment, basePath: string) {
  if (!payment.user?.id) return <span className="text-faint">—</span>;
  return (
    <Link className="text-accent hover:underline" to={`${basePath}/users/${payment.user.id}/payments`}>
      {refLabel(payment.user)}
    </Link>
  );
}

function paymentSource(payment: UserPayment, basePath: string, manualLabel: string) {
  if (!payment.incoming_payment?.id) return <span className="text-faint">{manualLabel}</span>;
  return (
    <Link className="text-accent hover:underline" to={`${basePath}/payments/incoming/${payment.incoming_payment.id}`}>
      #{payment.incoming_payment.id}
    </Link>
  );
}

export function PaymentHistoryPage() {
  const { basePath } = useAppMode();
  const { lang, t } = useI18n();
  const locale = lang === 'cs' ? 'cs-CZ' : 'en-US';
  const [searchParams, setSearchParams] = useSearchParams();
  const period = useMemo(() => parseFinancePeriodFilters(searchParams), [searchParams]);
  const userId = useMemo(() => parseLookupIdLike(searchParams.get('user') ?? '') ?? undefined, [searchParams]);
  const [draftUser, setDraftUser] = useState(userId ? String(userId) : '');
  const [draftFrom, setDraftFrom] = useState(period.from);
  const [draftTo, setDraftTo] = useState(period.to);

  useEffect(() => {
    setDraftUser(userId ? String(userId) : '');
    setDraftFrom(period.from);
    setDraftTo(period.to);
  }, [period.from, period.to, userId]);

  const draftUserId = parseLookupIdLike(draftUser);
  const userValid = !draftUser.trim() || draftUserId !== null;
  const hasPeriod = Boolean(period.from || period.to);

  const periodCapabilityQ = useQuery({
    queryKey: ['user_payments', 'capability', 'index'],
    queryFn: async ({ signal }) => (await fetchUserPaymentIndexCapability(signal)).data,
    enabled: hasPeriod,
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const periodSupported = !hasPeriod
    || (periodCapabilityQ.isSuccess && userPaymentIndexSupportsPeriod(periodCapabilityQ.data));

  const pagination = useKeysetPagination({
    id: 'admin.finance.payment_history',
    filterKey: JSON.stringify({ userId, ...period }),
    searchParams,
    setSearchParams,
    defaultLimit: 50,
    allowedLimits: [25, 50, 100],
  });

  const historyQ = useQuery({
    queryKey: ['finance', 'payment_history', {
      userId,
      from: period.from || undefined,
      to: period.to || undefined,
      limit: pagination.limit,
      fromId: pagination.fromId,
    }],
    queryFn: ({ signal }) => fetchFinancePaymentHistoryPage({
      userId,
      createdFrom: period.from || undefined,
      createdTo: period.to || undefined,
      limit: pagination.limit,
      fromId: pagination.fromId ?? undefined,
      signal,
    }),
    enabled: periodSupported,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const configsQ = useQuery({
    queryKey: ['system_configs'],
    queryFn: async () => (await fetchSystemConfigs()).data,
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const currency = defaultCurrency(configsQ.data);
  const rows = historyQ.data?.rows ?? [];
  const nextCursor = historyQ.data?.nextFromId ?? null;
  const canNext = nextCursor !== null;
  const pageCount = Math.max(pagination.stack.length, pagination.page + (canNext ? 1 : 0));

  const replaceFilters = (next: { user?: number; from?: string; to?: string }) => {
    setSearchParams((previous) => {
      const params = new URLSearchParams(previous);
      if (next.user) params.set('user', String(next.user));
      else params.delete('user');
      if (next.from) params.set('from', next.from);
      else params.delete('from');
      if (next.to) params.set('to', next.to);
      else params.delete('to');
      params.delete('from_id');
      params.delete('page');
      return params;
    });
  };

  const applyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userValid) return;
    const normalized = normalizeFinancePeriodFilters({ from: draftFrom, to: draftTo });
    replaceFilters({
      user: draftUserId ?? undefined,
      from: normalized.from || undefined,
      to: normalized.to || undefined,
    });
  };

  const applyPreset = (value: 'all' | 'current' | 'previous' | '90_days') => {
    const range = value === 'current'
      ? monthRange(0)
      : value === 'previous'
        ? monthRange(-1)
        : value === '90_days'
          ? ninetyDayRange()
          : { from: '', to: '' };
    replaceFilters({ user: userId, from: range.from || undefined, to: range.to || undefined });
  };

  const paginationNode = (
    <KeysetPagination
      page={pagination.page}
      pageCount={pageCount}
      totalPagesKnown={historyQ.data?.complete === true}
      canPrev={pagination.canPrev}
      canNext={canNext}
      onPrev={pagination.goPrev}
      onNext={() => pagination.goNext(nextCursor)}
      onGoToPage={pagination.goToPage}
      maxDirectPage={pagination.stack.length}
      limit={pagination.limit}
      allowedLimits={pagination.allowedLimits}
      onLimitChange={pagination.setLimit}
    />
  );

  return (
    <ListShell
      testId="admin.finance.history"
      header={(
        <div className="space-y-4">
          <PageHeader
            title={t('finance.history.title')}
            description={t('finance.history.description')}
            actions={(
              <>
                <Button to={`${basePath}/payments/incoming`} variant="secondary" size="sm" testId="admin.finance.history.open_incoming">
                  <CreditCard size={16} aria-hidden="true" />
                  {t('finance.history.open_incoming')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={historyQ.isFetching || periodCapabilityQ.isFetching}
                  onClick={() => {
                    if (hasPeriod) void periodCapabilityQ.refetch();
                    if (periodSupported) void historyQ.refetch();
                  }}
                  testId="admin.finance.history.refresh"
                >
                  <RefreshCw size={16} aria-hidden="true" />
                  {t('finance.history.refresh')}
                </Button>
              </>
            )}
          />
          <AdminFinanceTabs />
        </div>
      )}
      filters={(
        <Card testId="admin.finance.history.filters">
          <CardBody>
            <form className="space-y-3" onSubmit={applyFilters}>
              <FilterBar>
                <UserLookupInput
                  className="w-full sm:min-w-64 sm:flex-1"
                  label={t('finance.history.filter.user')}
                  ariaLabel={t('finance.history.filter.user')}
                  value={draftUser}
                  onChange={setDraftUser}
                  objectStates={['active', 'suspended', 'soft_delete', 'deleted']}
                  onPick={(user) => setDraftUser(String(user.id))}
                  placeholder={t('finance.history.filter.user.placeholder')}
                  testId="admin.finance.history.filter.user"
                />
                <div className="w-full sm:w-44">
                  <Input
                    label={t('finance.history.filter.from')}
                    type="date"
                    value={draftFrom}
                    onChange={(event) => setDraftFrom(event.target.value)}
                    testId="admin.finance.history.filter.from"
                  />
                </div>
                <div className="w-full sm:w-44">
                  <Input
                    label={t('finance.history.filter.to')}
                    type="date"
                    value={draftTo}
                    onChange={(event) => setDraftTo(event.target.value)}
                    testId="admin.finance.history.filter.to"
                  />
                </div>
                <Button type="submit" disabled={!userValid} testId="admin.finance.history.filter.apply">
                  {t('finance.history.filter.apply')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => replaceFilters({})}
                  testId="admin.finance.history.filter.clear"
                >
                  {t('common.clear_filters')}
                </Button>
              </FilterBar>
              {!userValid ? (
                <div className="text-xs text-danger" role="alert">{t('finance.history.filter.user.invalid')}</div>
              ) : null}
              <div className="flex flex-wrap gap-2" aria-label={t('finance.history.filter.presets')}>
                {(['all', 'current', 'previous', '90_days'] as const).map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => applyPreset(preset)}
                    testId={`admin.finance.history.filter.preset.${preset}`}
                  >
                    {t(`finance.history.filter.preset.${preset}`)}
                  </Button>
                ))}
              </div>
              <div className="text-xs text-muted">{t('finance.history.filter.period_note')}</div>
            </form>
          </CardBody>
        </Card>
      )}
    >
      {hasPeriod && periodCapabilityQ.isLoading ? (
        <LoadingState testId="admin.finance.history.loading" />
      ) : hasPeriod && periodCapabilityQ.isError ? (
        <ErrorState
          title={t('finance.history.load_error')}
          error={periodCapabilityQ.error}
          onRetry={() => void periodCapabilityQ.refetch()}
          showBack={false}
          testId="admin.finance.history.error"
        />
      ) : hasPeriod && periodCapabilityQ.isSuccess && !periodSupported ? (
        <ErrorState
          title={t('finance.history.api_filter_required.title')}
          error={{ message: t('finance.history.api_filter_required.body') }}
          onRetry={() => void periodCapabilityQ.refetch()}
          showBack={false}
          testId="admin.finance.history.error"
        />
      ) : historyQ.isLoading ? (
        <LoadingState testId="admin.finance.history.loading" />
      ) : historyQ.isError ? (
        <ErrorState
          title={t(historyQ.error instanceof FinancePeriodFilterUnsupportedError
            ? 'finance.history.api_filter_required.title'
            : 'finance.history.load_error')}
          error={historyQ.error instanceof FinancePeriodFilterUnsupportedError
            ? { message: t('finance.history.api_filter_required.body') }
            : historyQ.error}
          onRetry={() => void historyQ.refetch()}
          showBack={false}
          testId="admin.finance.history.error"
        />
      ) : historyQ.data ? (
        <div className="space-y-3">
          {configsQ.isError || (configsQ.isSuccess && !currency) ? (
            <Alert
              variant="warn"
              title={t('finance.overview.currency_error.title')}
              description={t('finance.overview.currency_error.body')}
              testId="admin.finance.history.currency_error"
            />
          ) : null}
          {historyQ.data.incompleteReason ? (
            <Alert
              variant="warn"
              title={t('finance.history.incomplete.title')}
              description={t('finance.history.incomplete.body', { count: historyQ.data.scannedRows })}
              testId="admin.finance.history.incomplete"
            />
          ) : null}
          {historyQ.data.invalidCreatedAtRows > 0 ? (
            <Alert
              variant="warn"
              title={t('finance.history.invalid_dates.title')}
              description={t('finance.history.invalid_dates.body', { count: historyQ.data.invalidCreatedAtRows })}
              testId="admin.finance.history.invalid_dates"
            />
          ) : null}
          {(period.from || period.to) && !historyQ.data.incompleteReason ? (
            <Alert
              variant="neutral"
              title={t('finance.history.period_active.title')}
              description={t('finance.history.period_active.body', {
                from: period.from || '—',
                to: period.to || '—',
                count: historyQ.data.scannedRows,
              })}
              testId="admin.finance.history.period_active"
            />
          ) : null}

          {rows.length > 0 ? (
            <>
              <div className="space-y-2 md:hidden" data-testid="admin.finance.history.mobile">
                {rows.map((payment) => (
                  <TableCard
                    key={payment.id}
                    title={`#${payment.id} · ${formatAmount(payment.amount, locale, currency)}`}
                    subtitle={formatDateTime(payment.created_at)}
                    testId={`admin.finance.history.row.${payment.id}.mobile`}
                    rows={[
                      { label: t('common.user'), value: paymentUserLink(payment, basePath) },
                      {
                        label: t('finance.history.col.period'),
                        value: <span>{formatDate(payment.from_date)} → {formatDate(payment.to_date)}</span>,
                      },
                      {
                        label: t('finance.history.col.source'),
                        value: paymentSource(payment, basePath, t('finance.history.source.manual')),
                      },
                      { label: t('finance.history.col.accounted_by'), value: refLabel(payment.accounted_by) },
                    ]}
                  />
                ))}
                <Card>{React.cloneElement(paginationNode, { testId: 'admin.finance.history.pagination.mobile' })}</Card>
              </div>

              <TableCard
                className="hidden md:block"
                minWidth="lg"
                tableTestId="admin.finance.history.table"
                footer={React.cloneElement(paginationNode, { testId: 'admin.finance.history.pagination.desktop' })}
              >
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="px-3 py-3">{t('common.id')}</th>
                    <th className="px-3 py-3">{t('finance.history.col.created')}</th>
                    <th className="px-3 py-3">{t('common.user')}</th>
                    <th className="px-3 py-3 text-right">{t('finance.history.col.amount')}</th>
                    <th className="px-3 py-3">{t('finance.history.col.period')}</th>
                    <th className="px-3 py-3">{t('finance.history.col.source')}</th>
                    <th className="px-3 py-3">{t('finance.history.col.accounted_by')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((payment) => (
                    <tr key={payment.id} className="border-b border-border/60 last:border-b-0" data-testid={`admin.finance.history.row.${payment.id}`}>
                      <td className="px-3 py-3 font-medium">#{payment.id}</td>
                      <td className="px-3 py-3">{formatDateTime(payment.created_at)}</td>
                      <td className="px-3 py-3 font-medium">{paymentUserLink(payment, basePath)}</td>
                      <td className="px-3 py-3 text-right font-medium">{formatAmount(payment.amount, locale, currency)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{formatDate(payment.from_date)} → {formatDate(payment.to_date)}</td>
                      <td className="px-3 py-3">{paymentSource(payment, basePath, t('finance.history.source.manual'))}</td>
                      <td className="px-3 py-3">{refLabel(payment.accounted_by)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableCard>
            </>
          ) : (
            <div className="space-y-2">
              <EmptyState
                title={t('finance.history.empty.title')}
                body={t('finance.history.empty.body')}
                actionLabel={userId || period.from || period.to ? t('common.clear_filters') : undefined}
                onAction={userId || period.from || period.to ? () => replaceFilters({}) : undefined}
                testId="admin.finance.history.empty"
              />
              {pagination.canPrev || canNext ? (
                <Card>{React.cloneElement(paginationNode, { testId: 'admin.finance.history.pagination.empty' })}</Card>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </ListShell>
  );
}
