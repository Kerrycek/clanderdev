import { expect, test, type Page } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

const languages = [
  { id: 1, code: 'en', label: 'English' },
  { id: 2, code: 'cs', label: 'Čeština' },
];

interface TestMailTemplate {
  id: number;
  name: string;
  label: string;
  template_id: string;
  user_visibility: string;
  updated_at: string;
}

function welcomeTemplate(): TestMailTemplate {
  return {
    id: 1,
    name: 'welcome',
    label: 'Welcome mail',
    template_id: 'welcome',
    user_visibility: 'visible',
    updated_at: '2026-09-01T12:00:00Z',
  };
}

async function installMailerMock(
  page: Page,
  state: { templates: TestMailTemplate[] },
  handlers: Record<string, (ctx: any) => unknown | Promise<unknown>> = {},
) {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'MAILER_TEMPLATE_CRUD' });
  await installHaveApiMock(page, {
    user: { id: 1, login: 'mailer-admin', level: 100 },
    handlers: {
      'GET languages': () => ({ languages, _meta: { total_count: languages.length } }),
      'GET mail_templates': () => ({
        mail_templates: state.templates,
        _meta: { total_count: state.templates.length },
      }),
      'GET mail_templates/1': () => ({ mail_template: state.templates.find((tpl) => tpl.id === 1) }),
      'GET mail_templates/1/recipients': () => ({ recipients: [], _meta: { total_count: 0 } }),
      'GET mail_templates/1/translations': () => ({ translations: [], _meta: { total_count: 0 } }),
      'GET mail_templates/3': () => ({ mail_template: state.templates.find((tpl) => tpl.id === 3) }),
      'GET mail_templates/3/recipients': () => ({ recipients: [], _meta: { total_count: 0 } }),
      'GET mail_templates/3/translations': () => ({ translations: [], _meta: { total_count: 0 } }),
      ...handlers,
    },
  });

}

async function fillEditor(
  page: Page,
  values: { name: string; label: string; templateId: string; userVisibility: string },
) {
  await page.getByTestId('admin.mailer.template.editor.name').fill(values.name);
  await page.getByTestId('admin.mailer.template.editor.label').fill(values.label);
  await page.getByTestId('admin.mailer.template.editor.template_id').fill(values.templateId);
  await page
    .getByTestId('admin.mailer.template.editor.user_visibility')
    .selectOption(values.userVisibility);
}

