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
    expect(requests).toHaveLength(2);

    const proofPath = process.env['E2E_BACKUP_CENTER_PROOF_SCREENSHOT']?.trim();
    if (proofPath) await page.screenshot({ path: proofPath, fullPage: true });
  });
});
