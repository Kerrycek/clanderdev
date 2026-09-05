import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, CreditCard, RefreshCw, TrendingUp, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useAppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';
import { ListShell } from '../../../components/layout/ListShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { ErrorState } from '../../../components/ui/ErrorState';
import { LoadingState } from '../../../components/ui/LoadingState';
import { StatCard } from '../../../components/ui/StatCard';
import { TableCard } from '../../../components/ui/TableCard';
import { fetchFinanceUsersSnapshot } from '../../../lib/api/finance';
import { fetchSystemConfigs, type SystemConfigItem } from '../../../lib/api/systemConfig';
import type { User } from '../../../lib/api/users';
import { formatDateTime } from '../../../lib/format';
import { paidUntilBadgeVariant } from '../../../lib/paymentsBadges';
import { safeInt } from '../../../lib/paymentsFormat';
import { AdminFinanceTabs } from './AdminFinanceTabs';
import {
  classifyFinanceAccount,
  isFinanceAccountInScope,
  summarizeFinanceAccounts,
  type FinanceAccountStatus,
} from './FinanceOverviewModel';

function defaultCurrency(configs: readonly SystemConfigItem[] | undefined): string | undefined {
  const raw = configs?.find((item) => (
    item.category === 'plugin_payments' && item.name === 'default_currency'
  ))?.value;
  if (typeof raw !== 'string') return undefined;
  const normalized = raw.trim().toUpperCase();
  return normalized || undefined;
}

function formatAmount(amount: number, locale: string, currency?: string): string {
  const value = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(amount);
  return currency ? `${value} ${currency}` : value;
}

function userLabel(user: User): string {
  const identity = String(user.login || user.full_name || user.email || '').trim();
  return identity ? `#${user.id} ${identity}` : `#${user.id}`;
}

function statusPriority(status: FinanceAccountStatus): number {
  if (status === 'invalid') return 0;
  if (status === 'overdue') return 1;
  if (status === 'due_soon') return 2;
  return 3;
}

function financeStatusBadge(status: FinanceAccountStatus) {
  if (status === 'invalid') return 'neutral' as const;
  return paidUntilBadgeVariant(status);
}

