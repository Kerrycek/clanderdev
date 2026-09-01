import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import { useAppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Input } from '../../../components/ui/Input';
import { KeysetPagination } from '../../../components/ui/KeysetPagination';
import { LoadingState } from '../../../components/ui/LoadingState';
import { TableCard } from '../../../components/ui/TableCard';
import { TableRowLink } from '../../../components/ui/TableRowLink';
import { eventBadgeVariant, eventVariant, sessionLabel, userLabel } from '../../../lib/auditUi';
import { fetchObjectHistoryEvents, type ObjectHistoryEvent } from '../../../lib/api/audit';
import { formatDateTime } from '../../../lib/format';
import { useDebouncedValue } from '../../../lib/hooks/useDebouncedValue';
import { useKeysetPagination } from '../../../lib/hooks/useKeysetPagination';
import { cursorFromAscendingPage } from '../../../lib/lockIndex';
import { useVps } from './VpsContext';

function changedFields(event: ObjectHistoryEvent): string {
  const data = event.event_data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return '';

  const keys = Object.keys(data);
  const head = keys.slice(0, 4).join(', ');
  return keys.length > 4 ? `${head}, …` : head;
}

export function VpsHistoryPage() {
  const { vps } = useVps();
  const { basePath, mode } = useAppMode();
  const { t } = useI18n();
  const na = t('common.na');
  const [searchParams, setSearchParams] = useSearchParams();
  const [eventTypeInput, setEventTypeInput] = useState(() => searchParams.get('event_type') ?? '');
  const eventType = useDebouncedValue(eventTypeInput.trim(), 250);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (eventType) next.set('event_type', eventType);
    else next.delete('event_type');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [eventType, searchParams, setSearchParams]);

  const pagination = useKeysetPagination({
    id: `vps.${vps.id}.history`,
    filterKey: eventType,
    searchParams,
    setSearchParams,
    defaultLimit: 25,
    allowedLimits: [25, 50, 100],
  });

  const historyQ = useQuery({
    queryKey: ['object_history', 'vps', { vpsId: vps.id, eventType, fromId: pagination.fromId, limit: pagination.limit }],
    queryFn: async () => (
      await fetchObjectHistoryEvents({
        object: 'Vps',
        objectId: vps.id,
        eventType: eventType || undefined,
        fromId: pagination.fromId,
        // Fetch one look-ahead row so an exactly full terminal page does not
        // expose a misleading Next button that only opens an empty page.
        limit: pagination.limit + 1,
      })
    ).data,
    refetchOnWindowFocus: false,
  });

  const historyPage = historyQ.data ?? [];
  const events = useMemo(() => historyPage.slice(0, pagination.limit), [historyPage, pagination.limit]);
  const nextCursor = useMemo(() => cursorFromAscendingPage(events), [events]);
  const canNext = pagination.hasForward || historyPage.length > pagination.limit;
  const pageCount = Math.max(pagination.pageCount, pagination.page + (canNext && !pagination.hasForward ? 1 : 0));
  const adminDetail = (event: ObjectHistoryEvent) => mode === 'admin' ? `${basePath}/audit/${event.id}` : undefined;

  const paginationControl = events.length > 0 || pagination.canPrev ? (
    <KeysetPagination
      testId="vps.history.pagination"
      page={pagination.page}
      pageCount={pageCount}
      canPrev={pagination.canPrev}
      canNext={canNext}
      onPrev={pagination.goPrev}
      onNext={() => pagination.goNext(nextCursor)}
      onGoToPage={pagination.goToPage}
      limit={pagination.limit}
      allowedLimits={pagination.allowedLimits}
      onLimitChange={pagination.setLimit}
    />
  ) : null;

  return (
    <div className="space-y-4" data-testid="vps.history.page">
      <Card testId="vps.history.card">
        <CardHeader
          title={t('vps.history.title')}
          subtitle={mode === 'admin' ? t('vps.history.subtitle_admin') : t('vps.history.subtitle_user')}
          actions={
            <Button
              variant="secondary"
              size="sm"
              loading={historyQ.isFetching}
              onClick={() => void historyQ.refetch()}
              testId="vps.history.refresh"
            >
              {t('common.refresh')}
            </Button>
          }
        />

        <CardBody className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 sm:max-w-md">
              <Input
                label={t('vps.history.filter.event_type')}
                value={eventTypeInput}
                onChange={(event) => setEventTypeInput(event.target.value)}
                placeholder={t('vps.history.filter.event_type_placeholder')}
                testId="vps.history.filter.event_type"
              />
            </div>
            {eventTypeInput.trim() ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEventTypeInput('')}
                testId="vps.history.filter.clear"
              >
                {t('common.clear_filters')}
              </Button>
            ) : null}
          </div>

          {historyQ.isLoading ? (
            <LoadingState testId="vps.history.loading" />
          ) : historyQ.isError ? (
            <ErrorState
              testId="vps.history.error"
              title={t('audit.load_error.title')}
              error={historyQ.error}
              onRetry={() => void historyQ.refetch()}
              detailsExtra={{ page: 'vps.history', vpsId: vps.id }}
            />
          ) : events.length === 0 ? (
            <EmptyState
              testId="vps.history.empty"
              title={t('vps.history.empty.title')}
              body={t('vps.history.empty.body')}
              actionLabel={eventType ? t('common.clear_filters') : undefined}
              onAction={eventType ? () => setEventTypeInput('') : undefined}
            />
          ) : (
            <>
              <TableCard testId="vps.history.table" minWidth="lg" className="hidden md:block">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="px-4 py-3">{t('audit.table.time')}</th>
                    <th className="px-4 py-3">{t('audit.table.event')}</th>
                    <th className="px-4 py-3">{t('audit.table.user')}</th>
                    <th className="px-4 py-3">{t('audit.table.session')}</th>
                    <th className="px-4 py-3">{t('vps.history.fields')}</th>
                    {mode === 'admin' ? <th className="px-4 py-3 text-right">{t('common.details')}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => {
                    const label = event.event_type ? String(event.event_type) : na;
                    const fields = changedFields(event);
                    return (
                      <TableRowLink
                        key={event.id}
                        to={adminDetail(event)}
                        variant={eventVariant(event.event_type)}
                        testId={`vps.history.row.${event.id}`}
                      >
                        <td className="px-4 py-3 text-xs text-muted">{formatDateTime(event.created_at)}</td>
                        <td className="px-4 py-3"><Badge variant={eventBadgeVariant(event.event_type)}>{label}</Badge></td>
                        <td className="px-4 py-3">{userLabel(event, na)}</td>
                        <td className="px-4 py-3 text-xs text-muted">{sessionLabel(event, na)}</td>
                        <td className="px-4 py-3 text-xs text-muted">{fields || t('vps.history.fields.hidden')}</td>
                        {mode === 'admin' ? <td className="px-4 py-3 text-right text-xs text-accent">{t('common.open')}</td> : null}
                      </TableRowLink>
                    );
                  })}
                </tbody>
              </TableCard>

              <div className="space-y-3 md:hidden" data-testid="vps.history.mobile">
                {events.map((event) => {
                  const label = event.event_type ? String(event.event_type) : na;
                  const fields = changedFields(event);
                  return (
                    <TableCard
                      key={event.id}
                      testId={`vps.history.card.${event.id}`}
                      to={adminDetail(event)}
                      title={<Badge variant={eventBadgeVariant(event.event_type)}>{label}</Badge>}
                      subtitle={formatDateTime(event.created_at)}
                      rows={[
                        { label: t('audit.table.user'), value: userLabel(event, na) },
                        { label: t('audit.table.session'), value: sessionLabel(event, na) },
                        { label: t('vps.history.fields'), value: fields || t('vps.history.fields.hidden') },
                      ]}
                    />
                  );
                })}
              </div>
            </>
          )}
        </CardBody>

        {paginationControl}
      </Card>
    </div>
  );
}
