import { expect, test, type Page } from '@playwright/test';

import { bootstrapVpsAdminWindow, failEnvelope, installHaveApiMock } from '../../fixtures';

type PowerAction = 'start' | 'stop' | 'restart';

const baseVps = {
  id: 123,
  hostname: 'vps123.example',
  object_state: 'active',
  is_running: true,
  enable_network: true,
  cpu: 2,
  memory: 2048,
  swap: 0,
  diskspace: 20480,
  node: { id: 1, domain_name: 'node1.example', location: { id: 2, label: 'Praha' } },
  user: { id: 42, login: 'owner' },
  os_template: { id: 6, label: 'Debian 12' },
};

async function installPowerFailureMock(
  page: Page,
  options: {
    action: PowerAction;
    isRunning: boolean;
    mutation: () => unknown;
    actionState?: () => unknown;
    actionStateId?: number;
    user?: { id: number; login: string; level: number };
  }
) {
  const handlers: Record<string, () => unknown> = {
    'GET vpses/123': () => ({ vps: { ...baseVps, is_running: options.isRunning } }),
    'GET vpses/123/statuses': () => ({ statuses: [] }),
    'GET ip_addresses': () => ({ ip_addresses: [] }),
    'GET transaction_chains': () => ({ transaction_chains: [] }),
    [`POST vpses/123/${options.action}`]: options.mutation,
  };

  if (options.actionState && options.actionStateId !== undefined) {
    handlers[`GET action_states/${options.actionStateId}`] = options.actionState;
  }

  await installHaveApiMock(page, {
    user: options.user ?? { id: 42, login: 'owner', level: 1 },
    handlers,
  });
}

async function submitPowerAction(page: Page, action: PowerAction) {
  if (action === 'start') {
    await page.getByTestId('vps.action.start').click();
    return;
  }

  await page.getByTestId('vps.actions.menu').selectOption(`action:${action}`);
  await expect(page.getByTestId(`vps.action.${action}_confirm`)).toBeVisible();
  await page.getByTestId(`vps.action.${action}_confirm.confirm`).click();
}

