import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';

import { useAppMode } from '../../../../app/appMode';
import { useI18n } from '../../../../app/i18n';
import { useToasts } from '../../../../app/toasts';

import { useChrome } from '../../../../components/layout/ChromeContext';

import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../../components/ui/Card';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { ErrorState } from '../../../../components/ui/ErrorState';
import { Input } from '../../../../components/ui/Input';
import { KeysetPagination } from '../../../../components/ui/KeysetPagination';
import { LoadingState } from '../../../../components/ui/LoadingState';

import { createUserPayment, fetchUserPayments } from '../../../../lib/api/payments';
import { fetchUserAccount, updateUserAccount } from '../../../../lib/api/userAccounts';
import { getMetaActionStateId } from '../../../../lib/api/haveapi';
import { objectRef } from '../../../../lib/objectRef';
import type { ObjectRef } from '../../../../lib/objectRef';

import { formatErrorMessage } from '../../../../lib/errors';
import { formatDate } from '../../../../lib/format';
import { cursorFromDescendingPage } from '../../../../lib/lockIndex';
import { getPaidUntilStatus, paidUntilBadgeVariant, paidUntilStatusLabelKey } from '../../../../lib/paymentsBadges';
import { formatMoneyLike, safeInt } from '../../../../lib/paymentsFormat';
import { useKeysetPagination } from '../../../../lib/hooks/useKeysetPagination';

import {
  paidUntilSubtitleToken,
  parsePositiveInt,
  resourceRefLabel,
} from '../../payments/PaymentsModel';

import { useAdminUserContext } from './AdminUserLayout';

function isoToDateInput(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const trimmed = value.trim();
    return /^\d{4}-\d{2}-\d{2}/.test(trimmed) ? trimmed.slice(0, 10) : '';
  }
  return d.toISOString().slice(0, 10);
}

