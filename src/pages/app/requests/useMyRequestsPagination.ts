import { useLayoutEffect, useMemo, useState } from 'react';

import {
  EMPTY_MY_REQUESTS_CURSOR,
  type MyRequestsCursor,
} from './MyRequestsModel';

interface PaginationState {
  signature: string;
  stack: MyRequestsCursor[];
  index: number;
}

const REGISTRATION_CURSOR_KEY = 'registration_from_id';
const CHANGE_CURSOR_KEY = 'change_from_id';

function positiveInteger(value: string | null): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function cursorKey(cursor: MyRequestsCursor): string {
  return `${cursor.registration ?? ''}:${cursor.change ?? ''}`;
}

function isEmptyCursor(cursor: MyRequestsCursor): boolean {
  return cursor.registration === null && cursor.change === null;
}

function sameCursor(a: MyRequestsCursor, b: MyRequestsCursor): boolean {
  return a.registration === b.registration && a.change === b.change;
}

function normalizeCursor(value: unknown): MyRequestsCursor | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<MyRequestsCursor>;
  const registration = raw.registration === null ? null : Number(raw.registration);
  const change = raw.change === null ? null : Number(raw.change);
  if (registration !== null && (!Number.isSafeInteger(registration) || registration <= 0)) return null;
  if (change !== null && (!Number.isSafeInteger(change) || change <= 0)) return null;
  return { registration, change };
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    // eslint-disable-next-line no-bitwise
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(36);
}

function readStack(storageKey: string): MyRequestsCursor[] {
  if (typeof window === 'undefined') return [EMPTY_MY_REQUESTS_CURSOR];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(storageKey) ?? 'null') as unknown;
    if (!Array.isArray(parsed)) return [EMPTY_MY_REQUESTS_CURSOR];
    const stack = parsed.map(normalizeCursor).filter((cursor): cursor is MyRequestsCursor => Boolean(cursor));
    if (stack.length === 0 || !isEmptyCursor(stack[0] as MyRequestsCursor)) {
      stack.unshift(EMPTY_MY_REQUESTS_CURSOR);
    }
    return stack;
  } catch {
    return [EMPTY_MY_REQUESTS_CURSOR];
  }
}

function writeStack(storageKey: string, stack: MyRequestsCursor[]) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(stack));
  } catch {
    // Pagination remains usable for this mount when storage is unavailable.
  }
}

function initialState(signature: string, storageKey: string, urlCursor: MyRequestsCursor): PaginationState {
  const stored = readStack(storageKey);
  if (isEmptyCursor(urlCursor)) return { signature, stack: stored, index: 0 };

  const found = stored.findIndex((cursor) => sameCursor(cursor, urlCursor));
  if (found >= 0) return { signature, stack: stored, index: found };

  return { signature, stack: [EMPTY_MY_REQUESTS_CURSOR, urlCursor], index: 1 };
}

