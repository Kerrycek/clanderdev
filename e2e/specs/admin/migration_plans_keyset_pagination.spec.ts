import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

test('admin migration plans: keyset pagination (from_id)', async ({ page }) => {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'GET migration_plans': (ctx) => {
        const fromId = ctx.searchParams.get('migration_plan[from_id]');
        const limitStr = ctx.searchParams.get('migration_plan[limit]');
        const limit = limitStr ? Number(limitStr) : 50;

        const startId = fromId ? Number(fromId) - 1 : 300;
        const count = Number.isFinite(limit) && limit > 0 ? limit : 50;

        const migration_plans = Array.from({ length: count }, (_, i) => {
          const id = startId - i;
          return {
            id,
            state: id % 3 === 0 ? 'done' : id % 3 === 1 ? 'running' : 'staged',
            concurrency: 10,
            stop_on_error: true,
            send_mail: true,
            user: { id: 42, login: 'root' },
            node: { id: 7, domain_name: 'node7' },
            created_at: '2025-01-01T00:00:00Z',
            finished_at: null,
          };
        });

        return { migration_plans };
      },
    },
  });

  await page.goto('/admin/migration-plans');

  await expect(page.getByTestId('admin.migration_plans.row.300')).toBeVisible();
  await expect(page.getByTestId('admin.migration_plans.row.300')).toHaveAttribute('data-row-variant', 'ok');
  await expect(page.getByTestId('admin.migration_plans.row.300.dot')).toBeVisible();
  await expect(page.getByTestId('admin.migration_plans.row.299')).toHaveAttribute('data-row-variant', 'neutral');
  await expect(page.getByTestId('admin.migration_plans.row.298')).toHaveAttribute('data-row-variant', 'info');

  await expect(page.getByTestId('admin.migration_plans.row.300')).toContainText('root');
  await expect(page.getByTestId('admin.migration_plans.row.300')).toContainText('node7');

  await page.getByTestId('admin.migration_plans.pagination.desktop.next').click();
  await expect(page.getByTestId('admin.migration_plans.row.250')).toBeVisible();
  await expect(page).toHaveURL((url) =>
    url.pathname === '/admin/migration-plans'
    && url.searchParams.get('page') === '2'
    && url.searchParams.get('from_id') === '251'
  );

  const prev = page.getByTestId('admin.migration_plans.pagination.desktop.prev');
  await expect(prev).toBeEnabled();
  await prev.click();
  await expect(page).toHaveURL((url) =>
    url.pathname === '/admin/migration-plans'
    && url.searchParams.get('page') === '1'
    && !url.searchParams.has('from_id'),
    { timeout: 30_000 },
  );
  await expect(page.getByTestId('admin.migration_plans.row.300')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('admin.migration_plans.row.300')).toHaveAttribute('data-row-variant', 'ok');
  await expect(page.getByTestId('admin.migration_plans.row.300.dot')).toBeVisible();
  await expect(page.getByTestId('admin.migration_plans.row.299')).toHaveAttribute('data-row-variant', 'neutral');
  await expect(page.getByTestId('admin.migration_plans.row.298')).toHaveAttribute('data-row-variant', 'info');

  await expect(page.getByTestId('admin.migration_plans.row.300')).toContainText('root');
  await expect(page.getByTestId('admin.migration_plans.row.300')).toContainText('node7');
});
