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
  await expect(page.getByTestId('admin.finance.tabs').getByRole('link')).toHaveCount(4);
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

test('@pr-smoke @pr-smoke-mobile admin payment history filters the complete keyset source by user and period', async ({ page }, testInfo) => {
  const sourceRows = [
    ...Array.from({ length: 30 }, (_, index) => ({
      id: 200 - index,
      user: { id: 42, login: 'alice' },
      amount: 300 + index,
      accounted_by: { id: 1, login: 'admin' },
      incoming_payment: index % 2 === 0 ? { id: 900 - index } : undefined,
      from_date: '2026-08-01T00:00:00Z',
      to_date: '2026-08-31T23:59:59Z',
      created_at: `2026-08-${String(31 - (index % 30)).padStart(2, '0')}T12:00:00Z`,
    })),
    ...Array.from({ length: 10 }, (_, index) => ({
      id: 170 - index,
      user: { id: 43, login: 'bob' },
      amount: 500,
      accounted_by: { id: 1, login: 'admin' },
      from_date: '2026-08-01T00:00:00Z',
      to_date: '2026-08-31T23:59:59Z',
      created_at: `2026-08-${String(index + 1).padStart(2, '0')}T08:00:00Z`,
    })),
    ...Array.from({ length: 20 }, (_, index) => ({
      id: 160 - index,
      user: { id: 42, login: 'alice' },
      amount: 250,
      accounted_by: { id: 1, login: 'admin' },
      from_date: '2026-07-01T00:00:00Z',
      to_date: '2026-07-31T23:59:59Z',
      created_at: `2026-07-${String(20 - (index % 20)).padStart(2, '0')}T12:00:00Z`,
    })),
  ].sort((a, b) => b.id - a.id);
  const historyRequests: URLSearchParams[] = [];

  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'OPTIONS user_payments': () => ({
        input: { parameters: { created_from: {}, created_to: {} } },
      }),
      'GET user_payments': ({ searchParams }) => {
        historyRequests.push(new URLSearchParams(searchParams));
        const fromId = Number(searchParams.get('user_payment[from_id]') ?? Number.POSITIVE_INFINITY);
        const userId = Number(searchParams.get('user_payment[user]') ?? 0);
        const limit = Number(searchParams.get('user_payment[limit]') ?? 50);
        const createdFrom = Date.parse(searchParams.get('user_payment[created_from]') ?? '');
        const createdTo = Date.parse(searchParams.get('user_payment[created_to]') ?? '');
        const rows = sourceRows
          .filter((payment) => payment.id < fromId)
          .filter((payment) => !userId || payment.user.id === userId)
          .filter((payment) => !Number.isFinite(createdFrom) || Date.parse(payment.created_at) >= createdFrom)
          .filter((payment) => !Number.isFinite(createdTo) || Date.parse(payment.created_at) <= createdTo)
          .slice(0, limit);
        return { user_payments: rows };
      },
      'GET system_configs': () => ({
        system_configs: [{ category: 'plugin_payments', name: 'default_currency', value: 'CZK' }],
      }),
    },
  });

  await page.goto('/admin/payments/history?from=2026-08-01&to=2026-08-31&limit=25');

  await expect(page.getByTestId('admin.finance.history.period_active')).toBeVisible();
  await expect(page.getByTestId('admin.finance.history.period_active')).toContainText(/2026-08-01/);
  await expect(page.getByTestId('admin.finance.history.period_active')).toContainText(/2026-08-31/);

  const visibleRows = testInfo.project.name === 'mobile-chrome'
    ? page.locator('[data-testid^="admin.finance.history.row."][data-testid$=".mobile"]')
    : page.getByTestId('admin.finance.history.table').locator('tbody tr');
  await expect(visibleRows).toHaveCount(25);

  await page.getByTestId('admin.finance.history.filter.user').fill('42');
  await page.getByTestId('admin.finance.history.filter.apply').click();
  await expect(page).toHaveURL(/(?:\?|&)user=42(?:&|$)/);
  await expect(page.locator('[data-testid^="admin.finance.history.row."]:visible').first()).toContainText('alice');
  await expect(page.getByText('bob', { exact: true })).toHaveCount(0);

  const pagination = testInfo.project.name === 'mobile-chrome'
    ? page.getByTestId('admin.finance.history.pagination.mobile')
    : page.getByTestId('admin.finance.history.pagination.desktop');
  await expect(pagination.getByTestId(/\.next$/)).toBeEnabled();
  await pagination.getByTestId(/\.next$/).click();
  await expect(page).toHaveURL(/(?:\?|&)page=2(?:&|$)/);
  await expect(page.locator('[data-testid^="admin.finance.history.row."]:visible')).toHaveCount(5);

  expect(historyRequests.length).toBeGreaterThan(1);
  for (const request of historyRequests) {
    expect(request.get('user_payment[created_from]')).toBe('2026-08-01T00:00:00.000Z');
    expect(request.get('user_payment[created_to]')).toBe('2026-08-31T23:59:59.999Z');
  }

  const screenshot = process.env.E2E_ADMIN_FINANCE_HISTORY_SCREENSHOT?.trim();
  if (screenshot) {
    const suffix = testInfo.project.name === 'mobile-chrome' ? '-mobile' : '-desktop';
    await page.screenshot({ path: screenshot.replace(/\.png$/i, `${suffix}.png`), fullPage: true });
  }
});

test('@pr-smoke global Finance fails closed when the API ignores period filters', async ({ page }) => {
  let historyRequests = 0;
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'OPTIONS user_payments': () => ({ input: { parameters: { limit: {}, from_id: {} } } }),
      'GET user_payments': () => {
        historyRequests += 1;
        return { user_payments: [] };
      },
      'GET system_configs': () => ({ system_configs: [] }),
    },
  });

  await page.goto('/admin/payments/history?from=2026-08-01&to=2026-08-31');

  await expect(page.getByTestId('admin.finance.history.error')).toBeVisible();
  await expect(page.getByTestId('admin.finance.history.error')).toContainText(/cannot safely filter/i);
  await expect(page.getByTestId('admin.finance.history.empty')).toHaveCount(0);
  expect(historyRequests).toBe(0);
});

test('@pr-smoke restricted support sessions cannot mount global Finance totals or history', async ({ page }) => {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
  await installHaveApiMock(page, {
    user: { id: 2, login: 'support', level: 50 },
    handlers: {
      'GET incoming_payments': () => ({ incoming_payments: [] }),
      'GET system_configs': () => ({ system_configs: [] }),
    },
  });

  await page.goto('/admin/payments');

  await expect(page).toHaveURL(/\/admin\/payments\/incoming$/);
  await expect(page.getByTestId('admin.finance.tabs').getByRole('link')).toHaveCount(2);
  await expect(page.getByTestId('admin.finance.tabs.overview')).toHaveCount(0);
  await expect(page.getByTestId('admin.finance.tabs.history')).toHaveCount(0);
});
