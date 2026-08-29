import { useCallback, useMemo, useRef, useState } from 'react';

import {
  extendKeysetCursorStack,
  MAX_KEYSET_CURSOR_WALK_PAGES,
} from '../keysetPageJump';
import type { KeysetDirection } from '../keysetPageJump';
import type { KeysetPaginationState } from './useKeysetPagination';

interface IdentifiedRow {
  id: number;
}

function pageEndCursor(rows: readonly IdentifiedRow[], direction: KeysetDirection): number | null {
  let cursor: number | null = null;
  for (const row of rows) {
    if (!Number.isFinite(row.id) || row.id <= 0) continue;
    if (cursor === null || (direction === 'asc' ? row.id > cursor : row.id < cursor)) cursor = row.id;
  }
  return cursor;
}

/** Add exact page counts and first-use direct jumps to a HaveAPI keyset list. */
export function useCountedKeysetPagination<T extends IdentifiedRow>(options: {
  pagination: KeysetPaginationState;
  totalCount: number | undefined;
  rows: readonly T[];
  loadPage: (fromId: number | undefined) => Promise<readonly T[]>;
  direction: KeysetDirection;
}) {
  const { pagination, rows, totalCount } = options;
  const pageCursor = useMemo(() => pageEndCursor(rows, options.direction), [options.direction, rows]);
  const totalPagesKnown = totalCount !== undefined;
  const pageCount = totalPagesKnown
    ? Math.max(1, Math.ceil(totalCount / pagination.limit))
    : pagination.pageCount;
  const canNext =
    pagination.hasForward ||
    (totalPagesKnown
      ? pagination.page < pageCount
      : rows.length >= pagination.limit && pageCursor !== null);
  const maxDirectPage = Math.min(
    pageCount,
    pagination.stack.length + MAX_KEYSET_CURSOR_WALK_PAGES
  );
  const jumpPromiseRef = useRef<Promise<void> | null>(null);
  const [isJumping, setIsJumping] = useState(false);

  const goToPage = useCallback(
    async (pageNumber: number) => {
      const target = Math.max(1, Math.min(pageCount, Math.floor(pageNumber)));
      if (target > maxDirectPage) return;
      if (target <= pagination.stack.length) {
        pagination.goToPage(target);
        return;
      }

      if (jumpPromiseRef.current) return jumpPromiseRef.current;

      const pending = (async () => {
        setIsJumping(true);
        try {
          const stack = await extendKeysetCursorStack({
            stack: pagination.stack,
            targetPage: target,
            limit: pagination.limit,
            loadPage: async (fromId) => ({ rows: await options.loadPage(fromId) }),
            getRowId: (row) => row.id,
            direction: options.direction,
          });
          if (stack.length >= target) pagination.goToPageWithStack(target, stack);
        } finally {
          setIsJumping(false);
          jumpPromiseRef.current = null;
        }
      })();
      jumpPromiseRef.current = pending;
      return pending;
    },
    [maxDirectPage, options.direction, options.loadPage, pageCount, pagination]
  );

  return {
    pageCursor,
    pageCount,
    totalPagesKnown,
    canNext,
    goToPage,
    maxDirectPage,
    isJumping,
  };
}
