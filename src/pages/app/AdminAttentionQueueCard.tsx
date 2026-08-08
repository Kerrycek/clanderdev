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
import { fetchIncidentReports } from '../../lib/api/incidents';
import { fetchIncomingPayments } from '../../lib/api/payments';
import { fetchChangeRequests, fetchRegistrationRequests } from '../../lib/api/requests';
import { fetchTransactionChains } from '../../lib/api/transactions';
import { formatDateTime } from '../../lib/time';
import { useTierSlowIntervalMs } from '../../lib/refreshTiers';

import {
  adminAttentionSourcePermissions,
  isOpenIncident,
  selectAdminAttentionItems,
  type AdminAttentionKind,
  type AdminAttentionTone,
} from './AdminAttentionQueueModel';

const SOURCE_LIMIT = 5;
const QUEUE_LIMIT = 5;

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
    case 'queued-payment':
      return t('dashboard.attention.kind.queued_payment');
    case 'failed-transaction':
      return t('dashboard.attention.kind.failed_transaction');
    case 'rollbacking-transaction':
      return t('dashboard.attention.kind.rollbacking_transaction');
    case 'incident':
      return t('dashboard.attention.kind.incident');
  }
}

function countLabel(count: number, truncated: boolean): string {
  return truncated ? `${count}+` : String(count);
}

