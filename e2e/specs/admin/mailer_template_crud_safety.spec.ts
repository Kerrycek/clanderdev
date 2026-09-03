import { expect, test, type Page } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

const template = {
  id: 1,
  name: 'welcome',
  label: 'Welcome mail',
  template_id: 'welcome',
  user_visibility: 'visible',
  updated_at: '2026-09-01T12:00:00Z',
};

const english = { id: 1, code: 'en', label: 'English' };

function recipientRelations(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    return {
      id: 1_000 + id,
      mail_recipient: {
        id,
        label: `Recipient ${id}`,
        to: `recipient-${id}@example.test`,
        cc: '',
        bcc: '',
      },
    };
  });
}

function languageList(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    return { id, code: `l${id}`, label: `Language ${id}` };
  });
}

function translationList(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    return {
      id: 2_000 + id,
      language: english,
      from: `sender-${id}@example.test`,
      subject: `Translation ${id}`,
      text_plain: `Body ${id}`,
      text_html: null,
      created_at: '2026-09-01T09:00:00Z',
      updated_at: '2026-09-01T09:00:00Z',
    };
  });
}

async function installMock(
  page: Page,
  handlers: Record<string, (ctx: any) => unknown | Promise<unknown>> = {},
) {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'MAILER_TEMPLATE_SAFETY' });
  await installHaveApiMock(page, {
    user: { id: 1, login: 'mailer-admin', level: 100 },
    handlers: {
      'GET languages': () => ({ languages: [english], _meta: { total_count: 1 } }),
      'GET mail_templates': () => ({ mail_templates: [template], _meta: { total_count: 1 } }),
      'GET mail_templates/1': () => ({ mail_template: template }),
      'GET mail_templates/1/recipients': () => ({ recipients: [], _meta: { total_count: 0 } }),
      'GET mail_templates/1/translations': () => ({ translations: [], _meta: { total_count: 0 } }),
      ...handlers,
    },
  });
}

