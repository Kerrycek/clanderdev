import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

test('@smoke admin node detail: busy transaction gates maintenance lock', async ({ page }) => {
  await bootstrapVpsAdminWindow(page);
  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'GET nodes/5': () => ({
        node: {
          id: 5,
          domain_name: 'node5.example',
          fqdn: 'node5.example',
          status: true,
          maintenance_lock: false,
          maintenance_lock_reason: null,
          role: 'hypervisor',
          hypervisor_type: 'vpsadminos',
          ip_address: '192.0.2.5',
        },
      }),
      'GET nodes': () => [
        { id: 5, domain_name: 'node5.example' },
        { id: 6, domain_name: 'node6.example' },
      ],
      'GET nodes/public_status': () => [
        {
          id: 5,
          status: true,
          location: { label: 'dc1' },
          last_report_at: '2026-02-02T00:00:00.000Z',
        },
      ],
      'GET nodes/5/statuses': () => [],
      'GET transactions': () => [],
      'GET transaction_chains': (ctx) => {
        const cls = ctx.searchParams.get('transaction_chain[class_name]');
        const row = ctx.searchParams.get('transaction_chain[row_id]');
        const state = ctx.searchParams.get('transaction_chain[state]');

        // Only the node we are testing is busy.
        if (cls === 'Node' && row === '5' && (state === 'staged' || state === 'queued' || state === 'rollbacking')) {
          return {
            transaction_chains: [{ id: 999, state: state ?? 'staged' }],
          };
        }

        return { transaction_chains: [] };
      },
    },
  });

  await page.goto('/admin/nodes/5?section=maintenance');

  const lockBtn = page.getByTestId('admin.node.maintenance.lock');
  await expect(lockBtn).toBeVisible();

  // Wait for the active transaction chain to be loaded and applied to gates.
  await expect(lockBtn).toHaveAttribute('aria-disabled', 'true');

  await lockBtn.click({ force: true });
  await expect(page.getByTestId('admin.node.maintenance.lock.reason')).toBeVisible();
});
