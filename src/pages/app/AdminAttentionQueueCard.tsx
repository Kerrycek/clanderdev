import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { useAppMode } from '../../app/appMode';
import { useAuth } from '../../app/auth';
import { useI18n } from '../../app/i18n';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { getMetaTotalCount } from '../../lib/api/haveapi';
import { fetchIncomingPayments } from '../../lib/api/payments';
import { fetchChangeRequests, fetchRegistrationRequests } from '../../lib/api/requests';
import { fetchTransactionChains } from '../../lib/api/transactions';
import { formatDateTime } from '../../lib/time';

import {
  adminAttentionSourcePermissions,
  selectAdminAttentionItems,
  type AdminAttentionKind,
  type AdminAttentionTone,
} from './AdminAttentionQueueModel';

const SOURCE_LIMIT = 10;
const QUEUE_LIMIT = 5;
const STALE_TIME_MS = 60_000;

function badgeVariant(tone: AdminAttentionTone): 'danger' | 'warn' | 'info' {
  return tone;
}

function kindLabel(t: ReturnType<typeof useI18n>['t'], kind: AdminAttentionKind): string {
  switch (kind) {
    case 'registration-request':
      return t('dashboard.attention.kind.registration_request');
    case 'change-request':
      return t('dashboard.attention.kind.change_request');
    case 'unmatched-payment':
      return t('dashboard.attention.kind.unmatched_payment');
    case 'failed-transaction':
      return t('dashboard.attention.kind.failed_transaction');
  }
}

function countLabel(count: number, truncated: boolean): string {
  return truncated ? `${count}+` : String(count);
}

function responseCount(response: { data: unknown[]; meta?: unknown } | undefined): {
  count: number;
  truncated: boolean;
} {
  if (!response) return { count: 0, truncated: false };
  const exact = getMetaTotalCount(response.meta);
  if (exact !== undefined) return { count: exact, truncated: false };
  return { count: response.data.length, truncated: response.data.length >= SOURCE_LIMIT };
}

interface Metric {
  id: string;
  label: string;
  count: string;
  to: string;
  loading: boolean;
  unavailable: boolean;
}

function AttentionMetric(props: Metric) {
  return (
    <Link
      to={props.to}
      data-testid={`admin.attention.metric.${props.id}`}
      className="flex min-w-0 items-center justify-between gap-3 px-3 py-2 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span className="truncate text-sm font-medium">{props.label}</span>
      <Badge variant={props.unavailable ? 'warn' : 'neutral'}>
        {props.loading ? '…' : props.unavailable ? '—' : props.count}
      </Badge>
    </Link>
  );
}

