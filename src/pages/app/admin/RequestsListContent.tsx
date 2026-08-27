import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { useI18n } from '../../../app/i18n';
import { formatDateTime } from '../../../lib/format';
import {
  fraudRiskBadge,
  requestRowVariant,
  requestStateBadgeVariant,
  requestStateLabelKey,
  requestTypeBadgeVariant,
  requestTypeLabelKey,
} from '../../../lib/requestsBadges';
import { dotVariantFromBadgeVariant } from '../../../lib/variantMap';

import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { KeysetPagination } from '../../../components/ui/KeysetPagination';
import { StatusDot } from '../../../components/ui/StatusDot';
import { TableCard } from '../../../components/ui/TableCard';
import { TableRowLink } from '../../../components/ui/TableRowLink';

import {
  requestDateValue,
  requestId,
  requestIpValue,
  requestKey,
  requestLabel,
  requestState,
  requestType,
  type UnifiedRequestRow,
  userLabel,
} from './RequestsModel';

type RequestsPaginationProps = {
  page: number;
  stack: unknown[];
  canPrev: boolean;
  goPrev: () => void;
  goNext: (cursor: number | undefined) => void;
  goToPage: (page: number) => void;
  limit: number;
  allowedLimits: readonly number[];
  setLimit: (limit: number) => void;
};

function RequestPagination(props: {
  pagination: RequestsPaginationProps;
  canNext: boolean;
  pageCursor: number | undefined;
  testId: string;
}) {
  return (
    <KeysetPagination
      page={props.pagination.page}
      pageCount={props.pagination.stack.length}
      canPrev={props.pagination.canPrev}
      canNext={props.canNext}
      onPrev={props.pagination.goPrev}
      onNext={() => props.pagination.goNext(props.pageCursor)}
      onGoToPage={props.pagination.goToPage}
      limit={props.pagination.limit}
      allowedLimits={props.pagination.allowedLimits}
      onLimitChange={props.pagination.setLimit}
      testId={props.testId}
    />
  );
}

