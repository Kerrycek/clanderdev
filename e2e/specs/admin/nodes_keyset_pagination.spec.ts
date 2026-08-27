import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

test('admin nodes: keyset pagination (from_id)', async ({ page }) => {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'GET nodes/public_status': () => [
        { domain_name: 'node125.example.test', fqdn: 'node125.example.test', status: false, maintenance_lock: null },
        { domain_name: 'node124.example.test', fqdn: 'node124.example.test', status: true, maintenance_lock: 'lock', maintenance_lock_reason: 'maint' },
      ],
      'GET nodes': (ctx) => {
        const fromId = ctx.searchParams.get('node[from_id]');
        const limitStr = ctx.searchParams.get('node[limit]');
        const limit = limitStr ? Number(limitStr) : 50;

        const startId = fromId ? Number(fromId) - 1 : 125;
        const count = Number.isFinite(limit) && limit > 0 ? limit : 50;

        const nodes = Array.from({ length: count }, (_, i) => {
          const id = startId - i;
          return {
            id,
            domain_name: `node${id}.example.test`,
            fqdn: `node${id}.example.test`,
            location: { label: 'dc1' },
          };
        }).filter((n) => n.id > 0);

        return { nodes };
      },
    },
  });

  await page.goto('/admin/nodes');

  await expect(page.getByTestId('admin.nodes.row.125')).toBeVisible();
  await expect(page.getByTestId('admin.nodes.row.125')).toHaveAttribute('data-row-variant', 'danger');
  await expect(page.getByTestId('admin.nodes.row.125.dot')).toBeVisible();
  await expect(page.getByTestId('admin.nodes.row.124')).toHaveAttribute('data-row-variant', 'warn');
  await expect(page.getByTestId('admin.nodes.row.125.detail')).toHaveAttribute('href', '/admin/nodes/125');
  await expect(page.getByTestId('admin.nodes.row.125.copy')).toBeVisible();
  await expect(page.getByTestId('admin.nodes.row.125.vps')).toBeVisible();

  await page.getByTestId('admin.nodes.pagination.desktop.next').click();
  await expect(page.getByTestId('admin.nodes.row.75')).toBeVisible();

  await page.getByTestId('admin.nodes.pagination.desktop.prev').click();
  await expect(page.getByTestId('admin.nodes.row.125')).toBeVisible();
});
