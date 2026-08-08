import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

test.describe('Admin attention queue', () => {
  test('@smoke groups navigation and links directly to urgent work', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    await installHaveApiMock(page, {
      user: { id: 1, login: 'administrator', level: 90 },
      handlers: {
        'GET vpses': () => ({ vpses: [], _meta: { total_count: 0 } }),
        'GET datasets': () => ({ datasets: [], _meta: { total_count: 0 } }),
        'GET dns_zones': () => ({ dns_zones: [], _meta: { total_count: 0 } }),
        'GET nodes/public_status': () => ({ nodes: [] }),
        'GET outages': () => ({ outages: [] }),
        'GET news_logs': () => ({ news_logs: [] }),
        'GET security_advisories': () => ({ security_advisories: [], _meta: { total_count: 0 } }),
        'GET user_request/registrations': () => ({
          registrations: [{ id: 101, state: 'awaiting', login: 'new-member', created_at: '2026-08-01T09:00:00Z' }],
          _meta: { total_count: 1 },
        }),
        'GET user_request/changes': () => ({ changes: [], _meta: { total_count: 0 } }),
        'GET incoming_payments': (ctx) => {
          const state = ctx.searchParams.get('incoming_payment[state]');
          return state === 'unmatched'
            ? {
                incoming_payments: [{ id: 202, state: 'unmatched', account_name: 'Missing variable symbol', date: '2026-08-02' }],
                _meta: { total_count: 1 },
              }
            : { incoming_payments: [], _meta: { total_count: 0 } };
        },
        'GET transaction_chains': (ctx) => {
          const state = ctx.searchParams.get('transaction_chain[state]');
          return state === 'failed'
            ? {
                transaction_chains: [{ id: 303, state: 'failed', label: 'Create VPS', created_at: '2026-08-03T09:00:00Z' }],
                _meta: { total_count: 1 },
              }
            : { transaction_chains: [], _meta: { total_count: 0 } };
        },
      },
    });

    await page.goto('/admin');

    await expect(page.getByTestId('admin.attention.queue')).toBeVisible();
    await expect(page.getByTestId('admin.attention.item.unmatched-payment:202')).toContainText('Missing variable symbol');
    await expect(page.getByTestId('admin.attention.item.failed-transaction:303')).toContainText('Create VPS');
    await expect(page.getByTestId('admin.attention.item.registration-request:101')).toContainText('new-member');
    if ((page.viewportSize()?.width ?? 0) < 768) {
      await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
      await expect(page.getByTestId('nav.drawer.group.services')).toBeVisible();
      await expect(page.getByTestId('nav.drawer.group.operations')).toBeVisible();
      await expect(page.getByTestId('nav.drawer.group.users-finance')).toBeVisible();
      await expect(page.getByTestId('nav.drawer.account')).toBeVisible();
      await page.getByTestId('nav.drawer.close').click();
    } else {
      await expect(page.getByTestId('nav.sidebar.group.services')).toBeVisible();
      await expect(page.getByTestId('nav.sidebar.group.operations')).toBeVisible();
      await expect(page.getByTestId('nav.sidebar.group.users-finance')).toBeVisible();
      await expect(page.getByTestId('nav.sidebar.account')).toBeVisible();
    }

    const paymentLink = page.getByTestId('admin.attention.item.unmatched-payment:202').getByRole('link', {
      name: 'Missing variable symbol',
      exact: true,
    });
    await expect(paymentLink).toHaveAttribute('href', '/admin/payments/incoming/202');

    const proofPath = process.env['E2E_ADMIN_ATTENTION_PROOF_SCREENSHOT']?.trim();
    if (proofPath) await page.screenshot({ path: proofPath, fullPage: true });
  });
});
