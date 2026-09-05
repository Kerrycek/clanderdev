import { expect, test, type Page } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

function visibleRecipientEntry(page: Page, id: number) {
  const mobile = (page.viewportSize()?.width ?? 1280) < 768;
  return page.getByTestId(mobile ? `admin.mailer.recipients.card.${id}` : `admin.mailer.recipients.row.${id}`);
}

test.describe('@smoke @smoke-mobile Admin mailer recipients', () => {
  test.beforeEach(async ({ page }) => {
    await bootstrapVpsAdminWindow(page, {
      sessionToken: 'TEST',
    });

    let recipients = [
      { id: 10, label: 'Support', to: 'support@example.test', cc: 'team@example.test', bcc: 'audit@example.test' },
      { id: 11, label: 'Accounting', to: 'acc@example.test', cc: '', bcc: '' },
      ...Array.from({ length: 58 }, (_, index) => ({
        id: index + 12,
        label: `Recipient ${index + 12}`,
        to: `recipient-${index + 12}@example.test`,
        cc: '',
        bcc: '',
      })),
    ];

    let rejectedCreateAttempts = 0;

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 90 },
      handlers: {
        'GET mail_recipients': () => ({ mail_recipients: recipients, _meta: { total_count: recipients.length } }),
        'GET mail_recipients/10': () => ({
          mail_recipient: recipients.find((recipient) => recipient.id === 10),
        }),
        'POST mail_recipients': async ({ reqJson }) => {
          const payload = (reqJson as any)?.mail_recipient ?? {};
          await new Promise((resolve) => setTimeout(resolve, 100));
          if (payload.label === 'Ambiguous recipient') {
            return {
              status: 503,
              contentType: 'application/json',
              body: JSON.stringify({ status: false, message: 'recipient response was lost', response: null }),
            };
          }
          if (payload.label === 'Malformed recipient') {
            return { mail_recipient: payload };
          }
          if (payload.label === 'Fractional ID recipient') {
            return { mail_recipient: { id: 70.5, ...payload } };
          }
          if (payload.label === 'Rejected recipient' && rejectedCreateAttempts++ === 0) {
            return {
              status: 422,
              contentType: 'application/json',
              body: JSON.stringify({ status: false, message: 'recipient validation rejected', response: null }),
            };
          }
          const created = { id: 70, ...payload };
          recipients = [...recipients, created];
          return { mail_recipient: created };
        },
        'PUT mail_recipients/10': ({ reqJson }) => {
          const updated = { ...recipients.find((recipient) => recipient.id === 10), ...((reqJson as any)?.mail_recipient ?? {}) };
          recipients = recipients.map((recipient) => recipient.id === 10 ? updated as typeof recipient : recipient);
          return { mail_recipient: updated };
        },
      },
    });
  });

  test('filters and paginates locally while sending only supported API parameters', async ({ page }) => {
    const reqs: URL[] = [];
    page.on('request', (req) => {
      if (req.method() !== 'GET') return;
      const url = new URL(req.url());
      if (!url.pathname.endsWith('/mail_recipients')) return;
      reqs.push(url);
    });

    await page.goto('/admin/mailer/recipients');

    await expect(page.getByTestId('admin.mailer.recipients.page')).toBeVisible();
    await expect(visibleRecipientEntry(page, 10)).toBeVisible();
    await expect(visibleRecipientEntry(page, 69)).toHaveCount(0);

    const paginationPrefix = (page.viewportSize()?.width ?? 1280) < 768
      ? 'admin.mailer.recipients.pagination.mobile'
      : 'admin.mailer.recipients.pagination.desktop';
    await page.getByTestId(`${paginationPrefix}.next`).click();
    await expect(visibleRecipientEntry(page, 69)).toBeVisible();
    await expect(page).toHaveURL(/(?:\?|&)page=2(?:&|$)/);

    await page.getByTestId('admin.mailer.recipients.search.input').fill('acc');
    await page.getByTestId('admin.mailer.recipients.search.input').press('Enter');

    await expect(visibleRecipientEntry(page, 11)).toBeVisible();
    await expect(visibleRecipientEntry(page, 10)).toHaveCount(0);
    await expect(page).toHaveURL(/(?:\?|&)q=acc(?:&|$)/);
    await expect(page).not.toHaveURL(/(?:\?|&)page=/);

    expect(reqs.length).toBeGreaterThan(0);
    for (const requestUrl of reqs) {
      expect([...requestUrl.searchParams.keys()]).toEqual(['mail_recipient[limit]']);
      expect(requestUrl.searchParams.get('mail_recipient[limit]')).toBe('500');
      for (const unsupported of ['q', 'label', 'to', 'cc', 'bcc']) {
        expect(requestUrl.searchParams.get(unsupported)).toBeNull();
        expect(requestUrl.searchParams.get(`mail_recipient[${unsupported}]`)).toBeNull();
      }
    }
  });

  test('validates and creates a recipient with one exact mutation', async ({ page }) => {
    const postPayloads: unknown[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (request.method() === 'POST' && url.pathname.endsWith('/mail_recipients')) {
        postPayloads.push(request.postDataJSON());
      }
    });

    await page.goto('/admin/mailer/recipients');
    await page.getByTestId('admin.mailer.recipients.create').click();

    const save = page.getByTestId('admin.mailer.recipients.editor.save');
    await expect(save).toBeDisabled();
    await page.getByTestId('admin.mailer.recipients.editor.to').fill('ops@example.test');
    await expect(save).toBeDisabled();
    await page.getByTestId('admin.mailer.recipients.editor.label').fill('Operations');
    await expect(save).toBeEnabled();
    await save.dblclick();

    await expect.poll(() => postPayloads).toEqual([{
      mail_recipient: {
        label: 'Operations',
        to: 'ops@example.test',
      },
    }]);
    await expect(page.getByTestId('admin.mailer.recipients.editor')).toHaveCount(0);
    const successToast = page.getByTestId('toast.viewport');
    await expect(successToast).toContainText('Recipient created');
    await expect(successToast).toContainText('#70');
  });

  test('an authoritative 422 keeps the create draft retryable and leaves no reload guard', async ({ page }) => {
    let postCalls = 0;
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (request.method() === 'POST' && url.pathname.endsWith('/mail_recipients')) postCalls += 1;
    });

    await page.goto('/admin/mailer/recipients');
    await page.getByTestId('admin.mailer.recipients.create').click();
    await page.getByTestId('admin.mailer.recipients.editor.label').fill('Rejected recipient');
    await page.getByTestId('admin.mailer.recipients.editor.to').fill('rejected@example.test');
    await page.getByTestId('admin.mailer.recipients.editor.cc').fill('copy@example.test');
    await page.getByTestId('admin.mailer.recipients.editor.bcc').fill('audit@example.test');

    const editor = page.getByTestId('admin.mailer.recipients.editor');
    const save = page.getByTestId('admin.mailer.recipients.editor.save');
    await save.click();

    await expect.poll(() => postCalls).toBe(1);
    await expect(editor).toBeVisible();
    await expect(editor).toContainText('recipient validation rejected');
    await expect(page.getByTestId('admin.mailer.recipients.editor.label')).toHaveValue('Rejected recipient');
    await expect(page.getByTestId('admin.mailer.recipients.editor.to')).toHaveValue('rejected@example.test');
    await expect(page.getByTestId('admin.mailer.recipients.editor.cc')).toHaveValue('copy@example.test');
    await expect(page.getByTestId('admin.mailer.recipients.editor.bcc')).toHaveValue('audit@example.test');
    await expect(save).toBeEnabled();
    await expect.poll(() => page.evaluate(() => (
      Object.keys(window.sessionStorage)
        .filter((key) => key.startsWith('webui-next.mailer.mail-recipient-create.'))
    ))).toEqual([]);

    await editor.getByRole('button', { name: /cancel/i }).click();
    await page.reload();
    await expect(page.getByTestId('admin.mailer.recipients.create.indeterminate')).toHaveCount(0);
    await expect(page.getByTestId('admin.mailer.recipients.create')).toBeEnabled();

    await page.getByTestId('admin.mailer.recipients.create').click();
    await page.getByTestId('admin.mailer.recipients.editor.label').fill('Rejected recipient');
    await page.getByTestId('admin.mailer.recipients.editor.to').fill('rejected@example.test');
    await page.getByTestId('admin.mailer.recipients.editor.cc').fill('copy@example.test');
    await page.getByTestId('admin.mailer.recipients.editor.bcc').fill('audit@example.test');
    await page.getByTestId('admin.mailer.recipients.editor.save').dblclick();

    await expect.poll(() => postCalls).toBe(2);
    await expect(editor).toHaveCount(0);
    await expect(page.getByTestId('toast.viewport')).toContainText('Recipient created');
  });

  test('clears optional recipient addresses with explicit nulls', async ({ page }) => {
    let updatePayload: unknown;
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (request.method() === 'PUT' && url.pathname.endsWith('/mail_recipients/10')) {
        updatePayload = request.postDataJSON();
      }
    });

    await page.goto('/admin/mailer/recipients');
    await visibleRecipientEntry(page, 10).getByTestId('admin.mailer.recipients.edit.10').click();
    await page.getByTestId('admin.mailer.recipients.editor.cc').fill('');
    await page.getByTestId('admin.mailer.recipients.editor.bcc').fill('');
    await page.getByTestId('admin.mailer.recipients.editor.save').click();

    await expect.poll(() => updatePayload).toEqual({
      mail_recipient: {
        label: 'Support',
        to: 'support@example.test',
        cc: null,
        bcc: null,
      },
    });
  });

  for (const attempt of [
    { label: 'Ambiguous recipient' },
    { label: 'Malformed recipient' },
    { label: 'Fractional ID recipient' },
  ]) {
    test(`${attempt.label} is fail-closed and never blindly retried`, async ({ page }) => {
      let postCalls = 0;
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (request.method() === 'POST' && url.pathname.endsWith('/mail_recipients')) postCalls += 1;
      });

      await page.goto('/admin/mailer/recipients');
      await page.getByTestId('admin.mailer.recipients.create').click();
      await page.getByTestId('admin.mailer.recipients.editor.label').fill(attempt.label);
      await page.getByTestId('admin.mailer.recipients.editor.to').fill('uncertain@example.test');
      await page.getByTestId('admin.mailer.recipients.editor.save').dblclick();

      await expect.poll(() => postCalls).toBe(1);
      await expect(page.getByTestId('admin.mailer.recipients.editor')).toHaveCount(0);
      await expect(page.getByTestId('admin.mailer.recipients.create.indeterminate')).toBeVisible();
      await expect(page.getByTestId('admin.mailer.recipients.create')).toBeDisabled();
      await page.getByTestId('admin.mailer.recipients.create').evaluate((button) => (
        button as HTMLButtonElement
      ).click());
      await page.waitForTimeout(150);
      expect(postCalls).toBe(1);

      await page.reload();
      await expect(page.getByTestId('admin.mailer.recipients.create.indeterminate')).toBeVisible();
      await expect(page.getByTestId('admin.mailer.recipients.create')).toBeDisabled();
      expect(postCalls).toBe(1);

      await page.getByTestId('admin.mailer.recipients.create.indeterminate.reviewed').click();
      const unlockConfirm = page.getByTestId('admin.mailer.recipients.create.indeterminate.reviewed_confirm');
      await expect(unlockConfirm).toBeVisible();
      await unlockConfirm.getByTestId('admin.mailer.recipients.create.indeterminate.reviewed_confirm.confirm').click();

      const create = page.getByTestId('admin.mailer.recipients.create');
      await expect(create).toBeEnabled();
      await create.click();
      await expect(page.getByTestId('admin.mailer.recipients.editor')).toBeVisible();
      await expect(page.getByTestId('admin.mailer.recipients.editor.label')).toBeEnabled();
      await expect(page.getByTestId('admin.mailer.recipients.editor.to')).toBeEnabled();
      expect(postCalls).toBe(1);
    });
  }

  test('keeps unsafe global recipient deletion disabled', async ({ page }) => {
    let deleteCalls = 0;
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (request.method() === 'DELETE' && url.pathname.includes('/mail_recipients/')) deleteCalls += 1;
    });

    await page.goto('/admin/mailer/recipients');
    await expect(page.getByTestId('admin.mailer.recipients.delete_blocked')).toBeVisible();
    const blockedDelete = visibleRecipientEntry(page, 10).getByTestId('admin.mailer.recipients.delete.10.blocked');
    await expect(blockedDelete).toBeDisabled();
    await blockedDelete.evaluate((button) => (button as HTMLButtonElement).click());
    await page.waitForTimeout(100);
    expect(deleteCalls).toBe(0);
  });
});
