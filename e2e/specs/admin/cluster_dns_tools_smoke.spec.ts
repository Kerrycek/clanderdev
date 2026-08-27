import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

test('@smoke admin cluster dns tools pages render', async ({ page }) => {
  let listParams: URLSearchParams | null = null;
  let createdKey: any;
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 90 },
    handlers: {
      'GET dns_servers': () => ({ dns_servers: [{ id: 1, name: 'ns1', node: { id: 11, domain_name: 'node1.example.test' }, ipv4_addr: '192.0.2.1', enable_user_dns_zones: true }] }),
      'GET nodes': () => ({ nodes: [{ id: 11, domain_name: 'node1.example.test' }] }),
      'GET dns_tsig_keys': ({ searchParams }) => {
        listParams = new URLSearchParams(searchParams);
        return { dns_tsig_keys: [{ id: 7, name: 'transfer-key', algorithm: 'hmac-sha256', secret: 'admin-list-secret-must-not-render', user: { id: 10, login: 'alice' } }] };
      },
      'POST dns_tsig_keys': async ({ request }) => {
        createdKey = await request.postDataJSON();
        return { dns_tsig_key: { id: 8, name: 'new-key', algorithm: 'hmac-sha256', secret: 'one-time-secret', user: { id: 10, login: 'alice' } } };
      },
    },
  });

  await page.goto('/admin/cluster/dns-servers');
  await expect(page.getByTestId('admin.cluster.dns_servers.page')).toBeVisible();
  await expect(page.getByTestId('admin.cluster.dns_servers.row.1')).toBeVisible();

  await page.goto('/admin/cluster/dns-tsig-keys');
  await expect(page.getByTestId('admin.cluster.dns_tsig.page')).toBeVisible();
  await expect(page.getByTestId('admin.cluster.dns_tsig.row.7')).toBeVisible();
  await expect(page.getByText('admin-list-secret-must-not-render', { exact: true })).toHaveCount(0);
  expect(listParams?.has('dns_tsig_key[q]')).toBe(false);

  await page.getByTestId('admin.cluster.dns_tsig.create.open').click();
  const modal = page.getByTestId('admin.cluster.dns_tsig.create.modal');
  await expect(modal.getByLabel('Name')).toBeVisible();
  await expect(modal.getByLabel('User')).toBeVisible();
  await expect(modal.getByLabel('Algorithm')).toBeVisible();
  await modal.getByLabel('Name').fill('new-key');
  await expect(page.getByTestId('admin.cluster.dns_tsig.create.submit')).toBeDisabled();
  await modal.getByLabel('User').fill('10');
  await expect(page.getByTestId('admin.cluster.dns_tsig.create.submit')).toBeEnabled();
  await page.getByTestId('admin.cluster.dns_tsig.create.submit').click();
  await expect.poll(() => createdKey?.dns_tsig_key?.user).toBe(10);
});
