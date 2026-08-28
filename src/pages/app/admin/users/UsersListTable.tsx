import React from 'react';
import { Link } from 'react-router-dom';

import { formatDateTime } from '../../../../lib/format';
import type { KeysetPaginationState } from '../../../../lib/hooks/useKeysetPagination';

import { Badge } from '../../../../components/ui/Badge';
import { KeysetPagination } from '../../../../components/ui/KeysetPagination';
import { StatusDot } from '../../../../components/ui/StatusDot';
import { TableCard } from '../../../../components/ui/TableCard';
import { TableRowLink } from '../../../../components/ui/TableRowLink';

import {
  type UserListRecord,
  type UsersPageTranslator,
  roleBadgeForUser,
  userDotVariant,
  userRowVariant,
  userStatusBadges,
} from './userListSemantics';

interface UsersListTableProps {
  users: UserListRecord[];
  basePath: string;
  t: UsersPageTranslator;
  na: string;
  pagination: KeysetPaginationState;
  pageCount: number;
  totalPagesKnown: boolean;
  onGoToPage: (pageNumber: number) => void | Promise<void>;
  maxDirectPage: number;
  jumpPending: boolean;
  canPaginate: boolean;
  canNext: boolean;
  pageCursor: number | null;
}

export function UsersListTable({
  users,
  basePath,
  t,
  na,
  pagination,
  pageCount,
  totalPagesKnown,
  onGoToPage,
  maxDirectPage,
  jumpPending,
  canPaginate,
  canNext,
  pageCursor,
}: UsersListTableProps) {
  return (
    <TableCard
      className="hidden md:block"
      minWidth="md"
      tableTestId="admin.users.table"
      footer={
        canPaginate ? (
          <KeysetPagination
            page={pagination.page}
            pageCount={pageCount}
            totalPagesKnown={totalPagesKnown}
            maxDirectPage={maxDirectPage}
            jumpPending={jumpPending}
            canPrev={pagination.canPrev}
            canNext={canNext}
            onPrev={pagination.goPrev}
            onNext={() => pagination.goNext(pageCursor)}
            onGoToPage={onGoToPage}
            limit={pagination.limit}
            allowedLimits={pagination.allowedLimits}
            onLimitChange={pagination.setLimit}
            testId="admin.users.pagination.desktop"
          />
        ) : null
      }
    >
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted">
          <th className="w-8 px-2 py-2"><span className="sr-only">{t('common.state')}</span></th>
          <th className="px-3 py-2">{t('admin.users.field.login')}</th>
          <th className="px-3 py-2">{t('admin.users.field.name')}</th>
          <th className="px-3 py-2">{t('admin.users.field.email')}</th>
          <th className="px-3 py-2">{t('admin.users.field.role')}</th>
          <th className="px-3 py-2">{t('admin.users.field.last_activity')}</th>
          <th className="px-3 py-2">{t('admin.users.field.created')}</th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => {
          const role = roleBadgeForUser(user);
          const rowVariant = userRowVariant(user);
          const dotVariant = userDotVariant(user);
          const statusBadges = userStatusBadges(user, t);
          return (
            <TableRowLink
              key={user.id}
              testId={`admin.users.row.${user.id}`}
              to={`${basePath}/users/${user.id}`}
              variant={rowVariant}
              className="border-b border-border/60 last:border-b-0"
            >
              <td className="px-2 py-2 align-top">
                <StatusDot variant={dotVariant} testId={`admin.users.row.${user.id}.dot`} ariaLabel={t('common.state')} />
              </td>
              <td className="px-3 py-2 align-top">
                <Link className="font-medium text-accent hover:underline" to={`${basePath}/users/${user.id}`}>
                  {user.login ?? `#${user.id}`}
                </Link>
                <div className="mt-1 text-xs text-faint">#{user.id}</div>
                {statusBadges.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {statusBadges.map((badge) => (
                      <Badge key={badge.key} variant={badge.variant}>
                        {badge.label}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </td>
              <td className="px-3 py-2 text-xs text-muted align-top">{user.full_name ? String(user.full_name) : na}</td>
              <td className="px-3 py-2 text-xs text-muted align-top">{user.email ? String(user.email) : na}</td>
              <td className="px-3 py-2 align-top">
                <Badge variant={role.variant}>{role.label}</Badge>
              </td>
              <td className="px-3 py-2 text-xs text-muted align-top">{user.last_activity_at ? formatDateTime(String(user.last_activity_at)) : na}</td>
              <td className="px-3 py-2 text-xs text-muted align-top">{user.created_at ? formatDateTime(String(user.created_at)) : na}</td>
            </TableRowLink>
          );
        })}
      </tbody>
    </TableCard>
  );
}