function uniqueCount(rows: Array<{ id: number }>): number {
  return new Set(rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0)).size;
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
  const tierSlowRefetchMs = useTierSlowIntervalMs();
  const enabled = mode === 'admin' && auth.canUseAdminUi;
  const permissions = adminAttentionSourcePermissions(auth.role);

  const requestsQ = useQuery({
    queryKey: ['dashboard', 'admin_attention', 'requests'],
    enabled: enabled && permissions.requests,
    queryFn: async () => {
      const [registrations, changes] = await Promise.allSettled([
        fetchRegistrationRequests({ limit: SOURCE_LIMIT, state: 'awaiting' }),
        fetchChangeRequests({ limit: SOURCE_LIMIT, state: 'awaiting' }),
      ]);
      return {
        registrations: registrations.status === 'fulfilled' ? registrations.value.data : [],
        changes: changes.status === 'fulfilled' ? changes.value.data : [],
        failures: Number(registrations.status === 'rejected') + Number(changes.status === 'rejected'),
      };
    },
    staleTime: 30_000,
    refetchInterval: tierSlowRefetchMs,
  });

  const paymentsQ = useQuery({
    queryKey: ['dashboard', 'admin_attention', 'payments'],
    enabled: enabled && permissions.payments,
    queryFn: async () => {
      const [unmatched, queued] = await Promise.allSettled([
        fetchIncomingPayments({ limit: SOURCE_LIMIT, state: 'unmatched' }),
        fetchIncomingPayments({ limit: SOURCE_LIMIT, state: 'queued' }),
      ]);
      return {
        unmatched: unmatched.status === 'fulfilled' ? unmatched.value.data : [],
        queued: queued.status === 'fulfilled' ? queued.value.data : [],
        failures: Number(unmatched.status === 'rejected') + Number(queued.status === 'rejected'),
      };
    },
    staleTime: 30_000,
    refetchInterval: tierSlowRefetchMs,
  });

  const transactionsQ = useQuery({
    queryKey: ['dashboard', 'admin_attention', 'transactions'],
    enabled: enabled && permissions.transactions,
    queryFn: async () => {
      const [failed, fatal, rollbacking] = await Promise.allSettled([
        fetchTransactionChains({ limit: SOURCE_LIMIT, state: 'failed' }),
        fetchTransactionChains({ limit: SOURCE_LIMIT, state: 'fatal' }),
        fetchTransactionChains({ limit: SOURCE_LIMIT, state: 'rollbacking' }),
      ]);
      return {
        failed: failed.status === 'fulfilled' ? failed.value.data : [],
        fatal: fatal.status === 'fulfilled' ? fatal.value.data : [],
        rollbacking: rollbacking.status === 'fulfilled' ? rollbacking.value.data : [],
        failures:
          Number(failed.status === 'rejected') +
          Number(fatal.status === 'rejected') +
          Number(rollbacking.status === 'rejected'),
      };
    },
    staleTime: 30_000,
    refetchInterval: tierSlowRefetchMs,
  });

  const incidentsQ = useQuery({
    queryKey: ['dashboard', 'admin_attention', 'incidents'],
    enabled: enabled && permissions.incidents,
    queryFn: async () => {
      try {
        return {
          incidents: (await fetchIncidentReports({ limit: SOURCE_LIMIT, includes: 'user,vps' })).data,
          failures: 0,
        };
      } catch {
        return { incidents: [], failures: 1 };
      }
    },
    staleTime: 30_000,
    refetchInterval: tierSlowRefetchMs,
  });

  const allItems = useMemo(
    () =>
      selectAdminAttentionItems(
        {
          registrations: requestsQ.data?.registrations,
          changes: requestsQ.data?.changes,
          unmatchedPayments: paymentsQ.data?.unmatched,
          queuedPayments: paymentsQ.data?.queued,
          failedTransactions: transactionsQ.data?.failed,
          fatalTransactions: transactionsQ.data?.fatal,
          rollbackingTransactions: transactionsQ.data?.rollbacking,
          incidents: incidentsQ.data?.incidents,
        },
        { basePath, limit: Number.MAX_SAFE_INTEGER },
      ),
    [
      basePath,
      incidentsQ.data?.incidents,
      paymentsQ.data?.queued,
      paymentsQ.data?.unmatched,
      requestsQ.data?.changes,
      requestsQ.data?.registrations,
      transactionsQ.data?.failed,
      transactionsQ.data?.fatal,
      transactionsQ.data?.rollbacking,
    ],
  );

  if (!enabled) return null;

  const visibleItems = allItems.slice(0, QUEUE_LIMIT);
  const expectedCalls =
    (permissions.requests ? 2 : 0) +
    (permissions.payments ? 2 : 0) +
    (permissions.transactions ? 3 : 0) +
    (permissions.incidents ? 1 : 0);
  const failedCalls =
    (requestsQ.data?.failures ?? 0) +
    (paymentsQ.data?.failures ?? 0) +
    (transactionsQ.data?.failures ?? 0) +
    (incidentsQ.data?.failures ?? 0);
  const isLoading = [requestsQ, paymentsQ, transactionsQ, incidentsQ].some(
    (query) => query.isLoading && query.fetchStatus !== 'idle',
  );
  const allUnavailable = !isLoading && expectedCalls > 0 && failedCalls >= expectedCalls;
  const hasPartialFailure = failedCalls > 0 && !allUnavailable;
  const truncated =
    (requestsQ.data?.registrations.length ?? 0) >= SOURCE_LIMIT ||
    (requestsQ.data?.changes.length ?? 0) >= SOURCE_LIMIT ||
    (paymentsQ.data?.unmatched.length ?? 0) >= SOURCE_LIMIT ||
    (paymentsQ.data?.queued.length ?? 0) >= SOURCE_LIMIT ||
    (transactionsQ.data?.failed.length ?? 0) >= SOURCE_LIMIT ||
    (transactionsQ.data?.fatal.length ?? 0) >= SOURCE_LIMIT ||
    (transactionsQ.data?.rollbacking.length ?? 0) >= SOURCE_LIMIT ||
    (incidentsQ.data?.incidents.length ?? 0) >= SOURCE_LIMIT;

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

  const requestCount = (requestsQ.data?.registrations.length ?? 0) + (requestsQ.data?.changes.length ?? 0);
  const paymentCount = (paymentsQ.data?.unmatched.length ?? 0) + (paymentsQ.data?.queued.length ?? 0);
  const transactionRows = [
    ...(transactionsQ.data?.failed ?? []),
    ...(transactionsQ.data?.fatal ?? []),
    ...(transactionsQ.data?.rollbacking ?? []),
  ];
  const transactionCount = uniqueCount(transactionRows);
  const incidentCount = (incidentsQ.data?.incidents ?? []).filter(isOpenIncident).length;

  const metrics: Metric[] = [
    ...(permissions.requests
      ? [{
          id: 'requests',
          label: t('dashboard.attention.category.requests'),
          count: countLabel(
            requestCount,
            (requestsQ.data?.registrations.length ?? 0) >= SOURCE_LIMIT ||
              (requestsQ.data?.changes.length ?? 0) >= SOURCE_LIMIT,
          ),
          to: `${basePath}/requests?state=awaiting`,
          loading: requestsQ.isLoading,
          unavailable: (requestsQ.data?.failures ?? 0) >= 2,
        }]
      : []),
    ...(permissions.payments
      ? [{
          id: 'payments',
          label: t('dashboard.attention.category.payments'),
          count: countLabel(
            paymentCount,
            (paymentsQ.data?.unmatched.length ?? 0) >= SOURCE_LIMIT ||
              (paymentsQ.data?.queued.length ?? 0) >= SOURCE_LIMIT,
          ),
          to: `${basePath}/payments/incoming?state=unmatched`,
          loading: paymentsQ.isLoading,
          unavailable: (paymentsQ.data?.failures ?? 0) >= 2,
        }]
      : []),
    ...(permissions.transactions
      ? [{
          id: 'transactions',
          label: t('dashboard.attention.category.transactions'),
          count: countLabel(
            transactionCount,
            (transactionsQ.data?.failed.length ?? 0) >= SOURCE_LIMIT ||
              (transactionsQ.data?.fatal.length ?? 0) >= SOURCE_LIMIT ||
              (transactionsQ.data?.rollbacking.length ?? 0) >= SOURCE_LIMIT,
          ),
          to: `${basePath}/transactions?errors=1`,
          loading: transactionsQ.isLoading,
          unavailable: (transactionsQ.data?.failures ?? 0) >= 3,
        }]
      : []),
    ...(permissions.incidents
      ? [{
          id: 'incidents',
          label: t('dashboard.attention.category.incidents'),
          count: countLabel(incidentCount, (incidentsQ.data?.incidents.length ?? 0) >= SOURCE_LIMIT),
          to: `${basePath}/incidents`,
          loading: incidentsQ.isLoading,
          unavailable: (incidentsQ.data?.failures ?? 0) >= 1,
        }]
      : []),
  ];

  return (
    <Card testId="admin.attention.queue">
      <CardHeader
        className="p-3"
        title={t('dashboard.attention.title')}
        subtitle={t('dashboard.attention.subtitle', {
          count: countLabel(allItems.length, truncated),
        })}
      />

      <CardBody className="p-0">
        <div className="grid divide-y divide-border border-b border-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
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