test.describe('@workflow-matrix VPS power failure regressions', () => {
  for (const action of ['start', 'stop', 'restart'] as const) {
    test(`surfaces an immediate ${action} error and releases the local lock`, async ({ page }) => {
      await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
      const message = `${action} rejected immediately`;
      await installPowerFailureMock(page, {
        action,
        isRunning: action !== 'start',
        mutation: () => failEnvelope(message),
      });

      await page.goto('/app/vps/123');

      const requestPromise = page.waitForRequest(
        (request) => request.method() === 'POST' && request.url().includes(`/api/v7.0/vpses/123/${action}`)
      );
      await submitPowerAction(page, action);

      const request = await requestPromise;
      // start has no options; stop/restart must not silently force the operation.
      expect(request.postDataJSON()).toEqual({});
      await expect(page.getByText('Action failed')).toBeVisible();
      await expect(page.getByText(message)).toBeVisible();

      if (action === 'start') {
        await expect(page.getByTestId('vps.action.start')).toHaveAttribute('aria-disabled', 'false');
      } else {
        await expect(page.getByTestId('vps.actions.menu').locator(`option[value="action:${action}"]`)).toBeEnabled();
      }
    });
  }

  test('keeps a durable lock after transport loss and sends at most one start request', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installPowerFailureMock(page, {
      action: 'start',
      isRunning: false,
      mutation: () => ({ _meta: { action_state_id: 999 } }),
    });
    let postCount = 0;
    await page.route('**/api/v7.0/vpses/123/start', async (route) => {
      postCount += 1;
      await route.abort('connectionreset');
    });

    await page.goto('/app/vps/123');
    await page.getByTestId('vps.action.start').click();
    await expect(page.getByTestId('vps.mutation.uncertain')).toBeVisible();
    await expect(page.getByTestId('vps.action.start')).toHaveAttribute('aria-disabled', 'true');
    await page.getByTestId('vps.action.start').evaluate((button) => (button as HTMLButtonElement).click());
    await page.waitForTimeout(100);
    expect(postCount).toBe(1);

    await page.reload();
    await expect(page.getByTestId('vps.mutation.uncertain')).toBeVisible();
    await expect(page.getByTestId('vps.action.start')).toHaveAttribute('aria-disabled', 'true');
    expect(postCount).toBe(1);
  });

  test('treats HTTP 408 as ambiguous and never blindly retries start', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    let postCount = 0;
    await installPowerFailureMock(page, {
      action: 'start',
      isRunning: false,
      mutation: () => {
        postCount += 1;
        return {
          status: 408,
          contentType: 'application/json',
          body: JSON.stringify({ status: false, message: 'Request timeout', response: null }),
        };
      },
    });

    await page.goto('/app/vps/123');
    await page.getByTestId('vps.action.start').click();
    await expect(page.getByTestId('vps.mutation.uncertain')).toBeVisible();
    await expect(page.getByTestId('vps.action.start')).toHaveAttribute('aria-disabled', 'true');
    await page.getByTestId('vps.action.start').evaluate((button) => (button as HTMLButtonElement).click());
    await page.reload();
    await expect(page.getByTestId('vps.mutation.uncertain')).toBeVisible();
    await expect(page.getByTestId('vps.action.start')).toHaveAttribute('aria-disabled', 'true');
    expect(postCount).toBe(1);
  });

  test('treats a malformed 2xx envelope as ambiguous and never blindly retries start', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    let postCount = 0;
    await installPowerFailureMock(page, {
      action: 'start',
      isRunning: false,
      mutation: () => {
        postCount += 1;
        return {
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}),
        };
      },
    });

    await page.goto('/app/vps/123');
    await page.getByTestId('vps.action.start').click();
    await expect(page.getByTestId('vps.mutation.uncertain')).toBeVisible();
    await expect(page.getByTestId('vps.action.start')).toHaveAttribute('aria-disabled', 'true');
    await page.getByTestId('vps.action.start').evaluate((button) => (button as HTMLButtonElement).click());
    await page.reload();
    await expect(page.getByTestId('vps.mutation.uncertain')).toBeVisible();
    await expect(page.getByTestId('vps.action.start')).toHaveAttribute('aria-disabled', 'true');
    expect(postCount).toBe(1);
  });

  test('does not send a start request when the durable browser guard cannot be stored', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    let postCount = 0;
    await installPowerFailureMock(page, {
      action: 'start',
      isRunning: false,
      mutation: () => {
        postCount += 1;
        return { _meta: { action_state_id: 999 } };
      },
    });
    await page.addInitScript(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function safeLockStorage(key: string, value: string) {
        if (String(key).startsWith('webui-next.local_locks')) {
          throw new DOMException('quota exceeded', 'QuotaExceededError');
        }
        return original.call(this, key, value);
      };
    });

    await page.goto('/app/vps/123');
    await page.getByTestId('vps.action.start').click();
    await expect(page.getByText(/could not persist the safety lock/i)).toBeVisible();
    await expect(page.getByTestId('vps.mutation.uncertain')).toHaveCount(0);
    await expect(page.getByTestId('vps.action.start')).toHaveAttribute('aria-disabled', 'false');
    expect(postCount).toBe(0);
  });

  test('serializes simultaneous user/admin tabs and shares the VPS guard across views', async ({ page }) => {
    const secondPage = await page.context().newPage();
    let postCount = 0;
    const options = {
      action: 'start' as const,
      isRunning: false,
      mutation: () => {
        postCount += 1;
        return { _meta: {} };
      },
      user: { id: 42, login: 'admin', level: 90 },
    };
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await bootstrapVpsAdminWindow(secondPage, { sessionToken: 'TEST' });
    await installPowerFailureMock(page, options);
    await installPowerFailureMock(secondPage, options);

    await Promise.all([page.goto('/app/vps/123'), secondPage.goto('/admin/vps/123')]);
    await Promise.all([
      page.getByTestId('vps.action.start').evaluate((button) => (button as HTMLButtonElement).click()),
      secondPage.getByTestId('vps.action.start').evaluate((button) => (button as HTMLButtonElement).click()),
    ]);

    await expect(page.getByTestId('vps.mutation.uncertain')).toBeVisible();
    await expect(secondPage.getByTestId('vps.mutation.uncertain')).toBeVisible();
    expect(postCount).toBe(1);
    await expect(page.getByTestId('vps.action.start')).toHaveAttribute('aria-disabled', 'true');
    await expect(secondPage.getByTestId('vps.action.start')).toHaveAttribute('aria-disabled', 'true');
    await secondPage.close();
  });

  test('tracks an action state that finishes with status false', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    let startedAt = 0;

    await installPowerFailureMock(page, {
      action: 'start',
      actionStateId: 790,
      isRunning: false,
      mutation: () => {
        startedAt = Date.now();
        return { _meta: { action_state_id: 790 } };
      },
      actionState: () => {
        const finished = startedAt > 0 && Date.now() - startedAt >= 600;
        return {
          action_state: {
            id: 790,
            label: 'Start VPS',
            finished,
            status: finished ? false : true,
            current: finished ? 1 : 0,
            total: 1,
            error_message: finished ? 'node rejected start' : undefined,
            created_at: '2026-08-29T20:00:00Z',
            updated_at: '2026-08-29T20:00:01Z',
          },
        };
      },
    });

    await page.goto('/app/vps/123');
    await page.getByTestId('vps.action.start').click();

    await expect(page.getByTestId('modal.action_progress')).toBeVisible();
    await expect(page.getByTestId('modal.action_progress')).toBeHidden();
    await page.getByTestId('tasks.open-button').click();
    await expect(page.getByTestId('tasks.row.790')).toContainText('Start VPS');
    await expect(page.getByTestId('tasks.row.790')).toContainText('Failed');
  });

  for (const action of ['start', 'stop', 'restart'] as const) {
    test(`fails closed and keeps a cross-tab safety lock when ${action} has no action-state id`, async ({ page }) => {
      await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
      let postCount = 0;
      await installPowerFailureMock(page, {
        action,
        isRunning: action !== 'start',
        mutation: () => {
          postCount += 1;
          return { _meta: {} };
        },
      });

      await page.goto('/app/vps/123');
      const requestPromise = page.waitForRequest(
        (request) => request.method() === 'POST' && request.url().includes(`/api/v7.0/vpses/123/${action}`)
      );
      await submitPowerAction(page, action);

      expect((await requestPromise).postDataJSON()).toEqual({});
      await expect(page.getByTestId('modal.action_progress')).toBeHidden();
      await expect(page.getByText(/server did not return a task identifier/i)).toBeVisible();
      await expect(page.getByTestId('vps.mutation.uncertain')).toBeVisible();
      if (action === 'start') {
        await expect(page.getByTestId('vps.action.start')).toHaveAttribute('aria-disabled', 'true');
        await page.getByTestId('vps.action.start').evaluate((button) => (button as HTMLButtonElement).click());
      } else {
        await expect(page.getByTestId('vps.actions.menu').locator(`option[value="action:${action}"]`)).toBeDisabled();
        await page.getByTestId('vps.actions.menu').evaluate((select, value) => {
          const element = select as HTMLSelectElement;
          element.value = String(value);
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }, `action:${action}`);
      }
      await page.waitForTimeout(100);
      expect(postCount).toBe(1);

      await page.reload();
      await expect(page.getByTestId('vps.mutation.uncertain')).toBeVisible();
      if (action === 'start') {
        await expect(page.getByTestId('vps.action.start')).toHaveAttribute('aria-disabled', 'true');
        await page.getByTestId('vps.action.start').evaluate((button) => (button as HTMLButtonElement).click());
      } else {
        await expect(page.getByTestId('vps.actions.menu').locator(`option[value="action:${action}"]`)).toBeDisabled();
      }
      await page.waitForTimeout(100);
      expect(postCount).toBe(1);
    });
  }
});
