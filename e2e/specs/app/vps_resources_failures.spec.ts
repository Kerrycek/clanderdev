import { expect, test, type Page } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock, jsonFulfill } from '../../fixtures';

const vps = {
  id: 123,
  hostname: 'vps123.example',
  object_state: 'active',
  is_running: true,
  enable_network: true,
  manage_hostname: true,
  cpu: 2,
  memory: 2048,
  swap: 0,
  diskspace: 20480,
  cgroup_version: 'cgroup_any',
  allow_admin_modifications: true,
  node: { id: 1, domain_name: 'node1.example', location: { id: 2, label: 'Praha' } },
  user: { id: 42, login: 'owner' },
  os_template: { id: 6, label: 'Debian 12' },
};

async function installResourcesMock(page: Page, putHandler: () => unknown, actionHandler?: () => unknown) {
  const handlers: Record<string, () => unknown> = {
    'GET vpses/123': () => ({ vps }),
    'GET ip_addresses': () => ({ ip_addresses: [] }),
    'GET transaction_chains': () => ({ transaction_chains: [] }),
    'GET dns_resolvers': () => ({ dns_resolvers: [] }),
    'GET user_namespace_maps': () => ({ user_namespace_maps: [] }),
    'PUT vpses/123': putHandler,
  };
  if (actionHandler) handlers['GET action_states/812'] = actionHandler;

  await installHaveApiMock(page, {
    user: { id: 42, login: 'owner', level: 1 },
    handlers,
  });
}

async function reviewAndSubmit(page: Page, expectedChanges: number) {
  await page.getByRole('button', { name: `Save (${expectedChanges})`, exact: true }).click();
  await expect(page.getByText('Review and apply VPS configuration changes?')).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
}

function resourceInput(page: Page, name: 'CPU' | 'Memory (MiB)' | 'Swap (MiB)') {
  return page.getByRole('spinbutton', { name: new RegExp(`^${name.replace(/[()]/g, '\\$&')}`) });
}

test.describe('@workflow-matrix VPS resource mutation regressions', () => {
  test('sends only the changed CPU, memory and swap fields in the PUT payload', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installResourcesMock(page, () => ({
      vps: { ...vps, cpu: 4, memory: 4096, swap: 512 },
      _meta: { action_state_id: 812 },
    }));

    await page.goto('/app/vps/123/config');
    await resourceInput(page, 'CPU').fill('4');
    await resourceInput(page, 'Memory (MiB)').fill('4096');
    await resourceInput(page, 'Swap (MiB)').fill('512');

    const requestPromise = page.waitForRequest(
      (request) => request.method() === 'PUT' && request.url().includes('/api/v7.0/vpses/123')
    );
    await reviewAndSubmit(page, 3);

    expect((await requestPromise).postDataJSON()).toEqual({
      vps: { cpu: 4, memory: 4096, swap: 512 },
    });
  });

  test('maps an HTTP 422 resource error back to the changed field', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installResourcesMock(page, () =>
      jsonFulfill(
        {
          status: false,
          message: 'Validation failed',
          errors: { vps: { memory: ['exceeds allocated memory'] } },
          response: null,
        },
        422
      )
    );

    await page.goto('/app/vps/123/config');
    await resourceInput(page, 'Memory (MiB)').fill('4096');

    const requestPromise = page.waitForRequest(
      (request) => request.method() === 'PUT' && request.url().includes('/api/v7.0/vpses/123')
    );
    await reviewAndSubmit(page, 1);
    expect((await requestPromise).postDataJSON()).toEqual({ vps: { memory: 4096 } });

    // Keep the failed draft for correction while exposing the field-level reason.
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByText('Some fields need attention')).toBeVisible();
    await expect(page.getByTestId('vps.config.field_errors').getByText('exceeds allocated memory')).toBeVisible();
    await expect(resourceInput(page, 'Memory (MiB)')).toHaveValue('4096');
  });

  test('fails closed without an action-state id, keeps the draft and blocks a blind retry across reloads', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    let putCount = 0;
    await installResourcesMock(page, () => {
      putCount += 1;
      return { vps: { ...vps, cpu: 4 }, _meta: {} };
    });

    await page.goto('/app/vps/123/config');
    await resourceInput(page, 'CPU').fill('4');
    await reviewAndSubmit(page, 1);

    await expect(page.getByText(/server did not return a task identifier/i)).toBeVisible();
    await expect(resourceInput(page, 'CPU')).toHaveValue('4');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByTestId('vps.mutation.uncertain')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save (1)', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Save (1)', exact: true }).evaluate((button) => (button as HTMLButtonElement).click());
    await page.waitForTimeout(100);
    expect(putCount).toBe(1);
    await expect(page.getByTestId('modal.action_progress')).toBeHidden();

    await page.reload();
    await expect(page.getByTestId('vps.mutation.uncertain')).toBeVisible();
    expect(putCount).toBe(1);
  });

  test('tracks a resource action state that finishes with status false', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    let startedAt = 0;
    await installResourcesMock(
      page,
      () => {
        startedAt = Date.now();
        return { vps: { ...vps, cpu: 3 }, _meta: { action_state_id: 812 } };
      },
      () => {
        const finished = startedAt > 0 && Date.now() - startedAt >= 600;
        return {
          action_state: {
            id: 812,
            label: 'Save VPS configuration',
            finished,
            status: finished ? false : true,
            current: finished ? 1 : 0,
            total: 1,
            error_message: finished ? 'resource update rejected' : undefined,
          },
        };
      }
    );

    await page.goto('/app/vps/123/config');
    await resourceInput(page, 'CPU').fill('3');
    await reviewAndSubmit(page, 1);

    // Configuration updates are background tasks: they must be tracked without
    // forcing the blocking progress overlay used by access/power actions.
    await expect(page.getByTestId('modal.action_progress')).toBeHidden();
    await page.getByTestId('tasks.open-button').click();
    await expect(page.getByTestId('tasks.row.812')).toContainText('Save VPS configuration');
    await expect(page.getByTestId('tasks.row.812')).toContainText('Failed');
  });
});
