import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { fetchObjectHistoryEvents } from '../../../../lib/api/audit';
import { getMetaTotalCount } from '../../../../lib/api/haveapi';
import { useCountedKeysetPagination } from '../../../../lib/hooks/useCountedKeysetPagination';
import { useKeysetPagination } from '../../../../lib/hooks/useKeysetPagination';

interface AuditListFilters {
  q: string;
  userId?: number;
  userSessionId?: number;
  object: string;
  objectId?: number;
  eventType: string;
}

export function useAuditListPaging(options: {
  filters: AuditListFilters;
  searchParams: URLSearchParams;
  setSearchParams: (next: URLSearchParams | string, opts?: { replace?: boolean }) => void;
}) {
  const { filters } = options;
  const pagination = useKeysetPagination({
    id: 'admin.audit.list',
    filterKey: JSON.stringify(filters),
    searchParams: options.searchParams,
    setSearchParams: options.setSearchParams,
    defaultLimit: 25,
    allowedLimits: [10, 25, 50, 100],
  });
  const request = (fromId: number | undefined, count = false) =>
    fetchObjectHistoryEvents({
      userId: filters.userId,
      userSessionId: filters.userSessionId,
      object: filters.object || undefined,
      objectId: filters.objectId,
      eventType: filters.eventType || undefined,
      fromId,
      limit: pagination.limit,
      count,
    });
  const query = useQuery({
    queryKey: ['object_history', 'index', { ...filters, fromId: pagination.fromId ?? null, limit: pagination.limit }],
    queryFn: () => request(pagination.fromId, !filters.q),
  });
  const rawEvents = query.data?.data ?? [];
  const events = useMemo(() => {
    const needle = filters.q.trim().toLowerCase();
    if (!needle) return rawEvents;
    return rawEvents.filter((event) => {
      const searchable = [
        event.id,
        event.event_type,
        event.object,
        event.object_id,
        event.user?.id,
        event.user?.login,
        event.user?.label,
        event.user_session?.id,
        event.user_session?.api_ip_addr,
        JSON.stringify(event.event_data ?? null),
      ]
        .map((value) => String(value ?? '').toLowerCase())
        .join(' ');
      return searchable.includes(needle);
    });
  }, [filters.q, rawEvents]);
  const counted = useCountedKeysetPagination({
    pagination,
    totalCount: filters.q ? undefined : getMetaTotalCount(query.data?.meta),
    rows: rawEvents,
    loadPage: async (fromId) => (await request(fromId)).data,
    direction: 'asc',
  });

  return {
    pagination,
    eventsQ: query,
    events,
    rawEvents,
    canPaginate: pagination.stack.length > 1 || rawEvents.length > 0 || counted.canNext,
    ...counted,
  };
}
