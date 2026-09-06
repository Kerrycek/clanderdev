import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, failEnvelope, installHaveApiMock } from '../../fixtures';

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

  test('@pr-smoke @pr-smoke-mobile guides an owner through a guarded restore workflow', async ({ page }, testInfo) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    let rollbackCalls = 0;

    await installHaveApiMock(page, {
      user: { id: 1, login: 'backup-user', level: 1 },
      handlers: {
        'GET datasets': () => ({
          datasets: [
            {
              id: 10,
              name: 'root',
              full_name: 'mail.example/root',
              object_state: 'active',
              snapshots_count: 1,
              vps: { id: 20, hostname: 'mail.example' },
              environment: { id: 7, label: 'Production' },
              user: { id: 1, login: 'backup-user' },
            },
          ],
          _meta: { total_count: 1 },
        }),
        'GET snapshot_downloads': () => ({
          snapshot_downloads: [],
          _meta: { total_count: 0 },
        }),
        'GET transaction_chains': () => ({
          transaction_chains: [],
          _meta: { total_count: 0 },
        }),
        'GET datasets/10/snapshots': () => ({
          snapshots: [
            {
              id: 31,
              name: 'before-upgrade',
              label: 'Before upgrade',
              created_at: '2026-08-10T09:00:00Z',
            },
          ],
          _meta: { total_count: 1 },
        }),
        'POST datasets/10/snapshots/31/rollback': () => {
          rollbackCalls += 1;
          return { ok: true };
        },
      },
    });

    await page.goto('/app/backups');
    await page.getByTestId('backups.quick.restore').click();

    await expect(page).toHaveURL(/(?=.*[?&]tab=snapshots)(?=.*[?&]intent=restore)/);
    await expect(page.getByTestId('backups.restore.guide')).toBeVisible();
    await expect(page.getByTestId('backups.restore.warning')).toBeVisible();
    await expect(page.getByTestId('backups.snapshots.row.10.count')).toContainText('Recovery points: 1');

    await page.getByTestId('backups.snapshots.row.10').click();
    const layout = testInfo.project.name === 'mobile-chrome' ? 'card' : 'row';
    const rollback = page.getByTestId(`dataset.snapshots.${layout}.31.rollback`);
    await expect(rollback).toBeVisible();
    await expect(rollback).toBeEnabled();
    await rollback.click();

    const confirm = page.getByTestId('dataset.snapshots.rollback_confirm.confirm');
    const input = page.getByTestId('dataset.snapshots.rollback_confirm.input');
    await expect(confirm).toBeDisabled();
    await input.fill('before upgrade');
    await expect(confirm).toBeDisabled();
    await input.fill('Before upgrade');
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page.getByTestId('dataset.snapshots.rollback_confirm')).toBeHidden();
    expect(rollbackCalls).toBe(1);
  });

  test('keeps an administrator My view on explicit owned dataset requests', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    const requestedDatasetIds: Array<string | null> = [];

    await installHaveApiMock(page, {
      user: { id: 42, login: 'admin', level: 100 },
      handlers: {
        'GET datasets': ({ searchParams }) => {
          expect(searchParams.get('dataset[user]')).toBe('42');
          return {
            datasets: [
              {
                id: 10,
                name: 'root',
                full_name: 'mail.example/root',
                vps: { id: 20, hostname: 'mail.example' },
              },
              { id: 11, name: 'archive', full_name: 'nas/archive' },
            ],
            _meta: { total_count: 2 },
          };
        },
        'GET snapshot_downloads': ({ searchParams }) => {
          const datasetId = searchParams.get('snapshot_download[dataset]');
          requestedDatasetIds.push(datasetId);
          if (datasetId === '10') {
            return {
              snapshot_downloads: [
                {
                  id: 51,
                  state: 'ready',
                  format: 'archive',
                  url: '/download/51',
                  snapshot: { id: 31, name: 'owned', dataset: { id: 10 } },
                },
                {
                  id: 999,
                  state: 'ready',
                  url: '/download/999',
                  snapshot: { id: 999, name: 'foreign', dataset: { id: 999 } },
                },
              ],
              _meta: { total_count: 1 },
            };
          }
          return { snapshot_downloads: [], _meta: { total_count: 0 } };
        },
      },
    });

    await page.goto('/app/backups');

    await expect(page.getByTestId('backups.downloads.row.51')).toContainText('mail.example/root');
    await expect(page.getByTestId('backups.downloads.row.999')).toHaveCount(0);
    await expect(page.getByTestId('backups.downloads.row.51.detail')).toHaveAttribute(
      'href',
      '/app/datasets/10/downloads',
    );
    expect(requestedDatasetIds.sort()).toEqual(['10', '11']);
    expect(requestedDatasetIds).not.toContain(null);
  });

  test('keeps backend-authorized user downloads available without dataset metadata', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    await installHaveApiMock(page, {
      user: { id: 1, login: 'backup-user', level: 1 },
      handlers: {
        'GET datasets': () => failEnvelope('Dataset metadata temporarily unavailable'),
        'GET snapshot_downloads': ({ searchParams }) => {
          expect(searchParams.get('snapshot_download[dataset]')).toBeNull();
          return {
            snapshot_downloads: [
              {
                id: 61,
                state: 'ready',
                format: 'archive',
                url: '/download/61',
                snapshot: { id: 32, name: 'authorized download', dataset: { id: 10 } },
              },
            ],
            _meta: { total_count: 1 },
          };
        },
      },
    });

    await page.goto('/app/backups?tab=downloads');

    await expect(page.getByTestId('backups.downloads.row.61')).toBeVisible();
    await expect(page.getByTestId('backups.error')).toHaveCount(0);
    await expect(page.getByTestId('backups.datasets.metadata_partial')).toBeVisible();
  });
});
