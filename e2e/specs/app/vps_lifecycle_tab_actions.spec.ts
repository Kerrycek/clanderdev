import { expect, test, type Page } from '@playwright/test';

import { bootstrapVpsAdminWindow, failEnvelope, installHaveApiMock } from '../../fixtures';

const vps = {
  id: 123,
  hostname: 'vps123.example',
  object_state: 'active',
  expiration_date: '2026-08-01T00:00:00.000Z',
  remind_after_date: '2026-07-20T00:00:00.000Z',
  is_running: false,
  enable_network: true,
  cpus: 2,
  memory: 2048,
  swap: 0,
  diskspace: 20480,
  used_memory: 768,
  used_swap: 0,
  used_diskspace: 5120,
  uptime: 0,
  loadavg1: 0,
  node: { id: 1, domain_name: 'node1.example', location: { id: 2, label: 'Praha-2', environment: { id: 1, label: 'prod' } } },
  user: { id: 7, login: 'owner' },
  os_template: { id: 6, label: 'Debian latest' },
  dataset: { id: 901, name: 'tank/vps/123/root' },
  dns_resolver: 'inherit',
};

const osTemplates = [
  { id: 6, label: 'Debian latest', enabled: true, hypervisor_type: 'vpsadminos' },
  { id: 7, label: 'AlmaLinux 9', enabled: true, hypervisor_type: 'vpsadminos' },
];

function runningActionState(id: number, label: string) {
  return {
    action_state: {
      id,
      label,
      status: true,
      finished: false,
      current: 1,
      total: 2,
      created_at: '2026-07-15T12:00:00Z',
      updated_at: '2026-07-15T12:00:01Z',
    },
  };
}

async function installLifecycleMock(page: Page, options?: { updateVps?: () => unknown }) {
  let ipAddressRequests = 0;
  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 99 },
    handlers: {
      'GET vpses': () => ({
        vpses: [
          {
            ...vps,
            id: 321,
            hostname: 'vps123-playground',
            dataset: { id: 902, name: 'tank/vps/321/root' },
            node: { id: 1, domain_name: 'node1.example', location: { id: 2, label: 'Praha-2', environment: { id: 1, label: 'prod' } } },
            memory: 2048,
            swap: 512,
            diskspace: 20480,
          },
        ],
      }),
      'GET vpses/123': () => ({ vps }),
      'GET vpses/321': () => ({
        vps: {
          ...vps,
          id: 321,
          hostname: 'vps123-playground',
          dataset: { id: 902, name: 'tank/vps/321/root' },
          memory: 2048,
          swap: 512,
          diskspace: 20480,
        },
      }),
      'GET ip_addresses': () => {
        ipAddressRequests += 1;
        return { ip_addresses: [] };
      },
      'GET vpses/123/statuses': () => ({ statuses: [] }),
      'GET vpses/123/state_logs': () => ({ state_logs: [] }),
      'GET vpses/321/statuses': () => ({ statuses: [] }),
      'GET vpses/321/state_logs': () => ({ state_logs: [] }),
      'GET transaction_chains': () => ({ transaction_chains: [] }),
      'GET os_templates': () => ({ os_templates: osTemplates }),
      'GET nodes': () => ({
        nodes: [
          { id: 1, domain_name: 'node1.example', location: { id: 2, label: 'Praha-2', environment: { id: 1, label: 'prod' } } },
          { id: 2, domain_name: 'node2.example', location: { id: 2, label: 'Praha-2', environment: { id: 1, label: 'prod' } } },
          { id: 5, domain_name: 'node5.example', location: { id: 5, label: 'Brno', environment: { id: 2, label: 'staging' } } },
        ],
      }),
      'PUT vpses/123': options?.updateVps ?? (() => ({ vps, _meta: { action_state_id: 506 } })),
      'POST vpses/123/start': () => ({ _meta: { action_state_id: 503 } }),
      'POST vpses/123/stop': () => ({ _meta: { action_state_id: 504 } }),
      'POST vpses/123/restart': () => ({ _meta: { action_state_id: 505 } }),
      'GET action_states/503': () => runningActionState(503, 'Start VPS'),
      'GET action_states/504': () => runningActionState(504, 'Stop VPS'),
      'GET action_states/505': () => runningActionState(505, 'Restart VPS'),
      'POST vpses/123/clone': () => ({ vps: { id: 456, hostname: 'admin-clone' }, _meta: { action_state_id: 507 } }),
      'POST vpses/123/swap_with': () => ({ _meta: { action_state_id: 508 } }),
      'POST vpses/123/replace': () => ({ vps: { id: 789, hostname: 'replacement' }, _meta: { action_state_id: 509 } }),
      'POST vpses/123/boot': () => ({ _meta: { action_state_id: 501 } }),
      'POST vpses/123/reinstall': () => ({ _meta: { action_state_id: 502 } }),
      'POST vpses/123/migrate': () => ({ _meta: { action_state_id: 510 } }),
      'DELETE vpses/123': () => ({ _meta: { action_state_id: 511 } }),
    },
  });

  return { ipAddressRequests: () => ipAddressRequests };
}