test.describe('Admin mail template CRUD', () => {
  test('an uncertain template create is reconciled without a blind duplicate POST', async ({ page }) => {
    const state = { templates: [welcomeTemplate()] };
    let postCalls = 0;

    await installMailerMock(page, state, {
      'POST mail_templates': ({ reqJson }) => {
        postCalls += 1;
        state.templates = [...state.templates, {
          id: 3,
          name: String((reqJson as any)?.mail_template?.name),
          label: String((reqJson as any)?.mail_template?.label),
          template_id: String((reqJson as any)?.mail_template?.template_id),
          user_visibility: String((reqJson as any)?.mail_template?.user_visibility),
          updated_at: '2026-09-03T12:00:00Z',
        }];
        return {
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ status: false, message: 'template response was lost', response: null }),
        };
      },
    });

    await page.goto('/admin/mailer/templates');
    await page.getByTestId('admin.mailer.templates.create').click();
    await fillEditor(page, {
      name: 'ambiguous_create',
      label: 'Ambiguous create',
      templateId: 'ambiguous-create',
      userVisibility: 'visible',
    });
    await page.getByTestId('admin.mailer.template.editor.submit').dblclick();

    await expect.poll(() => postCalls).toBe(1);
    await expect(page.getByTestId('admin.mailer.template.editor')).toHaveCount(0);
    await expect(page.getByTestId('admin.mailer.templates.create.indeterminate')).toBeVisible();
    const create = page.getByTestId('admin.mailer.templates.create');
    await expect(create).toBeDisabled();
    await create.evaluate((button) => (button as HTMLButtonElement).click());
    await page.waitForTimeout(100);
    expect(postCalls).toBe(1);

    await page.reload();
    await expect(page.getByTestId('admin.mailer.templates.create.indeterminate')).toBeVisible();
    await expect(page.getByTestId('admin.mailer.templates.create')).toBeDisabled();
    expect(postCalls).toBe(1);

    await page.getByTestId('admin.mailer.templates.create.indeterminate.verify').click();
    await expect(page.getByTestId('admin.mailer.templates.create.indeterminate.found')).toBeVisible();
    await expect(page.getByTestId('admin.mailer.templates.create.indeterminate.open')).toBeVisible();
    expect(postCalls).toBe(1);
  });

  test('list sends only the supported mail_template pagination parameters', async ({ page }) => {
    const state = { templates: [welcomeTemplate()] };
    const indexRequests: URL[] = [];

    await installMailerMock(page, state, {
      'GET mail_templates': ({ url }) => {
        indexRequests.push(new URL(url));
        return { mail_templates: state.templates, _meta: { total_count: state.templates.length } };
      },
    });

    await page.goto(
      '/admin/mailer/templates?limit=25&page=2&from_id=91&q=welcome&template_id=welcome&user_visibility=visible&role=admin&public=true&language=2',
    );
    await expect(page.getByTestId('admin.mailer.templates.page')).toBeVisible();
    await expect.poll(() => indexRequests.length).toBeGreaterThan(0);

    for (const requestUrl of indexRequests) {
      const queryKeys = [...requestUrl.searchParams.keys()];
      expect(queryKeys.length).toBeGreaterThan(0);
      expect(queryKeys.every((key) => [
        'mail_template[limit]',
        'mail_template[from_id]',
      ].includes(key))).toBe(true);

      for (const unsupported of ['q', 'template_id', 'user_visibility', 'role', 'public', 'language']) {
        expect(requestUrl.searchParams.get(unsupported)).toBeNull();
        expect(requestUrl.searchParams.get(`mail_template[${unsupported}]`)).toBeNull();
      }
    }
  });

  test('@pr-smoke @pr-smoke-mobile validates, creates and safely edits a template with exact single mutations', async ({ page }) => {
    const state = { templates: [welcomeTemplate()] };
    const postPayloads: unknown[] = [];
    const putPayloads: unknown[] = [];
    let deleteCalls = 0;

    await installMailerMock(page, state, {
      'POST mail_templates': async ({ reqJson }) => {
        postPayloads.push(reqJson);
        await new Promise((resolve) => setTimeout(resolve, 100));
        const created: TestMailTemplate = {
          ...welcomeTemplate(),
          id: 3,
          name: 'password_reset',
          label: 'Password reset',
          template_id: 'password-reset-v2',
          user_visibility: 'visible',
          updated_at: '2026-09-02T10:00:00Z',
        };
        state.templates = [...state.templates, created];
        return { mail_template: created };
      },
      'PUT mail_templates/3': async ({ reqJson }) => {
        putPayloads.push(reqJson);
        await new Promise((resolve) => setTimeout(resolve, 100));
        const changes = (reqJson as any)?.mail_template ?? {};
        state.templates = state.templates.map((tpl) => (
          tpl.id === 3
            ? { ...tpl, ...changes, updated_at: '2026-09-02T11:00:00Z' }
            : tpl
        ));
        return { mail_template: state.templates.find((tpl) => tpl.id === 3) };
      },
      'DELETE mail_templates/3': () => {
        deleteCalls += 1;
        return null;
      },
    });

    await page.goto('/admin/mailer/templates');
    await page.getByTestId('admin.mailer.templates.create').click();
    const editor = page.getByTestId('admin.mailer.template.editor');
    await expect(editor).toBeVisible();

    await page.getByTestId('admin.mailer.template.editor.submit').click();
    await expect(page.getByTestId('admin.mailer.template.editor.error')).toBeVisible();
    expect(postPayloads).toEqual([]);

    await fillEditor(page, {
      name: 'password_reset',
      label: 'Password reset',
      templateId: 'password-reset-v2',
      userVisibility: 'visible',
    });
    await page.getByTestId('admin.mailer.template.editor.submit').dblclick();

    await expect.poll(() => postPayloads).toEqual([{
      mail_template: {
        name: 'password_reset',
        label: 'Password reset',
        template_id: 'password-reset-v2',
        user_visibility: 'visible',
      },
    }]);
    await expect(page).toHaveURL(/\/admin\/mailer\/templates\/3$/);
    await expect(editor).toHaveCount(0);
    const detail = page.getByTestId('admin.mailer.templates.detail');
    await expect(detail).toContainText('password_reset');
    await expect(detail).toContainText('Password reset');
    await expect(detail).toContainText('password-reset-v2');

    await page.getByTestId('admin.mailer.templates.detail.edit').click();
    await expect(editor).toBeVisible();
    await expect(page.getByTestId('admin.mailer.template.editor.name')).toHaveValue('password_reset');
    await expect(page.getByTestId('admin.mailer.template.editor.name')).toBeDisabled();
    await expect(page.getByTestId('admin.mailer.template.editor.template_id')).toBeDisabled();
    await expect(page.getByTestId('admin.mailer.template.editor.identifiers_locked')).toBeVisible();
    await page.getByTestId('admin.mailer.template.editor.label').fill('Password reset v2');
    await page.getByTestId('admin.mailer.template.editor.user_visibility').selectOption('invisible');
    await page.getByTestId('admin.mailer.template.editor.submit').dblclick();

    await expect.poll(() => putPayloads).toEqual([{
      mail_template: {
        label: 'Password reset v2',
        user_visibility: 'invisible',
      },
    }]);
    await expect(editor).toHaveCount(0);
    await expect(detail).toContainText('password_reset');
    await expect(detail).toContainText('Password reset v2');
    await expect(detail).toContainText('password-reset-v2');
    await expect(page.getByTestId('admin.mailer.templates.detail.delete_blocked')).toBeVisible();
    await expect(page.getByTestId('admin.mailer.templates.detail.delete.blocked')).toBeDisabled();
    await page.getByTestId('admin.mailer.templates.detail.delete.blocked').evaluate((button) => (
      button as HTMLButtonElement
    ).click());
    expect(deleteCalls).toBe(0);
  });

  for (const failure of [
    { status: 409, message: 'template name already exists', title: 'duplicate response' },
    { status: 403, message: 'template creation denied', title: '403 response' },
  ]) {
    test(`create ${failure.title} preserves every draft field`, async ({ page }) => {
      const state = { templates: [welcomeTemplate()] };
      const postPayloads: unknown[] = [];

      await installMailerMock(page, state, {
        'POST mail_templates': ({ reqJson }) => {
          postPayloads.push(reqJson);
          return {
            status: failure.status,
            contentType: 'application/json',
            body: JSON.stringify({
              status: false,
              message: failure.message,
              response: null,
            }),
          };
        },
      });

      await page.goto('/admin/mailer/templates');
      await page.getByTestId('admin.mailer.templates.create').click();
      await fillEditor(page, {
        name: 'welcome_duplicate',
        label: 'Unsaved duplicate label',
        templateId: 'welcome-duplicate',
        userVisibility: 'invisible',
      });
      await page.getByTestId('admin.mailer.template.editor.submit').click();

      await expect.poll(() => postPayloads.length).toBe(1);
      const editor = page.getByTestId('admin.mailer.template.editor');
      await expect(editor).toBeVisible();
      await expect(page.getByTestId('admin.mailer.template.editor.error')).toContainText(failure.message);
      await expect(page.getByTestId('admin.mailer.template.editor.name')).toHaveValue('welcome_duplicate');
      await expect(page.getByTestId('admin.mailer.template.editor.label')).toHaveValue('Unsaved duplicate label');
      await expect(page.getByTestId('admin.mailer.template.editor.template_id')).toHaveValue('welcome-duplicate');
      await expect(page.getByTestId('admin.mailer.template.editor.user_visibility')).toHaveValue('invisible');
      await expect(page).toHaveURL(/\/admin\/mailer\/templates(?:\?.*)?$/);
    });
  }

  test('edit 403 preserves every editable field and the original readback', async ({ page }) => {
    const state = { templates: [welcomeTemplate()] };
    const putPayloads: unknown[] = [];

    await installMailerMock(page, state, {
      'PUT mail_templates/1': ({ reqJson }) => {
        putPayloads.push(reqJson);
        return {
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            status: false,
            message: 'template update denied',
            response: null,
          }),
        };
      },
    });

    await page.goto('/admin/mailer/templates/1');
    await page.getByTestId('admin.mailer.templates.detail.edit').click();
    await expect(page.getByTestId('admin.mailer.template.editor.name')).toBeDisabled();
    await expect(page.getByTestId('admin.mailer.template.editor.template_id')).toBeDisabled();
    await page.getByTestId('admin.mailer.template.editor.label').fill('Unsaved welcome label');
    await page.getByTestId('admin.mailer.template.editor.user_visibility').selectOption('invisible');
    await page.getByTestId('admin.mailer.template.editor.submit').click();

    await expect.poll(() => putPayloads).toEqual([{
      mail_template: {
        label: 'Unsaved welcome label',
        user_visibility: 'invisible',
      },
    }]);
    await expect(page.getByTestId('admin.mailer.template.editor')).toBeVisible();
    await expect(page.getByTestId('admin.mailer.template.editor.error')).toContainText('template update denied');
    await expect(page.getByTestId('admin.mailer.template.editor.name')).toHaveValue('welcome');
    await expect(page.getByTestId('admin.mailer.template.editor.label')).toHaveValue('Unsaved welcome label');
    await expect(page.getByTestId('admin.mailer.template.editor.template_id')).toHaveValue('welcome');
    await expect(page.getByTestId('admin.mailer.template.editor.user_visibility')).toHaveValue('invisible');
    await expect(page.getByTestId('admin.mailer.templates.detail')).toContainText('Welcome mail');
  });

  test('template edit refuses to overwrite a newer server version and can load it explicitly', async ({ page }) => {
    const state = { templates: [welcomeTemplate()] };
    const putPayloads: unknown[] = [];

    await installMailerMock(page, state, {
      'PUT mail_templates/1': ({ reqJson }) => {
        putPayloads.push(reqJson);
        const changes = (reqJson as any)?.mail_template ?? {};
        state.templates = [{
          ...state.templates[0]!,
          ...changes,
          updated_at: '2026-09-03T13:00:00Z',
        }];
        return { mail_template: state.templates[0] };
      },
    });

    await page.goto('/admin/mailer/templates/1');
    await page.getByTestId('admin.mailer.templates.detail.edit').click();
    await page.getByTestId('admin.mailer.template.editor.label').fill('My stale draft');

    state.templates = [{
      ...state.templates[0]!,
      label: 'Changed by another admin',
      user_visibility: 'invisible',
      updated_at: '2026-09-03T12:30:00Z',
    }];

    await page.getByTestId('admin.mailer.template.editor.submit').click();
    await expect(page.getByTestId('admin.mailer.template.editor.stale')).toBeVisible();
    await expect(page.getByTestId('admin.mailer.template.editor.label')).toHaveValue('My stale draft');
    await expect(page.getByTestId('admin.mailer.template.editor.submit')).toBeDisabled();
    expect(putPayloads).toEqual([]);

    await page.getByTestId('admin.mailer.template.editor.stale.reset').click();
    await expect(page.getByTestId('admin.mailer.template.editor.stale')).toHaveCount(0);
    await expect(page.getByTestId('admin.mailer.template.editor.label')).toHaveValue('Changed by another admin');
    await expect(page.getByTestId('admin.mailer.template.editor.user_visibility')).toHaveValue('invisible');
    await page.getByTestId('admin.mailer.template.editor.label').fill('Reviewed final label');
    await page.getByTestId('admin.mailer.template.editor.submit').click();

    await expect.poll(() => putPayloads).toEqual([{
      mail_template: {
        label: 'Reviewed final label',
        user_visibility: 'invisible',
      },
    }]);
    await expect(page.getByTestId('admin.mailer.template.editor')).toHaveCount(0);
  });

  test('new translation requires language, from and subject and sends the exact payload', async ({ page }) => {
    const state = { templates: [welcomeTemplate()] };
    const postPayloads: unknown[] = [];
    let translations: any[] = [{
      id: 100,
      language: languages[0],
      from: 'existing@example.test',
      subject: 'Existing English translation',
      created_at: '2026-09-02T09:00:00Z',
      updated_at: '2026-09-02T09:00:00Z',
    }];

    await installMailerMock(page, state, {
      'GET mail_templates/1/translations': () => ({
        translations,
        _meta: { total_count: translations.length },
      }),
      'POST mail_templates/1/translations': async ({ reqJson }) => {
        postPayloads.push(reqJson);
        await new Promise((resolve) => setTimeout(resolve, 100));
        const created = {
          id: 101,
          language: languages.find((language) => language.id === Number((reqJson as any)?.translation?.language)),
          ...((reqJson as any)?.translation ?? {}),
          created_at: '2026-09-03T09:00:00Z',
          updated_at: '2026-09-03T09:00:00Z',
        };
        translations = [...translations, created];
        return { translation: created };
      },
    });

    await page.goto('/admin/mailer/templates/1');
    await page.getByTestId('admin.mailer.templates.detail.translations.add').click();
    await expect(page.getByTestId('admin.mailer.templates.detail.translations.add_confirm')).toBeVisible();
    await page.getByTestId('admin.mailer.templates.detail.translations.add_confirm.confirm').click();

    const modal = page.getByTestId('admin.mailer.templates.detail.translations.modal');
    const create = page.getByTestId('admin.mailer.templates.detail.translations.modal.create');
    const language = page.getByTestId('admin.mailer.templates.detail.translations.modal.language');
    const from = page.getByTestId('admin.mailer.templates.detail.translations.modal.from');
    const subject = page.getByTestId('admin.mailer.templates.detail.translations.modal.subject');
    await expect(modal).toBeVisible();
    await expect(create).toBeDisabled();
    await expect(language.locator('option[value="1"]')).toHaveCount(0);
    await expect(language.locator('option[value="2"]')).toHaveCount(1);

    await language.selectOption('2');
    await from.fill('discarded@example.test');
    await subject.fill('Discard this draft');
    await modal.getByRole('button', { name: /cancel/i }).click();
    await page.getByTestId('admin.mailer.templates.detail.translations.add').click();
    await page.getByTestId('admin.mailer.templates.detail.translations.add_confirm.confirm').click();
    await expect(language).toHaveValue('');
    await expect(from).toHaveValue('');
    await expect(subject).toHaveValue('');
    await expect(create).toBeDisabled();

    await from.fill('noreply@example.test');
    await subject.fill('Reset your password');
    await expect(create).toBeDisabled();
    await language.selectOption('2');
    await expect(create).toBeEnabled();
    await from.fill('');
    await expect(create).toBeDisabled();
    await from.fill('noreply@example.test');
    await subject.fill('');
    await expect(create).toBeDisabled();
    await subject.fill('Reset your password');
    await expect(create).toBeEnabled();
    expect(postPayloads).toEqual([]);

    await create.click();

    await expect.poll(() => postPayloads).toEqual([{
      translation: {
        language: 2,
        from: 'noreply@example.test',
        reply_to: null,
        return_path: null,
        subject: 'Reset your password',
      },
    }]);
    await expect(modal).toHaveCount(0);
    await expect(page.getByTestId('admin.mailer.templates.detail.translation.101')).toContainText('Reset your password');
  });

  test('translation edit blocks empty required fields and clears optional addresses with null', async ({ page }) => {
    const state = { templates: [welcomeTemplate()] };
    const putPayloads: unknown[] = [];
    let translation = {
      id: 101,
      language: languages[0],
      from: 'old-from@example.test',
      reply_to: 'old-reply@example.test',
      return_path: 'old-return@example.test',
      subject: 'Original subject',
      text_plain: 'Original plain body',
      text_html: '<p>Original HTML body</p>',
      created_at: '2026-09-01T09:00:00Z',
      updated_at: '2026-09-01T09:00:00Z',
    };

    await installMailerMock(page, state, {
      'GET mail_templates/1/translations/101': () => ({ translation }),
      'PUT mail_templates/1/translations/101': async ({ reqJson }) => {
        putPayloads.push(reqJson);
        await new Promise((resolve) => setTimeout(resolve, 100));
        translation = {
          ...translation,
          ...((reqJson as any)?.translation ?? {}),
          updated_at: '2026-09-03T10:00:00Z',
        };
        return { translation };
      },
    });

    await page.goto('/admin/mailer/templates/1/translations/101');
    await page.getByTestId('admin.mailer.templates.translation.detail.enable_editing').click();
    await page.getByTestId('admin.mailer.templates.translation.detail.enable_editing_confirm.confirm').click();

    const save = page.getByTestId('admin.mailer.templates.translation.detail.save');
    const from = page.getByTestId('admin.mailer.templates.translation.detail.from');
    const subject = page.getByTestId('admin.mailer.templates.translation.detail.subject');
    await expect(save).toBeEnabled();
    await from.fill('');
    await expect(save).toBeDisabled();
    expect(putPayloads).toEqual([]);
    await from.fill('new-from@example.test');
    await subject.fill('');
    await expect(save).toBeDisabled();
    expect(putPayloads).toEqual([]);

    await subject.fill('Updated subject');
    await page.getByTestId('admin.mailer.templates.translation.detail.reply_to').fill('');
    await page.getByTestId('admin.mailer.templates.translation.detail.return_path').fill('');
    await page.getByTestId('admin.mailer.templates.translation.detail.text_plain').fill('');
    await page.getByTestId('admin.mailer.templates.translation.detail.text_html').fill('');
    await expect(save).toBeEnabled();
    await save.click();

    await expect.poll(() => putPayloads).toEqual([{
      translation: {
        from: 'new-from@example.test',
        reply_to: null,
        return_path: null,
        subject: 'Updated subject',
        text_plain: null,
        text_html: null,
      },
    }]);
    await expect(from).toHaveValue('new-from@example.test');
    await expect(subject).toHaveValue('Updated subject');
  });

  test('an uncertain translation create is reconciled without a blind duplicate POST', async ({ page }) => {
    const state = { templates: [welcomeTemplate()] };
    let postCalls = 0;
    let translations: any[] = [];

    await installMailerMock(page, state, {
      'GET mail_templates/1/translations': () => ({
        translations,
        _meta: { total_count: translations.length },
      }),
      'POST mail_templates/1/translations': ({ reqJson }) => {
        postCalls += 1;
        const payload = (reqJson as any)?.translation ?? {};
        translations = [{
          id: 101,
          ...payload,
          language: languages.find((language) => language.id === Number(payload.language)),
          created_at: '2026-09-03T12:00:00Z',
          updated_at: '2026-09-03T12:00:00Z',
        }];
        return {
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ status: false, message: 'translation response was lost', response: null }),
        };
      },
    });

    await page.goto('/admin/mailer/templates/1');
    await page.getByTestId('admin.mailer.templates.detail.translations.add').click();
    await page.getByTestId('admin.mailer.templates.detail.translations.add_confirm.confirm').click();
    await page.getByTestId('admin.mailer.templates.detail.translations.modal.language').selectOption('1');
    await page.getByTestId('admin.mailer.templates.detail.translations.modal.from').fill('noreply@example.test');
    await page.getByTestId('admin.mailer.templates.detail.translations.modal.subject').fill('Ambiguous translation');
    await page.getByTestId('admin.mailer.templates.detail.translations.modal.create').dblclick();

    await expect.poll(() => postCalls).toBe(1);
    await expect(page.getByTestId('admin.mailer.templates.detail.translations.modal')).toHaveCount(0);
    await expect(page.getByTestId('admin.mailer.templates.detail.translations.indeterminate')).toBeVisible();
    const add = page.getByTestId('admin.mailer.templates.detail.translations.add');
    await expect(add).toBeDisabled();
    await add.evaluate((button) => (button as HTMLButtonElement).click());
    await page.waitForTimeout(100);
    expect(postCalls).toBe(1);

    await page.reload();
    await expect(page.getByTestId('admin.mailer.templates.detail.translations.indeterminate')).toBeVisible();
    await expect(page.getByTestId('admin.mailer.templates.detail.translations.add')).toBeDisabled();
    expect(postCalls).toBe(1);

    await page.getByTestId('admin.mailer.templates.detail.translations.indeterminate.verify').click();
    await expect(page.getByTestId('admin.mailer.templates.detail.translations.indeterminate.found')).toBeVisible();
    await expect(page.getByTestId('admin.mailer.templates.detail.translations.indeterminate.open')).toBeVisible();
    expect(postCalls).toBe(1);
  });

  test('recipient create-and-add validates both inputs and retries only the failed link step', async ({ page }) => {
    const state = { templates: [welcomeTemplate()] };
    const createPayloads: unknown[] = [];
    const linkPayloads: unknown[] = [];
    const createdRecipient = {
      id: 55,
      label: 'Night operations',
      to: 'night-ops@example.test',
      cc: '',
      bcc: '',
    };
    let templateRecipients: any[] = [];

    await installMailerMock(page, state, {
      'GET mail_recipients': () => ({ mail_recipients: [], _meta: { total_count: 0 } }),
      'GET mail_templates/1/recipients': () => ({
        recipients: templateRecipients,
        _meta: { total_count: templateRecipients.length },
      }),
      'POST mail_recipients': async ({ reqJson }) => {
        createPayloads.push(reqJson);
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { mail_recipient: createdRecipient };
      },
      'POST mail_templates/1/recipients': async ({ reqJson }) => {
        linkPayloads.push(reqJson);
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (linkPayloads.length === 1) {
          return {
            status: 422,
            contentType: 'application/json',
            body: JSON.stringify({
              status: false,
              message: 'recipient link rejected',
              response: null,
            }),
          };
        }
        const linked = { id: 901, mail_recipient: createdRecipient };
        templateRecipients = [linked];
        return { recipient: linked };
      },
    });

    await page.goto('/admin/mailer/templates/1');
    await page.getByTestId('admin.mailer.templates.detail.recipients.add').click();
    const modal = page.getByTestId('admin.mailer.templates.detail.recipients.modal');
    await expect(modal).toBeVisible();
    await page.getByTestId('admin.mailer.templates.detail.recipients.modal.mode.create').click();

    const label = page.getByTestId('admin.mailer.templates.detail.recipients.modal.create.label');
    const to = page.getByTestId('admin.mailer.templates.detail.recipients.modal.create.to');
    const createAndAdd = page.getByTestId('admin.mailer.templates.detail.recipients.modal.create');
    await expect(createAndAdd).toBeDisabled();
    await label.fill('Night operations');
    await expect(createAndAdd).toBeDisabled();
    await label.fill('');
    await to.fill('night-ops@example.test');
    await expect(createAndAdd).toBeDisabled();
    await label.fill('Night operations');
    await expect(createAndAdd).toBeEnabled();

    await createAndAdd.dblclick();
    await expect.poll(() => createPayloads).toEqual([{
      mail_recipient: {
        label: 'Night operations',
        to: 'night-ops@example.test',
      },
    }]);
    await expect.poll(() => linkPayloads).toEqual([{
      recipient: { mail_recipient: 55 },
    }]);
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('recipient link rejected');
    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.modal.create.link_retry')).toContainText('#55');
    await expect(label).toBeDisabled();
    await expect(to).toBeDisabled();
    await expect(createAndAdd).toContainText(/retry/i);
    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.modal.create.reset')).toBeVisible();

    await page.reload();
    await page.getByTestId('admin.mailer.templates.detail.recipients.add').click();
    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.modal.create.link_retry')).toContainText('#55');
    await expect(label).toBeDisabled();
    await expect(to).toBeDisabled();
    expect(createPayloads).toHaveLength(1);
    expect(linkPayloads).toHaveLength(1);

    await createAndAdd.dblclick();
    await expect.poll(() => linkPayloads).toEqual([
      { recipient: { mail_recipient: 55 } },
      { recipient: { mail_recipient: 55 } },
    ]);
    expect(createPayloads).toHaveLength(1);
    await expect(modal).toHaveCount(0);
    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.table')).toContainText('Night operations');
    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.table')).toContainText('night-ops@example.test');
  });

  test('an uncertain recipient link is locked and never retried blindly', async ({ page }) => {
    const state = { templates: [welcomeTemplate()] };
    let createCalls = 0;
    let linkCalls = 0;

    await installMailerMock(page, state, {
      'GET mail_recipients': () => ({ mail_recipients: [], _meta: { total_count: 0 } }),
      'POST mail_recipients': () => {
        createCalls += 1;
        return {
          mail_recipient: {
            id: 56,
            label: 'Ambiguous link recipient',
            to: 'ambiguous-link@example.test',
          },
        };
      },
      'POST mail_templates/1/recipients': async () => {
        linkCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 100));
        return {
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            status: false,
            message: 'recipient link response was lost',
            response: null,
          }),
        };
      },
    });

    await page.goto('/admin/mailer/templates/1');
    await page.getByTestId('admin.mailer.templates.detail.recipients.add').click();
    await page.getByTestId('admin.mailer.templates.detail.recipients.modal.mode.create').click();
    const createAndAdd = page.getByTestId('admin.mailer.templates.detail.recipients.modal.create');
    await page.getByTestId('admin.mailer.templates.detail.recipients.modal.create.label').fill('Ambiguous link recipient');
    await page.getByTestId('admin.mailer.templates.detail.recipients.modal.create.to').fill('ambiguous-link@example.test');
    await createAndAdd.dblclick();

    await expect.poll(() => ({ createCalls, linkCalls })).toEqual({ createCalls: 1, linkCalls: 1 });
    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.modal.create.link_uncertain')).toContainText('#56');
    await expect(createAndAdd).toBeDisabled();
    await createAndAdd.evaluate((button) => (button as HTMLButtonElement).click());
    await page.waitForTimeout(200);
    expect(createCalls).toBe(1);
    expect(linkCalls).toBe(1);

    await page.reload();
    await page.getByTestId('admin.mailer.templates.detail.recipients.add').click();
    const uncertain = page.getByTestId('admin.mailer.templates.detail.recipients.modal.create.link_uncertain');
    await expect(uncertain).toContainText('#56');
    await expect(createAndAdd).toBeDisabled();
    expect(createCalls).toBe(1);
    expect(linkCalls).toBe(1);

    await page.getByTestId('admin.mailer.templates.detail.recipients.modal.create.link_uncertain.reviewed').click();
    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.modal.create.link_uncertain.reviewed.confirmation')).toBeVisible();
    const confirmUnlock = page.getByTestId('admin.mailer.templates.detail.recipients.modal.create.link_uncertain.reviewed.confirm');
    await expect(confirmUnlock).toBeFocused();
    await confirmUnlock.click();
    const existingMode = page.getByTestId('admin.mailer.templates.detail.recipients.modal.mode.existing');
    await expect(existingMode).toBeEnabled();
    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.modal.mode.create')).toBeFocused();
    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.modal.create.label')).toHaveValue('');
    expect(createCalls).toBe(1);
    expect(linkCalls).toBe(1);
  });

  test('an uncertain recipient create locks the draft and never sends a blind duplicate POST', async ({ page }) => {
    const state = { templates: [welcomeTemplate()] };
    let createCalls = 0;
    let linkCalls = 0;

    await installMailerMock(page, state, {
      'GET mail_recipients': () => ({ mail_recipients: [], _meta: { total_count: 0 } }),
      'POST mail_recipients': async () => {
        createCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 100));
        return {
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            status: false,
            message: 'recipient create response was lost',
            response: null,
          }),
        };
      },
      'POST mail_templates/1/recipients': () => {
        linkCalls += 1;
        return {};
      },
    });

    await page.goto('/admin/mailer/templates/1');
    await page.getByTestId('admin.mailer.templates.detail.recipients.add').click();
    await page.getByTestId('admin.mailer.templates.detail.recipients.modal.mode.create').click();
    const label = page.getByTestId('admin.mailer.templates.detail.recipients.modal.create.label');
    const to = page.getByTestId('admin.mailer.templates.detail.recipients.modal.create.to');
    const createAndAdd = page.getByTestId('admin.mailer.templates.detail.recipients.modal.create');
    await label.fill('Possibly created recipient');
    await to.fill('uncertain@example.test');
    await createAndAdd.dblclick();

    await expect.poll(() => createCalls).toBe(1);
    const uncertain = page.getByTestId('admin.mailer.templates.detail.recipients.modal.create.uncertain');
    await expect(uncertain).toBeVisible();
    await expect(uncertain).toContainText(/safety lock survives reloads/i);
    await expect(label).toBeDisabled();
    await expect(to).toBeDisabled();
    await expect(createAndAdd).toBeDisabled();
    expect(linkCalls).toBe(0);

    // Even a programmatic click cannot turn an ambiguous create into a blind retry.
    await createAndAdd.evaluate((button) => (button as HTMLButtonElement).click());
    await page.waitForTimeout(200);
    expect(createCalls).toBe(1);
    expect(linkCalls).toBe(0);

    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.modal.create.reset')).toHaveCount(0);
    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.modal.mode.existing')).toBeDisabled();
    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.modal.mode.create')).toBeDisabled();
    await expect(label).toHaveValue('Possibly created recipient');
    await expect(to).toHaveValue('uncertain@example.test');
    expect(createCalls).toBe(1);

    await page.reload();
    await page.getByTestId('admin.mailer.templates.detail.recipients.add').click();
    await expect(uncertain).toBeVisible();
    await expect(label).toBeDisabled();
    await expect(to).toBeDisabled();
    await expect(label).toHaveValue('Possibly created recipient');
    await expect(to).toHaveValue('uncertain@example.test');
    await expect(createAndAdd).toBeDisabled();
    expect(createCalls).toBe(1);
    expect(linkCalls).toBe(0);

    // The same persisted create guard is global: leaving this template cannot
    // open a second create surface and accidentally duplicate the recipient.
    await page.goto('/admin/mailer/recipients');
    await expect(page.getByTestId('admin.mailer.recipients.create.indeterminate')).toBeVisible();
    await expect(page.getByTestId('admin.mailer.recipients.create')).toBeDisabled();
    expect(createCalls).toBe(1);

    await page.goto('/admin/mailer/templates/1');
    await page.getByTestId('admin.mailer.templates.detail.recipients.add').click();
    await expect(uncertain).toBeVisible();

    await page.getByTestId('admin.mailer.templates.detail.recipients.modal.create.uncertain.reviewed').click();
    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.modal.create.uncertain.reviewed.confirmation')).toBeVisible();
    const confirmUnlock = page.getByTestId('admin.mailer.templates.detail.recipients.modal.create.uncertain.reviewed.confirm');
    await expect(confirmUnlock).toBeFocused();
    await confirmUnlock.click();
    await expect(label).toBeEnabled();
    await expect(label).toHaveValue('');
    await expect(to).toHaveValue('');
    await expect(page.getByTestId('admin.mailer.templates.detail.recipients.modal.mode.create')).toBeFocused();
    expect(createCalls).toBe(1);
    expect(linkCalls).toBe(0);
  });

});
