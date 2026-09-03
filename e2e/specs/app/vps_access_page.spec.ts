import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';
import {
  expectNoDocumentHorizontalOverflow,
  expectTableHorizontalScrollUsable,
} from '../../helpers/horizontalOverflow';

const vps = {
  id: 123,
  hostname: 'vps123.example',
  object_state: 'active',
  is_running: true,
  enable_network: true,
  cpus: 2,
  memory: 2048,
  swap: 0,
  diskspace: 20480,
  used_memory: 768,
  used_swap: 0,
  used_diskspace: 5120,
  uptime: 12345,
  loadavg1: 0.12,
  node: { id: 1, domain_name: 'node1.example', location: { id: 2, label: 'Praha' } },
  user: { id: 42, login: 'owner' },
  os_template: { id: 6, label: 'Debian 12' },
  dns_resolver: 'inherit',
};

const longPublicKeyLabel = `workstation-${'primary'.repeat(18)}`;
const longPublicKeyFingerprint = `SHA256:${'abcdefghijklmnopqrstuvwxyz0123456789'.repeat(4)}`;
const longPublicKeyComment = `main-laptop-${'comment'.repeat(24)}`;

const publicKeys = [
  { id: 8, label: longPublicKeyLabel, fingerprint: longPublicKeyFingerprint, comment: longPublicKeyComment, auto_add: true },
  { id: 9, label: 'backup', fingerprint: 'SHA256:def', comment: 'backup key', auto_add: false },
];

const hostKeys = [
  {
    id: 1,
    key_type: 'ssh-ed25519',
    fingerprint: 'SHA256:host-ed25519',
    public_key: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestHostKey',
    bits: 256,
    created_at: '2026-01-24T12:00:00Z',
  },
  { id: 2, key_type: 'ssh-rsa', fingerprint: 'SHA256:host-rsa', public_key: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ' },
];

test('@workflow-matrix @pr-smoke @pr-smoke-mobile VPS access page generates root password and deploys saved SSH key', async ({ page }) => {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

  await installHaveApiMock(page, {
    user: { id: 42, login: 'owner', level: 1 },
    handlers: {
      'GET vpses/123': () => ({ vps }),
      'GET ip_addresses': () => ({
        ip_addresses: [{ id: 55, addr: '198.51.100.10', network: { id: 5, role: 'public' } }],
      }),
      'GET transaction_chains': () => ({ transaction_chains: [] }),
      'GET users/42/public_keys': () => ({ public_keys: publicKeys, _meta: { total_count: 2 } }),
      'GET vpses/123/ssh_host_keys': () => ({ ssh_host_keys: hostKeys, _meta: { total_count: 2 } }),
      'POST vpses/123/passwd': () => ({ vps: { password: 'Root-123!' }, _meta: { action_state_id: 700 } }),
      'POST vpses/123/deploy_public_key': () => ({ _meta: { action_state_id: 701 } }),
      'GET action_states/700': () => ({
        action_state: { id: 700, label: 'Passwd', finished: true, status: true, current: 1, total: 1 },
      }),
      'GET action_states/701': () => ({
        action_state: { id: 701, label: 'Deploy public key', finished: true, status: true, current: 1, total: 1 },
      }),
    },
  });

  await page.goto('/app/vps/123/access');

  await expect(page.getByTestId('vps.access.page')).toBeVisible();
  await expect(page.getByTestId('vps.access.checklist')).toBeVisible();
  await expect(page.getByTestId('vps.access.ssh_command')).toHaveCount(0);
  await expect(page.getByTestId('vps.access.host_keys.fingerprints')).toBeVisible();
  await expect(page.getByTestId('vps.access.host_keys.table')).toBeVisible();
  await expect(page.getByTestId('vps.access.host_keys.row.1')).toContainText('SHA256:host-ed25519');
  await expect(page.getByTestId('vps.access.host_keys.row.1')).toContainText('ssh-ed25519');
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoDocumentHorizontalOverflow(page);
  await expectTableHorizontalScrollUsable(page, 'vps.access.host_keys.table');
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.getByTestId('vps.access.password_type').selectOption('simple');
  await page.getByTestId('vps.access.password.generate').click();

  await expect(page.getByTestId('vps.access.password.confirm')).toBeVisible();
  const passwdReqPromise = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/api/v7.0/vpses/123/passwd')
  );
  await page.getByTestId('vps.access.password.confirm.confirm').click();

  const passwdReq = await passwdReqPromise;
  expect(passwdReq.postDataJSON()).toEqual({ vps: { type: 'simple' } });

  await expect(page.getByTestId('vps.access.generated_password')).toBeVisible();
  await expect(page.getByTestId('vps.access.generated_password.field')).toHaveValue('Root-123!');
  await expect(page.getByTestId('vps.access.generated_password.field')).toHaveAttribute('type', 'password');
  await page.getByTestId('vps.access.generated_password.toggle').click();
  await expect(page.getByTestId('vps.access.generated_password.field')).toHaveAttribute('type', 'text');
  await page.getByTestId('vps.access.generated_password.clear').click();
  await expect(page.getByTestId('vps.access.generated_password')).toHaveCount(0);

  await page.getByTestId('tasks.open-button').click();
  await expect(page.getByTestId('tasks.drawer')).toHaveAttribute('aria-modal', 'false');
  await expect(page.getByTestId('tasks.row.700')).toContainText('Passwd');
  await expect(page.getByTestId('vps.access.page')).toBeVisible();
  await page.getByTestId('tasks.close-button').click();

  await expect(page.getByTestId('vps.access.ssh.key')).toHaveValue('8');
  const selectedKeyCard = page.getByTestId('vps.access.ssh.selected.fingerprint').locator('..');
  await expect(selectedKeyCard).toContainText(longPublicKeyLabel);
  await expect(selectedKeyCard).toContainText(longPublicKeyFingerprint);
  await expect(selectedKeyCard).toContainText(longPublicKeyComment);
  await page.getByTestId('vps.access.ssh.deploy').click();

  await expect(page.getByTestId('vps.access.ssh.confirm')).toBeVisible();
  const keyReqPromise = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/api/v7.0/vpses/123/deploy_public_key')
  );
  await page.getByTestId('vps.access.ssh.confirm.confirm').click();

  const keyReq = await keyReqPromise;
  expect(keyReq.postDataJSON()).toEqual({ vps: { public_key: 8 } });
  await expect(page.getByText(/Public key deployed: workstation/)).toBeVisible();

  await page.getByTestId('tasks.open-button').click();
  await expect(page.getByTestId('tasks.row.701')).toContainText('Deploy public key');
  await expect(page.getByTestId('vps.access.page')).toBeVisible();
});

