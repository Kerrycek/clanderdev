import { describe, expect, test, vi } from 'vitest';

import {
  extendKeysetCursorStack,
  MAX_KEYSET_CURSOR_WALK_PAGES,
} from './keysetPageJump';

describe('extendKeysetCursorStack', () => {
  test('loads only the missing ascending keyset cursors for a direct jump', async () => {
    const loadPage = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: 3 }, { id: 4 }] });

    const stack = await extendKeysetCursorStack<{ id: number }>({
      stack: [null],
      targetPage: 3,
      limit: 2,
      loadPage,
      getRowId: (row) => row.id,
      direction: 'asc',
    });

    expect(stack).toEqual([null, 2, 4]);
    expect(loadPage).toHaveBeenNthCalledWith(1, undefined);
    expect(loadPage).toHaveBeenNthCalledWith(2, 2);
  });

  test('loads only the missing descending keyset cursors for a direct jump', async () => {
    const loadPage = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 100 }, { id: 90 }] })
      .mockResolvedValueOnce({ rows: [{ id: 89 }, { id: 80 }] });

    const stack = await extendKeysetCursorStack<{ id: number }>({
      stack: [null], targetPage: 3, limit: 2, loadPage,
      getRowId: (row) => row.id, direction: 'desc',
    });

    expect(stack).toEqual([null, 90, 80]);
    expect(loadPage).toHaveBeenNthCalledWith(1, undefined);
    expect(loadPage).toHaveBeenNthCalledWith(2, 90);
  });

  test('stops on the final short page and on a stalled cursor', async () => {
    const short = await extendKeysetCursorStack<{ id: number }>({
      stack: [null],
      targetPage: 5,
      limit: 2,
      loadPage: async () => ({ rows: [{ id: 10 }] }),
      getRowId: (row) => row.id,
      direction: 'asc',
    });
    expect(short).toEqual([null]);

    const loadPage = vi.fn().mockResolvedValue({ rows: [{ id: 90 }, { id: 90 }] });
    const stalled = await extendKeysetCursorStack<{ id: number }>({
      stack: [null, 90],
      targetPage: 4,
      limit: 2,
      loadPage,
      getRowId: (row) => row.id,
      direction: 'desc',
    });
    expect(stalled).toEqual([null, 90]);
    expect(loadPage).toHaveBeenCalledTimes(1);
  });

  test('does not refetch an already visited page', async () => {
    const loadPage = vi.fn();
    const stack = await extendKeysetCursorStack({
      stack: [null, 90, 80],
      targetPage: 2,
      limit: 2,
      loadPage,
      getRowId: (row: { id: number }) => row.id,
      direction: 'desc',
    });

    expect(stack).toEqual([null, 90, 80]);
    expect(loadPage).not.toHaveBeenCalled();
  });

  test('hard-caps an unvisited remote jump to a bounded number of requests', async () => {
    let nextId = 10_000;
    const loadPage = vi.fn(async () => ({
      rows: [{ id: nextId-- }, { id: nextId-- }],
    }));

    const stack = await extendKeysetCursorStack({
      stack: [null],
      targetPage: 20_000,
      limit: 2,
      loadPage,
      getRowId: (row: { id: number }) => row.id,
      direction: 'desc',
    });

    expect(loadPage).toHaveBeenCalledTimes(MAX_KEYSET_CURSOR_WALK_PAGES);
    expect(stack).toHaveLength(1 + MAX_KEYSET_CURSOR_WALK_PAGES);
  });
});
