import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock, setUiSettingsLocalStorage } from '../../fixtures';

function namespacedPayload(body: unknown, namespace: string): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  const payload = (body as Record<string, unknown>)[namespace];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  return payload as Record<string, unknown>;
}

test('@smoke profile: overview exposes account actions and profile updates', async ({ page }) => {
  const user = {
    id: 1,
    login: 'e2e',
    level: 1,
    full_name: 'E2E User',
    email: 'e2e@example.test',
    address: 'Test street 1, Prague',
    time_zone: 'Europe/Prague',
    mailer_enabled: true,
  };

  let timeZonePayload: Record<string, unknown> | null = null;
  let changePayload: Record<string, unknown> | null = null;

  await setUiSettingsLocalStorage(page, { language: 'en' });
  await bootstrapVpsAdminWindow(page, {
    sessionToken: 'TEST_SESSION',
    webuiNext: { serverTimeZone: 'Europe/Prague' },
  });

  await installHaveApiMock(page, {
    user,
    handlers: {
      'GET users/current': () => ({ user }),
      'GET users/1': () => ({ user }),
      'PUT users/1': ({ reqJson }) => {
        timeZonePayload = namespacedPayload(reqJson, 'user');
        Object.assign(user, timeZonePayload);
        return { user };
      },
      'POST user_request/changes': ({ reqJson }) => {
        changePayload = namespacedPayload(reqJson, 'change');
        return {
          change: {
            id: 55,
            state: 'awaiting',
            user: { id: user.id, login: user.login },
            ...changePayload,
          },
        };
      },
    },
  });

  await page.goto('/app/profile');

  await expect(page.getByTestId('profile.user.card')).toBeVisible();
  await expect(page.getByTestId('profile.personal.card')).toBeVisible();
  await expect(page.getByTestId('profile.time_zone.card')).toBeVisible();
  await expect(page.getByTestId('profile.prefs.card')).toBeVisible();

  await page.getByTestId('profile.personal.time_zone').selectOption('America/New_York');
  await page.getByTestId('profile.personal.time_zone.save').click();
  await expect.poll(() => timeZonePayload?.time_zone).toBe('America/New_York');
  await expect(page.getByTestId('profile.personal.time_zone.save')).toBeDisabled();
  await expect(page.getByTestId('profile.user.card')).toContainText('America/New_York');

  await page.getByTestId('profile.personal.address').fill('New street 2, Brno');
  await page.getByTestId('profile.personal.change_reason').fill('Moving to a new address');
  await expect(page.getByTestId('profile.personal.change.submit')).toBeEnabled();
  await page.getByTestId('profile.personal.change.submit').click();

  await expect.poll(() => changePayload?.address).toBe('New street 2, Brno');
  expect(changePayload?.change_reason).toBe('Moving to a new address');
  expect(changePayload?.time_zone).toBeUndefined();
  await expect(page.getByTestId('profile.personal.change.sent')).toBeVisible();
  await expect(page.getByTestId('profile.personal.change.sent.open')).toHaveAttribute(
    'href',
    '/app/requests/change/55'
  );
});
