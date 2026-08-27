import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { useI18n } from '../../../app/i18n';
import { ListShell } from '../../../components/layout/ListShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { KeysetPagination } from '../../../components/ui/KeysetPagination';
import { LinkButton } from '../../../components/ui/LinkButton';
import { LoadingState } from '../../../components/ui/LoadingState';
import { Select } from '../../../components/ui/Select';
import { TableCard } from '../../../components/ui/TableCard';
import { TableRowLink } from '../../../components/ui/TableRowLink';
import { formatDateTime } from '../../../lib/format';
import {
  requestRowVariant,
  requestStateBadgeVariant,
  requestStateLabelKey,
  requestTypeBadgeVariant,
  requestTypeLabelKey,
} from '../../../lib/requestsBadges';
import {
  defaultStateOptions,
  requestDateValue,
  requestId,
  requestState,
  requestType,
  requestTypeFilterFromUrl,
  type UnifiedRequestRow,
} from '../admin/RequestsModel';
import { fetchMyRequestsPage } from './MyRequestsModel';
import { useMyRequestsPagination } from './useMyRequestsPagination';

const ALLOWED_LIMITS = [25, 50, 100] as const;

function requestSummary(request: UnifiedRequestRow): string {
  const label = String(request.label ?? '').trim();
  if (label) return label;
  if (request._type === 'change') {
    return String(request.change_reason ?? '').trim() || '—';
  }
  return String(request.login ?? request.full_name ?? '').trim() || '—';
}

