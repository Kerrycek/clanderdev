import type { KeysetCursorStack } from './hooks/useKeysetPagination';

/**
 * Maximum number of API pages a single direct-jump interaction may discover.
 *
 * HaveAPI list cursors are opaque keyset boundaries, not offsets. Walking all
 * the way to an arbitrary page would turn one click into an unbounded burst of
 * sequential requests. Later pages become reachable progressively as their
 * cursors are discovered.
 */
export const MAX_KEYSET_CURSOR_WALK_PAGES = 8;

export type KeysetDirection = 'asc' | 'desc';

export interface KeysetPage<T> {
  rows: readonly T[];
}

/**
 * Extend a visited HaveAPI cursor stack up to a requested page.
 *
 * HaveAPI indexes use keyset cursors, so a direct jump can only be resolved by
 * walking the missing cursors once. The resulting stack is persisted by
 * useKeysetPagination and subsequent jumps are immediate.
 */
export async function extendKeysetCursorStack<T>(options: {
  stack: KeysetCursorStack;
  targetPage: number;
  limit: number;
  loadPage: (fromId: number | undefined) => Promise<KeysetPage<T>>;
  getRowId: (row: T) => number | undefined;
  direction: KeysetDirection;
  maxAdditionalPages?: number;
}): Promise<KeysetCursorStack> {
  const targetPage = Math.max(1, Math.floor(options.targetPage));
  const stack: KeysetCursorStack = options.stack.length > 0 ? [...options.stack] : [null];
  stack[0] = null;
  const maxAdditionalPages = Math.max(
    0,
    Math.floor(options.maxAdditionalPages ?? MAX_KEYSET_CURSOR_WALK_PAGES)
  );
  const target = Math.min(targetPage, stack.length + maxAdditionalPages);

  if (stack.length >= target) return stack;

  let fromId = stack[stack.length - 1] ?? undefined;
  const seen = new Set(stack.filter((value): value is number => typeof value === 'number'));

  while (stack.length < target) {
    const page = await options.loadPage(fromId);
    if (page.rows.length < options.limit) break;

    const ids = page.rows
      .map(options.getRowId)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
    if (ids.length === 0) break;

    const nextCursor = options.direction === 'asc' ? Math.max(...ids) : Math.min(...ids);
    if (seen.has(nextCursor) || nextCursor === fromId) break;

    stack.push(nextCursor);
    seen.add(nextCursor);
    fromId = nextCursor;
  }

  return stack;
}
