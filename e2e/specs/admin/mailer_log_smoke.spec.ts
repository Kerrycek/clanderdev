import { expect, test, type Page } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

function visibleMailLogEntry(page: Page, id: number) {
  const mobile = (page.viewportSize()?.width ?? 1280) < 768;
  return page.getByTestId(mobile ? `admin.mailer.log.card.${id}` : `admin.mailer.log.row.${id}`);
}

async function openMailLogEntry(page: Page, id: number) {
  const entry = visibleMailLogEntry(page, id);
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    await entry.locator(`a[href$="/mailer/log/${id}"]`).click();
    return;
  }
  await entry.click();
}

test.describe('@smoke Admin mailer log', () => {
  test.beforeEach(async ({ page }) => {
    await bootstrapVpsAdminWindow(page, {
      sessionToken: 'TEST',
    });

    const templates = [
      { id: 10, name: 'welcome', label: 'Welcome mail', template_id: 'welcome' },
      { id: 20, name: 'invoice', label: 'Invoice', template_id: 'invoice' },
    ];

    const makeMail = (id: number, tplId: number, subject: string) => ({
      id,
      user: { id: 1, login: 'test' },
      to: 'user@example.test',
      from: 'noreply@example.test',
      subject,
      message_id: `<m${id}@example.test>`,
      mail_template: { id: tplId, label: templates.find((t) => t.id === tplId)?.label ?? `#${tplId}` },
      mail_transaction: { id: 123 },
      text_plain: `Hello from mail ${id}`,
      text_html: `<p>Hello <strong>from</strong> mail ${id}</p>`,
      created_at: '2025-01-01T12:00:00Z',
    });

    const all = [makeMail(101, 10, 'Welcome to vpsFree.cz'), makeMail(100, 20, 'Invoice #42')];

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 90 },
      handlers: {
        'GET mail_templates': () => ({ mail_templates: templates, _meta: { total_count: templates.length } }),
        'GET mail_logs': ({ searchParams }) => {
          const q = searchParams.get('mail_log[q]') || searchParams.get('q') || '';
          const tpl = searchParams.get('mail_log[mail_template]') || searchParams.get('mail_template') || '';

          let data = all;
          if (tpl) {
            data = data.filter((m) => String(m.mail_template.id) === tpl);
          }
          if (q) {
            data = data.filter((m) => m.subject.toLowerCase().includes(q.toLowerCase()));
          }

          return { mail_logs: data, _meta: { total_count: data.length } };
        },
        'GET mail_logs/101': () => ({ mail_log: makeMail(101, 10, 'Welcome to vpsFree.cz') }),
        'GET mail_logs/100': () => ({ mail_log: makeMail(100, 20, 'Invoice #42') }),
      },
    });
  });

  test('lists mails and opens detail', async ({ page }) => {
    await page.goto('/admin/mailer/log');

    await expect(page.getByTestId('admin.mailer.log.page')).toBeVisible();
    await expect(visibleMailLogEntry(page, 101)).toBeVisible();

    await openMailLogEntry(page, 101);

    await expect(page).toHaveURL(/\/admin\/mailer\/log\/101/);
    await expect(page.getByTestId('admin.mailer.log.detail')).toBeVisible();
    await expect(page.getByTestId('admin.mailer.log.detail.header')).toContainText('Welcome to vpsFree.cz');

    // Plain body is default.
    await expect(page.getByTestId('admin.mailer.log.detail.body')).toContainText('Hello from mail 101');

    // HTML preview + raw toggle.
    await page.getByTestId('admin.mailer.log.detail.tab.html').click();
    await expect(page.getByTestId('admin.mailer.log.detail.body.html')).toBeVisible();

    await page.getByTestId('admin.mailer.log.detail.body.raw_toggle').click();
    await expect(page.getByTestId('admin.mailer.log.detail.body')).toContainText('<p>Hello');
  });

  test('filters by template and search', async ({ page }) => {
    const mailLogReqs: URL[] = [];
    page.on('request', (req) => {
      if (req.method() !== 'GET') return;
      const url = new URL(req.url());
      if (!url.pathname.endsWith('/mail_logs')) return;
      mailLogReqs.push(url);
    });

    await page.goto('/admin/mailer/log');

    await expect(visibleMailLogEntry(page, 101)).toBeVisible();

    // Filter by template (Smart Filter Input).
    await page.getByTestId('admin.mailer.log.smart_filter.input').fill('template:10');
    await page.getByTestId('admin.mailer.log.smart_filter.input').press('Escape');
    await page.getByTestId('admin.mailer.log.smart_filter.input').press('Enter');
    await expect(visibleMailLogEntry(page, 101)).toBeVisible();
    await expect(visibleMailLogEntry(page, 100)).toHaveCount(0);

    // Search within results.
    await page.getByTestId('admin.mailer.log.smart_filter.input').fill('q:welcome');
    await page.getByTestId('admin.mailer.log.smart_filter.input').press('Escape');
    await page.getByTestId('admin.mailer.log.smart_filter.input').press('Enter');
    await expect(visibleMailLogEntry(page, 101)).toBeVisible();

    // Ensure at least one request used the namespaced query params.
    expect(mailLogReqs.length).toBeGreaterThan(0);
    const last = mailLogReqs[mailLogReqs.length - 1];
    expect(last.searchParams.get('mail_log[mail_template]')).toBe('10');
    expect(last.searchParams.get('mail_log[q]')).toBe('welcome');
  });
});
