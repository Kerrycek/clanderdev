import path from 'node:path';

import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

test.describe('@smoke Admin list pagination consistency', () => {
  test('jumps directly to the fifth mailbox page without losing the keyset cursor', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    const mailboxes = Array.from({ length: 125 }, (_, index) => {
      const id = index + 1;
      return {
        id,
        label: `Mailbox ${id}`,
        server: 'imap.example.test',
        port: 993,
        user: `mailbox-${id}@example.test`,
        enable_ssl: true,
        handlers_count: 0,
        updated_at: '2026-08-28T00:00:00Z',
      };
    });
    const cursors: Array<number | null> = [];
    let countRequested = false;

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 90 },
      handlers: {
        'GET mailboxes': ({ searchParams }) => {
          const fromIdRaw = searchParams.get('mailbox[from_id]');
          const fromId = fromIdRaw ? Number(fromIdRaw) : null;
          const limit = Number(searchParams.get('mailbox[limit]') ?? 50);
          cursors.push(fromId);
          if (searchParams.get('_meta[count]') === 'true') countRequested = true;

          const rows = mailboxes
            .filter((mailbox) => fromId === null || mailbox.id > fromId)
            .slice(0, limit);
          return { mailboxes: rows, _meta: { total_count: mailboxes.length } };
        },
      },
    });

    await page.goto('/admin/mailer/mailboxes?limit=25');

    await expect(page.getByTestId('admin.mailer.mailboxes.pagination')).toContainText('Page 1 of 5');
    await expect(page.getByTestId('admin.mailer.mailboxes.pagination.page.5')).toBeVisible();

    await page.getByTestId('admin.mailer.mailboxes.pagination.page.5').click();

    await expect(page).toHaveURL(/(?:\?|&)page=5(?:&|$)/);
    await expect(page).toHaveURL(/(?:\?|&)from_id=100(?:&|$)/);
    await expect(page.getByTestId('admin.mailer.mailboxes.pagination')).toContainText('Page 5 of 5');
    await expect(page.getByTestId('admin.mailer.mailboxes.row.101')).toBeVisible();
    await expect(page.getByTestId('admin.mailer.mailboxes.row.100')).toHaveCount(0);

    expect(countRequested).toBe(true);
    expect(cursors).toEqual(expect.arrayContaining([null, 25, 50, 75, 100]));

    const screenshotPath = process.env.E2E_ADMIN_LIST_CONSISTENCY_SCREENSHOT;
    if (screenshotPath) {
      await page.screenshot({ path: path.resolve(screenshotPath), fullPage: true });
    }
  });
});
