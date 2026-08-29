import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getMetaTotalCount } from '../../../../lib/api/haveapi';
import { fetchMailboxes, type Mailbox } from '../../../../lib/api/mailer';
import { useCountedKeysetPagination } from '../../../../lib/hooks/useCountedKeysetPagination';
import { useKeysetPagination } from '../../../../lib/hooks/useKeysetPagination';

type Pagination = ReturnType<typeof useKeysetPagination>;

export function useMailboxPageNavigation(options: {
  pagination: Pagination;
  filters: {
    q?: string;
    server?: string;
    user?: string;
    enableSsl?: boolean;
  };
}) {
  const { pagination, filters } = options;
  const filtersActive = Boolean(
    filters.q?.trim() ||
    filters.server?.trim() ||
    filters.user?.trim() ||
    filters.enableSsl !== undefined
  );
  const listQ = useQuery({
    queryKey: ['mailer', 'mailboxes', 'index', {
      limit: pagination.limit,
      fromId: pagination.fromId,
      q: filters.q,
      server: filters.server,
      user: filters.user,
      ssl: filters.enableSsl,
    }],
    queryFn: () => fetchMailboxes({
      limit: pagination.limit,
      fromId: pagination.fromId,
      count: !filtersActive,
    }),
    staleTime: 10_000,
  });
  const rawRows: Mailbox[] = listQ.data?.data ?? [];
  const rows = useMemo(() => {
    const q = filters.q?.trim().toLowerCase() ?? '';
    const server = filters.server?.trim().toLowerCase() ?? '';
    const user = filters.user?.trim().toLowerCase() ?? '';

    return rawRows.filter((mailbox) => {
      const labelValue = String(mailbox.label ?? '').toLowerCase();
      const serverValue = String(mailbox.server ?? '').toLowerCase();
      const userValue = String(mailbox.user ?? '').toLowerCase();
      const searchable = [mailbox.id, labelValue, serverValue, userValue, mailbox.port]
        .join(' ')
        .toLowerCase();
      if (q && !searchable.includes(q)) return false;
      if (server && !serverValue.includes(server)) return false;
      if (user && !userValue.includes(user)) return false;
      if (filters.enableSsl !== undefined && Boolean(mailbox.enable_ssl) !== filters.enableSsl) return false;
      return true;
    });
  }, [filters.enableSsl, filters.q, filters.server, filters.user, rawRows]);
  const totalCount = filtersActive ? undefined : getMetaTotalCount(listQ.data?.meta);
  const loadPage = useCallback(async (fromId: number | undefined) => (
    await fetchMailboxes({ limit: pagination.limit, fromId, count: !filtersActive })
  ).data, [filtersActive, pagination.limit]);
  const counted = useCountedKeysetPagination({ pagination, totalCount, rows: rawRows, loadPage, direction: 'asc' });

  return {
    canPaginate: pagination.stack.length > 1 || rawRows.length > 0 || counted.canNext,
    listQ,
    filtersActive,
    rows,
    rawRows,
    totalCount,
    ...counted,
  };
}