export function FinanceOverviewPage() {
  const { basePath } = useAppMode();
  const { lang, t } = useI18n();
  const locale = lang === 'cs' ? 'cs-CZ' : 'en-US';

  const snapshotQ = useQuery({
    queryKey: ['finance', 'account_snapshot'],
    queryFn: async ({ signal }) => ({
      snapshot: await fetchFinanceUsersSnapshot({ signal }),
      capturedAt: new Date().toISOString(),
    }),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const configsQ = useQuery({
    queryKey: ['system_configs'],
    queryFn: async () => (await fetchSystemConfigs()).data,
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const snapshot = snapshotQ.data?.snapshot;
  const complete = snapshot?.complete === true;
  const users = complete ? snapshot.rows : [];
  const summary = useMemo(
    () => complete ? summarizeFinanceAccounts(users) : null,
    [complete, users],
  );
  const currency = defaultCurrency(configsQ.data);

  const riskUsers = useMemo(() => users
    .filter(isFinanceAccountInScope)
    .map((user) => ({ user, classification: classifyFinanceAccount(user) }))
    .filter(({ classification }) => classification.status !== 'paid')
    .sort((a, b) => {
      const severity = statusPriority(a.classification.status) - statusPriority(b.classification.status);
      if (severity !== 0) return severity;
      const aDate = typeof a.user.paid_until === 'string' ? Date.parse(a.user.paid_until) : Number.NEGATIVE_INFINITY;
      const bDate = typeof b.user.paid_until === 'string' ? Date.parse(b.user.paid_until) : Number.NEGATIVE_INFINITY;
      return aDate - bDate || a.user.id - b.user.id;
    })
    .slice(0, 12), [users]);

  const distribution = useMemo(() => {
    const counts = new Map<number, number>();
    for (const user of users) {
      if (!isFinanceAccountInScope(user)) continue;
      const amount = Number(user.monthly_payment);
      counts.set(amount, (counts.get(amount) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([amount, count]) => ({ amount, count }))
      .sort((a, b) => b.count - a.count || b.amount - a.amount)
      .slice(0, 10);
  }, [users]);

  const refresh = () => {
    void snapshotQ.refetch();
    void configsQ.refetch();
  };

  return (
    <ListShell
      testId="admin.finance.overview"
      header={(
        <div className="space-y-4">
          <PageHeader
            title={t('finance.overview.title')}
            description={t('finance.overview.description')}
            actions={(
              <>
                <Button to={`${basePath}/payments/history`} variant="secondary" size="sm" testId="admin.finance.overview.open_history">
                  <CreditCard size={16} aria-hidden="true" />
                  {t('finance.overview.open_history')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={snapshotQ.isFetching || configsQ.isFetching}
                  onClick={refresh}
                  testId="admin.finance.overview.refresh"
                >
                  <RefreshCw size={16} aria-hidden="true" />
                  {t('finance.overview.refresh')}
                </Button>
              </>
            )}
          />
          <AdminFinanceTabs />
        </div>
      )}
    >
      {snapshotQ.isLoading ? (
        <LoadingState testId="admin.finance.overview.loading" />
      ) : snapshotQ.isError ? (
        <ErrorState
          title={t('finance.overview.load_error')}
          error={snapshotQ.error}
          onRetry={refresh}
          showBack={false}
          testId="admin.finance.overview.error"
        />
      ) : snapshot && !snapshot.complete ? (
        <ErrorState
          title={t('finance.overview.incomplete.title')}
          error={new Error(t('finance.overview.incomplete.body', { count: snapshot.scannedRows }))}
          onRetry={refresh}
          showBack={false}
          testId="admin.finance.overview.incomplete"
        />
      ) : summary ? (
        <div className="space-y-4">
          <Alert
            variant="neutral"
            title={t('finance.overview.scope.title')}
            description={t('finance.overview.scope.body', {
              count: summary.accountCount,
              excluded: summary.excludedAccountCount,
              time: formatDateTime(snapshotQ.data?.capturedAt),
            })}
            testId="admin.finance.overview.scope"
          />

          {configsQ.isError || (configsQ.isSuccess && !currency) ? (
            <Alert
              variant="warn"
              title={t('finance.overview.currency_error.title')}
              description={t('finance.overview.currency_error.body')}
              testId="admin.finance.overview.currency_error"
            />
          ) : null}

          <div className="grid gap-3 lg:grid-cols-2">
            <StatCard
              title={t('finance.overview.summary.monthly_payment')}
              subtitle={t('finance.overview.summary.monthly_payment.subtitle')}
              value={formatAmount(summary.monthlyPayment, locale, currency)}
              icon={<TrendingUp size={18} aria-hidden="true" />}
              variant="featured"
              testId="admin.finance.overview.summary.monthly_payment"
            />
            <StatCard
              title={t('finance.overview.summary.current_month')}
              subtitle={t('finance.overview.summary.current_month.subtitle')}
              value={formatAmount(summary.currentMonthExpected, locale, currency)}
              icon={<CalendarClock size={18} aria-hidden="true" />}
              variant="featured"
              testId="admin.finance.overview.summary.current_month"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title={t('finance.overview.summary.paid')}
              subtitle={t('finance.overview.summary.paid.subtitle')}
              value={new Intl.NumberFormat(locale).format(summary.paidCount)}
              icon={<UsersRound size={18} aria-hidden="true" />}
              testId="admin.finance.overview.summary.paid"
            />
            <StatCard
              title={t('finance.overview.summary.due_soon')}
              subtitle={t('finance.overview.summary.due_soon.subtitle')}
              value={new Intl.NumberFormat(locale).format(summary.dueSoonCount)}
              icon={<CalendarClock size={18} aria-hidden="true" />}
              testId="admin.finance.overview.summary.due_soon"
            />
            <StatCard
              title={t('finance.overview.summary.overdue')}
              subtitle={t('finance.overview.summary.overdue.subtitle')}
              value={new Intl.NumberFormat(locale).format(summary.overdueCount)}
              icon={<AlertTriangle size={18} aria-hidden="true" />}
              testId="admin.finance.overview.summary.overdue"
            />
            <StatCard
              title={t('finance.overview.summary.invalid')}
              subtitle={t('finance.overview.summary.invalid.subtitle')}
              value={new Intl.NumberFormat(locale).format(summary.invalidCount)}
              icon={<AlertTriangle size={18} aria-hidden="true" />}
              testId="admin.finance.overview.summary.invalid"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
            <section className="space-y-3" aria-labelledby="finance-risk-title">
              <div>
                <h2 id="finance-risk-title" className="text-lg font-semibold">{t('finance.overview.risk.title')}</h2>
                <p className="mt-1 text-sm text-muted">{t('finance.overview.risk.description')}</p>
              </div>

              {riskUsers.length > 0 ? (
                <>
                  <div className="space-y-2 md:hidden" data-testid="admin.finance.overview.risk.mobile">
                    {riskUsers.map(({ user, classification }) => (
                      <TableCard
                        key={user.id}
                        to={`${basePath}/users/${user.id}/payments`}
                        title={userLabel(user)}
                        subtitle={formatAmount(safeInt(user.monthly_payment) ?? 0, locale, currency)}
                        testId={`admin.finance.overview.risk.row.${user.id}.mobile`}
                        rows={[
                          { label: t('finance.overview.risk.col.paid_until'), value: formatDateTime(user.paid_until) },
                          {
                            label: t('common.state'),
                            value: <Badge variant={financeStatusBadge(classification.status)}>{t(`finance.overview.status.${classification.status}`)}</Badge>,
                          },
                        ]}
                      />
                    ))}
                  </div>

                  <TableCard className="hidden md:block" minWidth="sm" tableTestId="admin.finance.overview.risk.table">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted">
                        <th className="px-4 py-3">{t('common.user')}</th>
                        <th className="px-4 py-3 text-right">{t('finance.overview.risk.col.monthly_payment')}</th>
                        <th className="px-4 py-3">{t('finance.overview.risk.col.paid_until')}</th>
                        <th className="px-4 py-3">{t('common.state')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {riskUsers.map(({ user, classification }) => (
                        <tr key={user.id} className="border-b border-border/60 last:border-b-0" data-testid={`admin.finance.overview.risk.row.${user.id}`}>
                          <td className="px-4 py-3 font-medium">
                            <Link className="text-accent hover:underline" to={`${basePath}/users/${user.id}/payments`}>{userLabel(user)}</Link>
                          </td>
                          <td className="px-4 py-3 text-right">{formatAmount(safeInt(user.monthly_payment) ?? 0, locale, currency)}</td>
                          <td className="px-4 py-3">{formatDateTime(user.paid_until)}</td>
                          <td className="px-4 py-3">
                            <Badge variant={financeStatusBadge(classification.status)}>{t(`finance.overview.status.${classification.status}`)}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </TableCard>
                </>
              ) : (
                <Card className="p-4 text-sm text-muted" testId="admin.finance.overview.risk.empty">
                  {t('finance.overview.risk.empty')}
                </Card>
              )}
            </section>

            <section className="space-y-3" aria-labelledby="finance-distribution-title">
              <div>
                <h2 id="finance-distribution-title" className="text-lg font-semibold">{t('finance.overview.distribution.title')}</h2>
                <p className="mt-1 text-sm text-muted">{t('finance.overview.distribution.description')}</p>
              </div>
              <TableCard minWidth="sm" tableTestId="admin.finance.overview.distribution.table">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="px-4 py-3">{t('finance.overview.distribution.col.amount')}</th>
                    <th className="px-4 py-3 text-right">{t('finance.overview.distribution.col.users')}</th>
                  </tr>
                </thead>
                <tbody>
                  {distribution.map((row) => (
                    <tr key={row.amount} className="border-b border-border/60 last:border-b-0">
                      <td className="px-4 py-3 font-medium">{formatAmount(row.amount, locale, currency)}</td>
                      <td className="px-4 py-3 text-right">{new Intl.NumberFormat(locale).format(row.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableCard>
            </section>
          </div>
        </div>
      ) : null}
    </ListShell>
  );
}
