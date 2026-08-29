import React from 'react';

import { KeysetPagination } from '../../../../components/ui/KeysetPagination';
import type { useKeysetPagination } from '../../../../lib/hooks/useKeysetPagination';

type Pagination = ReturnType<typeof useKeysetPagination>;

export function MailboxListPagination(props: {
  pagination: Pagination;
  pageCount: number;
  totalCount: number | undefined;
  maxDirectPage: number;
  isJumping: boolean;
  canNext: boolean;
  pageCursor: number | null;
  goToPage: (pageNumber: number) => void | Promise<void>;
  variant?: 'default' | 'inCard';
}) {
  const { pagination } = props;
  return (
    <KeysetPagination
      testId="admin.mailer.mailboxes.pagination"
      variant={props.variant}
      page={pagination.page}
      pageCount={props.pageCount}
      totalPagesKnown={props.totalCount !== undefined}
      maxDirectPage={props.maxDirectPage}
      jumpPending={props.isJumping}
      limit={pagination.limit}
      allowedLimits={pagination.allowedLimits}
      canPrev={pagination.canPrev}
      canNext={props.canNext}
      onPrev={pagination.goPrev}
      onNext={() => pagination.goNext(props.pageCursor)}
      onGoToPage={props.goToPage}
      onLimitChange={pagination.setLimit}
    />
  );
}
