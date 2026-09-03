import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';
import { expectNoDocumentHorizontalOverflow } from '../../helpers/horizontalOverflow';

const longPayloadToken = `payload-${'0123456789abcdef'.repeat(16)}`;

const handlers = {
  'GET transactions/702': () => ({
    id: 702,
    name: 'Step 2',
    done: 'done',
    success: 0,
    progress: 40,
    priority: 20,
    urgent: true,
    type: 2,
    created_at: '2026-02-02T08:01:00Z',
    started_at: '2026-02-02T08:01:10Z',
    finished_at: '2026-02-02T08:02:40Z',
    node: { id: 2, label: 'node2' },
    vps: { id: 100, label: 'vps100' },
    transaction_chain: { id: 123 },
    depends_on: [701],
    input: { a: 1 },
    user: { id: 9, login: 'worker' },
    output: { ok: false, error: `dataset mount failed:${longPayloadToken}` },
    details: { command: `zfs mount tank/ct/vps100:${longPayloadToken}` },
    stdout: `created mountpoint:${longPayloadToken}`,
    stderr: `cannot mount dataset:${longPayloadToken}`,
  }),
};

test.describe('@workflow-matrix @pr-smoke TransactionDetailPage', () => {
  test('@pr-smoke-mobile renders user transaction details without broken admin node link', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST_TOKEN' });
    await installHaveApiMock(page, { handlers });

    await page.goto('/app/transactions/items/702');

    await expect(page.getByTestId('transactions.items.detail')).toBeVisible();
    await expect(page.getByTestId('transactions.items.detail.header')).toBeVisible();
    await expect(page.getByTestId('transactions.items.detail.info')).toBeVisible();
    await expect(page.getByTestId('transactions.items.detail.payload')).toBeVisible();
    await expect(page.getByTestId('transactions.items.detail.error')).toContainText('dataset mount failed');
    await expect(page.getByTestId('transactions.items.detail.info')).toContainText('worker');
    await expect(page.getByTestId('transactions.items.detail.info')).toContainText('40');
    await expect(page.getByTestId('transactions.items.detail.payload')).toContainText('zfs mount tank/ct/vps100');
    await expect(page.getByTestId('transactions.items.detail.payload')).toContainText('created mountpoint');
    await expect(page.getByTestId('transactions.items.detail.payload')).toContainText('cannot mount dataset');
    await expect(page.getByTestId('transactions.items.detail.raw')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoDocumentHorizontalOverflow(page);
    await page.getByTestId('transactions.items.detail.raw').getByText(/raw|surov/i).click();
    await expect(page.getByTestId('transactions.items.detail.raw.json')).toBeVisible();
    await expect(page.getByTestId('transactions.items.detail.raw.json')).toContainText(longPayloadToken);
    await expectNoDocumentHorizontalOverflow(page);
    await page.setViewportSize({ width: 1280, height: 844 });

    await expect(page.getByTestId('transactions.items.detail.open_chain')).toHaveAttribute('href', '/app/transactions/123');
    await expect(page.getByTestId('transactions.items.detail.node_value')).toContainText('node2');
    await expect(page.locator('a[href="/app/admin/nodes/2"]')).toHaveCount(0);
  });

  test('@pr-smoke-mobile renders admin transaction details with admin node link', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST_TOKEN' });
    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 99 },
      handlers,
    });

    await page.goto('/admin/transactions/items/702');

    await expect(page.getByTestId('transactions.items.detail')).toBeVisible();
    await expect(page.getByTestId('transactions.items.detail.open_chain')).toHaveAttribute('href', '/admin/transactions/123');
    await expect(page.getByTestId('transactions.items.detail.node_link')).toHaveAttribute('href', '/admin/nodes/2');
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoDocumentHorizontalOverflow(page);
  });

  test('deep reload keeps transaction detail route usable', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST_TOKEN' });
    await installHaveApiMock(page, { handlers });

    await page.goto('/app/transactions/items/702');
    await expect(page.getByTestId('transactions.items.detail')).toBeVisible();

    await page.reload();

    await expect(page).toHaveURL(/\/app\/transactions\/items\/702$/);
    await expect(page.getByTestId('transactions.items.detail')).toBeVisible();
    await expect(page.getByTestId('transactions.items.detail.error')).toContainText('dataset mount failed');
  });
});