export function AdminUserPaymentsPage() {
  const { basePath } = useAppMode();
  const { t, tc } = useI18n();
  const toasts = useToasts();
  const qc = useQueryClient();
  const chrome = useChrome();

  const { userId, user, refetch } = useAdminUserContext();

  const [searchParams, setSearchParams] = useSearchParams();

  const accountQ = useQuery({
    queryKey: ['user_accounts', userId],
    queryFn: async () => (await fetchUserAccount(userId)).data,
    staleTime: 30_000,
  });

  const monthlyPayment = safeInt(accountQ.data?.monthly_payment ?? user.monthly_payment);
  const paidUntil = (accountQ.data?.paid_until ?? user.paid_until) as unknown;

  const now = new Date();
  const status = getPaidUntilStatus(paidUntil, now);

  const paidUntilSubtitle = (() => {
    const token = paidUntilSubtitleToken(status);
    return token.kind === 'plural' ? tc(token.key, token.count) : t(token.key);
  })();

  const pagination = useKeysetPagination({
    id: 'admin.user.payments.history',
    filterKey: JSON.stringify({ userId }),
    searchParams,
    setSearchParams,
    defaultLimit: 50,
    allowedLimits: [25, 50, 100, 200],
  });

  const historyQ = useQuery({
    queryKey: ['user_payments', 'list', { userId, limit: pagination.limit, fromId: pagination.fromId }],
    queryFn: async () =>
      (
        await fetchUserPayments({
          userId,
          limit: pagination.limit,
          fromId: pagination.fromId ?? undefined,
        })
      ).data,
    staleTime: 15_000,
  });

  const canNext = (historyQ.data?.length ?? 0) >= pagination.limit;
  const cursor = useMemo(() => cursorFromDescendingPage(historyQ.data), [historyQ.data]);

  const [quickPaidUntil, setQuickPaidUntil] = useState('');
  const [quickMonthlyPayment, setQuickMonthlyPayment] = useState('');
  const [quickAmount, setQuickAmount] = useState('');

  useEffect(() => {
    setQuickPaidUntil(isoToDateInput(paidUntil));
  }, [paidUntil]);

  useEffect(() => {
    setQuickMonthlyPayment(monthlyPayment !== undefined ? String(monthlyPayment) : '');
  }, [monthlyPayment]);

  const monthlyPaymentParsed = parsePositiveInt(quickMonthlyPayment);
  const amountParsed = parsePositiveInt(quickAmount);
  const paidUntilChanged = quickPaidUntil !== isoToDateInput(paidUntil);
  const monthlyPaymentChanged = monthlyPaymentParsed !== null && monthlyPaymentParsed !== monthlyPayment;

  const paidUntilM = useMutation({
    mutationFn: async () => {
      await updateUserAccount(userId, {
        paid_until: quickPaidUntil ? quickPaidUntil : null,
      });
    },
    onSuccess: () => {
      toasts.pushToast({ variant: 'ok', title: t('admin.user.payments.settings.toast.paid_until_saved') });
      void qc.invalidateQueries({ queryKey: ['user_accounts', userId] });
      refetch();
    },
    onError: (e) => {
      const msg = formatErrorMessage(e);
      toasts.pushToast({ variant: 'danger', title: t('common.error'), body: msg, autoDismissMs: false });
    },
  });

  const monthlyPaymentM = useMutation({
    mutationFn: async () => {
      if (monthlyPaymentParsed === null) throw new Error(t('admin.user.payments.settings.validation.monthly_payment'));
      await updateUserAccount(userId, {
        monthly_payment: monthlyPaymentParsed,
      });
    },
    onSuccess: () => {
      toasts.pushToast({ variant: 'ok', title: t('admin.user.payments.settings.toast.monthly_saved') });
      void qc.invalidateQueries({ queryKey: ['user_accounts', userId] });
      refetch();
    },
    onError: (e) => {
      const msg = formatErrorMessage(e);
      toasts.pushToast({ variant: 'danger', title: t('common.error'), body: msg, autoDismissMs: false });
    },
  });

  const addM = useMutation({
    mutationFn: async () => {
      if (amountParsed === null) {
        throw new Error(t('admin.user.payments.add_payment.validation.amount'));
      }

      const res = await createUserPayment({ user: userId, amount: amountParsed });

      const asId = getMetaActionStateId(res.meta);
      if (asId) {
        chrome.trackActionState(asId, {
          actionLabelKey: 'action.user_payment.create.label',
          objectLabel: user.login,
          object: objectRef('User', userId),
        });
      }
    },
    onMutate: () => {
      const ref = objectRef('User', userId);
      chrome.acquireLocalLock(ref);
      return { lockRef: ref };
    },
    onSettled: (_data, _err, _vars, ctx: { lockRef?: ObjectRef } | undefined) => {
      if (ctx?.lockRef) chrome.releaseLocalLock(ctx.lockRef);
    },
    onSuccess: () => {
      toasts.pushToast({ variant: 'ok', title: t('admin.user.payments.add_payment.toast.created') });
      setQuickAmount('');
      void qc.invalidateQueries({ queryKey: ['user_payments'] });
      void qc.invalidateQueries({ queryKey: ['user_accounts', userId] });
      refetch();
    },
    onError: (e) => {
      const msg = formatErrorMessage(e);
      toasts.pushToast({ variant: 'danger', title: t('common.error'), body: msg, autoDismissMs: false });
    },
  });

  const submitPaidUntil = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paidUntilChanged) {
      toasts.pushToast({ variant: 'neutral', title: t('admin.user.payments.settings.validation.no_changes') });
      return;
    }
    paidUntilM.mutate();
  };

  const submitMonthlyPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!monthlyPaymentChanged) {
      toasts.pushToast({ variant: 'neutral', title: t('admin.user.payments.settings.validation.no_changes') });
      return;
    }
    monthlyPaymentM.mutate();
  };

  const submitAddPayment = (e: React.FormEvent) => {
    e.preventDefault();
    addM.mutate();
  };

  return (
    <div className="space-y-4">
      <Card testId="admin.user.payments.quick.card">
        <CardHeader title={t('admin.user.payments.quick.title')} subtitle={t('admin.user.payments.quick.subtitle')} />
        <CardBody>
          {accountQ.isError ? (
            <ErrorState
              title={t('admin.user.payments.settings.load_error.title')}
              error={accountQ.error}
              showDetails
            />
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
            <div className="space-y-4 rounded-lg border border-border bg-surface-2 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{t('admin.user.payments.settings.title')}</div>
                  <div className="mt-1 text-xs text-muted">{t('admin.user.payments.settings.description')}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted">{t('payments.my.stat.payment_id')}</div>
                  <div className="text-lg font-semibold tabular-nums text-fg">{userId}</div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <form className="space-y-2" onSubmit={submitPaidUntil} data-testid="admin.user.payments.paid_until.form">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-muted">{t('admin.user.payments.settings.field.paid_until')}</div>
                    <Badge variant={paidUntilBadgeVariant(status.status)}>{t(paidUntilStatusLabelKey(status.status))}</Badge>
                  </div>
                  <Input
                    testId="admin.user.payments.settings.paid_until"
                    type="date"
                    value={quickPaidUntil}
                    onChange={(e) => setQuickPaidUntil(e.target.value)}
                    disabled={accountQ.isLoading || paidUntilM.isPending}
                  />
                  <div className="text-xs text-muted">{paidUntilSubtitle}</div>
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    loading={paidUntilM.isPending}
                    disabled={accountQ.isLoading || !paidUntilChanged}
                    testId="admin.user.payments.settings.paid_until.save"
                  >
                    {t('admin.user.payments.settings.save_paid_until')}
                  </Button>
                </form>

                <form className="space-y-2" onSubmit={submitMonthlyPayment} data-testid="admin.user.payments.monthly.form">
                  <Input
                    label={t('admin.user.payments.settings.field.monthly_payment')}
                    testId="admin.user.payments.settings.monthly_payment"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={quickMonthlyPayment}
                    onChange={(e) => setQuickMonthlyPayment(e.target.value)}
                    disabled={accountQ.isLoading || monthlyPaymentM.isPending}
                  />
                  <div className="text-xs text-muted">{t('admin.user.payments.settings.hint.monthly_payment')}</div>
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    loading={monthlyPaymentM.isPending}
                    disabled={accountQ.isLoading || !monthlyPaymentChanged}
                    testId="admin.user.payments.settings.monthly.save"
                  >
                    {t('common.save')}
                  </Button>
                </form>
              </div>
            </div>

            <form className="space-y-3 rounded-lg border border-border bg-surface-2 p-3" onSubmit={submitAddPayment} data-testid="admin.user.payments.add.form">
              <div>
                <div className="text-sm font-semibold">{t('admin.user.payments.add_payment.title')}</div>
                <div className="mt-1 text-xs text-muted">{t('admin.user.payments.add_payment.description')}</div>
              </div>
              <Input
                label={t('admin.user.payments.add_payment.field.amount')}
                testId="admin.user.payments.add.amount_input"
                type="number"
                inputMode="numeric"
                min={1}
                value={quickAmount}
                onChange={(e) => setQuickAmount(e.target.value)}
                placeholder={monthlyPayment !== undefined ? String(monthlyPayment) : undefined}
                disabled={addM.isPending}
              />
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={addM.isPending}
                disabled={amountParsed === null}
                testId="admin.user.payments.add.save"
              >
                {t('admin.user.payments.add_payment')}
              </Button>
            </form>
          </div>
        </CardBody>
      </Card>

      <div className="space-y-3">
        <Card>
          <CardHeader title={t('admin.user.payments.history.title')} subtitle={t('admin.user.payments.history.description')} />
          <CardBody>
            {historyQ.isLoading ? <LoadingState /> : null}
            {historyQ.isError ? <ErrorState title={t('payments.my.history.load_error.title')} error={historyQ.error} /> : null}

            {!historyQ.isLoading && !historyQ.isError ? (
              historyQ.data && historyQ.data.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm table-list" data-testid="admin.user.payments.history.table">
                    <thead className="bg-surface-2">
                      <tr className="text-left text-xs text-muted">
                        <th className="px-3 py-2">{t('payments.my.history.col.created')}</th>
                        <th className="px-3 py-2 text-right">{t('payments.my.history.col.amount')}</th>
                        <th className="px-3 py-2">{t('payments.my.history.col.period')}</th>
                        <th className="px-3 py-2">{t('admin.user.payments.history.col.source')}</th>
                        <th className="px-3 py-2">{t('admin.user.payments.history.col.accounted_by')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {historyQ.data.map((p) => (
                        <tr key={p.id} data-testid={`admin.user.payments.history.row.${p.id}`}>
                          <td className="px-3 py-2 font-medium tabular-nums">{formatDate(p.created_at)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoneyLike(safeInt(p.amount))}</td>
                          <td className="px-3 py-2">
                            <span className="text-sm font-medium tabular-nums text-fg">{formatDate(p.from_date)}</span>
                            <span className="mx-2 text-muted">→</span>
                            <span className="text-sm font-medium tabular-nums text-fg">{formatDate(p.to_date)}</span>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted">
                            {p.incoming_payment?.id ? (
                              <Link
                                className="text-accent hover:underline"
                                to={`${basePath}/payments/incoming/${p.incoming_payment.id}`}
                                data-testid={`admin.user.payments.history.row.${p.id}.source`}
                              >
                                #{p.incoming_payment.id}
                              </Link>
                            ) : (
                              <span className="text-faint" data-testid={`admin.user.payments.history.row.${p.id}.source`}>
                                {t('admin.user.payments.history.source.manual')}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted">
                            <span className="tabular-nums">{resourceRefLabel(p.accounted_by)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="mt-3">
                    <KeysetPagination
                      testId="admin.user.payments.history.pagination"
                      page={pagination.page}
                      pageCount={pagination.pageCount}
                      canPrev={pagination.canPrev}
                      canNext={canNext}
                      onPrev={pagination.goPrev}
                      onNext={() => pagination.goNext(cursor)}
                      onGoToPage={pagination.goToPage}
                      limit={pagination.limit}
                      allowedLimits={pagination.allowedLimits}
                      onLimitChange={pagination.setLimit}
                    />
                  </div>
                </div>
              ) : (
                <EmptyState title={t('payments.my.history.empty')} />
              )
            ) : null}
          </CardBody>
        </Card>
      </div>

    </div>
  );
}