test.describe('@smoke-mobile Admin mail template CRUD safety edges', () => {
  for (const count of [499, 500]) {
    test(`recipient relation cap is enforced at ${count} rows`, async ({ page }) => {
      const relations = recipientRelations(count);
      let postCalls = 0;
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (request.method() === 'POST' && url.pathname.endsWith('/mail_templates/1/recipients')) {
          postCalls += 1;
        }
      });

      await installMock(page, {
        'GET mail_templates/1/recipients': () => ({
          recipients: relations,
          _meta: { total_count: relations.length },
        }),
      });

      await page.goto('/admin/mailer/templates/1');
      const add = page.getByTestId('admin.mailer.templates.detail.recipients.add');
      const warning = page.getByTestId('admin.mailer.templates.detail.recipients.fetch_limit_notice');

      if (count === 500) {
        await expect(warning).toBeVisible();
        await expect(add).toBeDisabled();
        await add.evaluate((button) => (button as HTMLButtonElement).click());
      } else {
        await expect(warning).toHaveCount(0);
        await expect(add).toBeEnabled();
      }
      expect(postCalls).toBe(0);
    });
  }

  test('persisted recipient recovery stays reachable at the 500-relation cap', async ({ page }) => {
    const relations = recipientRelations(500);
    let postCalls = 0;
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (request.method() === 'POST' && (
        url.pathname.endsWith('/mail_recipients')
        || url.pathname.endsWith('/mail_templates/1/recipients')
      )) postCalls += 1;
    });
    await page.addInitScript(() => {
      const key = 'webui-next.mailer.mail-template-recipient.v2.1.1';
      if (!window.sessionStorage.getItem(key)) {
        window.sessionStorage.setItem(key, JSON.stringify({
          draft: {
            label: 'Uncertain capped recipient',
            to: 'uncertain-cap@example.test',
            cc: '',
            bcc: '',
          },
          recovery: { phase: 'create_uncertain' },
          existingLinkUncertainRecipientId: null,
        }));
      }
    });

    await installMock(page, {
      'GET mail_templates/1/recipients': () => ({
        recipients: relations,
        _meta: { total_count: relations.length },
      }),
      'GET mail_recipients': () => ({ mail_recipients: [], _meta: { total_count: 0 } }),
    });

    await page.goto('/admin/mailer/templates/1');
    const add = page.getByTestId('admin.mailer.templates.detail.recipients.add');
    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.fetch_limit_notice')).toBeVisible();
    await expect(add).toBeEnabled();
    await add.click();

    const recovery = page.getByTestId('admin.mailer.templates.detail.recipients.modal.create.uncertain');
    await expect(recovery).toBeVisible();
    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.modal.create')).toBeDisabled();
    await recovery.getByTestId('admin.mailer.templates.detail.recipients.modal.create.uncertain.reviewed').click();
    const confirm = recovery.getByTestId('admin.mailer.templates.detail.recipients.modal.create.uncertain.reviewed.confirm');
    await expect(confirm).toBeFocused();
    await confirm.click();
    await expect(recovery).toHaveCount(0);
    const cancel = page.getByTestId('admin.mailer.templates.detail.recipients.modal.cancel');
    await expect(cancel).toBeFocused();
    await cancel.click();
    await expect(add).toBeDisabled();

    await page.evaluate(() => {
      window.sessionStorage.setItem(
        'webui-next.mailer.mail-template-recipient.v2.1.1',
        JSON.stringify({
          draft: {
            label: 'Created but not linked',
            to: 'link-retry-cap@example.test',
            cc: '',
            bcc: '',
          },
          recovery: { phase: 'link_retry', recipientId: 900 },
          existingLinkUncertainRecipientId: null,
        }),
      );
    });
    await page.reload();
    await expect(add).toBeEnabled();
    await add.click();
    const linkRetry = page.getByTestId('admin.mailer.templates.detail.recipients.modal.create.link_retry');
    await expect(linkRetry).toBeVisible();
    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.modal.create')).toBeDisabled();
    const reset = page.getByTestId('admin.mailer.templates.detail.recipients.modal.create.reset');
    await expect(reset).toBeEnabled();
    await reset.click();
    await expect(linkRetry).toHaveCount(0);
    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.modal.cancel')).toBeFocused();
    expect(postCalls).toBe(0);
  });

  test('recipient picker explains both an empty registry and a search with no match', async ({ page }) => {
    let recipients: any[] = [];
    await installMock(page, {
      'GET mail_recipients': () => ({ mail_recipients: recipients, _meta: { total_count: recipients.length } }),
    });

    await page.goto('/admin/mailer/templates/1');
    await page.getByTestId('admin.mailer.templates.detail.recipients.add').click();
    const empty = page.getByTestId('admin.mailer.templates.detail.recipients.modal.empty');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText(/no items to show here yet/i);
    await page.getByTestId('admin.mailer.templates.detail.recipients.modal.cancel').click();

    recipients = [{ id: 66, label: 'Operations', to: 'ops@example.test', cc: '', bcc: '' }];
    await page.reload();
    await page.getByTestId('admin.mailer.templates.detail.recipients.add').click();
    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.modal.pick.66')).toBeVisible();
    await page.getByTestId('admin.mailer.templates.detail.recipients.modal.search').fill('no-such-recipient');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText(/no items match/i);
  });

  for (const count of [499, 500]) {
    test(`translation relation cap is enforced at ${count} rows`, async ({ page }) => {
      const translations = translationList(count);
      const languages = [english, { id: 2, code: 'cs', label: 'Czech' }];
      let postCalls = 0;
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (request.method() === 'POST' && url.pathname.endsWith('/mail_templates/1/translations')) {
          postCalls += 1;
        }
      });

      await installMock(page, {
        'GET languages': () => ({ languages, _meta: { total_count: languages.length } }),
        'GET mail_templates/1/translations': () => ({
          translations,
          _meta: { total_count: translations.length },
        }),
      });

      await page.goto('/admin/mailer/templates/1');
      const add = page.getByTestId('admin.mailer.templates.detail.translations.add');
      const warning = page.getByTestId('admin.mailer.templates.detail.translations.fetch_limit_notice');

      if (count === 500) {
        await expect(warning).toBeVisible();
        await expect(add).toBeDisabled();
        await add.evaluate((button) => (button as HTMLButtonElement).click());
      } else {
        await expect(warning).toHaveCount(0);
        await expect(add).toBeEnabled();
      }
      expect(postCalls).toBe(0);
    });
  }

  for (const count of [499, 500]) {
    test(`language cap is enforced at ${count} rows`, async ({ page }) => {
      const languages = languageList(count);
      let postCalls = 0;
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (request.method() === 'POST' && url.pathname.endsWith('/mail_templates/1/translations')) {
          postCalls += 1;
        }
      });

      await installMock(page, {
        'GET languages': () => ({ languages, _meta: { total_count: languages.length } }),
      });

      await page.goto('/admin/mailer/templates/1');
      const add = page.getByTestId('admin.mailer.templates.detail.translations.add');
      const warning = page.getByTestId('admin.mailer.templates.detail.translations.fetch_limit_notice');

      if (count === 500) {
        await expect(warning).toBeVisible();
        await expect(add).toBeDisabled();
        await add.evaluate((button) => (button as HTMLButtonElement).click());
      } else {
        await expect(warning).toHaveCount(0);
        await expect(add).toBeEnabled();
      }
      expect(postCalls).toBe(0);
    });
  }

  test('a definitive existing-recipient link failure stays retryable without creating a recipient', async ({ page }) => {
    const recipient = { id: 66, label: 'Existing ops', to: 'ops@example.test', cc: '', bcc: '' };
    let relations: any[] = [];
    let linkCalls = 0;
    let createCalls = 0;

    await installMock(page, {
      'GET mail_recipients': () => ({ mail_recipients: [recipient], _meta: { total_count: 1 } }),
      'GET mail_templates/1/recipients': () => ({ recipients: relations, _meta: { total_count: relations.length } }),
      'POST mail_recipients': () => {
        createCalls += 1;
        return { mail_recipient: { id: 999 } };
      },
      'POST mail_templates/1/recipients': ({ reqJson }) => {
        linkCalls += 1;
        if (linkCalls === 1) {
          return {
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({ status: false, message: 'link forbidden', response: null }),
          };
        }
        relations = [{ id: 701, mail_recipient: recipient }];
        return { recipient: { id: 701, mail_recipient: recipient }, request: reqJson };
      },
    });

    await page.goto('/admin/mailer/templates/1');
    await page.getByTestId('admin.mailer.templates.detail.recipients.add').click();
    const picker = page.getByTestId('admin.mailer.templates.detail.recipients.modal.pick.66');
    const add = page.getByTestId('admin.mailer.templates.detail.recipients.modal.add');
    await picker.click();
    await add.click();

    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.modal')).toContainText('link forbidden');
    await expect(picker).toHaveAttribute('aria-pressed', 'true');
    await expect(add).toBeEnabled();
    expect(linkCalls).toBe(1);
    expect(createCalls).toBe(0);

    await add.dblclick();
    await expect.poll(() => linkCalls).toBe(2);
    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.modal')).toHaveCount(0);
    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.table')).toContainText('Existing ops');
    expect(createCalls).toBe(0);
  });

  test('an ambiguous existing-recipient link remains locked across reload until explicit review', async ({ page }) => {
    const recipient = { id: 67, label: 'Existing finance', to: 'finance@example.test', cc: '', bcc: '' };
    let linkCalls = 0;

    await installMock(page, {
      'GET mail_recipients': () => ({ mail_recipients: [recipient], _meta: { total_count: 1 } }),
      'POST mail_templates/1/recipients': () => {
        linkCalls += 1;
        return {
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ status: false, message: 'link response lost', response: null }),
        };
      },
    });

    await page.goto('/admin/mailer/templates/1');
    await page.getByTestId('admin.mailer.templates.detail.recipients.add').click();
    await page.getByTestId('admin.mailer.templates.detail.recipients.modal.pick.67').click();
    await page.getByTestId('admin.mailer.templates.detail.recipients.modal.add').dblclick();
    await expect.poll(() => linkCalls).toBe(1);
    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.modal.existing_link_uncertain')).toBeVisible();

    await page.reload();
    await page.getByTestId('admin.mailer.templates.detail.recipients.add').click();
    const guard = page.getByTestId('admin.mailer.templates.detail.recipients.modal.existing_link_uncertain');
    await expect(guard).toBeVisible();
    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.modal.add')).toBeDisabled();
    expect(linkCalls).toBe(1);

    await page.getByTestId('admin.mailer.templates.detail.recipients.modal.existing_link_uncertain.reviewed').click();
    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.modal.existing_link_uncertain.reviewed.confirmation')).toBeVisible();
    await page.getByTestId('admin.mailer.templates.detail.recipients.modal.existing_link_uncertain.reviewed.confirm').click();
    await expect(guard).toHaveCount(0);
    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.modal.pick.67')).toBeEnabled();
    expect(linkCalls).toBe(1);
  });

  test('a lost unlink response is reconciled from the complete relation list without a retry', async ({ page }) => {
    const recipient = { id: 68, label: 'Remove safely', to: 'remove@example.test', cc: '', bcc: '' };
    let relations: any[] = [{ id: 702, mail_recipient: recipient }];
    let deleteCalls = 0;

    await installMock(page, {
      'GET mail_templates/1/recipients': () => ({ recipients: relations, _meta: { total_count: relations.length } }),
      'DELETE mail_templates/1/recipients/68': () => {
        deleteCalls += 1;
        relations = [];
        return {
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ status: false, message: 'unlink response lost', response: null }),
        };
      },
    });

    await page.goto('/admin/mailer/templates/1');
    await page.getByTestId('admin.mailer.templates.detail.recipients.remove.68').click();
    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.remove_confirm.target')).toContainText('Remove safely (#68)');
    await page.getByTestId('admin.mailer.templates.detail.recipients.remove_confirm.confirm').dblclick();

    await expect.poll(() => deleteCalls).toBe(1);
    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.remove_confirm')).toHaveCount(0);
    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.remove.68')).toHaveCount(0);
    expect(deleteCalls).toBe(1);
  });

  test('remove-recipient confirmation names its target and does not reuse an earlier error', async ({ page }) => {
    const first = { id: 68, label: 'First recipient', to: 'first@example.test', cc: '', bcc: '' };
    const second = { id: 69, label: 'Second recipient', to: 'second@example.test', cc: '', bcc: '' };
    const relations = [
      { id: 702, mail_recipient: first },
      { id: 703, mail_recipient: second },
    ];
    await installMock(page, {
      'GET mail_templates/1/recipients': () => ({ recipients: relations, _meta: { total_count: relations.length } }),
      'DELETE mail_templates/1/recipients/68': () => ({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ status: false, message: 'first unlink denied', response: null }),
      }),
    });

    await page.goto('/admin/mailer/templates/1');
    await page.getByTestId('admin.mailer.templates.detail.recipients.remove.68').click();
    const dialog = page.getByTestId('admin.mailer.templates.detail.recipients.remove_confirm');
    await expect(dialog.getByTestId('admin.mailer.templates.detail.recipients.remove_confirm.target')).toContainText('First recipient (#68)');
    await dialog.getByTestId('admin.mailer.templates.detail.recipients.remove_confirm.confirm').click();
    await expect(dialog.getByTestId('admin.mailer.templates.detail.recipients.remove_error')).toContainText('first unlink denied');
    await dialog.getByTestId('admin.mailer.templates.detail.recipients.remove_confirm.cancel').click();

    await page.getByTestId('admin.mailer.templates.detail.recipients.remove.69').click();
    await expect(dialog.getByTestId('admin.mailer.templates.detail.recipients.remove_confirm.target')).toContainText('Second recipient (#69)');
    await expect(dialog.getByTestId('admin.mailer.templates.detail.recipients.remove_error')).toHaveCount(0);
  });

  test('translation save preflight blocks overwriting a newer server version', async ({ page }) => {
    let translation = {
      id: 101,
      language: english,
      from: 'old@example.test',
      reply_to: null,
      return_path: null,
      subject: 'Original subject',
      text_plain: 'Original body',
      text_html: null,
      created_at: '2026-09-01T09:00:00Z',
      updated_at: '2026-09-01T09:00:00Z',
    };
    let putCalls = 0;

    await installMock(page, {
      'GET mail_templates/1/translations/101': () => ({ translation }),
      'PUT mail_templates/1/translations/101': ({ reqJson }) => {
        putCalls += 1;
        translation = {
          ...translation,
          ...((reqJson as any)?.translation ?? {}),
          updated_at: '2026-09-03T13:00:00Z',
        };
        return { translation };
      },
    });

    await page.goto('/admin/mailer/templates/1/translations/101');
    await page.getByTestId('admin.mailer.templates.translation.detail.enable_editing').click();
    await page.getByTestId('admin.mailer.templates.translation.detail.enable_editing_confirm.confirm').click();
    const subject = page.getByTestId('admin.mailer.templates.translation.detail.subject');
    const save = page.getByTestId('admin.mailer.templates.translation.detail.save');
    await subject.fill('My unsaved draft');

    translation = {
      ...translation,
      subject: 'Changed by another admin',
      updated_at: '2026-09-03T12:30:00Z',
    };
    await save.click();

    await expect(page.getByTestId('admin.mailer.templates.translation.detail.stale')).toBeVisible();
    await expect(save).toBeDisabled();
    await expect(subject).toHaveValue('My unsaved draft');
    expect(putCalls).toBe(0);

    await page.getByTestId('admin.mailer.templates.translation.detail.stale.reset').click();
    await expect(subject).toHaveValue('Changed by another admin');
    await subject.fill('Reviewed update');
    await save.dblclick();
    await expect.poll(() => putCalls).toBe(1);
    await expect(subject).toHaveValue('Reviewed update');
  });

  test('a lost translation-delete response is reconciled by a 404 readback', async ({ page }) => {
    let exists = true;
    let deleteCalls = 0;
    const translation = {
      id: 101,
      language: english,
      from: 'delete@example.test',
      subject: 'Delete me',
      text_plain: 'Body',
      text_html: null,
      created_at: '2026-09-01T09:00:00Z',
      updated_at: '2026-09-01T09:00:00Z',
    };

    await installMock(page, {
      'GET mail_templates/1/translations/101': () => exists
        ? { translation }
        : {
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ status: false, message: 'translation not found', response: null }),
          },
      'DELETE mail_templates/1/translations/101': () => {
        deleteCalls += 1;
        exists = false;
        return {
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ status: false, message: 'delete response lost', response: null }),
        };
      },
    });

    await page.goto('/admin/mailer/templates/1/translations/101');
    await page.getByTestId('admin.mailer.templates.translation.detail.enable_editing').click();
    await page.getByTestId('admin.mailer.templates.translation.detail.enable_editing_confirm.confirm').click();
    await page.getByTestId('admin.mailer.templates.translation.detail.delete').click();
    await page.getByTestId('admin.mailer.templates.translation.detail.delete_confirm.confirm').dblclick();

    await expect.poll(() => deleteCalls).toBe(1);
    await expect(page).toHaveURL(/\/admin\/mailer\/templates\/1$/);
    expect(deleteCalls).toBe(1);
  });
});
