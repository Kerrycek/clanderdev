import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

test('@pr-smoke @pr-smoke-mobile admin Finance overview uses a complete account snapshot', async ({ page }, testInfo) => {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'GET users': ({ searchParams }) => {
        const fromId = Number(searchParams.get('user[from_id]') ?? 0);
        const objectState = searchParams.get('user[object_state]') ?? 'active';
        const rows = [
          { id: 10, login: 'paid', level: 1, object_state: 'active', monthly_payment: 300, paid_until: isoDaysFromNow(20) },
          { id: 11, login: 'soon', level: 1, object_state: 'active', monthly_payment: 400, paid_until: isoDaysFromNow(2) },
          { id: 12, login: 'late', level: 1, object_state: 'suspended', monthly_payment: 500, paid_until: isoDaysFromNow(-2) },
          { id: 13, login: 'missing', level: 1, object_state: 'active', monthly_payment: 600, paid_until: null },
          { id: 14, login: 'broken', level: 1, object_state: 'active', monthly_payment: 700, paid_until: 'broken-date' },
          { id: 15, login: 'deleted', level: 1, object_state: 'deleted', monthly_payment: 800, paid_until: null },
          { id: 16, login: 'free', level: 1, object_state: 'active', monthly_payment: 0, paid_until: null },
        ].filter((user) => user.id > fromId && user.object_state === objectState);
        return { users: rows };
      },
      'GET system_configs': () => ({
        system_configs: [{ category: 'plugin_payments', name: 'default_currency', value: 'CZK' }],
      }),
    },
  });

  await page.goto('/admin/payments');

  await expect(page.getByTestId('nav.sidebar.finance')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('admin.finance.tabs').getByRole('link')).toHaveCount(3);
  await expect(page.getByTestId('admin.finance.overview.summary.monthly_payment')).toContainText(/2[\s,.]?500/);
  await expect(page.getByTestId('admin.finance.overview.summary.monthly_payment')).toContainText('CZK');
  await expect(page.getByTestId('admin.finance.overview.summary.paid')).toContainText('1');
  await expect(page.getByTestId('admin.finance.overview.summary.due_soon')).toContainText('1');
  await expect(page.getByTestId('admin.finance.overview.summary.overdue')).toContainText('2');
  await expect(page.getByTestId('admin.finance.overview.summary.invalid')).toContainText('1');
  await expect(page.getByTestId('admin.finance.overview.scope')).toContainText(/5/);

  if (testInfo.project.name === 'mobile-chrome') {
    await expect(page.getByTestId('admin.finance.overview.risk.mobile')).toBeVisible();
    await expect(page.getByTestId('admin.finance.overview.risk.row.12.mobile')).toBeVisible();
  } else {
    await expect(page.getByTestId('admin.finance.overview.risk.table')).toBeVisible();
    await expect(page.getByTestId('admin.finance.overview.risk.row.12')).toBeVisible();
  }

  await expect(page.getByTestId('admin.finance.overview.distribution.table')).toBeVisible();
  await expect(page.getByText('deleted', { exact: true })).toHaveCount(0);

  const screenshot = process.env.E2E_ADMIN_FINANCE_OVERVIEW_SCREENSHOT?.trim();
  if (screenshot) {
    const suffix = testInfo.project.name === 'mobile-chrome' ? '-mobile' : '-desktop';
    await page.screenshot({ path: screenshot.replace(/\.png$/i, `${suffix}.png`), fullPage: true });
  }
});

test('@pr-smoke non-admin sessions cannot mount global Finance totals', async ({ page }) => {
  const globalFinanceRequests: string[] = [];
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
  await installHaveApiMock(page, {
    user: { id: 2, login: 'member', level: 50 },
    handlers: {
      'GET users': ({ relPath }) => {
        globalFinanceRequests.push(relPath ?? 'users');
        return { status: false, message: 'admin-only endpoint', response: null };
      },
      'GET incoming_payments': ({ relPath }) => {
        globalFinanceRequests.push(relPath ?? 'incoming_payments');
        return { status: false, message: 'admin-only endpoint', response: null };
      },
      'GET payment_stat/estimate_income': ({ relPath }) => {
        globalFinanceRequests.push(relPath ?? 'payment_stat/estimate_income');
        return { status: false, message: 'admin-only endpoint', response: null };
      },
      'GET system_configs': ({ relPath }) => {
        globalFinanceRequests.push(relPath ?? 'system_configs');
        return { status: false, message: 'admin-only endpoint', response: null };
      },
      'GET users/2/get_payment_instructions': () => ({ hash: { instructions: '' } }),
      'GET user_payments': () => ({ user_payments: [] }),
    },
  });

  await page.goto('/admin/payments');

  await expect(page).toHaveURL((url) => url.pathname === '/app/payments' && url.hash === '');
  await expect(page.getByTestId('payments.my.stat.payment_id')).toContainText('2');
  await expect(page.getByTestId('admin.finance.tabs')).toHaveCount(0);
  await page.waitForLoadState('networkidle');
  expect(globalFinanceRequests).toEqual([]);
});
