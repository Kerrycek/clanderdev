import { describe, expect, it } from 'vitest';

import { shouldReplayFinishedLockCallback } from './useTaskCompletionToasts';

describe('shouldReplayFinishedLockCallback', () => {
  it('replays exactly once when a finished action id is bound by a late local lock', () => {
    const delivered = new Set<number>();
    expect(shouldReplayFinishedLockCallback(901, true, [], delivered)).toBe(false);
    expect(shouldReplayFinishedLockCallback(901, true, [901], delivered)).toBe(true);
    delivered.add(901);
    expect(shouldReplayFinishedLockCallback(901, true, [901], delivered)).toBe(false);
  });

  it('does not replay unfinished or unrelated action states', () => {
    expect(shouldReplayFinishedLockCallback(901, false, [901], new Set())).toBe(false);
    expect(shouldReplayFinishedLockCallback(901, true, [902], new Set())).toBe(false);
  });

  it('leaves the normal unfinished-to-finished transition to the transition callback', () => {
    expect(shouldReplayFinishedLockCallback(901, true, [901], new Set(), false)).toBe(false);
    expect(shouldReplayFinishedLockCallback(901, true, [901], new Set(), true)).toBe(true);
  });
});
