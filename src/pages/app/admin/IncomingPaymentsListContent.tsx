import React from 'react';
import { Link } from 'react-router-dom';

import { useI18n } from '../../../app/i18n';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { KeysetPagination } from '../../../components/ui/KeysetPagination';
import { StatusDot } from '../../../components/ui/StatusDot';
import { TableCard } from '../../../components/ui/TableCard';
import { TableRowLink } from '../../../components/ui/TableRowLink';
import type { IncomingPayment } from '../../../lib/api/payments';
import { formatDateTime } from '../../../lib/format';
import type { useKeysetPagination } from '../../../lib/hooks/useKeysetPagination';
import {
  getPaidUntilStatus,
  incomingPaymentBadgeVariant,
  incomingPaymentPrimaryVariant,
  incomingPaymentRowVariantWithAccount,
  incomingPaymentStateLabelKey,
  paidUntilBadgeVariant,
  paidUntilStatusLabelKey,
} from '../../../lib/paymentsBadges';
import { dotVariantFromBadgeVariant } from '../../../lib/variantMap';
import {
  incomingPaymentAccountedAmountLabel,
  incomingPaymentReceivedAmountLabel,
  incomingPaymentUserLabel,
} from './IncomingPaymentsModel';

type PaginationController = ReturnType<typeof useKeysetPagination>;

