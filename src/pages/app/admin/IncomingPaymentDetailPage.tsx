import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';
import { useToasts } from '../../../app/toasts';
import { useChrome } from '../../../components/layout/ChromeContext';

import {
  createUserPayment,
  fetchIncomingPayment,
  type IncomingPayment,
  updateIncomingPaymentState,
} from '../../../lib/api/payments';
import { fetchUser, type User } from '../../../lib/api/users';
import { getMetaActionStateId } from '../../../lib/api/haveapi';

import { formatDateTime } from '../../../lib/format';
import { formatErrorMessage } from '../../../lib/errors';
import { parseLookupIdLike } from '../../../lib/lookupInput';
import {
  getPaidUntilStatus,
  incomingPaymentBadgeVariant,
  incomingPaymentPrimaryVariant,
  incomingPaymentStateLabelKey,
  paidUntilBadgeVariant,
  paidUntilStatusLabelKey,
} from '../../../lib/paymentsBadges';
import { dotVariantFromBadgeVariant } from '../../../lib/variantMap';

import { ListShell } from '../../../components/layout/ListShell';
import { PageHeader } from '../../../components/layout/PageHeader';

import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { ErrorState } from '../../../components/ui/ErrorState';
import { UserLookupInput } from '../../../components/ui/UserLookupInput';
import { LoadingState } from '../../../components/ui/LoadingState';
import { Select } from '../../../components/ui/Select';
import { StatusDot } from '../../../components/ui/StatusDot';
import { IncomingPaymentAssignReviewCard } from './IncomingPaymentReviewCards';
import {
  buildIncomingPaymentAssignReview,
  buildIncomingPaymentStateReview,
  incomingPaymentAccountedAmountLabel,
  incomingPaymentReceivedAmountLabel,
  incomingPaymentStateOptions,
  incomingPaymentUserLabel,
  parsePositivePaymentId,
} from './IncomingPaymentsModel';

function detailUserLabel(user: User): string {
  const login = String(user.login ?? '').trim();
  const name = String(user.full_name ?? '').trim();
  if (login && name && login !== name) return `${login} · ${name}`;
  return login || name || `#${user.id}`;
}

function AssignmentUserPreview(props: {
  basePath: string;
  userId: number | null;
  user?: User;
  loading: boolean;
  error: boolean;
}) {
  const { t } = useI18n();

  if (!props.userId) return null;

  if (props.loading && !props.user) {
    return (
      <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-muted" data-testid="admin.payments.incoming.assign.user_lookup.loading">
        {t('payments.incoming.assign.lookup.loading', { id: props.userId })}
      </div>
    );
  }

  if (props.error && !props.user) {
    return (
      <div className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger" data-testid="admin.payments.incoming.assign.user_lookup.error">
        {t('payments.incoming.assign.lookup.error', { id: props.userId })}
      </div>
    );
  }

  if (!props.user) return null;

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-ok-border bg-ok-bg px-3 py-2"
      data-testid="admin.payments.incoming.assign.user_lookup"
    >
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-muted">
          {t('payments.incoming.assign.lookup.title')}
        </div>
        <div className="mt-1 text-sm font-semibold text-fg">
          <Link className="text-accent hover:underline" to={`${props.basePath}/users/${props.user.id}`}>
            {detailUserLabel(props.user)}
          </Link>
          <span className="ml-2 text-xs font-medium text-muted">#{props.user.id}</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          {props.user.email ? <span>{props.user.email}</span> : null}
          {props.user.paid_until ? <span>{t('payments.incoming.detail.paid_until')}: {formatDateTime(props.user.paid_until)}</span> : null}
          {typeof props.user.monthly_payment === 'number' ? (
            <span>{t('payments.incoming.assign.lookup.monthly_payment')}: {props.user.monthly_payment}</span>
          ) : null}
        </div>
      </div>
      <Badge variant="ok">{t('payments.incoming.assign.lookup.found')}</Badge>
    </div>
  );
}