test.describe('@pr-smoke VPS lifecycle tab', () => {
  test('resets configuration review and lifetime editor when the VPS route changes', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installLifecycleMock(page);
    const navigate = (path: string) => page.evaluate((nextPath) => {
      window.history.pushState({}, '', nextPath);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);

    await page.goto('/admin/vps/123/config');
    await page.getByRole('textbox', { name: /^Hostname / }).fill('draft-for-vps-a.example');
    await page.getByRole('button', { name: 'Save (1)' }).click();
    await expect(page.getByText('Review and apply VPS configuration changes?')).toBeVisible();
    await navigate('/admin/vps/321/config');
    await expect(page.getByText('Review and apply VPS configuration changes?')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: /^Hostname / })).toHaveValue('vps123-playground');

    await navigate('/admin/vps/123/lifecycle/lifetime');
    await page.getByTestId('lifetimes.admin.edit').click();
    await expect(page.getByTestId('lifetimes.admin.modal')).toBeVisible();
    await page.getByTestId('lifetimes.admin.reason').fill('draft reason for VPS A');
    await navigate('/admin/vps/321/lifecycle/lifetime');
    await expect(page.getByTestId('lifetimes.admin.modal')).toHaveCount(0);
  });

  test('posts legacy rescue boot payload', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installLifecycleMock(page);

    await page.goto('/admin/vps/123/lifecycle/boot');

    await expect(page.getByTestId('vps.lifecycle.page')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.boot')).toBeVisible();

    await page.getByTestId('vps.lifecycle.boot.os_template').selectOption('7');
    await page.getByTestId('vps.lifecycle.boot.mountpoint').fill('/mnt/rescue-root');
    await expect(page.getByTestId('vps.lifecycle.boot.confirm').locator('input')).toHaveCount(0);

    const reqPromise = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().includes('/api/v7.0/vpses/123/boot')
    );

    await page.getByTestId('vps.lifecycle.boot.submit').click();
    await page.getByTestId('vps.lifecycle.boot.submit.confirm_dialog.confirm').click();

    const req = await reqPromise;
    expect(req.postDataJSON()).toEqual({
      vps: {
        os_template: 7,
        mount_root_dataset: '/mnt/rescue-root',
      },
    });
  });

  test('@workflow-matrix admin sees lifecycle controls reserved for admin mode', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installLifecycleMock(page);

    await page.goto('/admin/vps/123/lifecycle');

    await expect(page.getByTestId('vps.lifecycle.action_index')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.daily_actions')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.admin_actions')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.action_link.start')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.action_link.stop')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.action_link.restart')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.action_link.clone')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.action_link.swap')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.action_link.delete')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.action_link.lifetime')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.action_link.replace')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.action_link.migrate')).toBeVisible();
    await page.getByTestId('vps.lifecycle.action_link.migrate').click();
    await expect(page).toHaveURL(/\/admin\/vps\/123\/lifecycle\/migrate$/);
    await expect(page.getByTestId('vps.lifecycle.migrate')).toBeVisible();
  });

  test('@workflow-matrix focused lifecycle start action posts start endpoint', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installLifecycleMock(page);

    await page.goto('/admin/vps/123/lifecycle/start');

    await expect(page.getByTestId('vps.lifecycle.start')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.start.current_state')).toContainText('Stopped');
    await page.getByTestId('vps.lifecycle.start.confirm').check();

    const reqPromise = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().includes('/api/v7.0/vpses/123/start')
    );

    await page.getByTestId('vps.lifecycle.start.submit').click();

    const req = await reqPromise;
    expect(req.postDataJSON()).toEqual({});

    await expect(page.getByTestId('modal.action_progress')).toBeVisible();
    await page.getByTestId('modal.action_progress.open_tasks').click();
    await expect(page.getByTestId('tasks.drawer')).toHaveAttribute('aria-modal', 'false');
    await expect(page.getByTestId('tasks.row.503')).toContainText('Start VPS');
    await expect(page.getByTestId('vps.lifecycle.page')).toBeVisible();
  });

  test('@workflow-matrix focused lifecycle stop action can send force flag', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 99 },
      handlers: {
        'GET vpses/123': () => ({ vps: { ...vps, is_running: true } }),
        'GET ip_addresses': () => ({ ip_addresses: [] }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'POST vpses/123/stop': () => ({ _meta: { action_state_id: 514 } }),
        'POST vpses/123/restart': () => ({ _meta: { action_state_id: 515 } }),
        'GET action_states/514': () => runningActionState(514, 'Stop VPS'),
      },
    });

    await page.goto('/admin/vps/123/lifecycle/stop');
    await expect(page.getByTestId('vps.lifecycle.stop')).toBeVisible();
    await page.getByTestId('vps.lifecycle.stop.force').check();
    await page.getByTestId('vps.lifecycle.stop.confirm').check();

    const stopReqPromise = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().includes('/api/v7.0/vpses/123/stop')
    );

    await page.getByTestId('vps.lifecycle.stop.submit').click();
    const stopReq = await stopReqPromise;
    expect(stopReq.postDataJSON()).toEqual({ vps: { force: true } });

    await expect(page.getByTestId('modal.action_progress')).toBeVisible();
    await page.getByTestId('modal.action_progress.open_tasks').click();
    await expect(page.getByTestId('tasks.drawer')).toHaveAttribute('aria-modal', 'false');
    await expect(page.getByTestId('tasks.row.514')).toContainText('Stop VPS');
    await expect(page.getByTestId('vps.lifecycle.page')).toBeVisible();
  });

  test('@workflow-matrix focused lifecycle restart action can send force flag', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 99 },
      handlers: {
        'GET vpses/123': () => ({ vps: { ...vps, is_running: true } }),
        'GET ip_addresses': () => ({ ip_addresses: [] }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'POST vpses/123/restart': () => ({ _meta: { action_state_id: 515 } }),
        'GET action_states/515': () => runningActionState(515, 'Restart VPS'),
      },
    });

    await page.goto('/admin/vps/123/lifecycle/restart');
    await expect(page.getByTestId('vps.lifecycle.restart')).toBeVisible();
    await page.getByTestId('vps.lifecycle.restart.force').check();
    await page.getByTestId('vps.lifecycle.restart.confirm').check();

    const restartReqPromise = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().includes('/api/v7.0/vpses/123/restart')
    );

    await page.getByTestId('vps.lifecycle.restart.submit').click();
    const restartReq = await restartReqPromise;
    expect(restartReq.postDataJSON()).toEqual({ vps: { force: true } });

    await expect(page.getByTestId('modal.action_progress')).toBeVisible();
    await page.getByTestId('modal.action_progress.open_tasks').click();
    await expect(page.getByTestId('tasks.drawer')).toHaveAttribute('aria-modal', 'false');
    await expect(page.getByTestId('tasks.row.515')).toContainText('Restart VPS');
    await expect(page.getByTestId('vps.lifecycle.page')).toBeVisible();
  });

  test('overview management panel keeps user actions and marks admin-only lifecycle actions', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installLifecycleMock(page);

    await page.goto('/admin/vps/123');

    await expect(page.getByTestId('vps.overview.lifecycle')).toBeVisible();
    await expect(page.getByTestId('vps.overview.management.admin_context')).toBeVisible();

    await page.goto('/admin/vps/123/lifecycle');
    await expect(page.getByTestId('vps.lifecycle.action_link.reinstall')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.action_link.clone')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.action_link.swap')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.action_link.delete')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.action_link.migrate')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.action_link.replace')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.action_link.lifetime')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.action_link.template')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.action_link.boot')).toBeVisible();

    await page.getByTestId('vps.lifecycle.action_link.reinstall').click();
    await expect(page).toHaveURL(/\/admin\/vps\/123\/lifecycle\/reinstall$/);
  });

  test('can boot rescue template without mounting the original root dataset', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installLifecycleMock(page);

    await page.goto('/admin/vps/123/lifecycle/boot');

    await page.getByTestId('vps.lifecycle.boot.mount_root_dataset').uncheck();
    await expect(page.getByTestId('vps.lifecycle.boot.mountpoint')).toBeDisabled();
    await expect(page.getByTestId('vps.lifecycle.boot.confirm').locator('input')).toHaveCount(0);

    const reqPromise = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().includes('/api/v7.0/vpses/123/boot')
    );

    await page.getByTestId('vps.lifecycle.boot.submit').click();
    await page.getByTestId('vps.lifecycle.boot.submit.confirm_dialog.confirm').click();

    const req = await reqPromise;
    expect(req.postDataJSON()).toEqual({
      vps: {
        os_template: 6,
      },
    });
  });

  test('posts legacy reinstall payload from lifecycle tab', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    const mock = await installLifecycleMock(page);

    await page.goto('/admin/vps/123/lifecycle/reinstall');

    await expect(page.getByTestId('vps.lifecycle.reinstall.impact')).toBeVisible();
    expect(mock.ipAddressRequests()).toBe(1);
    await page.getByTestId('vps.lifecycle.reinstall.os_template').selectOption('7');
    await expect(page.getByTestId('vps.lifecycle.reinstall.confirm').locator('input')).toHaveCount(0);

    const reqPromise = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().includes('/api/v7.0/vpses/123/reinstall')
    );

    await page.getByTestId('vps.lifecycle.reinstall.submit').click();
    const proofScreenshot = process.env.E2E_VPS_PROOF_SCREENSHOT?.trim();
    if (proofScreenshot) {
      await page.screenshot({ path: proofScreenshot, fullPage: true });
    }
    await page.getByTestId('vps.lifecycle.reinstall.submit.confirm_dialog.confirm').click();

    const req = await reqPromise;
    expect(req.postDataJSON()).toEqual({
      vps: {
        os_template: 7,
      },
    });
  });

  test('reinstall can include inline user data when explicitly enabled', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installLifecycleMock(page);

    await page.goto('/admin/vps/123/lifecycle/reinstall');

    await page.getByTestId('vps.lifecycle.reinstall.os_template').selectOption('7');
    await page.getByTestId('vps.lifecycle.reinstall.user_data.summary').click();
    await page.getByTestId('vps.lifecycle.reinstall.user_data.enable').check();
    await page.getByTestId('vps.lifecycle.reinstall.user_data.format').selectOption('cloudinit_script');
    await page.getByTestId('vps.lifecycle.reinstall.user_data.content').fill('  #cloud-config\npackages: []\n  ');

    const reqPromise = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().includes('/api/v7.0/vpses/123/reinstall')
    );

    await page.getByTestId('vps.lifecycle.reinstall.submit').click();
    await page.getByTestId('vps.lifecycle.reinstall.submit.confirm_dialog.confirm').click();

    const req = await reqPromise;
    expect(req.postDataJSON()).toEqual({
      vps: {
        os_template: 7,
        user_data_format: 'cloudinit_script',
        user_data_content: '#cloud-config\npackages: []',
      },
    });
  });

  test('admin clone posts owner and node payload, not location', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installLifecycleMock(page);

    await page.goto('/admin/vps/123/lifecycle/clone');

    await page.getByTestId('vps.lifecycle.clone.user').fill('#8');
    await page.getByTestId('vps.lifecycle.clone.node').fill('#3');
    await page.getByTestId('vps.lifecycle.clone.hostname').fill('admin-clone');
    await page.getByTestId('vps.lifecycle.clone.confirm').check();

    const reqPromise = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().includes('/api/v7.0/vpses/123/clone')
    );

    await page.getByTestId('vps.lifecycle.clone.submit').click();

    const req = await reqPromise;
    expect(req.postDataJSON()).toEqual({
      vps: {
        hostname: 'admin-clone',
        subdatasets: true,
        dataset_plans: true,
        resources: true,
        features: true,
        stop: true,
        user: 8,
        node: 3,
      },
    });
    await expect(page).toHaveURL(/\/admin\/vps\/456$/);
  });

  test('admin swap includes legacy admin-only options', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installLifecycleMock(page);

    await page.goto('/admin/vps/123/lifecycle/swap');

    await expect(page.getByTestId('vps.lifecycle.swap')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('vps.lifecycle.summary').getByText('Swap VPS')).toHaveCount(1);
    await expect(page.getByTestId('vps.lifecycle.swap.candidate.321')).toContainText('Likely');
    await expect(page.getByTestId('vps.lifecycle.swap.candidate.321.reasons')).toContainText('staging/playground name');
    await page.getByTestId('vps.lifecycle.swap.target').fill('#321');
    await expect(page.getByTestId('vps.lifecycle.swap.preview')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.swap.preview.after_table')).toContainText('This VPS receives');
    await expect(page.getByTestId('vps.lifecycle.swap.preview.after_table')).toContainText('Target receives');
    await expect(page.getByTestId('vps.lifecycle.swap.impact.dataset')).toContainText('tank/vps/123/root');
    await expect(page.getByTestId('vps.lifecycle.swap.impact.dataset')).toContainText('tank/vps/321/root');
    await expect(page.getByTestId('vps.lifecycle.swap.preview.after_table')).toContainText('tank/vps/321/root');
    await expect(page.getByTestId('vps.lifecycle.swap.preview.options')).toContainText('Admin swap flags');
    await page.getByTestId('vps.lifecycle.swap.resources').uncheck();
    await page.getByTestId('vps.lifecycle.swap.confirm').check();

    const reqPromise = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().includes('/api/v7.0/vpses/123/swap_with')
    );

    await page.getByTestId('vps.lifecycle.swap.submit').click();

    const req = await reqPromise;
    expect(req.postDataJSON()).toEqual({
      vps: {
        vps: 321,
        hostname: true,
        resources: false,
        expirations: true,
      },
    });
  });

  test('swap manual lookup works when no likely staging candidate exists', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installHaveApiMock(page, {
      user: { id: 7, login: 'owner', level: 1 },
      handlers: {
        'GET vpses': () => ({
          vpses: [
            { ...vps, id: 321, hostname: 'vps123-copy', memory: 4096, swap: 512, diskspace: 40960 },
          ],
        }),
        'GET vpses/123': () => ({ vps }),
        'GET vpses/321': () => ({
          vps: { ...vps, id: 321, hostname: 'vps123-copy', memory: 4096, swap: 512, diskspace: 40960 },
        }),
        'GET locations': () => ({ locations: [{ id: 2, label: 'Praha-2' }] }),
        'GET ip_addresses': () => ({ ip_addresses: [] }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'POST vpses/123/swap_with': () => ({ _meta: { action_state_id: 512 } }),
      },
    });

    await page.goto('/app/vps/123/lifecycle/swap');

    await expect(page.getByTestId('vps.lifecycle.swap')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('No likely staging target found')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.swap.candidate.321')).toHaveCount(0);
    await page.getByTestId('vps.lifecycle.swap.target').fill('#321');
    await expect(page.getByTestId('vps.lifecycle.swap.preview.target_label')).toContainText('vps123-copy');
    await page.getByTestId('vps.lifecycle.swap.confirm').check();

    const reqPromise = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().includes('/api/v7.0/vpses/123/swap_with')
    );

    await page.getByTestId('vps.lifecycle.swap.submit').click();

    const req = await reqPromise;
    expect(req.postDataJSON()).toEqual({
      vps: {
        vps: 321,
      },
    });
  });

  test('admin can change VPS lifecycle expiration payload', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installLifecycleMock(page, { updateVps: () => ({ vps, _meta: {} }) });
    const expirationInput = '2026-09-15T10:45';
    const expectedExpirationIso = new Date(expirationInput).toISOString();

    await page.goto('/admin/vps/123/lifecycle/lifetime');

    await expect(page.getByTestId('vps.lifecycle.lifetime')).toBeVisible();
    await page.getByTestId('lifetimes.admin.edit').click();
    await page.getByTestId('lifetimes.admin.expiration').fill(expirationInput);
    await page.getByTestId('lifetimes.admin.reason').fill('extend staging validation');

    const reqPromise = page.waitForRequest(
      (r) => r.method() === 'PUT' && r.url().includes('/api/v7.0/vpses/123')
    );

    await page.getByTestId('lifetimes.admin.modal').getByRole('button', { name: 'Save' }).click();

    const req = await reqPromise;
    expect(req.postDataJSON()).toEqual({
      vps: {
        expiration_date: expectedExpirationIso,
        change_reason: 'extend staging validation',
      },
    });
    await expect(page.getByTestId('lifetimes.admin.modal')).toHaveCount(0);
    await expect(page.getByTestId('vps.mutation.uncertain')).toHaveCount(0);
  });

  test('admin can clear VPS lifecycle expiration and reminder payload', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installLifecycleMock(page);

    await page.goto('/admin/vps/123/lifecycle/lifetime');

    await page.getByTestId('lifetimes.admin.edit').click();
    await page.getByTestId('lifetimes.admin.expiration.clear').click();

    const reqPromise = page.waitForRequest(
      (r) => r.method() === 'PUT' && r.url().includes('/api/v7.0/vpses/123')
    );

    await page.getByTestId('lifetimes.admin.modal').getByRole('button', { name: 'Save' }).click();

    const req = await reqPromise;
    expect(req.postDataJSON()).toEqual({
      vps: {
        expiration_date: null,
        remind_after_date: null,
      },
    });
  });

  test('admin template update posts OS template and auto-update flag', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installLifecycleMock(page);

    await page.goto('/admin/vps/123/lifecycle/template');

    await page.getByTestId('vps.lifecycle.template.os_template').selectOption('7');
    await page.getByTestId('vps.lifecycle.template.auto_update').check();
    await expect(page.getByTestId('vps.lifecycle.template.confirm').locator('input')).toHaveCount(0);

    const reqPromise = page.waitForRequest(
      (r) => r.method() === 'PUT' && r.url().includes('/api/v7.0/vpses/123')
    );

    await page.getByTestId('vps.lifecycle.template.submit').click();
    await page.getByTestId('vps.lifecycle.template.submit.confirm_dialog.confirm').click();

    const req = await reqPromise;
    expect(req.postDataJSON()).toEqual({
      vps: {
        os_template: 7,
        enable_os_template_auto_update: true,
      },
    });
  });

  test('admin replace posts node, expiration, start and reason payload', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installLifecycleMock(page);
    const expirationInput = '2026-07-01T12:30';
    const expectedExpirationIso = new Date(expirationInput).toISOString();

    await page.goto('/admin/vps/123/lifecycle/replace');

    await page.getByTestId('vps.lifecycle.replace.node').fill('#4');
    await page.getByTestId('vps.lifecycle.replace.expiration').fill(expirationInput);
    await page.getByTestId('vps.lifecycle.replace.start').check();
    await page.getByTestId('vps.lifecycle.replace.reason').fill('staging replacement');
    await expect(page.getByTestId('vps.lifecycle.replace.confirm').locator('input')).toHaveCount(0);

    const reqPromise = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().includes('/api/v7.0/vpses/123/replace')
    );

    await page.getByTestId('vps.lifecycle.replace.submit').click();
    await page.getByTestId('vps.lifecycle.replace.submit.confirm_dialog.confirm').click();

    const req = await reqPromise;
    expect(req.postDataJSON()).toEqual({
      vps: {
        node: 4,
        expiration_date: expectedExpirationIso,
        start: true,
        reason: 'staging replacement',
      },
    });
    await expect(page).toHaveURL(/\/admin\/vps\/789$/);
  });

  test('admin migrate posts migration options and schedule payload', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installLifecycleMock(page);

    await page.goto('/admin/vps/123/lifecycle/migrate');

    await expect(page.getByTestId('vps.lifecycle.summary').getByText('Migrate VPS')).toHaveCount(1);
    await page.getByTestId('vps.lifecycle.migrate.node').fill('node5');
    await page.getByTestId('vps.lifecycle.migrate.node.opt.5').click();
    await expect(page.getByTestId('vps.lifecycle.migrate.node')).toHaveValue('node5.example (#5)');
    await page.getByTestId('vps.lifecycle.migrate.replace_ip_addresses').check();
    await page.getByTestId('vps.lifecycle.migrate.transfer_ip_addresses').uncheck();
    await page.getByTestId('vps.lifecycle.migrate.schedule').selectOption('custom');
    await page.getByTestId('vps.lifecycle.migrate.stop_on_error').check();
    await page.getByTestId('vps.lifecycle.migrate.cleanup_data').check();
    await page.getByTestId('vps.lifecycle.migrate.send_mail').check();
    await page.getByTestId('vps.lifecycle.migrate.finish_weekday').selectOption('2');
    await page.getByTestId('vps.lifecycle.migrate.finish_hour').selectOption('1');
    await page.getByTestId('vps.lifecycle.migrate.advanced').locator('summary').click();
    await page.getByTestId('vps.lifecycle.migrate.no_start').check();
    await page.getByTestId('vps.lifecycle.migrate.reason').fill('rack maintenance');
    await page.getByTestId('vps.lifecycle.migrate.confirm').check();

    const reqPromise = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().includes('/api/v7.0/vpses/123/migrate')
    );

    await page.getByTestId('vps.lifecycle.migrate.submit').click();

    const req = await reqPromise;
    expect(req.postDataJSON()).toEqual({
      vps: {
        node: 5,
        replace_ip_addresses: true,
        transfer_ip_addresses: false,
        maintenance_window: false,
        stop_on_error: true,
        cleanup_data: true,
        no_start: true,
        skip_start: false,
        send_mail: true,
        finish_weekday: 2,
        finish_minutes: 60,
        reason: 'rack maintenance',
      },
    });
  });

  test('admin migrate follows legacy IP option availability for same-location moves', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installLifecycleMock(page);

    await page.goto('/admin/vps/123/lifecycle/migrate');

    await page.getByTestId('vps.lifecycle.migrate.node').fill('node2');
    await page.getByTestId('vps.lifecycle.migrate.node.opt.2').click();
    await expect(page.getByTestId('vps.lifecycle.migrate.node')).toHaveValue('node2.example (#2)');

    await expect(page.getByTestId('vps.lifecycle.migrate.transfer_ip_addresses')).toHaveCount(0);
    await expect(page.getByTestId('vps.lifecycle.migrate.replace_ip_addresses')).toHaveCount(0);
    await expect(page.getByTestId('vps.lifecycle.migrate.schedule')).toHaveValue('maintenance');

    await page.getByTestId('vps.lifecycle.migrate.confirm').check();

    const reqPromise = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().includes('/api/v7.0/vpses/123/migrate')
    );

    await page.getByTestId('vps.lifecycle.migrate.submit').click();

    const req = await reqPromise;
    expect(req.postDataJSON()).toEqual({
      vps: {
        node: 2,
        replace_ip_addresses: false,
        transfer_ip_addresses: false,
        maintenance_window: true,
        stop_on_error: true,
        cleanup_data: true,
        no_start: false,
        skip_start: false,
        send_mail: true,
      },
    });
  });

  test('admin delete can request lazy delete', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installLifecycleMock(page);

    await page.goto('/admin/vps/123/lifecycle/delete');

    await page.getByTestId('vps.lifecycle.delete.lazy').check();
    await expect(page.getByTestId('vps.lifecycle.delete.confirm')).toHaveCount(0);

    const reqPromise = page.waitForRequest(
      (r) => r.method() === 'DELETE' && r.url().includes('/api/v7.0/vpses/123')
    );

    await page.getByTestId('vps.lifecycle.delete.submit').click();
    await page.getByTestId('vps.lifecycle.delete.submit.confirm_dialog.confirm').click();

    const req = await reqPromise;
    expect(req.postDataJSON()).toEqual({
      vps: {
        lazy: true,
      },
    });
    await expect(page).toHaveURL(/\/admin\/vps$/);
  });

  test('delete without an action-state id stays on the VPS and fails closed', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 99 },
      handlers: {
        'GET vpses/123': () => ({ vps }),
        'GET ip_addresses': () => ({ ip_addresses: [] }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'DELETE vpses/123': () => ({ _meta: {} }),
      },
    });

    await page.goto('/admin/vps/123/lifecycle/delete');
    await page.getByTestId('vps.lifecycle.delete.submit').click();
    await page.getByTestId('vps.lifecycle.delete.submit.confirm_dialog.confirm').click();

    await expect(page).toHaveURL(/\/admin\/vps\/123\/lifecycle\/delete$/);
    await expect(page.getByTestId('vps.lifecycle.delete')).toContainText(/server did not return a task identifier/i);
    await expect(page.getByTestId('modal.action_progress')).toBeHidden();
  });

  test('@workflow-matrix regular user gets legacy reinstall, clone, swap and delete actions without admin-only lifecycle actions', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installHaveApiMock(page, {
      user: { id: 7, login: 'owner', level: 1 },
      handlers: {
        'GET vpses': () => ({ vpses: [] }),
        'GET vpses/123': () => ({ vps }),
        'GET locations': () => ({ locations: [{ id: 2, label: 'Praha-2' }] }),
        'GET ip_addresses': () => ({ ip_addresses: [] }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'DELETE vpses/123': () => ({ _meta: { action_state_id: 503 } }),
      },
    });

    await page.goto('/app/vps/123/lifecycle');

    await expect(page.getByTestId('vps.lifecycle.page')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.action_link.clone')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.action_link.swap')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.action_link.delete')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.action_link.reinstall')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.action_link.lifetime')).toHaveCount(0);
    await expect(page.getByTestId('vps.lifecycle.action_link.replace')).toHaveCount(0);
    await expect(page.getByTestId('vps.lifecycle.action_link.migrate')).toHaveCount(0);
    await expect(page.getByTestId('lifetimes.admin.edit')).toHaveCount(0);
    await expect(page.getByTestId('lifetimes.admin.log')).toHaveCount(0);

    await page.goto('/app/vps/123/lifecycle/delete');
    await expect(page.getByTestId('vps.lifecycle.delete.lazy')).toHaveCount(0);
    await expect(page.getByTestId('vps.lifecycle.delete.confirm')).toHaveCount(0);
    await expect(page.getByTestId('vps.lifecycle.delete.submit')).toHaveAttribute('aria-disabled', 'false');

    const reqPromise = page.waitForRequest(
      (r) => r.method() === 'DELETE' && r.url().includes('/api/v7.0/vpses/123')
    );

    await page.getByTestId('vps.lifecycle.delete.submit').click();
    await page.getByTestId('vps.lifecycle.delete.submit.confirm_dialog.confirm').click();

    const req = await reqPromise;
    expect(req.postDataJSON()).toEqual({});
    await expect(page).toHaveURL(/\/app\/vps$/);
  });

  test('regular user clone posts location payload without admin owner or node', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installHaveApiMock(page, {
      user: { id: 7, login: 'owner', level: 1 },
      handlers: {
        'GET vpses': () => ({ vpses: [] }),
        'GET vpses/123': () => ({ vps }),
        'GET locations': () => ({ locations: [{ id: 2, label: 'Praha-2', environment: { id: 9, label: 'Playground' } }] }),
        'GET ip_addresses': () => ({ ip_addresses: [] }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'POST vpses/123/clone': () => ({ vps: { id: 456, hostname: 'vps123-playground' }, _meta: { action_state_id: 504 } }),
      },
    });

    await page.goto('/app/vps/123/lifecycle/clone');

    await page.getByTestId('vps.lifecycle.clone.location').selectOption('2');
    await page.getByTestId('vps.lifecycle.clone.hostname').fill('vps123-playground');
    await page.getByTestId('vps.lifecycle.clone.confirm').check();

    const reqPromise = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().includes('/api/v7.0/vpses/123/clone')
    );

    await page.getByTestId('vps.lifecycle.clone.submit').click();

    const req = await reqPromise;
    expect(req.postDataJSON()).toEqual({
      vps: {
        hostname: 'vps123-playground',
        subdatasets: true,
        dataset_plans: true,
        resources: true,
        features: true,
        stop: true,
        environment: 9,
        location: 2,
      },
    });
    await expect(page).toHaveURL(/\/app\/vps\/456$/);
  });

  test('regular user swap posts only target VPS without admin-only options', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installHaveApiMock(page, {
      user: { id: 7, login: 'owner', level: 1 },
      handlers: {
        'GET vpses': () => ({
          vpses: [
            {
              ...vps,
              id: 321,
              hostname: 'vps123-playground',
              dataset: { id: 902, name: 'tank/vps/321/root' },
              memory: 4096,
              swap: 512,
              diskspace: 40960,
            },
            { ...vps, id: 322, hostname: 'vps123-prod-copy' },
          ],
        }),
        'GET vpses/123': () => ({ vps }),
        'GET vpses/321': () => ({
          vps: {
            ...vps,
            id: 321,
            hostname: 'vps123-playground',
            dataset: { id: 902, name: 'tank/vps/321/root' },
            memory: 4096,
            swap: 512,
            diskspace: 40960,
          },
        }),
        'GET locations': () => ({ locations: [{ id: 2, label: 'Praha-2' }] }),
        'GET ip_addresses': ({ searchParams }: { searchParams: URLSearchParams }) => {
          const vpsId = searchParams.get('ip_address[vps]');
          if (vpsId === '123') {
            return {
              ip_addresses: [
                { id: 1, addr: '203.0.113.10', prefix: 32, network: { id: 1, role: 'public' } },
                { id: 2, addr: '2001:db8::10', prefix: 128, network: { id: 2, role: 'public' } },
              ],
            };
          }
          if (vpsId === '321') {
            return {
              ip_addresses: [
                { id: 3, addr: '203.0.113.99', prefix: 32, network: { id: 1, role: 'public' } },
              ],
            };
          }
          return { ip_addresses: [] };
        },
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'POST vpses/123/swap_with': () => ({ _meta: { action_state_id: 505 } }),
      },
    });

    await page.goto('/app/vps/123/lifecycle/swap');

    await expect(page.getByTestId('vps.lifecycle.swap')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('vps.lifecycle.swap.candidate.321')).toContainText('vps123-playground');
    await expect(page.getByTestId('vps.lifecycle.swap.candidate.321')).toContainText('Likely');
    await expect(page.getByTestId('vps.lifecycle.swap.candidate.321.reasons')).toContainText('same owner');
    await expect(page.getByTestId('vps.lifecycle.swap.candidate.322')).toHaveCount(0);
    await page.getByTestId('vps.lifecycle.swap.candidate.321').click();
    await expect(page.getByTestId('vps.lifecycle.swap.preview')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.swap.preview.source_label')).toContainText('vps123.example');
    await expect(page.getByTestId('vps.lifecycle.swap.preview.target_label')).toContainText('vps123-playground');
    await expect(page.getByTestId('vps.lifecycle.swap.preview')).toContainText('4.0 GiB');
    await expect(page.getByTestId('vps.lifecycle.swap.impact.target_fit')).toContainText('staging/playground naming');
    await expect(page.getByTestId('vps.lifecycle.swap.impact.network')).toContainText('Current VPS has 2 IP address(es); target has 1');
    await expect(page.getByTestId('vps.lifecycle.swap.impact.dataset')).toContainText('tank/vps/123/root');
    await expect(page.getByTestId('vps.lifecycle.swap.impact.dataset')).toContainText('tank/vps/321/root');
    await expect(page.getByTestId('vps.lifecycle.swap.preview.after_table')).toContainText('Dataset:');
    await expect(page.getByTestId('vps.lifecycle.swap.preview.after_table')).toContainText('tank/vps/321/root');
    await expect(page.getByTestId('vps.lifecycle.swap.preview.after_table')).toContainText('IP assignments');
    await expect(page.getByTestId('vps.lifecycle.swap.preview.after_table.source_ips')).toContainText('203.0.113.99');
    await expect(page.getByTestId('vps.lifecycle.swap.preview.after_table.target_ips')).toContainText('2001:db8::10');
    await expect(page.getByTestId('vps.lifecycle.swap.preview.source_ips_after')).toContainText('203.0.113.99');
    await expect(page.getByTestId('vps.lifecycle.swap.preview.target_ips_after')).toContainText('203.0.113.10');
    await expect(page.getByTestId('vps.lifecycle.swap.preview.target_ips_after')).toContainText('2001:db8::10');
    await page.getByTestId('vps.lifecycle.swap.confirm').check();
    await expect(page.getByTestId('vps.lifecycle.swap.hostname')).toHaveCount(0);
    await expect(page.getByTestId('vps.lifecycle.swap.resources')).toHaveCount(0);
    await expect(page.getByTestId('vps.lifecycle.swap.expirations')).toHaveCount(0);

    const reqPromise = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().includes('/api/v7.0/vpses/123/swap_with')
    );

    await page.getByTestId('vps.lifecycle.swap.submit').click();

    const req = await reqPromise;
    expect(req.postDataJSON()).toEqual({
      vps: {
        vps: 321,
      },
    });
  });

  test('swap API errors stay visible in the page workflow', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installHaveApiMock(page, {
      user: { id: 7, login: 'owner', level: 1 },
      handlers: {
        'GET vpses': () => ({
          vpses: [{ ...vps, id: 321, hostname: 'vps123-playground', memory: 4096, swap: 512, diskspace: 40960 }],
        }),
        'GET vpses/123': () => ({ vps }),
        'GET vpses/321': () => ({
          vps: { ...vps, id: 321, hostname: 'vps123-playground', memory: 4096, swap: 512, diskspace: 40960 },
        }),
        'GET locations': () => ({ locations: [{ id: 2, label: 'Praha-2' }] }),
        'GET ip_addresses': () => ({ ip_addresses: [] }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'POST vpses/123/swap_with': () => failEnvelope('swap target is not a staging VPS'),
      },
    });

    await page.goto('/app/vps/123/lifecycle/swap');

    await expect(page.getByTestId('vps.lifecycle.swap')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByTestId('vps.lifecycle.swap.candidate.321').click();
    await page.getByTestId('vps.lifecycle.swap.confirm').check();
    await page.getByTestId('vps.lifecycle.swap.submit').click();

    await expect(page.getByTestId('vps.lifecycle.swap')).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.swap')).toContainText('Swap VPS failed');
    await expect(page.getByTestId('vps.lifecycle.swap')).toContainText('swap target is not a staging VPS');
  });

  test('busy VPS transaction gates lifecycle submissions with an explanation', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 99 },
      handlers: {
        'GET vpses/123': () => ({ vps }),
        'GET ip_addresses': () => ({ ip_addresses: [] }),
        'GET os_templates': () => ({ os_templates: osTemplates }),
        'GET transaction_chains': (ctx) => {
          const cls = ctx.searchParams.get('transaction_chain[class_name]');
          const rowId = ctx.searchParams.get('transaction_chain[row_id]');
          if (cls === 'Vps' && rowId === '123') {
            return {
              transaction_chains: [
                {
                  id: 919,
                  state: 'running',
                  name: 'Vps#123 lifecycle operation',
                  progress: 0,
                  size: 1,
                },
              ],
            };
          }
          return { transaction_chains: [] };
        },
        'DELETE vpses/123': () => {
          throw new Error('delete should be blocked by busy gate');
        },
      },
    });

    await page.goto('/admin/vps/123/lifecycle/delete');

    const submit = page.getByTestId('vps.lifecycle.delete.submit');
    await expect(submit).toBeVisible();
    await expect(page.getByTestId('vps.lifecycle.delete.confirm')).toHaveCount(0);
    await expect(submit).toHaveAttribute('aria-disabled', 'true');
    await expect(submit).toHaveAttribute('title', 'Operation in progress');
  });
});
