import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

test('admin node detail: stale lock state degrades busy transaction after ttl', async ({ page }) => {
  // Make time controllable without waiting real seconds.
  await page.addInitScript(() => {
    (window as any).__TEST_NOW = 1700000000000;
    const realNow = Date.now;
    Date.now = () => (window as any).__TEST_NOW ?? realNow();
  });

  await bootstrapVpsAdminWindow(page);

  let chainCalls = 0;

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
      'GET nodes/5/metrics': () => ({ rows: [] }),

      // First load succeeds (3 calls for staged/queued/rollbacking), subsequent calls fail.
      'GET transaction_chains': (ctx) => {
        const cls = ctx.searchParams.get('transaction_chain[class_name]');
        const row = ctx.searchParams.get('transaction_chain[row_id]');
        const state = ctx.searchParams.get('transaction_chain[state]');

        // Only the node we are testing is busy.
        const isTargetNode = cls === 'Node' && row === '5' && (state === 'staged' || state === 'queued' || state === 'rollbacking');

        if (!isTargetNode) return { transaction_chains: [] };

        chainCalls += 1;

        if (chainCalls <= 3) {
          return { transaction_chains: [{ id: 999, state: state ?? 'staged' }] };
        }

        // Simulate a backend failure / stale lock data.
        return {
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ status: false, message: 'internal error', response: null }),
        };
      },
    },
  });

  await page.goto('/admin/nodes/5?section=maintenance');

  const lockBtn = page.getByTestId('admin.node.maintenance.lock');
  await expect(lockBtn).toBeVisible();

  // Initial lock state is busy: maintenance lock is gated.
  await expect(lockBtn).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('admin.node.transactions.lock.badge')).toBeVisible();

  // Advance time past the stale-lock TTL (60s).
  await page.evaluate(() => {
    (window as any).__TEST_NOW += 61_000;
  });

  // Trigger a refetch that fails; lock state becomes stale and should degrade busy gating.
  await page.getByTestId('admin.node.refresh').click();

  await expect(page.getByTestId('stale.lock.alert')).toBeVisible();

  // Busy badge should disappear once stale.
  await expect(page.locator('[data-testid="admin.node.transactions.lock.badge"]')).toHaveCount(0);

  // Maintenance lock action should no longer be gated by stale busy transaction.
  await expect(lockBtn).not.toHaveAttribute('aria-disabled', 'true');
});