export function MyRequestsPage() {
  const auth = useAuth();
  const { t } = useI18n();
  const [sp, setSp] = useSearchParams();
  const parsedUserId = Number(auth.user?.id);
  const userId = Number.isSafeInteger(parsedUserId) && parsedUserId > 0 ? parsedUserId : null;
  const type = requestTypeFilterFromUrl(sp.get('type'));
  const requestedState = String(sp.get('state') ?? '').trim();
  const state = defaultStateOptions().includes(requestedState) ? requestedState : '';
  const pagination = useMyRequestsPagination({
    filterKey: JSON.stringify({ type, state }),
    searchParams: sp,
    setSearchParams: setSp,
    defaultLimit: 25,
    allowedLimits: ALLOWED_LIMITS,
  });

  const setFilter = (key: 'type' | 'state', value: string) => {
    const next = new URLSearchParams(sp);
    if (value && !(key === 'type' && value === 'all')) next.set(key, value);
    else next.delete(key);
    next.delete('from_id');
    next.delete('registration_from_id');
    next.delete('change_from_id');
    next.delete('page');
    setSp(next, { replace: true });
  };

  const pageQ = useQuery({
    queryKey: ['user_request', 'mine', userId, 'page', {
      type,
      state,
      limit: pagination.limit,
      cursor: pagination.cursor,
    }],
    enabled: Boolean(userId),
    queryFn: async () => fetchMyRequestsPage({
      userId: userId as number,
      type,
      state: state || undefined,
      limit: pagination.limit,
      cursor: pagination.cursor,
      consumedBefore: (pagination.page - 1) * pagination.limit,
    }),
    staleTime: 15_000,
  });

  const rows = pageQ.data?.rows ?? [];
  const loading = Boolean(userId) && pageQ.isLoading;
  const error = !userId
    ? new Error('Authenticated user identity is unavailable.')
    : pageQ.error;

  const refresh = async () => {
    await pageQ.refetch();
  };

  const canNext = pagination.hasForward || Boolean(pageQ.data?.canNext && pageQ.data.nextCursor);
  const pageCount = pagination.pageCount + (
    pageQ.data?.canNext && pageQ.data.nextCursor && !pagination.hasForward ? 1 : 0
  );
  const goToPage = (pageNumber: number) => {
    if (pageNumber <= pagination.pageCount) {
      pagination.goToPage(pageNumber);
      return;
    }
    if (pageNumber === pagination.page + 1) {
      pagination.goNext(pageQ.data?.nextCursor ?? null);
    }
  };

  const renderPagination = (testId: string) => (
    <KeysetPagination
      page={pagination.page}
      pageCount={pageCount}
      canPrev={pagination.canPrev}
      canNext={canNext}
      onPrev={pagination.goPrev}
      onNext={() => pagination.goNext(pageQ.data?.nextCursor ?? null)}
      onGoToPage={goToPage}
      limit={pagination.limit}
      allowedLimits={ALLOWED_LIMITS}
      onLimitChange={pagination.setLimit}
      testId={testId}
    />
  );

  return (
    <ListShell
      testId="app.requests.list"
      header={
        <PageHeader
          title={t('requests.my.title')}
          description={t('requests.my.description')}
          actions={
            <Button variant="secondary" onClick={() => void refresh()} testId="app.requests.refresh">
              {t('common.refresh')}
            </Button>
          }
        />
      }
      filters={
        <Card className="p-3" testId="app.requests.filters">
          <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <Select
              label={t('requests.list.filter.type.label')}
              value={type}
              onChange={(event) => setFilter('type', event.target.value)}
              testId="app.requests.filter.type"
            >
              <option value="all">{t('requests.list.filter.type.all')}</option>
              <option value="registration">{t('requests.type.registration')}</option>
              <option value="change">{t('requests.type.change')}</option>
            </Select>
            <Select
              label={t('requests.list.filter.state.label')}
              value={state}
              onChange={(event) => setFilter('state', event.target.value)}
              testId="app.requests.filter.state"
            >
              <option value="">{t('requests.my.filter.state.all')}</option>
              {defaultStateOptions().filter(Boolean).map((value) => (
                <option key={value} value={value}>{t(requestStateLabelKey(value))}</option>
              ))}
            </Select>
          </div>
        </Card>
      }
    >
      {loading ? <LoadingState testId="app.requests.loading" /> : null}
      {!loading && error ? (
        <ErrorState
          testId="app.requests.error"
          title={t('requests.my.load_error.title')}
          body={t('requests.my.load_error.body')}
          error={error}
          onRetry={() => void refresh()}
          showDetails={false}
          showBack={false}
          showStatusLink={false}
        />
      ) : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyState
          testId="app.requests.empty"
          title={t('requests.my.empty.title')}
          body={t('requests.my.empty.body')}
          action={
            <LinkButton to="/app/profile" variant="secondary">
              {t('requests.my.empty.profile')}
            </LinkButton>
          }
        />
      ) : null}
      {!loading && !error && rows.length > 0 ? (
        <>
          <div className="space-y-2 md:hidden">
            {rows.map((request) => {
              const id = requestId(request);
              const rowType = requestType(request);
              const currentState = requestState(request);
              const createdAt = requestDateValue(request, 'created_at');
              return (
                <Card key={`${rowType}-${id}`} className="p-4" testId={`app.requests.mobile.row.${rowType}.${id}`}>
                  <Link to={`/app/requests/${rowType}/${id}`} className="block">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">#{id}</span>
                          <Badge variant={requestTypeBadgeVariant(rowType)}>{t(requestTypeLabelKey(rowType))}</Badge>
                          <Badge variant={requestStateBadgeVariant(currentState)}>{t(requestStateLabelKey(currentState))}</Badge>
                        </div>
                        <div className="mt-2 text-sm">{requestSummary(request)}</div>
                        <div className="mt-1 text-xs text-muted">{createdAt ? formatDateTime(createdAt) : '—'}</div>
                      </div>
                      <span className="text-sm font-medium text-accent">{t('common.open')}</span>
                    </div>
                  </Link>
                </Card>
              );
            })}
            <Card>{renderPagination('app.requests.pagination.mobile')}</Card>
          </div>

          <TableCard
            className="hidden md:block"
            minWidth="md"
            tableTestId="app.requests.table"
            footer={renderPagination('app.requests.pagination.desktop')}
          >
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-3 py-2">{t('common.id')}</th>
                <th className="px-3 py-2">{t('common.type')}</th>
                <th className="px-3 py-2">{t('requests.my.col.summary')}</th>
                <th className="px-3 py-2">{t('common.state')}</th>
                <th className="px-3 py-2">{t('common.created')}</th>
                <th className="px-3 py-2 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((request) => {
                const id = requestId(request);
                const rowType = requestType(request);
                const currentState = requestState(request);
                const createdAt = requestDateValue(request, 'created_at');
                return (
                  <TableRowLink
                    key={`${rowType}-${id}`}
                    to={`/app/requests/${rowType}/${id}`}
                    variant={requestRowVariant(currentState)}
                    className="border-b border-border/60 last:border-b-0"
                    testId={`app.requests.row.${rowType}.${id}`}
                  >
                    <td className="px-3 py-2 font-medium text-accent">#{id}</td>
                    <td className="px-3 py-2"><Badge variant={requestTypeBadgeVariant(rowType)}>{t(requestTypeLabelKey(rowType))}</Badge></td>
                    <td className="max-w-md truncate px-3 py-2 text-sm">{requestSummary(request)}</td>
                    <td className="px-3 py-2"><Badge variant={requestStateBadgeVariant(currentState)}>{t(requestStateLabelKey(currentState))}</Badge></td>
                    <td className="px-3 py-2 text-xs text-muted">{createdAt ? formatDateTime(createdAt) : '—'}</td>
                    <td className="px-3 py-2 text-right"><Link className="text-sm font-medium text-accent hover:underline" to={`/app/requests/${rowType}/${id}`}>{t('common.open')}</Link></td>
                  </TableRowLink>
                );
              })}
            </tbody>
          </TableCard>
        </>
      ) : null}
    </ListShell>
  );
}