export function useMyRequestsPagination(options: {
  filterKey: string;
  searchParams: URLSearchParams;
  setSearchParams: (
    next: URLSearchParams | string,
    options?: { replace?: boolean },
  ) => void;
  defaultLimit?: number;
  allowedLimits?: readonly number[];
}) {
  const allowedLimits = options.allowedLimits ?? [25, 50, 100];
  const defaultLimit = options.defaultLimit ?? 25;
  const requestedLimit = positiveInteger(options.searchParams.get('limit')) ?? defaultLimit;
  const limit = allowedLimits.includes(requestedLimit) ? requestedLimit : defaultLimit;
  const urlCursor = useMemo<MyRequestsCursor>(() => ({
    registration: positiveInteger(options.searchParams.get(REGISTRATION_CURSOR_KEY)),
    change: positiveInteger(options.searchParams.get(CHANGE_CURSOR_KEY)),
  }), [options.searchParams]);
  const urlCursorKey = cursorKey(urlCursor);
  const signature = `my-requests|${options.filterKey}|limit=${limit}`;
  const storageKey = `vpsadmin.keyset.my-requests.${hashString(signature)}`;
  const [state, setState] = useState<PaginationState>(() => (
    initialState(signature, storageKey, urlCursor)
  ));
  const active = state.signature === signature;
  const stack = active ? state.stack : [EMPTY_MY_REQUESTS_CURSOR];
  const index = active ? state.index : 0;

  const syncUrl = (nextStack: MyRequestsCursor[], nextIndex: number, replace: boolean) => {
    const next = new URLSearchParams(options.searchParams);
    const cursor = nextStack[nextIndex] ?? EMPTY_MY_REQUESTS_CURSOR;
    next.set('limit', String(limit));
    next.set('page', String(nextIndex + 1));
    if (cursor.registration === null) next.delete(REGISTRATION_CURSOR_KEY);
    else next.set(REGISTRATION_CURSOR_KEY, String(cursor.registration));
    if (cursor.change === null) next.delete(CHANGE_CURSOR_KEY);
    else next.set(CHANGE_CURSOR_KEY, String(cursor.change));
    if (next.toString() !== options.searchParams.toString()) {
      options.setSearchParams(next, { replace });
    }
  };

  useLayoutEffect(() => {
    if (state.signature === signature) return;
    const reset: PaginationState = {
      signature,
      stack: [EMPTY_MY_REQUESTS_CURSOR],
      index: 0,
    };
    setState(reset);
    writeStack(storageKey, reset.stack);
    syncUrl(reset.stack, 0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, storageKey]);

  useLayoutEffect(() => {
    if (state.signature !== signature) return;
    const found = state.stack.findIndex((cursor) => sameCursor(cursor, urlCursor));
    if (found >= 0) {
      if (found !== state.index) setState((previous) => ({ ...previous, index: found }));
      return;
    }

    if (isEmptyCursor(urlCursor)) {
      if (state.index !== 0) setState((previous) => ({ ...previous, index: 0 }));
      return;
    }

    const nextStack = [EMPTY_MY_REQUESTS_CURSOR, urlCursor];
    setState({ signature, stack: nextStack, index: 1 });
    writeStack(storageKey, nextStack);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, urlCursorKey]);

  useLayoutEffect(() => {
    if (state.signature === signature) writeStack(storageKey, state.stack);
  }, [signature, state.signature, state.stack, storageKey]);

  const goToPage = (pageNumber: number) => {
    const nextIndex = Math.floor(pageNumber) - 1;
    if (nextIndex < 0 || nextIndex >= stack.length) return;
    setState({ signature, stack, index: nextIndex });
    syncUrl(stack, nextIndex, false);
  };

  const goPrev = () => goToPage(index);

  const goNext = (nextCursor: MyRequestsCursor | null) => {
    if (index < stack.length - 1) {
      goToPage(index + 2);
      return;
    }
    if (!nextCursor || sameCursor(nextCursor, stack[index] ?? EMPTY_MY_REQUESTS_CURSOR)) return;
    const nextStack = [...stack, nextCursor];
    const nextIndex = index + 1;
    setState({ signature, stack: nextStack, index: nextIndex });
    writeStack(storageKey, nextStack);
    syncUrl(nextStack, nextIndex, false);
  };

  const setLimit = (nextLimit: number) => {
    const normalized = allowedLimits.includes(nextLimit) ? nextLimit : defaultLimit;
    const next = new URLSearchParams(options.searchParams);
    next.set('limit', String(normalized));
    next.delete('page');
    next.delete(REGISTRATION_CURSOR_KEY);
    next.delete(CHANGE_CURSOR_KEY);
    options.setSearchParams(next, { replace: true });
  };

  return {
    limit,
    allowedLimits,
    cursor: stack[index] ?? EMPTY_MY_REQUESTS_CURSOR,
    page: index + 1,
    pageCount: stack.length,
    canPrev: index > 0,
    hasForward: index < stack.length - 1,
    goPrev,
    goNext,
    goToPage,
    setLimit,
  };
}
