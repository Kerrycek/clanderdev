import { expect, test, type Page } from '@playwright/test';

import { bootstrapVpsAdminWindow, failEnvelope, installHaveApiMock } from '../../fixtures';

const vps = {
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

const publicKeys = [
  { id: 8, label: 'workstation', fingerprint: 'SHA256:abc', comment: 'main laptop', auto_add: true },
];

async function installAccessMock(page: Page, handlers: Record<string, () => unknown>) {
  await installHaveApiMock(page, {
    user: { id: 42, login: 'owner', level: 1 },
    handlers: {
      'GET vpses/123': () => ({ vps }),
      'GET ip_addresses': () => ({ ip_addresses: [] }),
      'GET transaction_chains': () => ({ transaction_chains: [] }),
      'GET users/42/public_keys': () => ({ public_keys: publicKeys, _meta: { total_count: 1 } }),
      'GET vpses/123/ssh_host_keys': () => ({ ssh_host_keys: [], _meta: { total_count: 0 } }),
      ...handlers,
    },
  });
}

async function submitPasswordReset(page: Page) {
  await page.getByTestId('vps.access.password.generate').click();
  await expect(page.getByTestId('vps.access.password.confirm')).toBeVisible();
  await page.getByTestId('vps.access.password.confirm.confirm').click();
}

async function navigateWithinVps(page: Page, path: string) {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, '', nextPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await expect(page).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}$`));
}

test.describe('@workflow-matrix VPS access failure regressions', () => {
  test('resets header power and access deploy-key confirms when the VPS route changes', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installAccessMock(page, {
      'GET vpses/456': () => ({ vps: { ...vps, id: 456, hostname: 'vps456.example' } }),
      'GET vpses/456/ssh_host_keys': () => ({ ssh_host_keys: [], _meta: { total_count: 0 } }),
    });

    await page.goto('/app/vps/123');
    await page.getByTestId('vps.actions.menu').selectOption('action:stop');
    await expect(page.getByTestId('vps.action.stop_confirm')).toBeVisible();
    await navigateWithinVps(page, '/app/vps/456');
    await expect(page.getByTestId('vps.action.stop_confirm')).toHaveCount(0);

    await navigateWithinVps(page, '/app/vps/123/access');
    await page.getByTestId('vps.access.ssh.deploy').click();
    await expect(page.getByTestId('vps.access.ssh.confirm')).toBeVisible();
    await navigateWithinVps(page, '/app/vps/456/access');
    await expect(page.getByTestId('vps.access.ssh.confirm')).toHaveCount(0);
  });

  test('never reveals a returned password when its action state fails', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    const secret = 'MUST-NOT-LEAK-123!';
    let startedAt = 0;
    await installAccessMock(page, {
      'POST vpses/123/passwd': () => {
        startedAt = Date.now();
        return { vps: { password: secret }, _meta: { action_state_id: 710 } };
      },
      'GET action_states/710': () => {
        const finished = startedAt > 0 && Date.now() - startedAt >= 600;
        return {
          action_state: {
            id: 710,
            label: 'Passwd',
            finished,
            status: finished ? false : true,
            current: finished ? 1 : 0,
            total: 1,
            error_message: finished ? 'password activation rejected' : undefined,
          },
        };
      },
    });

    await page.goto('/app/vps/123/access');
    await submitPasswordReset(page);

    await expect(page.getByText('Password activation failed')).toBeVisible();
    await expect(page.getByTestId('vps.access.generated_password')).toHaveCount(0);
    await expect(page.getByText(secret, { exact: true })).toHaveCount(0);
  });

  test('treats a malformed password response as missing instead of rendering a secret', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installAccessMock(page, {
      'POST vpses/123/passwd': () => ({ vps: { unexpected: 'shape' }, _meta: { action_state_id: 711 } }),
      'GET action_states/711': () => ({ action_state: { id: 711, finished: true, status: true, current: 1, total: 1 } }),
    });

    await page.goto('/app/vps/123/access');
    await submitPasswordReset(page);

    await expect(page.getByText(/response did not include a password/)).toBeVisible();
    await expect(page.getByTestId('vps.access.generated_password')).toHaveCount(0);
  });

  test('fails closed when a password is returned without an action-state id and never reveals the secret', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    const secret = 'MUST-NOT-LEAK-WITHOUT-ACTION-STATE!';
    let postCount = 0;
    await installAccessMock(page, {
      'POST vpses/123/passwd': () => {
        postCount += 1;
        return { vps: { password: secret }, _meta: {} };
      },
    });

    await page.goto('/app/vps/123/access');
    const requestPromise = page.waitForRequest(
      (request) => request.method() === 'POST' && request.url().includes('/api/v7.0/vpses/123/passwd')
    );
    await submitPasswordReset(page);

    expect((await requestPromise).postDataJSON()).toEqual({ vps: { type: 'secure' } });
    await expect(page.getByText(/server did not return a task identifier/i)).toBeVisible();
    await expect(page.getByTestId('vps.access.generated_password')).toHaveCount(0);
    await expect(page.getByText(secret, { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('modal.action_progress')).toBeHidden();
    await expect(page.getByTestId('vps.mutation.uncertain')).toBeVisible();
    await expect(page.getByTestId('vps.access.password.generate')).toBeDisabled();
    await page.getByTestId('vps.access.password.generate').evaluate((button) => (button as HTMLButtonElement).click());
    await page.waitForTimeout(100);
    expect(postCount).toBe(1);

    await page.reload();
    await expect(page.getByTestId('vps.mutation.uncertain')).toBeVisible();
    await expect(page.getByTestId('vps.access.password.generate')).toBeDisabled();
    expect(postCount).toBe(1);
  });

  test('fails closed in the VPS header password action when the action-state id is missing', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    const secret = 'MUST-NOT-LEAK-FROM-HEADER!';
    await installAccessMock(page, {
      'POST vpses/123/passwd': () => ({ vps: { password: secret }, _meta: {} }),
    });

    await page.goto('/app/vps/123');
    await page.getByTestId('vps.actions.menu').selectOption('action:root_password');
    await expect(page.getByTestId('vps.action.root_password_confirm')).toBeVisible();
    const requestPromise = page.waitForRequest(
      (request) => request.method() === 'POST' && request.url().includes('/api/v7.0/vpses/123/passwd')
    );
    await page.getByTestId('vps.action.root_password_confirm.confirm').click();

    expect((await requestPromise).postDataJSON()).toEqual({ vps: { type: 'secure' } });
    await expect(page.getByText(/server did not return a task identifier/i)).toBeVisible();
    await expect(page.getByText(secret, { exact: true })).toHaveCount(0);
    await expect(page.getByText('New root password')).toHaveCount(0);
    await expect(page.getByTestId('vps.actions.menu').locator('option[value="action:root_password"]')).toBeDisabled();
  });

  test('does not reveal a completed VPS A password on VPS B after a pending access-page task', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    const secret = 'VPS-A-PENDING-SECRET!';
    let finishAction!: () => void;
    const actionGate = new Promise<void>((resolve) => { finishAction = resolve; });
    await installAccessMock(page, {
      'GET vpses/456': () => ({ vps: { ...vps, id: 456, hostname: 'vps456.example' } }),
      'GET vpses/456/ssh_host_keys': () => ({ ssh_host_keys: [], _meta: { total_count: 0 } }),
      'POST vpses/123/passwd': () => ({ vps: { password: secret }, _meta: { action_state_id: 756 } }),
      'GET action_states/756': async () => {
        await actionGate;
        return { action_state: { id: 756, finished: true, status: true, current: 1, total: 1 } };
      },
    });

    await page.goto('/app/vps/123/access');
    await submitPasswordReset(page);
    await expect(page.getByText('Password generation is running')).toBeVisible();
    await navigateWithinVps(page, '/app/vps/456/access');
    finishAction();

    await expect(page.getByTestId('vps.access.page')).toBeVisible();
    await expect(page.getByText(secret, { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('vps.access.generated_password')).toHaveCount(0);
    await expect(page.getByText('Password generation is running')).toHaveCount(0);
  });

  test('does not materialize a delayed no-task header password response from VPS A on VPS B', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    const secret = 'VPS-A-DIRECT-SECRET!';
    let finishResponse!: () => void;
    const responseGate = new Promise<void>((resolve) => { finishResponse = resolve; });
    await installAccessMock(page, {
      'GET vpses/456': () => ({ vps: { ...vps, id: 456, hostname: 'vps456.example' } }),
      'POST vpses/123/passwd': async () => {
        await responseGate;
        return { vps: { password: secret }, _meta: {} };
      },
    });

    await page.goto('/app/vps/123');
    await page.getByTestId('vps.actions.menu').selectOption('action:root_password');
    await page.getByTestId('vps.action.root_password_confirm.confirm').click();
    await navigateWithinVps(page, '/app/vps/456');
    finishResponse();

    await expect(page.getByText('vps456.example')).toBeVisible();
    await expect(page.getByText(secret, { exact: true })).toHaveCount(0);
    await expect(page.getByText('New root password')).toHaveCount(0);
    await expect(page.getByText(/server did not return a task identifier/i)).toHaveCount(0);
  });

  test('surfaces an immediate SSH deployment error without reporting success', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installAccessMock(page, {
      'POST vpses/123/deploy_public_key': () => failEnvelope('SSH deploy denied immediately'),
    });

    await page.goto('/app/vps/123/access');
    await page.getByTestId('vps.access.ssh.deploy').click();
    const requestPromise = page.waitForRequest(
      (request) => request.method() === 'POST' && request.url().includes('/api/v7.0/vpses/123/deploy_public_key')
    );
    await page.getByTestId('vps.access.ssh.confirm.confirm').click();

    expect((await requestPromise).postDataJSON()).toEqual({ vps: { public_key: 8 } });
    await expect(page.getByText('SSH deploy denied immediately')).toBeVisible();
    await expect(page.getByText(/Public key deployed:/)).toHaveCount(0);
  });

  test('fails closed when SSH deployment has no action-state id and keeps the safety lock', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    let postCount = 0;
    await installAccessMock(page, {
      'POST vpses/123/deploy_public_key': () => {
        postCount += 1;
        return { vps: {}, _meta: {} };
      },
    });

    await page.goto('/app/vps/123/access');
    await page.getByTestId('vps.access.ssh.deploy').click();
    const requestPromise = page.waitForRequest(
      (request) => request.method() === 'POST' && request.url().includes('/api/v7.0/vpses/123/deploy_public_key')
    );
    await page.getByTestId('vps.access.ssh.confirm.confirm').click();

    expect((await requestPromise).postDataJSON()).toEqual({ vps: { public_key: 8 } });
    await expect(page.getByText(/server did not return a task identifier/i)).toBeVisible();
    await expect(page.getByText(/Public key deployed:/)).toHaveCount(0);
    await expect(page.getByTestId('vps.mutation.uncertain')).toBeVisible();
    await expect(page.getByTestId('vps.access.ssh.deploy')).toBeDisabled();
    await page.getByTestId('vps.access.ssh.deploy').evaluate((button) => (button as HTMLButtonElement).click());
    await page.waitForTimeout(100);
    expect(postCount).toBe(1);

    await page.reload();
    await expect(page.getByTestId('vps.mutation.uncertain')).toBeVisible();
    await expect(page.getByTestId('vps.access.ssh.deploy')).toBeDisabled();
    expect(postCount).toBe(1);
  });
});
