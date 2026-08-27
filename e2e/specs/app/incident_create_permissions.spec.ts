import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

test('regular user cannot discover or open incident creation', async ({ page }) => {
  let createCalls = 0;
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
  await installHaveApiMock(page, {
    user: { id: 41, login: 'member', level: 1 },
    handlers: {
      'GET incident_reports': () => ({ incident_reports: [] }),
      'POST incident_reports': () => {
        createCalls += 1;
        return {
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ status: false, message: 'Forbidden', response: null }),
        };
      },
    },
  });

  await page.goto('/app/incidents');
  await expect(page.getByTestId('incidents.list.new')).toHaveCount(0);

  await page.goto('/app/incidents/new');
  await expect(page.getByTestId('incidents.new.forbidden')).toBeVisible();
  await expect(page.getByTestId('incidents.new.forbidden')).toContainText(/access denied|přístup odepřen/i);
  await expect.poll(() => createCalls).toBe(0);
});
