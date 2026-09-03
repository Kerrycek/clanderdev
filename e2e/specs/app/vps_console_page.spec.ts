import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

const vps = {
  id: 123,
  hostname: 'vps123.example',
  object_state: 'active',
  is_running: true,
  cpus: 2,
  memory: 2048,
  swap: 0,
  diskspace: 20480,
  used_memory: 768,
  used_swap: 0,
  used_diskspace: 5120,
  uptime: 12345,
  loadavg1: 0.12,
  node: {
    id: 1,
    domain_name: 'node1.example',
    location: { label: 'dc1', remote_console_server: '/_console' },
  },
  os_template: { label: 'debian' },
  dns_resolver: 'inherit',
};

async function routeConsoleStub(page: Parameters<typeof installHaveApiMock>[0]) {
  await page.route('**/_console/**', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><body>console stub</body></html>',
    });
  });
}

test.describe('@smoke VPS console page', () => {
  test('@workflow-matrix keeps navigation read-only, then renders and recreates an explicitly requested session', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    await routeConsoleStub(page);

    let createCalls = 0;
    let deleteCalls = 0;

    await installHaveApiMock(page, {
      user: { id: 1, login: 'test', level: 1 },
      handlers: {
        'GET vpses/123': () => ({ vps }),
        'GET ip_addresses': () => ({ ip_addresses: [{ id: 5, addr: '203.0.113.10', network: { role: 'public' } }] }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'POST vpses/123/console_token': () => {
          createCalls += 1;
          return {
            token: createCalls === 1 ? 'T1' : 'T2',
            expiration: '2027-01-31T00:00:00Z',
          };
        },
        'DELETE vpses/123/console_token': () => {
          deleteCalls += 1;
          return {};
        },
      },
    });

    await page.goto('/app/vps/123/console');

    await expect(page.getByTestId('vps.console.page')).toBeVisible();
    await expect(page.getByTestId('vps.console.connection_state')).toContainText('Disconnected');
    await expect(page.getByTestId('vps.console.not_started')).toContainText('Select New session');
    await expect(page.getByTestId('vps.console.new_session')).toBeVisible();
    await expect(page.getByTestId('vps.console.iframe')).toHaveCount(0);
    expect(createCalls).toBe(0);
    expect(deleteCalls).toBe(0);

    await page.reload();
    await expect(page.getByTestId('vps.console.page')).toBeVisible();
    await expect(page.getByTestId('vps.console.connection_state')).toContainText('Disconnected');
    expect(createCalls).toBe(0);
    expect(deleteCalls).toBe(0);

    await page.getByTestId('vps.console.new_session').click();
    await expect.poll(() => createCalls).toBe(1);
    await expect(page.getByTestId('vps.console.connection_state')).toContainText(/Connecting|Connected/);
    await expect(page.getByTestId('vps.console.reconnect')).toBeVisible();
    await expect(page.getByTestId('vps.console.copy_url')).toHaveCount(0);
    await expect(page.getByTestId('vps.console.copy_ssh')).toBeVisible();
    await expect(page.getByTestId('vps.console.open_new_tab')).toHaveAttribute(
      'href',
      /\/_console\/console\/123\?session=T1/
    );

    const iframe = page.getByTestId('vps.console.iframe');
    await expect(iframe).toBeVisible();
    await expect(page.getByTestId('vps.console.frame_status')).toContainText('Connected');
    await expect(page.getByTestId('vps.console.connection_state')).toContainText('Connected');

    const src1 = await iframe.getAttribute('src');
    expect(src1).toContain('/_console/console/123?session=T1');

    await page.getByTestId('vps.console.copy_ssh').click();
    await expect(page.getByTestId('vps.console.copy_ssh')).toContainText(/Copied|Copy failed/);

    await page.getByTestId('vps.console.reconnect').click();
    await expect(page.getByTestId('vps.console.connection_state')).toContainText(/Reconnecting|Connected/);
    await expect(page.getByTestId('vps.console.frame_status')).toContainText('Connected');

    const normalBox = await page.getByTestId('vps.console.frame').boundingBox();
    await page.getByTestId('vps.console.focus').click();
    await expect(page.getByTestId('vps.console.exit_focus')).toBeVisible();
    const focusedBox = await page.getByTestId('vps.console.frame').boundingBox();
    expect(focusedBox?.height ?? 0).toBeGreaterThan(normalBox?.height ?? 0);
    await page.getByTestId('vps.console.exit_focus').click();
    await expect(page.getByTestId('vps.console.focus')).toBeVisible();

    // Recreate session (opens a confirm dialog when a session exists).
    await page.getByTestId('vps.console.new_session').click();
    await expect(page.getByTestId('vps.console.new_session_dialog')).toBeVisible();
    await page.getByTestId('vps.console.new_session_dialog.confirm').click();

    await expect
      .poll(async () => await iframe.getAttribute('src'))
      .toContain('/_console/console/123?session=T2');

    expect(deleteCalls).toBe(1);
    expect(createCalls).toBe(2);
  });

  test('keeps direct admin console navigation and reload read-only until explicit session creation', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await routeConsoleStub(page);

    let createCalls = 0;

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 90 },
      handlers: {
        'GET vpses/123': () => ({ vps }),
        'GET ip_addresses': () => ({ ip_addresses: [] }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'POST vpses/123/console_token': () => {
          createCalls += 1;
          return {
            token: 'ADMIN',
            expiration: '2027-01-31T00:00:00Z',
          };
        },
      },
    });

    await page.goto('/admin/vps/123/console');
    await expect(page.getByTestId('vps.console.page')).toBeVisible();
    await expect(page.getByTestId('vps.console.connection_state')).toContainText('Disconnected');
    expect(createCalls).toBe(0);

    await page.reload();
    await expect(page.getByTestId('vps.console.page')).toBeVisible();
    await expect(page.getByTestId('vps.console.not_started')).toBeVisible();
    expect(createCalls).toBe(0);

    await page.getByTestId('vps.console.new_session').click();
    await expect.poll(() => createCalls).toBe(1);
    await expect(page.getByTestId('vps.console.open_new_tab')).toHaveAttribute(
      'href',
      /\/_console\/console\/123\?session=ADMIN/
    );
    await expect(page.getByTestId('vps.console.frame_status')).toContainText('Connected');
  });

  test('shows actionable API error state', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    let createCalls = 0;
    await installHaveApiMock(page, {
      user: { id: 1, login: 'test', level: 1 },
      handlers: {
        'GET vpses/123': () => ({ vps }),
        'GET ip_addresses': () => ({ ip_addresses: [] }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'POST vpses/123/console_token': () => {
          createCalls += 1;
          return {
            status: false,
            message: 'console token unavailable',
            response: null,
          };
        },
      },
    });

    await page.goto('/app/vps/123/console');

    await expect(page.getByTestId('vps.console.not_started')).toBeVisible();
    expect(createCalls).toBe(0);
    await page.getByTestId('vps.console.new_session').click();
    await expect(page.getByTestId('vps.console.connection_state')).toContainText('Failed');
    await expect(page.getByTestId('vps.console.error')).toContainText('The console session could not be created');
    await expect(page.getByTestId('vps.console.retry')).toBeVisible();

    await page.getByTestId('vps.console.retry').click();
    await expect.poll(() => createCalls).toBeGreaterThanOrEqual(2);
  });

  test('fails closed when replacing a session cannot prove the old token stayed valid', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await routeConsoleStub(page);

    let createCalls = 0;
    let deleteCalls = 0;
    await installHaveApiMock(page, {
      user: { id: 1, login: 'test', level: 1 },
      handlers: {
        'GET vpses/123': () => ({ vps }),
        'GET ip_addresses': () => ({ ip_addresses: [] }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'POST vpses/123/console_token': () => {
          createCalls += 1;
          return { token: `T${createCalls}`, expiration: '2027-01-31T00:00:00Z' };
        },
        'DELETE vpses/123/console_token': () => {
          deleteCalls += 1;
          return { status: false, message: 'console revoke outcome unknown', response: null };
        },
      },
    });

    await page.goto('/app/vps/123/console');
    await page.getByTestId('vps.console.new_session').click();
    await expect(page.getByTestId('vps.console.iframe')).toBeVisible();

    await page.getByTestId('vps.console.new_session').click();
    await page.getByTestId('vps.console.new_session_dialog.confirm').click();

    await expect(page.getByTestId('vps.console.new_session_error')).toBeVisible();
    await expect(page.getByTestId('vps.console.revoked')).toBeVisible();
    await expect(page.getByTestId('vps.console.iframe')).toHaveCount(0);
    expect(deleteCalls).toBe(1);
    expect(createCalls).toBe(1);
  });

  test('clears a stale revoke error after an explicit replacement succeeds', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await routeConsoleStub(page);

    let createCalls = 0;
    let deleteCalls = 0;
    await installHaveApiMock(page, {
      user: { id: 1, login: 'test', level: 1 },
      handlers: {
        'GET vpses/123': () => ({ vps }),
        'GET ip_addresses': () => ({ ip_addresses: [] }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'POST vpses/123/console_token': () => {
          createCalls += 1;
          return { token: `T${createCalls}`, expiration: '2027-01-31T00:00:00Z' };
        },
        'DELETE vpses/123/console_token': () => {
          deleteCalls += 1;
          if (deleteCalls === 1) {
            return { status: false, message: 'temporary revoke failure', response: null };
          }
          return {};
        },
      },
    });

    await page.goto('/app/vps/123/console');
    await page.getByTestId('vps.console.new_session').click();
    await expect(page.getByTestId('vps.console.iframe')).toBeVisible();

    await page.getByTestId('vps.console.revoke_session').click();
    await page.getByTestId('vps.console.revoke_session_dialog.confirm').click();
    await expect(page.getByTestId('vps.console.revoke_error')).toBeVisible();

    await page.getByTestId('vps.console.new_session').click();
    await page.getByTestId('vps.console.new_session_dialog.confirm').click();

    await expect(page.getByTestId('vps.console.revoke_error')).toHaveCount(0);
    await expect(page.getByTestId('vps.console.open_new_tab')).toHaveAttribute(
      'href',
      /\/_console\/console\/123\?session=T2/
    );
    expect(deleteCalls).toBe(2);
    expect(createCalls).toBe(2);
  });

  test('shows unavailable state when no console server is configured', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    await installHaveApiMock(page, {
      user: { id: 1, login: 'test', level: 1 },
      handlers: {
        'GET vpses/123': () => ({
          vps: {
            ...vps,
            node: { ...vps.node, location: { label: 'dc1' } },
          },
        }),
        'GET ip_addresses': () => ({ ip_addresses: [] }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
      },
    });

    await page.goto('/app/vps/123/console');

    await expect(page.getByTestId('vps.console.connection_state')).toContainText('Unavailable');
    await expect(page.getByTestId('vps.console.server_missing')).toContainText('remote console server configured');
    await expect(page.getByTestId('vps.console.iframe')).toHaveCount(0);
  });
});