export function AdminAttentionQueueCard() {
  const auth = useAuth();
  const { basePath, mode } = useAppMode();
  const { t } = useI18n();
  const enabled = mode === 'admin' && auth.canUseAdminUi;
  const permissions = adminAttentionSourcePermissions(auth.role);

  const registrationsQ = useQuery({
    queryKey: ['user_request', 'registrations', 'index', { scope: 'dashboard-attention', state: 'awaiting' }],
    enabled: enabled && permissions.requests,
    queryFn: () => fetchRegistrationRequests({ limit: SOURCE_LIMIT, state: 'awaiting', count: true }),
    staleTime: STALE_TIME_MS,
    retry: 1,
  });

  const changesQ = useQuery({
    queryKey: ['user_request', 'changes', 'index', { scope: 'dashboard-attention', state: 'awaiting' }],
    enabled: enabled && permissions.requests,
    queryFn: () => fetchChangeRequests({ limit: SOURCE_LIMIT, state: 'awaiting', count: true }),
    staleTime: STALE_TIME_MS,
    retry: 1,
  });

  const unmatchedPaymentsQ = useQuery({
    queryKey: ['incoming_payments', 'index', { scope: 'dashboard-attention', state: 'unmatched' }],
    enabled: enabled && permissions.payments,
    queryFn: () => fetchIncomingPayments({ limit: SOURCE_LIMIT, state: 'unmatched', count: true }),
    staleTime: STALE_TIME_MS,
    retry: 1,
  });

  const failedTransactionsQ = useQuery({
    queryKey: ['transaction_chains', 'list', { scope: 'dashboard-attention', state: 'failed' }],
    enabled: enabled && permissions.transactions,
    queryFn: () => fetchTransactionChains({ limit: SOURCE_LIMIT, state: 'failed', count: true }),
    staleTime: STALE_TIME_MS,
    retry: 1,
  });

  const fatalTransactionsQ = useQuery({
    queryKey: ['transaction_chains', 'list', { scope: 'dashboard-attention', state: 'fatal' }],
    enabled: enabled && permissions.transactions,
    queryFn: () => fetchTransactionChains({ limit: SOURCE_LIMIT, state: 'fatal', count: true }),
    staleTime: STALE_TIME_MS,
    retry: 1,
  });

  const allItems = useMemo(
    () =>
      selectAdminAttentionItems(
        {
          registrations: registrationsQ.data?.data,
          changes: changesQ.data?.data,
          unmatchedPayments: unmatchedPaymentsQ.data?.data,
          failedTransactions: failedTransactionsQ.data?.data,
          fatalTransactions: fatalTransactionsQ.data?.data,
        },
        { basePath, limit: Number.MAX_SAFE_INTEGER },
      ),
    [
      basePath,
      changesQ.data?.data,
      failedTransactionsQ.data?.data,
      fatalTransactionsQ.data?.data,
      registrationsQ.data?.data,
      unmatchedPaymentsQ.data?.data,
    ],
  );

  if (!enabled) return null;

  const activeQueries = [
    ...(permissions.requests ? [registrationsQ, changesQ] : []),
    ...(permissions.payments ? [unmatchedPaymentsQ] : []),
    ...(permissions.transactions ? [failedTransactionsQ, fatalTransactionsQ] : []),
  ];
  const isLoading = activeQueries.some((query) => query.isLoading);
  const failedCalls = activeQueries.filter((query) => query.isError).length;
  const allUnavailable = !isLoading && activeQueries.length > 0 && failedCalls === activeQueries.length;
  const hasPartialFailure = failedCalls > 0 && !allUnavailable;

  const registrationCount = responseCount(registrationsQ.data);
  const changeCount = responseCount(changesQ.data);
  const unmatchedPaymentCount = responseCount(unmatchedPaymentsQ.data);
  const failedTransactionCount = responseCount(failedTransactionsQ.data);
  const fatalTransactionCount = responseCount(fatalTransactionsQ.data);

  const requestCount = registrationCount.count + changeCount.count;
  const requestTruncated = registrationCount.truncated || changeCount.truncated;
  const transactionCount = failedTransactionCount.count + fatalTransactionCount.count;
  const transactionTruncated = failedTransactionCount.truncated || fatalTransactionCount.truncated;
  const totalCount = requestCount + unmatchedPaymentCount.count + transactionCount;
  const totalTruncated = requestTruncated || unmatchedPaymentCount.truncated || transactionTruncated;

  if (isLoading && allItems.length === 0) {
    return (
      <Alert
        variant="neutral"
        className="px-3 py-2"
        title={t('dashboard.attention.loading.title')}
        testId="admin.attention.loading"
      >
        {t('dashboard.attention.loading.body')}
      </Alert>
    );
  }

  if (allUnavailable) {
    return (
      <Alert
        variant="warn"
        className="px-3 py-2"
        title={t('dashboard.attention.unavailable.title')}
        testId="admin.attention.unavailable"
      >
        {t('dashboard.attention.unavailable.body')}
      </Alert>
    );
  }

  if (allItems.length === 0 && !hasPartialFailure) {
    return (
      <Alert
        variant="ok"
        className="px-3 py-2"
        title={t('dashboard.attention.empty.title')}
        testId="admin.attention.empty"
      >
        {t('dashboard.attention.empty.body')}
      </Alert>
    );
  }

  const visibleItems = allItems.slice(0, QUEUE_LIMIT);
  const metrics: Metric[] = [
    ...(permissions.requests
      ? [{
          id: 'requests',
          label: t('dashboard.attention.category.requests'),
          count: countLabel(requestCount, requestTruncated),
          to: `${basePath}/requests?state=awaiting`,
          loading: registrationsQ.isLoading || changesQ.isLoading,
          unavailable: registrationsQ.isError && changesQ.isError,
        }]
      : []),
    ...(permissions.payments
      ? [{
          id: 'payments',
          label: t('dashboard.attention.category.payments'),
          count: countLabel(unmatchedPaymentCount.count, unmatchedPaymentCount.truncated),
          to: `${basePath}/payments/incoming?state=unmatched`,
          loading: unmatchedPaymentsQ.isLoading,
          unavailable: unmatchedPaymentsQ.isError,
        }]
      : []),
    ...(permissions.transactions
      ? [{
          id: 'transactions',
          label: t('dashboard.attention.category.transactions'),
          count: countLabel(transactionCount, transactionTruncated),
          to: `${basePath}/transactions?errors=1`,
          loading: failedTransactionsQ.isLoading || fatalTransactionsQ.isLoading,
          unavailable: failedTransactionsQ.isError && fatalTransactionsQ.isError,
        }]
      : []),
  ];

  return (
    <Card testId="admin.attention.queue">
      <CardHeader
        className="p-3"
        title={t('dashboard.attention.title')}
        subtitle={t('dashboard.attention.subtitle', {
          count: countLabel(totalCount || allItems.length, totalTruncated),
        })}
      />

      <CardBody className="p-0">
        <div className="grid divide-y divide-border border-b border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {metrics.map((metric) => <AttentionMetric key={metric.id} {...metric} />)}
        </div>

        {visibleItems.length > 0 ? (
          <div className="divide-y divide-border">
            {visibleItems.map((attentionItem) => (
              <div
                key={attentionItem.key}
                data-testid={`admin.attention.item.${attentionItem.key}`}
                className="flex flex-wrap items-center gap-2 px-3 py-2.5 hover:bg-surface-2/60 sm:flex-nowrap"
              >
                <Badge variant={badgeVariant(attentionItem.tone)} className="shrink-0">
                  {kindLabel(t, attentionItem.kind)}
                </Badge>
                <div className="min-w-0 flex-1">
                  <Link to={attentionItem.to} className="block truncate text-sm font-medium text-link hover:underline">
                    {attentionItem.label}
                  </Link>
                  <div className="mt-0.5 text-xs text-muted">
                    #{attentionItem.id}
                    {attentionItem.createdAt ? ` · ${formatDateTime(attentionItem.createdAt)}` : ''}
                  </div>
                </div>
                <Button to={attentionItem.to} variant="secondary" size="sm" className="ml-auto shrink-0">
                  {t('dashboard.attention.open')}
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        {hasPartialFailure ? (
          <div className="border-t border-warn-border bg-warn-bg px-3 py-2 text-xs text-muted" data-testid="admin.attention.partial">
            {t('dashboard.attention.partial')}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
