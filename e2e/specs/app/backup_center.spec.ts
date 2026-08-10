import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

test.describe('Backup center', () => {
  test('@smoke shows the bounded overview and opens dataset backup tools', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    const requests: string[] = [];

    await installHaveApiMock(page, {
      user: { id: 1, login: 'backup-user', level: 1 },
      handlers: {
        'GET datasets': (ctx) => {
          requests.push(ctx.relPath ?? 'datasets');
          return {
            datasets: [
              {
                id: 10,
                name: 'root',
                full_name: 'mail.example/root',
                vps: { id: 20, hostname: 'mail.example' },
                environment: { id: 7, label: 'Production' },
                user: { id: 1, login: 'backup-user' },
              },
              { id: 11, name: 'archive', full_name: 'nas/archive' },
            ],
            _meta: { total_count: 2 },
          };
        },
        'GET snapshot_downloads': (ctx) => {
          requests.push(ctx.relPath ?? 'snapshot_downloads');
          return {
            snapshot_downloads: [
              {
                id: 41,
                state: 'ready',
                format: 'archive',
                url: '/download/41',
                snapshot: {
                  id: 31,
                  name: 'before-upgrade',
                  dataset: { id: 10, name: 'root', vps: { id: 20, hostname: 'mail.example' } },
                },
              },
            ],
            _meta: { total_count: 1 },
          };
        },
        'GET transaction_chains': (ctx) => {
          const className = ctx.searchParams?.get('transaction_chain[class_name]');
          const rowId = ctx.searchParams?.get('transaction_chain[row_id]');
          if (className === 'Dataset' && rowId === '10') {
            requests.push('transaction_chains?class_name=Dataset&row_id=10');
          }
          return { transaction_chains: [], _meta: { total_count: 0 } };
        },
        'GET datasets/10/snapshots': (ctx) => {
          requests.push(ctx.relPath ?? 'datasets/10/snapshots');
          return {
            snapshots: [
              {
                id: 31,
                name: 'before-upgrade',
                label: 'Before upgrade',
                created_at: '2026-08-10T09:00:00Z',
              },
            ],
            _meta: { total_count: 1 },
          };
        },
        'GET datasets/10/plans': (ctx) => {
          requests.push(ctx.relPath ?? 'datasets/10/plans');
          return {
            plans: [
              {
                id: 2,
                environment_dataset_plan: {
                  id: 12,
                  label: 'Daily backup',
                  dataset_plan: { id: 3, label: 'daily_backup' },
                  user_add: true,
                  user_remove: true,
                },
              },
            ],
          };
        },
        'GET environments/7/dataset_plans': (ctx) => {
          requests.push(ctx.relPath ?? 'environments/7/dataset_plans');
          return {
            dataset_plans: [
              {
                id: 12,
                label: 'Daily backup',
                dataset_plan: { id: 3, label: 'daily_backup' },
                user_add: true,
                user_remove: true,
              },
              {
                id: 13,
                label: 'Weekly backup',
                dataset_plan: { id: 4, label: 'weekly_backup' },
                user_add: true,
                user_remove: false,
              },
            ],
          };
        },
        'POST datasets/10/plans': () => ({
          plan: {
            id: 3,
            environment_dataset_plan: {
              id: 13,
              label: 'Weekly backup',
              user_add: true,
              user_remove: false,
            },
          },
        }),
      },
    });

    await page.goto('/app/backups');

    await expect(page.getByTestId('backups.page')).toBeVisible();
    await expect(page.getByTestId('nav.sidebar.backups')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('backups.stats.datasets')).toContainText('2');
    await expect(page.getByTestId('backups.stats.downloads')).toContainText('1');
    await expect(page.getByTestId('backups.downloads.row.41')).toContainText('root');
    expect(requests).toHaveLength(2);

    await page.getByTestId('backups.tab.snapshots').click();
    await expect(page.getByTestId('backups.snapshots')).toBeVisible();
    await expect(page.getByTestId('backups.snapshots.row.10')).toContainText('mail.example/root');
    await expect(page.getByTestId('backups.snapshots.row.11')).toContainText('nas/archive');
    await expect(page.getByTestId('backups.workspace.empty')).toBeVisible();
    expect(requests).toHaveLength(2);

    await page.getByTestId('backups.snapshots.row.10').click();
    await expect(page.getByTestId('backups.snapshots.row.10')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('dataset.snapshots.row.31')).toContainText('Before upgrade');
    await expect(page.getByTestId('dataset.snapshots.row.31.rollback')).toBeEnabled();
    await expect(page.getByTestId('dataset.snapshots.row.31.delete')).toBeEnabled();
    await expect(page).toHaveURL(/tab=snapshots.*dataset=10|dataset=10.*tab=snapshots/);
    expect(requests.filter((request) => request === 'datasets/10/snapshots')).toHaveLength(1);
    expect(
      requests.filter((request) => request === 'transaction_chains?class_name=Dataset&row_id=10')
    ).not.toHaveLength(0);

    const proofPath = process.env['E2E_BACKUP_CENTER_PROOF_SCREENSHOT']?.trim();
    if (proofPath) await page.screenshot({ path: proofPath, fullPage: true });

    await page.getByTestId('backups.tab.plans').click();
    await expect(page.getByTestId('dataset.plans.summary')).toBeVisible();
    await expect(page.getByTestId('dataset.plans.row.2')).toContainText('Daily backup');
    await expect(page).toHaveURL(/tab=plans.*dataset=10|dataset=10.*tab=plans/);
    expect(requests.filter((request) => request === 'datasets/10/plans')).toHaveLength(1);
    expect(requests.filter((request) => request === 'environments/7/dataset_plans')).toHaveLength(1);

    await page.getByTestId('dataset.plans.assign.open').click();
    await page.getByTestId('dataset.plans.assign.select').selectOption('13');
    const assignRequest = page.waitForRequest(
      (request) => request.method() === 'POST' && request.url().includes('/datasets/10/plans')
    );
    await page.getByTestId('dataset.plans.assign.submit').click();
    expect((await assignRequest).postDataJSON()).toEqual({
      plan: { environment_dataset_plan: 13 },
    });
    await expect(page.getByTestId('dataset.plans.assign.modal')).toBeHidden();
  });
});
