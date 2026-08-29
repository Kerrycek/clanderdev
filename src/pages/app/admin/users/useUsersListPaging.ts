import { useQuery } from '@tanstack/react-query';

import { getMetaTotalCount } from '../../../../lib/api/haveapi';
import { fetchUsers, type FetchUsersOpts } from '../../../../lib/api/users';
import { useCountedKeysetPagination } from '../../../../lib/hooks/useCountedKeysetPagination';
import { useKeysetPagination } from '../../../../lib/hooks/useKeysetPagination';

import type { UserListRecord } from './userListSemantics';

type UserFilters = Pick<
  FetchUsersOpts,
  'q' | 'role' | 'level' | 'mailerEnabled' | 'lockout' | 'passwordReset' | 'enableMfa'
>;

export function useUsersListPaging(options: {
  basePath: string;
  filters: UserFilters;
  searchParams: URLSearchParams;
  setSearchParams: (next: URLSearchParams | string, opts?: { replace?: boolean }) => void;
}) {
  const pagination = useKeysetPagination({
    id: 'admin.users.list',
    filterKey: JSON.stringify({ ...options.filters, scope: options.basePath }),
    searchParams: options.searchParams,
    setSearchParams: options.setSearchParams,
    defaultLimit: 50,
    allowedLimits: [25, 50, 100],
  });
  const request = (fromId: number | undefined, count = false) =>
    fetchUsers({ ...options.filters, limit: pagination.limit, fromId, count });
  const query = useQuery({
    queryKey: ['users', 'index', { ...options.filters, limit: pagination.limit, fromId: pagination.fromId ?? null }],
    queryFn: () => request(pagination.fromId, true),
    staleTime: 10_000,
  });
  const users = (query.data?.data ?? []) as UserListRecord[];
  const counted = useCountedKeysetPagination({
    pagination,
    totalCount: getMetaTotalCount(query.data?.meta),
    rows: users,
    loadPage: async (fromId) => (await request(fromId)).data as UserListRecord[],
    direction: 'asc',
  });
  const compat = query.data?.compat;
  const compatCursor = compat?.nextFromId;
  const canNext = pagination.hasForward || (compat ? compatCursor !== undefined : counted.canNext);
  const pageCursor = compatCursor ?? counted.pageCursor;
  const goToPage = compat
    ? async (pageNumber: number) => {
        if (pageNumber <= pagination.stack.length) pagination.goToPage(pageNumber);
      }
    : counted.goToPage;

  return {
    pagination,
    listQ: query,
    users,
    ...counted,
    pageCursor,
    canNext,
    goToPage,
    maxDirectPage: compat ? pagination.stack.length : counted.maxDirectPage,
    compatScanActive: Boolean(compat),
    canPaginate: pagination.stack.length > 1 || users.length > 0 || canNext,
  };
}
