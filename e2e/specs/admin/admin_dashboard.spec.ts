import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

test.describe('Admin dashboard', () => {
  test('@smoke keeps the overview concise and groups navigation', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    await installHaveApiMock(page, {
      user: { id: 1, login: 'administrator', level: 90 },
      handlers: {
        'GET cluster_full_stats': () => ({
          cluster_full_stats: [{ vps_count: 0, dataset_count: 0, dns_zone_count: 0 }],
        }),
        'GET datasets': () => ({ datasets: [], _meta: { total_count: 0 } }),
        'GET dns_zones': () => ({ dns_zones: [], _meta: { total_count: 0 } }),
        'GET nodes/public_status': () => ({ nodes: [] }),
        'GET outages': () => ({ outages: [] }),
        'GET news_logs': () => ({ news_logs: [] }),
        'GET security_advisories': () => ({ security_advisories: [], _meta: { total_count: 0 } }),
      },
    });

    await page.goto('/admin');

    await expect(page.getByTestId('app.dashboard.page')).toBeVisible();
    await expect(page.getByTestId('admin.attention.queue')).toHaveCount(0);

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
  });
});