export function RequestsListContent(props: {
  rows: UnifiedRequestRow[];
  isAdmin: boolean;
  basePath: string;
  expandedKeys: Set<string>;
  selectedKeys?: ReadonlySet<string>;
  canNext: boolean;
  pageCursor: number | undefined;
  pagination: RequestsPaginationProps;
  onToggleExpanded: (key: string) => void;
  onToggleSelected?: (key: string, selected: boolean) => void;
  onToggleAllVisible?: (selected: boolean) => void;
  renderExpandedContent: (request: UnifiedRequestRow, compact?: boolean) => React.ReactNode;
}) {
  const { t } = useI18n();
  const allVisibleSelected =
    props.rows.length > 0 && props.selectedKeys ? props.rows.every((request) => props.selectedKeys?.has(requestKey(request))) : false;

  return (
    <>
      <div className="space-y-2 md:hidden">
        {props.rows.map((request) => {
          const id = requestId(request);
          const reqType = requestType(request);
          const state = requestState(request);
          const stateVar = requestStateBadgeVariant(state);
          const dotVar = dotVariantFromBadgeVariant(stateVar);
          const risk = request._type === 'registration' ? fraudRiskBadge(request) : null;
          const key = requestKey(request);
          const expanded = props.expandedKeys.has(key);
          const createdAt = requestDateValue(request, 'created_at');

          return (
            <Card key={key} className="p-4" testId={`admin.requests.mobile.row.${reqType}.${id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {props.selectedKeys && props.onToggleSelected ? (
                      <input
                        className="h-4 w-4 rounded border-border"
                        type="checkbox"
                        checked={props.selectedKeys.has(key)}
                        onChange={(e) => props.onToggleSelected?.(key, e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={t('requests.bulk.select_one', { id: String(id) })}
                        data-testid={`admin.requests.bulk.select.mobile.${reqType}.${id}`}
                      />
                    ) : null}
                    <StatusDot variant={dotVar} testId={`admin.requests.row.${reqType}.${id}.dot`} />
                    <div className="text-sm font-semibold">#{id}</div>
                    <Badge variant={requestTypeBadgeVariant(reqType)}>{t(requestTypeLabelKey(reqType))}</Badge>
                  </div>
                  <div className="mt-1 truncate text-xs text-muted">{requestLabel(request)}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant={stateVar}>{t(requestStateLabelKey(state))}</Badge>
                    {props.isAdmin && risk ? (
                      <Badge variant={risk.variant} title={t('requests.risk.tooltip', { score: risk.score })}>
                        {t(risk.labelKey)} {risk.score}
                      </Badge>
                    ) : null}
                  </div>
                  {props.isAdmin ? (
                    <div className="mt-2 text-xs text-muted">
                      <span className="text-faint">{t('common.user')}:</span> {userLabel(request.user)}
                    </div>
                  ) : null}
                  <div className="mt-1 text-xs text-muted">
                    <span className="text-faint">{t('common.created')}:</span> {createdAt ? formatDateTime(createdAt) : '—'}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 px-0"
                    onClick={() => props.onToggleExpanded(key)}
                    aria-label={expanded ? t('requests.list.collapse_row') : t('requests.list.expand_row')}
                    testId={`admin.requests.expand.${reqType}.${id}`}
                  >
                    {expanded ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                  </Button>
                  <Link className="text-xs font-medium text-accent hover:underline" to={`${props.basePath}/requests/${reqType}/${id}`}>
                    {t('common.open')}
                  </Link>
                </div>
              </div>
              {expanded ? <div className="mt-4 border-t border-border pt-4">{props.renderExpandedContent(request, true)}</div> : null}
            </Card>
          );
        })}

        <Card>
          <RequestPagination
            pagination={props.pagination}
            canNext={props.canNext}
            pageCursor={props.pageCursor}
            testId="admin.requests.pagination.mobile"
          />
        </Card>
      </div>

      <TableCard
        className="hidden md:block"
        minWidth="lg"
        tableTestId="admin.requests.table"
        footer={
          <RequestPagination
            pagination={props.pagination}
            canNext={props.canNext}
            pageCursor={props.pageCursor}
            testId="admin.requests.pagination.desktop"
          />
        }
      >
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            {props.selectedKeys && props.onToggleAllVisible ? (
              <th className="w-10 px-3 py-2">
                <input
                  className="h-4 w-4 rounded border-border"
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(e) => props.onToggleAllVisible?.(e.target.checked)}
                  aria-label={t('requests.bulk.select_visible')}
                  data-testid="admin.requests.bulk.select_all"
                />
              </th>
            ) : null}
            <th className="w-10 px-2 py-2"></th>
            <th className="px-3 py-2">{t('common.id')}</th>
            <th className="px-3 py-2">{t('common.type')}</th>
            <th className="px-3 py-2">{t('common.label')}</th>
            {props.isAdmin ? <th className="px-3 py-2">{t('common.user')}</th> : null}
            <th className="px-3 py-2">{t('common.state')}</th>
            <th className="px-3 py-2">{t('common.created')}</th>
            <th className="px-3 py-2">{t('requests.list.col.api_ip')}</th>
            <th className="px-3 py-2">{t('requests.list.col.client_ip')}</th>
            {props.isAdmin ? <th className="px-3 py-2">{t('requests.list.col.risk')}</th> : null}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((request) => {
            const id = requestId(request);
            const reqType = requestType(request);
            const state = requestState(request);
            const rowVar = requestRowVariant(state);
            const stateVar = requestStateBadgeVariant(state);
            const dotVar = dotVariantFromBadgeVariant(stateVar);
            const risk = request._type === 'registration' ? fraudRiskBadge(request) : null;
            const key = requestKey(request);
            const expanded = props.expandedKeys.has(key);
            const colSpan = (props.isAdmin ? 10 : 8) + (props.selectedKeys ? 1 : 0);
            const createdAt = requestDateValue(request, 'created_at');

            return (
              <React.Fragment key={key}>
                <TableRowLink
                  testId={`admin.requests.row.${reqType}.${id}`}
                  to={`${props.basePath}/requests/${reqType}/${id}`}
                  variant={rowVar}
                  className={expanded ? 'border-b border-border/30' : 'border-b border-border/60 last:border-b-0'}
                >
                  {props.selectedKeys && props.onToggleSelected ? (
                    <td className="px-3 py-2">
                      <input
                        className="h-4 w-4 rounded border-border"
                        type="checkbox"
                        checked={props.selectedKeys.has(key)}
                        onChange={(e) => props.onToggleSelected?.(key, e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={t('requests.bulk.select_one', { id: String(id) })}
                        data-testid={`admin.requests.bulk.select.${reqType}.${id}`}
                      />
                    </td>
                  ) : null}
                  <td className="px-2 py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 px-0"
                      onClick={() => props.onToggleExpanded(key)}
                      aria-label={expanded ? t('requests.list.collapse_row') : t('requests.list.expand_row')}
                      testId={`admin.requests.expand.${reqType}.${id}`}
                    >
                      {expanded ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                    </Button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <StatusDot variant={dotVar} testId={`admin.requests.row.${reqType}.${id}.dot`} />
                      <span className="font-medium text-accent">#{id}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={requestTypeBadgeVariant(reqType)}>{t(requestTypeLabelKey(reqType))}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">{requestLabel(request)}</td>
                  {props.isAdmin ? <td className="px-3 py-2 text-xs text-muted">{userLabel(request.user)}</td> : null}
                  <td className="px-3 py-2">
                    <Badge variant={stateVar}>{t(requestStateLabelKey(state))}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">{createdAt ? formatDateTime(createdAt) : '—'}</td>
                  <td className="px-3 py-2 text-xs text-muted">{requestIpValue(request, 'api_ip_addr')}</td>
                  <td className="px-3 py-2 text-xs text-muted">{requestIpValue(request, 'client_ip_addr')}</td>
                  {props.isAdmin ? (
                    <td className="px-3 py-2">
                      {risk ? (
                        <Badge variant={risk.variant} title={t('requests.risk.tooltip', { score: risk.score })}>
                          {t(risk.labelKey)} {risk.score}
                        </Badge>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                  ) : null}
                </TableRowLink>
                {expanded ? (
                  <tr className="border-b border-border/60 bg-surface-2/50" data-testid={`admin.requests.expanded_row.${reqType}.${id}`}>
                    <td colSpan={colSpan} className="px-4 py-4">
                      {props.renderExpandedContent(request)}
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </TableCard>
    </>
  );
}
