import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { useI18n } from '../../../app/i18n';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { CopyButton } from '../../../components/ui/CopyButton';
import type { IncomingPayment } from '../../../lib/api/payments';
import { incomingPaymentBadgeVariant, incomingPaymentStateLabelKey } from '../../../lib/paymentsBadges';
import {
  buildIncomingPaymentReviewSearchTargets,
  buildIncomingPaymentsReconciliationSummary,
  describeIncomingPaymentState,
  incomingPaymentAccountedAmountLabel,
  incomingPaymentReceivedAmountLabel,
  incomingPaymentUserLabel,
} from './IncomingPaymentsModel';

function MetricTile(props: {
  label: React.ReactNode;
  value: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  badge?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3" data-testid={props.testId}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-muted">{props.label}</div>
        {props.badge ? <div className="shrink-0">{props.badge}</div> : null}
      </div>
      <div className="mt-2 text-2xl font-semibold leading-none tabular-nums">{props.value}</div>
      {props.description ? <div className="mt-2 text-xs text-muted">{props.description}</div> : null}
      {props.action ? <div className="mt-3">{props.action}</div> : null}
    </div>
  );
}

function ReviewRow(props: { label: React.ReactNode; children: React.ReactNode; testId?: string }) {
  return (
    <div data-testid={props.testId}>
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{props.label}</div>
      <div className="mt-1 text-sm text-fg">{props.children}</div>
    </div>
  );
}

export function IncomingPaymentsReconciliationSummary(props: {
  rows: IncomingPayment[];
  activeState: string;
  onSetState: (state: string) => void;
  stateTotals?: Partial<Record<'queued' | 'unmatched' | 'processed' | 'ignored', number>>;
}) {
  const { t } = useI18n();
  const summary = useMemo(() => buildIncomingPaymentsReconciliationSummary(props.rows), [props.rows]);

  const activeStateLabel = props.activeState ? t(incomingPaymentStateLabelKey(props.activeState)) : t('common.all');
  const queuedCount = props.stateTotals?.queued ?? summary.queued;
  const unmatchedCount = props.stateTotals?.unmatched ?? summary.unmatched;
  const processedCount = props.stateTotals?.processed ?? summary.processed;
  const ignoredCount = props.stateTotals?.ignored ?? summary.ignored;
  const needsReviewCount = queuedCount + unmatchedCount;
  const openReviewState = unmatchedCount > 0 ? 'unmatched' : queuedCount > 0 ? 'queued' : '';

  return (
    <Card testId="admin.payments.incoming.reconciliation.summary">
      <CardHeader
        title={t('payments.incoming.reconcile.summary.title')}
        subtitle={t('payments.incoming.reconcile.summary.subtitle', { count: summary.total, state: activeStateLabel })}
        actions={
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <Button
              variant={props.activeState === 'unmatched' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => props.onSetState(props.activeState === 'unmatched' ? '' : 'unmatched')}
              testId="admin.payments.incoming.reconciliation.filter.unmatched"
            >
              {t(incomingPaymentStateLabelKey('unmatched'))}
            </Button>
            <Button
              variant={props.activeState === 'queued' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => props.onSetState(props.activeState === 'queued' ? '' : 'queued')}
              testId="admin.payments.incoming.reconciliation.filter.queued"
            >
              {t(incomingPaymentStateLabelKey('queued'))}
            </Button>
            <Button
              variant={props.activeState === 'ignored' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => props.onSetState(props.activeState === 'ignored' ? '' : 'ignored')}
              testId="admin.payments.incoming.reconciliation.filter.ignored"
            >
              {t(incomingPaymentStateLabelKey('ignored'))}
            </Button>
          </div>
        }
      />
      <CardBody>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <MetricTile
            label={t('payments.incoming.reconcile.summary.needs_review')}
            value={needsReviewCount}
            description={
              <span className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="text-accent underline-offset-2 hover:underline disabled:pointer-events-none disabled:text-muted"
                  onClick={() => props.onSetState('queued')}
                  disabled={queuedCount === 0}
                  data-testid="admin.payments.incoming.reconciliation.summary.open_queued"
                >
                  {t('payments.incoming.reconcile.summary.needs_review.queued', { count: queuedCount })}
                </button>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  className="text-accent underline-offset-2 hover:underline disabled:pointer-events-none disabled:text-muted"
                  onClick={() => props.onSetState('unmatched')}
                  disabled={unmatchedCount === 0}
                  data-testid="admin.payments.incoming.reconciliation.summary.open_unmatched"
                >
                  {t('payments.incoming.reconcile.summary.needs_review.unmatched', { count: unmatchedCount })}
                </button>
              </span>
            }
            action={
              openReviewState ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => props.onSetState(openReviewState)}
                  testId="admin.payments.incoming.reconciliation.summary.open_review"
                >
                  {t(openReviewState === 'unmatched' ? 'payments.incoming.reconcile.summary.open_unmatched' : 'payments.incoming.reconcile.summary.open_queued')}
                </Button>
              ) : null
            }
            badge={<Badge variant={needsReviewCount > 0 ? 'danger' : 'ok'}>{needsReviewCount > 0 ? t('payments.incoming.reconcile.summary.badge.review') : t('payments.incoming.reconcile.summary.badge.ok')}</Badge>}
            testId="admin.payments.incoming.reconciliation.metric.needs_review"
          />
          <MetricTile
            label={t(incomingPaymentStateLabelKey('queued'))}
            value={queuedCount}
            description={t('payments.incoming.reconcile.state.queued.explanation')}
            testId="admin.payments.incoming.reconciliation.metric.queued"
          />
          <MetricTile
            label={t('payments.incoming.reconcile.summary.processed')}
            value={processedCount}
            description={t('payments.incoming.reconcile.summary.processed.detail')}
            testId="admin.payments.incoming.reconciliation.metric.processed"
          />
          <MetricTile
            label={t('payments.incoming.reconcile.summary.ignored')}
            value={ignoredCount}
            description={t('payments.incoming.reconcile.summary.ignored.detail')}
            action={
              ignoredCount > 0 ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => props.onSetState('ignored')}
                  testId="admin.payments.incoming.reconciliation.summary.open_ignored"
                >
                  {t('payments.incoming.reconcile.summary.open_ignored')}
                </Button>
              ) : null
            }
            testId="admin.payments.incoming.reconciliation.metric.ignored"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 md:hidden">
          <Button variant={props.activeState === 'unmatched' ? 'primary' : 'secondary'} size="sm" onClick={() => props.onSetState(props.activeState === 'unmatched' ? '' : 'unmatched')}>
            {t(incomingPaymentStateLabelKey('unmatched'))}
          </Button>
          <Button variant={props.activeState === 'queued' ? 'primary' : 'secondary'} size="sm" onClick={() => props.onSetState(props.activeState === 'queued' ? '' : 'queued')}>
            {t(incomingPaymentStateLabelKey('queued'))}
          </Button>
          <Button variant={props.activeState === 'ignored' ? 'primary' : 'secondary'} size="sm" onClick={() => props.onSetState(props.activeState === 'ignored' ? '' : 'ignored')}>
            {t(incomingPaymentStateLabelKey('ignored'))}
          </Button>
        </div>

      </CardBody>
    </Card>
  );
}

