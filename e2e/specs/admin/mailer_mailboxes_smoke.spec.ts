import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

test.describe('@smoke Admin mailer mailboxes', () => {
  test.beforeEach(async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    const mailboxes = [
      {
        id: 20,
        label: 'Incident inbox',
        server: 'imap.example.test',
        port: 993,
        user: 'incidents@example.test',
        enable_ssl: true,
        handlers_count: 1,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-02-01T00:00:00Z',
      },
      {
        id: 10,
        label: 'Support inbox',
        server: 'imap.example.test',
        port: 993,
        user: 'support@example.test',
        enable_ssl: true,
        handlers_count: 2,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-15T00:00:00Z',
      },
    ];

    const handlersByMailbox: Record<number, any[]> = {
      20: [
        {
          id: 201,
          class_name: 'VpsAdmin::API::IncidentReports::Handler',
          order: 1,
          continue: false,
        },
      ],
      10: [
        {
          id: 101,
          class_name: 'VpsAdmin::API::IncidentReports::Handler',
          order: 1,
          continue: true,
        },
        {
          id: 102,
          class_name: 'Custom::Handler',
          order: 2,
          continue: false,
        },
      ],
    };

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 90 },
      handlers: {
        'GET mailboxes': ({ searchParams }) => {
          const q = (searchParams.get('mailbox[q]') || searchParams.get('q') || '').toLowerCase();
          let data = mailboxes;
          if (q) {
            data = data.filter(
              (m) =>
                m.label.toLowerCase().includes(q) ||
                m.server.toLowerCase().includes(q) ||
                m.user.toLowerCase().includes(q)
            );
          }
          return { mailboxes: data, _meta: { total_count: data.length } };
        },
        'GET mailboxes/20': () => ({ mailbox: mailboxes.find((m) => m.id === 20) }),
        'GET mailboxes/10': () => ({ mailbox: mailboxes.find((m) => m.id === 10) }),
        'GET mailboxes/20/handler': () => ({ handlers: handlersByMailbox[20], _meta: { total_count: handlersByMailbox[20].length } }),
        'GET mailboxes/10/handler': () => ({ handlers: handlersByMailbox[10], _meta: { total_count: handlersByMailbox[10].length } }),

        'POST mailboxes': () => {
          const created = {
            id: 30,
            label: 'New inbox',
            server: 'imap.example.test',
            port: 993,
            user: 'new@example.test',
            enable_ssl: true,
            handlers_count: 0,
            created_at: '2025-02-01T00:00:00Z',
            updated_at: '2025-02-01T00:00:00Z',
          };
          mailboxes.unshift(created);
          handlersByMailbox[30] = [];
          return { mailbox: created };
        },
        'GET mailboxes/30': () => ({ mailbox: mailboxes.find((m) => m.id === 30) }),
        'GET mailboxes/30/handler': () => ({ handlers: [], _meta: { total_count: 0 } }),
      },
    });
  });

  test('lists mailboxes and opens detail', async ({ page }) => {
    await page.goto('/admin/mailer/mailboxes');

    await expect(page.getByTestId('admin.mailer.mailboxes.page')).toBeVisible();
    await expect(page.getByTestId('admin.mailer.mailboxes.row.20')).toBeVisible();
    await expect(page.getByTestId('admin.mailer.mailboxes.pagination.page.1')).toBeVisible();
    await expect(page.getByTestId('admin.mailer.mailboxes.pagination')).toContainText('Page 1 of 1');

    await page.getByTestId('admin.mailer.mailboxes.row.20').click();
    await expect(page).toHaveURL(/\/admin\/mailer\/mailboxes\/20/);
    await expect(page.getByTestId('admin.mailer.mailboxes.detail')).toBeVisible();
    await expect(page.getByTestId('admin.mailer.mailboxes.detail.header')).toContainText('Incident inbox');

    await expect(page.getByTestId('admin.mailer.mailboxes.detail.handlers')).toContainText('Handlers');
    await expect(page.getByTestId('admin.mailer.mailboxes.handler.201')).toBeVisible();
  });

  test('searches and creates mailbox', async ({ page }) => {
    const mailboxReqs: URL[] = [];
    page.on('request', (req) => {
      if (req.method() !== 'GET') return;
      const url = new URL(req.url());
      if (!url.pathname.endsWith('/mailboxes')) return;
      mailboxReqs.push(url);
    });

    await page.goto('/admin/mailer/mailboxes');

    // Search.
    await page.getByTestId('admin.mailer.mailboxes.search.input').fill('support');
    await page.getByTestId('admin.mailer.mailboxes.search.input').press('Enter');
    await expect(page.getByTestId('admin.mailer.mailboxes.row.10')).toBeVisible();

    expect(mailboxReqs.length).toBeGreaterThan(0);
    const last = mailboxReqs[mailboxReqs.length - 1];
    expect(last.searchParams.get('mailbox[q]')).toBeNull();
    expect(last.searchParams.get('_meta[count]')).toBeNull();

    await page.getByTestId('admin.mailer.mailboxes.filter.clear').click();
    await expect(page.getByTestId('admin.mailer.mailboxes.row.20')).toBeVisible();

    // Create.
    await page.getByTestId('admin.mailer.mailboxes.create').click();
    await expect(page.getByTestId('admin.mailer.mailboxes.create.modal')).toBeVisible();

    await page.getByTestId('admin.mailer.mailboxes.create.label').fill('New inbox');
    await page.getByTestId('admin.mailer.mailboxes.create.server').fill('imap.example.test');
    await page.getByTestId('admin.mailer.mailboxes.create.port').fill('993');
    await page.getByTestId('admin.mailer.mailboxes.create.user').fill('new@example.test');
    await page.getByTestId('admin.mailer.mailboxes.create.password').fill('secret');

    await page.getByTestId('admin.mailer.mailboxes.create.modal.save').click();
    await expect(page.getByTestId('admin.mailer.mailboxes.create.modal')).toHaveCount(0);

    // New row appears after refetch.
    await expect(page.getByTestId('admin.mailer.mailboxes.row.30')).toBeVisible();
  });
});