export function IncomingPaymentDetailPage() {
  const { basePath } = useAppMode();
  const { t } = useI18n();
  const toasts = useToasts();
  const chrome = useChrome();
  const qc = useQueryClient();

  const params = useParams();
  const paymentId = parsePositivePaymentId(params['paymentId']);

  const q = useQuery({
    queryKey: ['incoming_payments', 'show', paymentId],
    enabled: Boolean(paymentId),
    queryFn: async () => {
      if (!paymentId) throw new Error('invalid payment');
      return (await fetchIncomingPayment(paymentId, { includes: 'user' })).data;
    },
  });

  const payment = q.data as IncomingPayment | undefined;

  const st = String(payment?.state ?? '').trim();
  const acctStatus = payment?.user ? getPaidUntilStatus(payment.user_paid_until) : null;
  const primaryVar = incomingPaymentPrimaryVariant({
    state: st,
    user: payment?.user,
    user_paid_until: payment?.user_paid_until,
  });
  const dotVar = dotVariantFromBadgeVariant(primaryVar);

  const [stateEdit, setStateEdit] = useState('');
  const effectiveStateEdit = stateEdit || st;

  const [assignUserId, setAssignUserId] = useState('');

  const isAssigned = Boolean(payment?.user);

  const recvAmount = useMemo(() => incomingPaymentReceivedAmountLabel(payment), [payment]);
  const acctAmount = useMemo(() => incomingPaymentAccountedAmountLabel(payment), [payment]);

  const stateReview = useMemo(
    () => buildIncomingPaymentStateReview({ payment, nextState: effectiveStateEdit }),
    [effectiveStateEdit, payment]
  );

  const assignReview = useMemo(
    () => buildIncomingPaymentAssignReview({ payment, rawUserId: assignUserId }),
    [assignUserId, payment]
  );

  const assignLookupUserId = useMemo(() => parseLookupIdLike(assignUserId), [assignUserId]);
  const assignUserQ = useQuery({
    queryKey: ['users', 'incoming_payment_assignment_lookup', assignLookupUserId],
    enabled: assignLookupUserId !== null && !isAssigned,
    queryFn: async () => {
      if (assignLookupUserId === null) throw new Error('missing user id');
      return (await fetchUser(assignLookupUserId)).data;
    },
    staleTime: 60_000,
  });

  async function saveState() {
    if (!paymentId || !stateReview.canSubmit) return;

    const next = String(stateReview.nextState).trim();
    if (!next) return;

    try {
      await updateIncomingPaymentState(paymentId, next);

      toasts.pushToast({
        variant: 'ok',
        title: t('payments.incoming.detail.toast.state_updated.title'),
        body: t('payments.incoming.detail.toast.state_updated.message'),
      });

      setStateEdit('');
      q.refetch();
      qc.invalidateQueries({ queryKey: ['incoming_payments', 'index'] });
    } catch (e: unknown) {
      toasts.pushToast({
        variant: 'danger',
        title: t('payments.incoming.detail.toast.state_updated.error.title'),
        body: formatErrorMessage(e),
      });
    }
  }

  async function submitAssign() {
    if (!paymentId) return;

    const userId = assignReview.userId;
    if (!assignReview.canSubmit || !userId) {
      toasts.pushToast({
        variant: 'danger',
        title: t('payments.incoming.assign.toast.invalid_user.title'),
        body: t(assignReview.validationKey ?? 'payments.incoming.assign.toast.invalid_user.message'),
      });
      return;
    }

    try {
      const res = await createUserPayment({ incoming_payment: paymentId, user: userId });
      const asId = getMetaActionStateId(res.meta);
      if (asId) chrome.trackActionState(asId);

      // After matching, default to marking the incoming payment as processed.
      if (String(st).trim() !== 'processed') {
        try {
          await updateIncomingPaymentState(paymentId, 'processed');
        } catch (e: unknown) {
          toasts.pushToast({
            variant: 'warn',
            title: t('payments.incoming.assign.toast.state_update_failed.title'),
            body: `${t('payments.incoming.assign.toast.state_update_failed.message')} (${formatErrorMessage(e)})`,
          });
        }
      }

      toasts.pushToast({
        variant: 'ok',
        title: t('payments.incoming.assign.toast.title'),
        body: t('payments.incoming.assign.toast.message'),
      });

      setAssignUserId('');
      setStateEdit('');

      await q.refetch();
      void qc.invalidateQueries({ queryKey: ['incoming_payments', 'index'] });
      void qc.invalidateQueries({ predicate: (query) => ['user_payments', 'finance', 'payment_stats'].includes(String(query.queryKey[0])) });
    } catch (e: unknown) {
      toasts.pushToast({
        variant: 'danger',
        title: t('payments.incoming.assign.toast.error.title'),
        body: formatErrorMessage(e),
      });
    }
  }

  if (!paymentId) {
    return (
      <ListShell>
        <ErrorState title={t('payments.incoming.detail.invalid')} error={{ message: t('payments.incoming.detail.invalid.body') }} />
      </ListShell>
    );
  }

  if (q.isLoading) {
    return (
      <ListShell>
        <LoadingState />
      </ListShell>
    );
  }

  if (q.isError) {
    return (
      <ListShell>
        <ErrorState title={t('payments.incoming.detail.load_error.title')} error={q.error} />
      </ListShell>
    );
  }

  if (!payment) {
    return (
      <ListShell>
        <ErrorState title={t('payments.incoming.detail.load_error.title')} error={{ message: t('payments.incoming.detail.not_found') }} />
      </ListShell>
    );
  }

  return (
    <ListShell>
      <PageHeader
        title={`${t('payments.incoming.detail.title')} #${paymentId}`}
        description={
          <span className="inline-flex items-center gap-2">
            <StatusDot variant={dotVar} testId={`admin.payments.incoming.detail.${paymentId}.dot`} />
            <Badge variant={incomingPaymentBadgeVariant(st)} testId={`admin.payments.incoming.detail.${paymentId}.state`}>{t(incomingPaymentStateLabelKey(st))}</Badge>
            {acctStatus && (acctStatus.status === 'due_soon' || acctStatus.status === 'overdue') ? (
              <Badge variant={paidUntilBadgeVariant(acctStatus.status)}>{t(paidUntilStatusLabelKey(acctStatus.status))}</Badge>
            ) : null}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Link className="text-sm text-accent hover:underline" to={`${basePath}/payments/incoming`}>
              {t('common.back')}
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <Card>
            <CardHeader
              title={t('payments.incoming.detail.card.payment')}
              subtitle={
                <span className="inline-flex flex-wrap items-center gap-2">
                  <Badge variant={incomingPaymentBadgeVariant(st)}>{t(incomingPaymentStateLabelKey(st))}</Badge>
                  <span className="text-faint">#{paymentId}</span>
                </span>
              }
              actions={
                <div className="text-right">
                  <div className="text-lg font-semibold tabular-nums text-fg">{recvAmount}</div>
                  {acctAmount ? (
                    <div className="text-xs text-muted">{t('payments.incoming.detail.accounted_amount')}: {acctAmount}</div>
                  ) : null}
                </div>
              }
            />
            <CardBody>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <div className="text-xs text-muted">{t('common.date')}</div>
                <div className="text-sm">{formatDateTime(payment.date)}</div>
              </div>
              <div>
                <div className="text-xs text-muted">{t('payments.incoming.detail.transaction_id')}</div>
                <div className="text-sm tabular-nums">{String(payment.transaction_id ?? '—')}</div>
              </div>
              <div>
                <div className="text-xs text-muted">{t('payments.incoming.detail.received_amount')}</div>
                <div className="text-sm font-semibold tabular-nums">{recvAmount}</div>
                {acctAmount ? <div className="text-xs text-muted">{t('payments.incoming.detail.accounted_amount')}: {acctAmount}</div> : null}
              </div>
              <div>
                <div className="text-xs text-muted">{t('payments.incoming.detail.account')}</div>
                <div className="text-sm">{String(payment.account_name ?? '—')}</div>
              </div>
              <div>
                <div className="text-xs text-muted">VS</div>
                <div className="text-sm tabular-nums">{String(payment.vs ?? '—')}</div>
              </div>
              <div>
                <div className="text-xs text-muted">KS</div>
                <div className="text-sm tabular-nums">{String(payment.ks ?? '—')}</div>
              </div>
              <div>
                <div className="text-xs text-muted">SS</div>
                <div className="text-sm tabular-nums">{String(payment.ss ?? '—')}</div>
              </div>
              <div>
                <div className="text-xs text-muted">{t('payments.incoming.detail.user_ident')}</div>
                <div className="text-sm">{String(payment.user_ident ?? '—')}</div>
              </div>
              <div className="md:col-span-3">
                <div className="text-xs text-muted">{t('payments.incoming.detail.user_message')}</div>
                <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm whitespace-pre-line">
                  {String(payment.user_message ?? '—')}
                </div>
              </div>
              <div className="md:col-span-3">
                <div className="text-xs text-muted">{t('payments.incoming.detail.comment')}</div>
                <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm whitespace-pre-line">
                  {String(payment.comment ?? '—')}
                </div>
              </div>
            </div>
          </CardBody>
          </Card>

          {!isAssigned ? (
            <Card testId="admin.payments.incoming.assign.inline">
              <CardHeader
                title={t('payments.incoming.assign.card.title')}
                subtitle={t('payments.incoming.assign.card.unassigned_subtitle')}
                actions={
                  <Badge variant={assignReview.canSubmit ? 'warn' : 'neutral'}>
                    {assignReview.canSubmit
                      ? t('payments.incoming.review.badge.ready')
                      : t('payments.incoming.review.badge.incomplete')}
                  </Badge>
                }
              />
              <CardBody>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                    <div>
                      <div className="text-sm font-medium">{t('payments.incoming.assign.user_id')}</div>
                      <UserLookupInput
                        value={assignUserId}
                        onChange={setAssignUserId}
                        placeholder={t('payments.incoming.assign.user_placeholder')}
                        testId="admin.payments.incoming.assign.user_id"
                        ariaLabel={t('payments.incoming.assign.user_id')}
                        loadingLabel={t('common.loading')}
                        noResultsLabel={t('empty.list.no_matches.title')}
                      />
                    </div>
                    <Button
                      variant="primary"
                      onClick={submitAssign}
                      disabled={!assignReview.canSubmit}
                      testId="admin.payments.incoming.assign.submit"
                    >
                      {t('payments.incoming.assign.modal.submit')}
                    </Button>
                  </div>

                  <AssignmentUserPreview
                    basePath={basePath}
                    userId={assignLookupUserId}
                    user={assignUserQ.data}
                    loading={assignUserQ.isFetching}
                    error={assignUserQ.isError}
                  />

                  <IncomingPaymentAssignReviewCard payment={payment} review={assignReview} targetUser={assignUserQ.data} />
                </div>
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div className="space-y-3">
          <Card>
            <CardHeader title={t('payments.incoming.detail.card.state')} />
            <CardBody>
              <div className="flex items-center gap-2">
                <StatusDot variant={dotVar} />
                <Badge variant={incomingPaymentBadgeVariant(st)} testId={`admin.payments.incoming.detail.${paymentId}.state.card`}>{t(incomingPaymentStateLabelKey(st))}</Badge>
              </div>

              <div className="mt-3 space-y-3">
                <div>
                  <div className="text-xs text-muted">{t('payments.incoming.detail.change_state')}</div>
                  <Select
                    value={effectiveStateEdit}
                    onChange={(e) => setStateEdit(e.target.value)}
                    testId="admin.payments.incoming.state.select"
                  >
                    {incomingPaymentStateOptions().map((s) => (
                      <option key={s} value={s}>
                        {t(incomingPaymentStateLabelKey(s))}
                      </option>
                    ))}
                  </Select>
                </div>

                {stateReview.warningKey ? (
                  <div className="rounded-md border border-warn-border bg-warn-bg px-3 py-2 text-sm text-warn">
                    {t(stateReview.warningKey)}
                  </div>
                ) : null}

                {isAssigned ? (
                  <div className="rounded-md border border-border bg-surface-2 px-3 py-2">
                    <div className="text-xs text-muted">{t('common.user')}</div>
                    <div className="mt-1 text-sm font-medium">
                      <Link className="text-accent hover:underline" to={`${basePath}/users/${payment.user?.id}`}>
                        {incomingPaymentUserLabel(payment.user)}
                      </Link>
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {t('payments.incoming.detail.paid_until')}: {payment.user_paid_until ? formatDateTime(payment.user_paid_until) : '—'}
                    </div>
                  </div>
                ) : null}

                <div>
                  <Button
                    variant="secondary"
                    onClick={saveState}
                    disabled={!stateReview.canSubmit}
                    testId="admin.payments.incoming.state.save"
                  >
                    {t('common.save')}
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </ListShell>
  );
}
