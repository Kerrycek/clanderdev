import { expect, test, type Page } from '@playwright/test';

import {
  bootstrapVpsAdminWindow,
  installHaveApiMock,
  type HaveApiHandler,
} from '../../fixtures';

async function installCreateMock(
  page: Page,
  createHandler: HaveApiHandler,
  extraHandlers: Record<string, HaveApiHandler> = {}
) {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST_USER' });
  await installHaveApiMock(page, {
    user: { id: 2, login: 'member', level: 1 },
    handlers: {
      'GET locations': () => ({
        locations: [{ id: 2, label: 'Praha', environment: { id: 1, label: 'Test' } }],
      }),
      'GET os_templates': () => ({
        os_templates: [
          {
            id: 6,
            label: 'Debian 12',
            distribution: 'Debian',
            version: '12',
            arch: 'x86_64',
            os_family: { id: 1, label: 'Linux' },
          },
        ],
      }),
      'GET default_object_cluster_resources': () => ({
        default_object_cluster_resources: [
          { id: 1, cluster_resource: { name: 'cpu' }, value: 2 },
          { id: 2, cluster_resource: { name: 'memory' }, value: 2048 },
          { id: 3, cluster_resource: { name: 'diskspace' }, value: 10240 },
          { id: 4, cluster_resource: { name: 'swap' }, value: 512 },
          { id: 5, cluster_resource: { name: 'ipv4' }, value: 1 },
          { id: 6, cluster_resource: { name: 'ipv6' }, value: 1 },
          { id: 7, cluster_resource: { name: 'ipv4_private' }, value: 0 },
        ],
      }),
      'POST vpses': createHandler,
      ...extraHandlers,
    },
  });
}

async function fillCreateForm(page: Page, hostname = 'not-confirmed.example') {
  await page.getByTestId('vps.create.location').selectOption('2');
  await page.getByTestId('vps.create.os_template').selectOption('6');
  await page.getByTestId('vps.create.hostname').fill(hostname);
}

async function forceDisabledSubmitClick(page: Page) {
  await page.getByTestId('vps.create.submit').evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
}