test('@workflow-matrix @pr-smoke @pr-smoke-mobile admin VPS access contains long key data on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST_ADMIN' });

  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 99 },
    handlers: {
      'GET vpses/123': () => ({ vps }),
      'GET ip_addresses': () => ({
        ip_addresses: [{ id: 55, addr: '198.51.100.10', network: { id: 5, role: 'public' } }],
      }),
      'GET transaction_chains': () => ({ transaction_chains: [] }),
      'GET users/42/public_keys': () => ({ public_keys: publicKeys, _meta: { total_count: 2 } }),
      'GET vpses/123/ssh_host_keys': () => ({ ssh_host_keys: hostKeys, _meta: { total_count: 2 } }),
    },
  });

  await page.goto('/admin/vps/123/access');

  await expect(page.getByTestId('vps.access.page')).toBeVisible();
  const selectedKeyCard = page.getByTestId('vps.access.ssh.selected.fingerprint').locator('..');
  await expect(selectedKeyCard).toContainText(longPublicKeyLabel);
  await expect(selectedKeyCard).toContainText(longPublicKeyFingerprint);
  await expect(selectedKeyCard).toContainText(longPublicKeyComment);
  await expectNoDocumentHorizontalOverflow(page);
  await expectTableHorizontalScrollUsable(page, 'vps.access.host_keys.table');
});

test('@workflow-matrix @pr-smoke VPS access reports failed SSH key deployment and opens tasks', async ({ page }) => {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

  await installHaveApiMock(page, {
    user: { id: 42, login: 'owner', level: 1 },
    handlers: {
      'GET vpses/123': () => ({ vps }),
      'GET transaction_chains': () => ({ transaction_chains: [] }),
      'GET users/42/public_keys': () => ({ public_keys: publicKeys, _meta: { total_count: 2 } }),
      'GET vpses/123/ssh_host_keys': () => ({ ssh_host_keys: hostKeys, _meta: { total_count: 2 } }),
      'POST vpses/123/deploy_public_key': () => ({ _meta: { action_state_id: 702 } }),
      'GET action_states/702': () => ({
        action_state: { id: 702, label: 'Deploy public key', finished: true, status: false, current: 1, total: 1 },
      }),
    },
  });

  await page.goto('/app/vps/123/access');
  await page.getByTestId('vps.access.ssh.deploy').click();
  await page.getByTestId('vps.access.ssh.confirm.confirm').click();

  await expect(page.getByText('SSH key deployment failed')).toBeVisible();
  await page.getByTestId('vps.access.ssh.failure.open_tasks').click();
  await expect(page.getByTestId('tasks.drawer')).toHaveAttribute('aria-modal', 'false');
  await expect(page.getByTestId('tasks.row.702')).toContainText('Deploy public key');
  await expect(page.getByTestId('vps.access.page')).toBeVisible();
});
