import type { Page } from '@playwright/test';

/**
 * Mirrors the shape used by src/components/layout/ChromeContext.tsx.
 * We keep a copy here to avoid importing app code into E2E scaffolding.
 */
export interface TrackedActionStateSeed {
  id: number;
  addedAt: number;
  actionLabelKey?: string;
  actionLabel?: string;
  objectLabel?: string;
  blockUi?: boolean;
  progressTitleKey?: string;
}

export async function seedTrackedActionStates(page: Page, states: TrackedActionStateSeed[], userId = 1) {
  await page.addInitScript(
    ({ states, userId }) => {
      window.sessionStorage.setItem(
        `webui-next.tracked_action_states.user-${userId}`,
        JSON.stringify(states ?? [])
      );
    },
    { states, userId }
  );
}
