import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

test('user TSIG management is owner-scoped and reveals a new secret only once', async ({ page }) => {
  let indexUserFilter: string | null = null;
  let createPayload: any;

  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
  await installHaveApiMock(page, {
    user: { id: 10, login: 'alice', level: 1 },
    handlers: {
      'GET dns_tsig_keys': ({ searchParams }) => {
        indexUserFilter = searchParams.get('dns_tsig_key[user]');
        return {
          dns_tsig_keys: [{
            id: 7,
            name: 'existing-transfer-key',
            algorithm: 'hmac-sha256',
            secret: 'existing-list-secret-must-not-render',
            user: { id: 10, login: 'alice' },
          }],
        };
      },
      'POST dns_tsig_keys': async ({ request }) => {
        createPayload = await request.postDataJSON();
        return {
          dns_tsig_key: {
            id: 8,
            name: createPayload?.dns_tsig_key?.name,
            algorithm: createPayload?.dns_tsig_key?.algorithm,
            secret: 'one-time-created-secret',
            user: { id: 10, login: 'alice' },
          },
        };
      },
    },
  });

  await page.goto('/app/dns/tsig-keys');

  await expect(page.getByTestId('dns.tsig.page')).toBeVisible();
  await expect(page.getByTestId('dns.tsig.row.7')).toContainText('existing-transfer-key');
  await expect(page.getByText('existing-list-secret-must-not-render', { exact: true })).toHaveCount(0);
  expect(indexUserFilter).toBe('10');

  await page.getByTestId('dns.tsig.create.open').click();
  const createModal = page.getByTestId('dns.tsig.create.modal');
  await createModal.getByLabel('Name').fill('new-transfer-key');
  await createModal.getByLabel('Algorithm').selectOption('hmac-sha512');
  await page.getByTestId('dns.tsig.create.submit').click();

  await expect(page.getByTestId('dns.tsig.secret.modal')).toBeVisible();
  await expect(page.getByTestId('dns.tsig.secret.value.field')).toHaveValue('one-time-created-secret');
  expect(createPayload?.dns_tsig_key?.name).toBe('new-transfer-key');
  expect(createPayload?.dns_tsig_key?.algorithm).toBe('hmac-sha512');
  expect(createPayload?.dns_tsig_key?.user).toBeUndefined();

  await page.getByTestId('dns.tsig.secret.close').click();
  await expect(page.getByTestId('dns.tsig.secret.modal')).toHaveCount(0);
  await expect(page.getByText('one-time-created-secret', { exact: true })).toHaveCount(0);
});

test('user TSIG management fails closed if the API returns another owner', async ({ page }) => {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
  await installHaveApiMock(page, {
    user: { id: 10, login: 'alice', level: 1 },
    handlers: {
      'GET dns_tsig_keys': () => ({
        dns_tsig_keys: [{
          id: 99,
          name: 'foreign-key',
          algorithm: 'hmac-sha256',
          secret: 'foreign-secret',
          user: { id: 11, login: 'mallory' },
        }],
      }),
    },
  });

  await page.goto('/app/dns/tsig-keys');

  await expect(page.getByTestId('dns.tsig.error')).toBeVisible();
  await expect(page.getByTestId('dns.tsig.row.99')).toHaveCount(0);
  await expect(page.getByText('foreign-secret', { exact: true })).toHaveCount(0);
});