test.describe('@workflow-matrix VPS create failure regressions', () => {
  test('does not navigate or report success when create omits its action-state id', async ({ page }) => {
    let postCount = 0;
    const handler: HaveApiHandler = () => {
      postCount += 1;
      return {
        vps: { id: 150, hostname: 'not-confirmed.example' },
        _meta: {},
      };
    };
    const createdVps = {
      id: 150,
      hostname: 'not-confirmed.example',
      user: { id: 2, login: 'member' },
      node: { id: 3, location: { id: 2, label: 'Praha' } },
    };
    await installCreateMock(page, handler, {
      'GET vpses/150': () => ({ vps: createdVps }),
    });

    await page.goto('/app/vps/new');
    await fillCreateForm(page);
    await page.getByTestId('vps.create.submit').click();

    await expect(page).toHaveURL(/\/app\/vps\/new$/);
    await expect(page.getByTestId('vps.create.error')).toContainText(/server did not return a task identifier/i);
    await expect(page.getByTestId('vps.create.error')).toContainText(/prevent a duplicate VPS/i);
    await expect(page.getByTestId('vps.create.hostname')).toHaveValue('not-confirmed.example');
    await expect(page.getByTestId('vps.create.submit')).toBeDisabled();
    await expect(page.getByTestId('modal.action_progress')).toBeHidden();

    await forceDisabledSubmitClick(page);
    await page.waitForTimeout(100);
    expect(postCount).toBe(1);

    await page.reload();
    await expect(page.getByTestId('vps.create.error')).toContainText(/prevent a duplicate VPS/i);
    await fillCreateForm(page);
    await expect(page.getByTestId('vps.create.submit')).toBeDisabled();

    await forceDisabledSubmitClick(page);
    await page.waitForTimeout(100);
    expect(postCount).toBe(1);

    const secondPage = await page.context().newPage();
    await installCreateMock(secondPage, handler, {
      'GET vpses/150': () => ({ vps: createdVps }),
    });
    await secondPage.goto('/app/vps/new');
    await expect(secondPage.getByTestId('vps.create.error')).toContainText(/prevent a duplicate VPS/i);
    await expect(secondPage.getByTestId('vps.create.submit')).toBeDisabled();
    await forceDisabledSubmitClick(secondPage);
    await secondPage.waitForTimeout(100);
    expect(postCount).toBe(1);

    await expect(page.getByTestId('vps.create.uncertain.acknowledge')).toBeDisabled();
    await page.getByTestId('vps.create.uncertain.open_tasks').click();
    await page.getByTestId('tasks.close-button').click();
    await expect(page.getByTestId('vps.create.uncertain.acknowledge')).toBeEnabled();
    await page.getByTestId('vps.create.uncertain.acknowledge').click();
    await expect(page).toHaveURL(/\/app\/vps\/150$/);
    await expect(secondPage.getByTestId('vps.create.error')).toHaveCount(0);
    expect(postCount).toBe(1);
  });

  test('keeps another tab locked while the first create request is still in flight', async ({ page }) => {
    let postCount = 0;
    let resolveCreate!: (value: unknown) => void;
    const response = new Promise<unknown>((resolve) => {
      resolveCreate = resolve;
    });
    const handler: HaveApiHandler = async () => {
      postCount += 1;
      return response;
    };
    await installCreateMock(page, handler);
    await page.goto('/app/vps/new');
    await fillCreateForm(page, 'in-flight.example');

    const submit = page.getByTestId('vps.create.submit').click();
    await expect.poll(() => postCount).toBe(1);

    const secondPage = await page.context().newPage();
    await installCreateMock(secondPage, handler);
    await secondPage.goto('/app/vps/new');
    await expect(secondPage.getByTestId('vps.create.pending')).toBeVisible();
    await expect(secondPage.getByTestId('vps.create.uncertain.acknowledge')).toHaveCount(0);
    await expect(secondPage.getByTestId('vps.create.submit')).toBeDisabled();
    await forceDisabledSubmitClick(secondPage);
    await secondPage.waitForTimeout(100);
    expect(postCount).toBe(1);

    resolveCreate({ vps: { id: 151, hostname: 'in-flight.example' }, _meta: {} });
    await submit;
    await expect(page.getByTestId('vps.create.error')).toContainText(/prevent a duplicate VPS/i);
    await expect(secondPage.getByTestId('vps.create.error')).toContainText(/prevent a duplicate VPS/i);
    expect(postCount).toBe(1);
  });

  test('persists a transport-loss outcome across reload and never sends a blind retry', async ({ page }) => {
    let postCount = 0;
    await installCreateMock(page, () => ({}));
    await page.route(/\/api\/v7\.0\/vpses$/, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      postCount += 1;
      await route.abort('connectionreset');
    });
    await page.goto('/app/vps/new');
    await fillCreateForm(page, 'transport-loss.example');
    await page.getByTestId('vps.create.submit').click();

    await expect(page.getByTestId('vps.create.error')).toContainText(/prevent a duplicate VPS/i);
    expect(postCount).toBe(1);
    await page.reload();
    await expect(page.getByTestId('vps.create.submit')).toBeDisabled();
    await forceDisabledSubmitClick(page);
    await page.waitForTimeout(100);
    expect(postCount).toBe(1);

    await expect(page.getByTestId('vps.create.uncertain.acknowledge')).toBeDisabled();
    await page.getByTestId('vps.create.uncertain.open_tasks').click();
    await page.getByTestId('tasks.close-button').click();
    await expect(page.getByTestId('vps.create.uncertain.review_error')).toContainText(/no matching VPS can be confirmed/i);
    await expect(page.getByTestId('vps.create.uncertain.acknowledge')).toBeDisabled();
    await forceDisabledSubmitClick(page);
    expect(postCount).toBe(1);
  });

  test('persists an accepted create receipt and reconciles the exact returned VPS before clearing it', async ({ page }) => {
    let postCount = 0;
    const createdVps = {
      id: 153,
      hostname: 'accepted.example',
      user: { id: 2, login: 'member' },
      node: { id: 3, location: { id: 2, label: 'Praha' } },
    };
    await installCreateMock(page, () => {
      postCount += 1;
      return { vps: createdVps, _meta: { action_state_id: 953 } };
    }, {
      'GET vpses/153': () => ({ vps: createdVps }),
    });

    await page.goto('/app/vps/new');
    await fillCreateForm(page, 'accepted.example');
    await page.getByTestId('vps.create.submit').click();
    await expect(page).toHaveURL(/\/app\/vps\/153$/);
    expect(postCount).toBe(1);

    await page.goto('/app/vps/new');
    await expect(page.getByTestId('vps.create.accepted')).toBeVisible();
    await expect(page.getByTestId('vps.create.submit')).toBeDisabled();
    await page.reload();
    await expect(page.getByTestId('vps.create.accepted')).toBeVisible();
    await page.getByTestId('vps.create.uncertain.open_tasks').click();
    await page.getByTestId('tasks.close-button').click();
    await expect(page.getByTestId('vps.create.uncertain.acknowledge')).toBeEnabled();
    await page.getByTestId('vps.create.uncertain.acknowledge').click();
    await expect(page).toHaveURL(/\/app\/vps\/153$/);
    expect(postCount).toBe(1);
  });

  test('waits for the exact accepted create task before requesting the new VPS detail', async ({ page }) => {
    let createFinished = false;
    let actionStateReads = 0;
    let detailReads = 0;
    const createdVps = {
      id: 156,
      hostname: 'eventually-visible.example',
      user: { id: 2, login: 'member' },
      node: { id: 3, name: 'node3', location: { id: 2, label: 'Praha' } },
      object_state: 'active',
      running: false,
    };
    await installCreateMock(page, () => ({
      vps: createdVps,
      _meta: { action_state_id: 956 },
    }), {
      'GET action_states/956': () => {
        actionStateReads += 1;
        return {
          action_state: {
            id: 956,
            label: 'Create VPS',
            finished: createFinished,
            status: true,
            current: createFinished ? 1 : 0,
            total: 1,
          },
        };
      },
      'GET vpses/156': () => {
        detailReads += 1;
        return { vps: createdVps };
      },
    });

    await page.goto('/app/vps/new');
    await fillCreateForm(page, 'eventually-visible.example');
    await page.getByTestId('vps.create.submit').click();

    await expect(page).toHaveURL(/\/app\/vps\/156$/);
    await expect(page.getByTestId('vps.detail.creating')).toBeVisible();
    await expect.poll(() => actionStateReads).toBeGreaterThan(0);
    expect(detailReads).toBe(0);

    createFinished = true;
    await expect(page.getByTestId('vps.header')).toBeVisible({ timeout: 10_000 });
    expect(detailReads).toBeGreaterThan(0);
    await expect(page.getByTestId('vps.detail.error')).toHaveCount(0);
  });

  test('does not send create when the durable guard cannot be written', async ({ page }) => {
    let postCount = 0;
    await page.addInitScript(() => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key.startsWith('webui-next.vps-create-outcome-uncertain')) {
          throw new DOMException('quota exceeded', 'QuotaExceededError');
        }
        return setItem.call(this, key, value);
      };
    });
    await installCreateMock(page, () => {
      postCount += 1;
      return { vps: { id: 152 }, _meta: { action_state_id: 952 } };
    });
    await page.goto('/app/vps/new');
    await fillCreateForm(page, 'storage-failure.example');
    await page.getByTestId('vps.create.submit').click();

    await expect(page.getByTestId('vps.create.error')).toBeVisible();
    expect(postCount).toBe(0);
  });

  test('keeps the pending guard when persisting the accepted create receipt fails', async ({ page }) => {
    let postCount = 0;
    await page.addInitScript(() => {
      const setItem = Storage.prototype.setItem;
      let createMarkerWrites = 0;
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key.startsWith('webui-next.vps-create-outcome-uncertain')) {
          createMarkerWrites += 1;
          if (createMarkerWrites === 2) {
            throw new DOMException('quota exceeded', 'QuotaExceededError');
          }
        }
        return setItem.call(this, key, value);
      };
    });
    await installCreateMock(page, () => {
      postCount += 1;
      return {
        vps: { id: 155, hostname: 'receipt-write-failure.example' },
        _meta: { action_state_id: 955 },
      };
    });

    await page.goto('/app/vps/new');
    await fillCreateForm(page, 'receipt-write-failure.example');
    await page.getByTestId('vps.create.submit').click();

    await expect(page).toHaveURL(/\/app\/vps\/new$/);
    await expect(page.getByTestId('vps.create.pending')).toBeVisible();
    await expect(page.getByTestId('vps.create.submit')).toBeDisabled();
    expect(postCount).toBe(1);

    await page.reload();
    await expect(page.getByTestId('vps.create.pending')).toBeVisible();
    await expect(page.getByTestId('vps.create.submit')).toBeDisabled();
    await forceDisabledSubmitClick(page);
    await page.waitForTimeout(100);
    expect(postCount).toBe(1);
  });

  test('keeps the accepted receipt when the concrete VPS guard cannot be persisted', async ({ page }) => {
    let postCount = 0;
    await page.addInitScript(() => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key.startsWith('webui-next.local_locks.user-2.uncertain.Vps%3A154.')) {
          throw new DOMException('quota exceeded', 'QuotaExceededError');
        }
        return setItem.call(this, key, value);
      };
    });
    await installCreateMock(page, () => {
      postCount += 1;
      return {
        vps: { id: 154, hostname: 'bridge-failure.example' },
        _meta: { action_state_id: 954 },
      };
    });

    await page.goto('/app/vps/new');
    await fillCreateForm(page, 'bridge-failure.example');
    await page.getByTestId('vps.create.submit').click();

    await expect(page).toHaveURL(/\/app\/vps\/new$/);
    await expect(page.getByTestId('vps.create.accepted')).toBeVisible();
    await expect(page.getByTestId('vps.create.submit')).toBeDisabled();
    expect(postCount).toBe(1);
    await page.reload();
    await expect(page.getByTestId('vps.create.accepted')).toBeVisible();
    await forceDisabledSubmitClick(page);
    expect(postCount).toBe(1);
  });
});
