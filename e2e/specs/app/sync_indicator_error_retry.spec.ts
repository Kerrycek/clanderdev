import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, failEnvelope, installHaveApiMock, jsonFulfill } from '../../fixtures';

test.describe('@smoke Sync indicator', () => {
  test('shows sync issues when background queries fail and allows manual retry', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    let actionStatesCalls = 0;

    await installHaveApiMock(page, {
      user: { id: 1, login: 'test', level: 1 },
      handlers: {
        'GET vpses': () => ({ vpses: [], _meta: { total_count: 0 } }),
        // Fail the first background refresh so the sync indicator appears.
        'GET action_states': () => {
          actionStatesCalls += 1;
          if (actionStatesCalls === 1) return failEnvelope('temporary failure');
          return { action_states: [] };
        },
      },
    });

    await page.goto('/app/vps');
    await expect(page.getByTestId('vps.list')).toBeVisible();

    const indicator = page.getByTestId('shell.sync-indicator');
    await expect(indicator).toBeVisible();

    await indicator.click();
    await expect(page.getByTestId('shell.sync-panel')).toBeVisible();
    await expect(page.getByTestId('shell.sync-panel.retry')).toBeVisible();
    await expect(page.getByTestId('shell.sync-panel.reload')).toBeVisible();

    await page.getByTestId('shell.sync-panel.retry').click();
    await expect(indicator).toBeHidden();
  });

  test('treats expired background sessions as logged out with a notice instead of sync errors', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'vpsadmin.uiSettings.v1',
        JSON.stringify({
          sidebarCollapsed: false,
          theme: 'system',
          language: 'cs',
        })
      );
    });
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    let actionStatesCalls = 0;
    let sessionExpired = false;

    await installHaveApiMock(page, {
      user: { id: 1, login: 'test', level: 1 },
      handlers: {
        'GET users/current': () => {
          if (sessionExpired) {
            return jsonFulfill({ status: false, message: 'Unauthorized', response: null }, 401);
          }
          return { user: { id: 1, login: 'test', level: 1 } };
        },
        'GET vpses': () => ({ vpses: [], _meta: { total_count: 0 } }),
        'GET action_states': () => {
          actionStatesCalls += 1;
          if (actionStatesCalls === 1) {
            sessionExpired = true;
            return jsonFulfill({ status: false, message: 'Unauthorized', response: null }, 401);
          }
          return { action_states: [] };
        },
      },
    });

    await page.goto('/app/vps');

    await expect(page).toHaveURL(/\/(?:\?session=expired)?$/);
    await expect(page.getByTestId('public.overview.page')).toBeVisible();
    await expect(page.getByTestId('auth.session-expired.notice')).toBeVisible();
    await expect(page.getByTestId('shell.sync-indicator')).toBeHidden();
  });
});
