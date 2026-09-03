import { expect, test, type Page } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

function visibleTemplateEntry(page: Page, id: number) {
  const mobile = (page.viewportSize()?.width ?? 1280) < 768;
  return page.getByTestId(mobile ? `admin.mailer.templates.card.${id}` : `admin.mailer.templates.row.${id}`);
}

test.describe('@smoke @smoke-mobile Admin mailer templates', () => {
  test.beforeEach(async ({ page }) => {
    await bootstrapVpsAdminWindow(page, {
      sessionToken: 'TEST',
    });

    const languages = [
      { id: 1, code: 'en', label: 'English' },
      { id: 2, code: 'cs', label: 'Čeština' },
    ];

    const templates = [
      {
        id: 1,
        name: 'welcome',
        label: 'Welcome mail',
        template_id: 'welcome',
        user_visibility: 'visible',
        updated_at: '2025-01-01T12:00:00Z',
      },
      {
        id: 2,
        name: 'invoice',
        label: 'Invoice',
        template_id: 'invoice',
        user_visibility: 'default',
        updated_at: '2025-01-02T12:00:00Z',
      },
      ...Array.from({ length: 58 }, (_, index) => {
        const id = index + 3;
        return {
          id,
          name: `template_${id}`,
          label: `Template ${id}`,
          template_id: `template.${id}`,
          user_visibility: 'default',
          updated_at: '2025-01-03T12:00:00Z',
        };
      }),
    ];

    const recipients = [{ id: 10, label: 'Support', to: 'support@example.test', cc: '', bcc: '' }];

    const templateRecipients = [{ id: 1000, mail_recipient: recipients[0] }];

    const translations = [
      {
        id: 101,
        language: languages[0],
        subject: 'Welcome',
        from: 'noreply@example.test',
        text_plain: 'Hello',
        text_html: '<p>Hello</p>',
        updated_at: '2025-01-01T12:00:00Z',
        created_at: '2025-01-01T12:00:00Z',
      },
      {
        id: 102,
        language: languages[1],
        subject: 'Vítejte',
        from: 'noreply@example.test',
        text_plain: 'Ahoj',
        text_html: '<p>Ahoj</p>',
        updated_at: '2025-01-01T12:00:00Z',
        created_at: '2025-01-01T12:00:00Z',
      },
    ];

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 90 },
      handlers: {
        'GET languages': () => ({ languages, _meta: { total_count: languages.length } }),
        'GET mail_templates': () => ({ mail_templates: templates, _meta: { total_count: templates.length } }),
        'GET mail_templates/1': () => ({ mail_template: templates[0] }),
        'GET mail_templates/2': () => ({ mail_template: templates[1] }),
        'GET mail_templates/1/recipients': () => ({ recipients: templateRecipients, _meta: { total_count: templateRecipients.length } }),
        'GET mail_templates/1/translations': () => ({ translations, _meta: { total_count: translations.length } }),
        'GET mail_templates/1/translations/101': () => ({ translation: translations[0] }),
      },
    });
  });

  test('lists templates and opens detail + translation', async ({ page }) => {
    await page.goto('/admin/mailer/templates');

    await expect(page.getByTestId('admin.mailer.templates.page')).toBeVisible();
    const entry = visibleTemplateEntry(page, 1);
    await expect(entry).toBeVisible();
    if ((page.viewportSize()?.width ?? 1280) < 768) await entry.getByRole('link').click();
    else await entry.click();

    await expect(page).toHaveURL(/\/admin\/mailer\/templates\/1/);
    await expect(page.getByTestId('admin.mailer.templates.detail')).toBeVisible();

    // Translations list should include EN row.
    await expect(page.getByTestId('admin.mailer.templates.detail.translation.101')).toBeVisible();

    await page.getByTestId('admin.mailer.templates.detail.translation.101').click();

    await expect(page).toHaveURL(/\/admin\/mailer\/templates\/1\/translations\/101/);
    await expect(page.getByTestId('admin.mailer.templates.translation.detail')).toBeVisible();
    await expect(page.getByTestId('admin.mailer.templates.translation.detail.fields')).toContainText('Welcome');
  });

  test('paginates and filters the bounded list locally without unsupported API parameters', async ({ page }) => {
    const reqs: URL[] = [];
    page.on('request', (req) => {
      if (req.method() !== 'GET') return;
      const url = new URL(req.url());
      if (!url.pathname.endsWith('/mail_templates')) return;
      reqs.push(url);
    });

    await page.goto('/admin/mailer/templates');

    await expect(page.getByTestId('admin.mailer.templates.pagination.mobile')).toHaveCount(1);
    await expect(page.getByTestId('admin.mailer.templates.pagination.desktop')).toHaveCount(1);

    const paginationPrefix = (page.viewportSize()?.width ?? 1280) < 768
      ? 'admin.mailer.templates.pagination.mobile'
      : 'admin.mailer.templates.pagination.desktop';
    await expect(visibleTemplateEntry(page, 1)).toBeVisible();
    await expect(visibleTemplateEntry(page, 60)).toHaveCount(0);

    await page.getByTestId(`${paginationPrefix}.next`).click();
    await expect(visibleTemplateEntry(page, 60)).toBeVisible();
    await expect(visibleTemplateEntry(page, 1)).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.get('page')).toBe('2');

    await page.getByTestId(`${paginationPrefix}.prev`).click();
    await expect(visibleTemplateEntry(page, 1)).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get('page')).toBeNull();

    await page.getByTestId(`${paginationPrefix}.limit`).selectOption('25');
    await expect.poll(() => new URL(page.url()).searchParams.get('limit')).toBe('25');
    await expect(visibleTemplateEntry(page, 30)).toHaveCount(0);

    await page.getByTestId(`${paginationPrefix}.next`).click();
    await expect(visibleTemplateEntry(page, 30)).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get('page')).toBe('2');

    const search = page.getByTestId('admin.mailer.templates.search.input');
    await search.pressSequentially('Welcome mail');
    await expect(search).toHaveValue('Welcome mail');

    await expect.poll(() => new URL(page.url()).searchParams.get('page')).toBeNull();
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('Welcome mail');
    await expect(visibleTemplateEntry(page, 1)).toBeVisible();
    await expect(visibleTemplateEntry(page, 2)).toHaveCount(0);

    await page.getByTestId('admin.mailer.templates.filter.clear').click();
    await expect(search).toHaveValue('');
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBeNull();
    await expect.poll(() => new URL(page.url()).searchParams.get('page')).toBeNull();
    await expect(visibleTemplateEntry(page, 1)).toBeVisible();
    await expect(visibleTemplateEntry(page, 30)).toHaveCount(0);

    expect(reqs.length).toBeGreaterThan(0);
    for (const request of reqs) {
      expect(request.searchParams.get('mail_template[limit]')).toBe('500');
      expect(request.searchParams.get('mail_template[q]')).toBeNull();
      expect(request.searchParams.get('mail_template[user_visibility]')).toBeNull();
    }
  });
});
