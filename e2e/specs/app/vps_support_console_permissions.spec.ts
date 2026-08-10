import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

test('@pr-smoke support cannot create a console session for a foreign VPS', async ({ page }) => {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST_SUPPORT_SESSION' });

  const consoleMutations: string[] = [];
  page.on('request', (request) => {
    if (!request.url().includes('/api/v7.0/vpses/123/console_token')) return;
    if (request.method() === 'GET') return;
    consoleMutations.push(request.method());
  });

  await installHaveApiMock(page, {
    user: { id: 21, login: 'support-agent', level: 21 },
    handlers: {
      'GET vpses/123': () => ({
        vps: {
          id: 123,
          hostname: 'foreign-vps.example',
          object_state: 'active',
          is_running: true,
          user: { id: 77, login: 'foreign-owner' },
          node: {
            id: 1,
            domain_name: 'node1.example',
            location: {
              id: 2,
              label: 'Praha-2',
              remote_console_server: '/_console',
              environment: { id: 1, label: 'Production' },
            },
          },
        },
      }),
      'GET ip_addresses': () => ({ ip_addresses: [] }),
      'GET transaction_chains': () => ({ transaction_chains: [] }),
      'POST vpses/123/console_token': () => {
        throw new Error('Support must not create a console token.');
      },
      'DELETE vpses/123/console_token': () => {
        throw new Error('Support must not revoke a console token.');
      },
    },
  });

  await page.goto('/admin/vps/123/console');

  await expect(page.getByTestId('vps.console.page')).toBeVisible();
  await expect(page.getByTestId('vps.console.read_only')).toContainText(
    'You do not have permission to perform this action.'
  );
  await expect(page.getByTestId('vps.console.new_session')).toHaveCount(0);
  await expect(page.getByTestId('vps.console.revoke_session')).toHaveCount(0);
  await expect(page.getByTestId('vps.console.open_new_tab')).toHaveCount(0);
  await expect(page.getByTestId('vps.console.frame')).toHaveCount(0);
  await expect(page.getByTestId('vps.console.iframe')).toHaveCount(0);
  expect(consoleMutations).toEqual([]);
});
