import { expect, test, type Page } from '@playwright/test';

import {
  bootstrapVpsAdminWindow,
  installHaveApiMock,
  setUiSettingsLocalStorage,
} from '../../fixtures';

const languages = [
  { id: 1, code: 'en', label: 'English' },
  { id: 2, code: 'cs', label: 'Čeština' },
];

const advisory = {
  id: 77,
  state: 'published',
  name: 'Linux kernel advisory',
  published_at: '2026-08-31T12:00:00.000Z',
  created_at: '2026-08-31T10:00:00.000Z',
  en_summary: 'Kernel vulnerability',
  en_description: 'Affects supported compute nodes.',
  en_response: 'Apply the fixed kernel.',
  cs_summary: 'Zranitelnost kernelu',
  cs_description: 'Týká se podporovaných nodů.',
  cs_response: 'Nasaď opravený kernel.',
};

function initialUpdate() {
  return {
    id: 701,
    security_advisory_id: 77,
    created_at: '2026-08-31T13:00:00.000Z',
    reporter_name: 'security-admin',
    en_summary: 'Original update',
    en_message: 'Original English message.',
    cs_summary: 'Původní aktualizace',
    cs_message: 'Původní česká zpráva.',
  };
}

async function installAdvisoryDetailMock(
  page: Page,
  handlers: Record<string, (ctx: any) => unknown>,
) {
  await setUiSettingsLocalStorage(page, { language: 'en' });
  await bootstrapVpsAdminWindow(page, { sessionToken: 'SECURITY_UPDATE_MUTATIONS' });
  await installHaveApiMock(page, {
    user: { id: 1, login: 'security-admin', level: 100 },
    handlers: {
      'GET languages': () => ({ languages }),
      'GET security_advisories/77': () => ({ security_advisory: advisory }),
      'GET security_advisory_cves': () => ({ security_advisory_cves: [] }),
      'GET nodes': () => ({ nodes: [] }),
      'GET security_advisories/77/node_statuses': () => ({ node_statuses: [] }),
      'GET outage_security_advisories': () => ({ outage_security_advisories: [] }),
      ...handlers,
    },
  });
}

test('@pr-smoke edits and deletes an advisory update with confirmation and refreshed readback', async ({ page }) => {
  let updates = [initialUpdate()];
  const putPayloads: unknown[] = [];
  const deletePayloads: unknown[] = [];
  let deleteCalls = 0;

  await installAdvisoryDetailMock(page, {
    'GET security_advisory_updates': () => ({ security_advisory_updates: updates }),
    'PUT security_advisory_updates/701': ({ reqJson }) => {
      putPayloads.push(reqJson);
      updates = updates.map((update) => ({
        ...update,
        ...((reqJson as any)?.security_advisory_update ?? {}),
      }));
      return { security_advisory_update: updates[0] };
    },
    'DELETE security_advisory_updates/701': ({ reqJson }) => {
      deleteCalls += 1;
      deletePayloads.push(reqJson);
      updates = [];
      return null;
    },
  });

  await page.goto('/admin/security-advisories/77?tab=updates');
  const updateCard = page.getByTestId('admin.security_advisory.update.701');
  await expect(updateCard).toContainText('Original update');

  await page.getByTestId('admin.security_advisory.update.701.edit').click();
  await expect(page.getByTestId('admin.security_advisories.update.editor')).toBeVisible();
  await page.getByTestId('admin.security_advisories.update.editor.en.summary').fill('Edited update');
  await page.getByTestId('admin.security_advisories.update.editor.en.message').fill('Edited English message.');
  await page.getByTestId('admin.security_advisories.update.editor.language.cs').click();
  await page.getByTestId('admin.security_advisories.update.editor.cs.summary').fill('Upravená aktualizace');
  await page.getByTestId('admin.security_advisories.update.editor.cs.message').fill('Upravená česká zpráva.');
  await page.getByTestId('admin.security_advisories.update.editor.save').click();

  await expect.poll(() => putPayloads).toEqual([{
    security_advisory_update: {
      en_summary: 'Edited update',
      en_message: 'Edited English message.',
      cs_summary: 'Upravená aktualizace',
      cs_message: 'Upravená česká zpráva.',
    },
  }]);
  await expect(page.getByTestId('admin.security_advisories.update.editor')).toHaveCount(0);
  await expect(updateCard).toContainText('Edited update');
  await expect(updateCard).toContainText('Edited English message.');

  await page.getByTestId('admin.security_advisory.update.701.delete').click();
  await expect(page.getByTestId('admin.security_advisory.update.delete_confirm')).toBeVisible();
  expect(deleteCalls).toBe(0);
  expect(deletePayloads).toEqual([]);

  await page.getByTestId('admin.security_advisory.update.delete_confirm.confirm').click();
  await expect.poll(() => deleteCalls).toBe(1);
  expect(deletePayloads).toEqual([{}]);
  await expect(page.getByTestId('admin.security_advisory.update.delete_confirm')).toHaveCount(0);
  await expect(updateCard).toHaveCount(0);
});

test('advisory update PUT and DELETE 403 errors preserve the editor, confirmation and data', async ({ page }) => {
  const update = initialUpdate();
  let putCalls = 0;
  let deleteCalls = 0;

  await installAdvisoryDetailMock(page, {
    'GET security_advisory_updates': () => ({ security_advisory_updates: [update] }),
    'PUT security_advisory_updates/701': () => {
      putCalls += 1;
      return {
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ status: false, message: 'update denied', response: null }),
      };
    },
    'DELETE security_advisory_updates/701': () => {
      deleteCalls += 1;
      return {
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ status: false, message: 'delete denied', response: null }),
      };
    },
  });

  await page.goto('/admin/security-advisories/77?tab=updates');
  const updateCard = page.getByTestId('admin.security_advisory.update.701');
  await expect(updateCard).toContainText('Original update');

  await page.getByTestId('admin.security_advisory.update.701.edit').click();
  await page.getByTestId('admin.security_advisories.update.editor.en.summary').fill('Unsaved edit');
  await page.getByTestId('admin.security_advisories.update.editor.save').click();

  await expect.poll(() => putCalls).toBe(1);
  const editor = page.getByTestId('admin.security_advisories.update.editor');
  await expect(editor).toBeVisible();
  await expect(editor).toContainText('update denied');
  await expect(page.getByTestId('admin.security_advisories.update.editor.en.summary')).toHaveValue('Unsaved edit');
  await expect(updateCard).toContainText('Original update');
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();

  await page.getByTestId('admin.security_advisory.update.701.delete').click();
  const deleteDialog = page.getByTestId('admin.security_advisory.update.delete_confirm');
  await expect(deleteDialog).toBeVisible();
  expect(deleteCalls).toBe(0);
  await page.getByTestId('admin.security_advisory.update.delete_confirm.confirm').click();

  await expect.poll(() => deleteCalls).toBe(1);
  await expect(deleteDialog).toBeVisible();
  await expect(updateCard).toContainText('Original update');
  await expect(page.getByTestId('toast.viewport')).toContainText('delete denied');
});