export function IncomingPaymentReconciliationCard(props: { payment: IncomingPayment; basePath: string }) {
  const { t } = useI18n();
  const descriptor = describeIncomingPaymentState({ state: props.payment.state, user: props.payment.user });
  const searchTargets = buildIncomingPaymentReviewSearchTargets(props.payment);
  const receivedAmount = incomingPaymentReceivedAmountLabel(props.payment);
  const accountedAmount = incomingPaymentAccountedAmountLabel(props.payment);
  const transactionId = String(props.payment.transaction_id ?? '').trim();

  return (
    <Card testId="admin.payments.incoming.reconciliation.detail">
      <CardHeader title={t('payments.incoming.reconcile.detail.title')} subtitle={t('payments.incoming.reconcile.detail.subtitle')} />
      <CardBody>
        {descriptor.warningKey ? (
          <Alert variant={descriptor.badgeVariant === 'neutral' ? 'warn' : descriptor.badgeVariant} title={t('payments.incoming.reconcile.detail.warning.title')}>
            {t(descriptor.warningKey)}
          </Alert>
        ) : null}

        <div className={descriptor.warningKey ? 'mt-3 grid grid-cols-1 gap-3 md:grid-cols-2' : 'grid grid-cols-1 gap-3 md:grid-cols-2'}>
          <ReviewRow label={t('common.state')} testId="admin.payments.incoming.reconciliation.detail.state">
            <span className="inline-flex flex-wrap items-center gap-2">
              <Badge variant={incomingPaymentBadgeVariant(props.payment.state)}>{t(incomingPaymentStateLabelKey(props.payment.state))}</Badge>
              <span className="text-muted">{t(descriptor.explanationKey)}</span>
            </span>
          </ReviewRow>
          <ReviewRow label={t('payments.incoming.reconcile.detail.next_action')} testId="admin.payments.incoming.reconciliation.detail.next_action">
            {t(descriptor.nextActionKey)}
          </ReviewRow>
          <ReviewRow label={t('payments.incoming.review.assignment')} testId="admin.payments.incoming.reconciliation.detail.assignment">
            {props.payment.user ? (
              <Link className="text-accent hover:underline" to={`${props.basePath}/users/${props.payment.user.id}/payments`}>
                {incomingPaymentUserLabel(props.payment.user)}
              </Link>
            ) : (
              t('payments.incoming.review.assignment.unassigned')
            )}
          </ReviewRow>
          <ReviewRow label={t('payments.incoming.detail.received_amount')} testId="admin.payments.incoming.reconciliation.detail.amount">
            <span className="tabular-nums">{receivedAmount}</span>
            {accountedAmount ? (
              <span className="ml-2 text-xs text-muted">
                {t('payments.incoming.detail.accounted_amount')}: {accountedAmount}
              </span>
            ) : null}
          </ReviewRow>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
          <div className="text-sm font-semibold">{t('payments.incoming.reconcile.links.title')}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {props.payment.user ? (
              <Button to={`${props.basePath}/users/${props.payment.user.id}/payments`} variant="secondary" size="sm" testId="admin.payments.incoming.reconciliation.link.user_payments">
                {t('payments.incoming.reconcile.link.user_payments')}
              </Button>
            ) : null}

            {searchTargets.filter((target) => target.key !== 'transaction').map((target) => (
              <CopyButton
                key={`${target.key}:${target.value}`}
                text={target.value}
                label={t(target.labelKey)}
                variant="secondary"
                size="sm"
                testId={`admin.payments.incoming.reconciliation.link.${target.key}`}
              />
            ))}

            {transactionId ? (
              <CopyButton
                text={transactionId}
                label={t('payments.incoming.reconcile.link.copy_transaction')}
                variant="secondary"
                size="sm"
                testId="admin.payments.incoming.reconciliation.copy_transaction"
              />
            ) : null}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