export function IncomingPaymentsListContent(props: {
  rows: IncomingPayment[];
  basePath: string;
  pagination: PaginationController;
  pageCount?: number;
  totalPagesKnown?: boolean;
  onGoToPage?: (pageNumber: number) => void | Promise<void>;
  pageCursor: number | null;
  canNext: boolean;
  selectedIds?: ReadonlySet<number>;
  onToggleSelected?: (id: number, selected: boolean) => void;
  onToggleAllVisible?: (selected: boolean) => void;
}) {
  const { t } = useI18n();
  const selectedIds = props.selectedIds ?? new Set<number>();
  const allVisibleSelected = props.rows.length > 0 && props.rows.every((row) => selectedIds.has(row.id));

  return (
    <>
      <div className="space-y-2 md:hidden">
        {props.rows.map((p) => {
          const st = String(p.state ?? '').trim();
          const acctStatus = p.user ? getPaidUntilStatus(p.user_paid_until) : null;
          const primaryVar = incomingPaymentPrimaryVariant({
            state: st,
            user: p.user,
            user_paid_until: p.user_paid_until,
          });
          const dotVar = dotVariantFromBadgeVariant(primaryVar);

          const recvAmount = incomingPaymentReceivedAmountLabel(p);
          const acctAmount = incomingPaymentAccountedAmountLabel(p);

          return (
            <Card key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={(event) => props.onToggleSelected?.(p.id, event.target.checked)}
                      aria-label={t('payments.incoming.bulk.select_row', { id: p.id })}
                      data-testid={`admin.payments.incoming.bulk.select.${p.id}.mobile`}
                      className="h-4 w-4 rounded border-border"
                    />
                    <StatusDot variant={dotVar} testId={`admin.payments.incoming.row.${p.id}.dot`} />
                    <div className="text-sm font-semibold">#{p.id}</div>
                    <Badge variant={incomingPaymentBadgeVariant(st)}>{t(incomingPaymentStateLabelKey(st))}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted">{formatDateTime(p.date)}</div>
                  <div className="mt-2 text-sm font-medium tabular-nums">{recvAmount}</div>
                  {acctAmount ? (
                    <div className="mt-1 text-xs text-muted">
                      {t('payments.incoming.list.accounted')}: {acctAmount}
                    </div>
                  ) : null}
                  <div className="mt-2 text-xs text-muted">
                    <span className="text-faint">VS:</span> {String(p.vs ?? '—')}{' '}
                    <span className="text-faint">TX:</span> {String(p.transaction_id ?? '—')}
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    <span className="text-faint">{t('common.user')}:</span> {incomingPaymentUserLabel(p.user)}
                  </div>
                  {p.user ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span className="text-faint">{t('payments.incoming.list.col.paid_until')}:</span>{' '}
                      {p.user_paid_until ? formatDateTime(p.user_paid_until) : '—'}
                      {acctStatus && (acctStatus.status === 'due_soon' || acctStatus.status === 'overdue') ? (
                        <Badge variant={paidUntilBadgeVariant(acctStatus.status)}>
                          {t(paidUntilStatusLabelKey(acctStatus.status))}
                        </Badge>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <Link className="text-xs font-medium text-accent hover:underline" to={`${props.basePath}/payments/incoming/${p.id}`}>
                  {t('common.open')}
                </Link>
              </div>
            </Card>
          );
        })}

        <Card>
          <KeysetPagination
            page={props.pagination.page}
            pageCount={props.pageCount ?? props.pagination.stack.length}
            totalPagesKnown={props.totalPagesKnown}
            canPrev={props.pagination.canPrev}
            canNext={props.canNext}
            onPrev={props.pagination.goPrev}
            onNext={() => props.pagination.goNext(props.pageCursor)}
            onGoToPage={props.onGoToPage ?? props.pagination.goToPage}
            limit={props.pagination.limit}
            allowedLimits={props.pagination.allowedLimits}
            onLimitChange={props.pagination.setLimit}
            testId="admin.payments.incoming.pagination.mobile"
          />
        </Card>
      </div>

      <TableCard
        className="hidden md:block"
        minWidth="lg"
        tableTestId="admin.payments.incoming.table"
        footer={
          <KeysetPagination
            page={props.pagination.page}
            pageCount={props.pageCount ?? props.pagination.stack.length}
            totalPagesKnown={props.totalPagesKnown}
            canPrev={props.pagination.canPrev}
            canNext={props.canNext}
            onPrev={props.pagination.goPrev}
            onNext={() => props.pagination.goNext(props.pageCursor)}
            onGoToPage={props.onGoToPage ?? props.pagination.goToPage}
            limit={props.pagination.limit}
            allowedLimits={props.pagination.allowedLimits}
            onLimitChange={props.pagination.setLimit}
            testId="admin.payments.incoming.pagination.desktop"
          />
        }
      >
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th className="w-10 px-2 py-2">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={(event) => props.onToggleAllVisible?.(event.target.checked)}
                aria-label={t('payments.incoming.bulk.select_visible')}
                data-testid="admin.payments.incoming.bulk.select_all.desktop"
                className="h-4 w-4 rounded border-border"
              />
            </th>
            <th className="px-3 py-2">{t('common.id')}</th>
            <th className="px-3 py-2">{t('common.date')}</th>
            <th className="px-3 py-2">{t('payments.incoming.list.col.amount')}</th>
            <th className="px-3 py-2">{t('payments.incoming.list.col.vs')}</th>
            <th className="px-3 py-2">{t('payments.incoming.list.col.account')}</th>
            <th className="px-3 py-2">{t('common.user')}</th>
            <th className="px-3 py-2">{t('payments.incoming.list.col.paid_until')}</th>
            <th className="px-3 py-2">{t('common.state')}</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((p) => {
            const st = String(p.state ?? '').trim();
            const acctStatus = p.user ? getPaidUntilStatus(p.user_paid_until) : null;
            const rowVar = incomingPaymentRowVariantWithAccount({
              state: st,
              user: p.user,
              user_paid_until: p.user_paid_until,
            });
            const primaryVar = incomingPaymentPrimaryVariant({
              state: st,
              user: p.user,
              user_paid_until: p.user_paid_until,
            });
            const dotVar = dotVariantFromBadgeVariant(primaryVar);

            const recvAmount = incomingPaymentReceivedAmountLabel(p);
            const acctAmount = incomingPaymentAccountedAmountLabel(p);

            return (
              <TableRowLink
                key={p.id}
                testId={`admin.payments.incoming.row.${p.id}`}
                to={`${props.basePath}/payments/incoming/${p.id}`}
                variant={rowVar}
                className="border-b border-border/60 last:border-b-0"
              >
                <td className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(p.id)}
                    onChange={(event) => props.onToggleSelected?.(p.id, event.target.checked)}
                    aria-label={t('payments.incoming.bulk.select_row', { id: p.id })}
                    data-testid={`admin.payments.incoming.bulk.select.${p.id}`}
                    className="h-4 w-4 rounded border-border"
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <StatusDot variant={dotVar} testId={`admin.payments.incoming.row.${p.id}.dot`} />
                    <span className="font-medium text-accent">#{p.id}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-muted">{formatDateTime(p.date)}</td>
                <td className="px-3 py-2">
                  <div className="text-sm font-medium tabular-nums">{recvAmount}</div>
                  {acctAmount ? <div className="text-xs text-muted">{acctAmount}</div> : null}
                </td>
                <td className="px-3 py-2 text-xs text-muted tabular-nums">{String(p.vs ?? '—')}</td>
                <td className="px-3 py-2 text-xs text-muted">{String(p.account_name ?? '—')}</td>
                <td className="px-3 py-2 text-xs text-muted">{incomingPaymentUserLabel(p.user)}</td>
                <td className="px-3 py-2 text-xs text-muted">
                  {p.user ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular-nums">{p.user_paid_until ? formatDateTime(p.user_paid_until) : '—'}</span>
                      {acctStatus && (acctStatus.status === 'due_soon' || acctStatus.status === 'overdue') ? (
                        <Badge variant={paidUntilBadgeVariant(acctStatus.status)}>
                          {t(paidUntilStatusLabelKey(acctStatus.status))}
                        </Badge>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Badge variant={incomingPaymentBadgeVariant(st)}>{t(incomingPaymentStateLabelKey(st))}</Badge>
                </td>
              </TableRowLink>
            );
          })}
        </tbody>
      </TableCard>
    </>
  );
}
