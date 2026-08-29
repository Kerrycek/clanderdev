import React from 'react';

import type { KeysetPaginationState } from '../../../../lib/hooks/useKeysetPagination';

import { Card } from '../../../../components/ui/Card';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { ErrorState } from '../../../../components/ui/ErrorState';
import { KeysetPagination } from '../../../../components/ui/KeysetPagination';
import { LoadingState } from '../../../../components/ui/LoadingState';

import { UsersListMobile } from './UsersListMobile';
import { UsersListTable } from './UsersListTable';
import type { UserListRecord, UsersPageTranslator } from './userListSemantics';

interface UsersListContentProps {
  users: UserListRecord[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  filtersActive: boolean;
  onClearFilters: () => void;
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

export function UsersListContent({
  users,
  isLoading,
  isError,
  error,
  onRetry,
  filtersActive,
  onClearFilters,
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
}: UsersListContentProps) {
  if (isLoading) {
    return <LoadingState testId="admin.users.loading" />;
  }

  if (isError) {
    return (
      <ErrorState
        testId="admin.users.error"
        title={t('admin.users.load_error')}
        error={error}
        onRetry={onRetry}
        showBack={false}
        detailsExtra={{ page: 'admin.users' }}
      />
    );
  }

  if (users.length === 0) {
    return (
      <div className="space-y-2">
        <EmptyState
          testId="admin.users.empty"
          title={filtersActive ? t('empty.list.no_matches.title') : t('admin.users.empty')}
          body={filtersActive ? t('empty.list.no_matches.body') : undefined}
          actionLabel={filtersActive ? t('common.clear_filters') : undefined}
          onAction={filtersActive ? onClearFilters : undefined}
        />
        {canPaginate ? (
          <Card>
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
              testId="admin.users.pagination.empty"
            />
          </Card>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <UsersListMobile users={users} basePath={basePath} t={t} />

      {canPaginate ? (
        <Card className="md:hidden">
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
            testId="admin.users.pagination.mobile"
          />
        </Card>
      ) : null}

      <UsersListTable
        users={users}
        basePath={basePath}
        t={t}
        na={na}
        pagination={pagination}
        pageCount={pageCount}
        totalPagesKnown={totalPagesKnown}
        onGoToPage={onGoToPage}
        maxDirectPage={maxDirectPage}
        jumpPending={jumpPending}
        canPaginate={canPaginate}
        canNext={canNext}
        pageCursor={pageCursor}
      />
    </>
  );
}
