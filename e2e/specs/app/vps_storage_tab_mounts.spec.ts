import { expect, test, type Page } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

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
  dataset: { id: 10, name: 'tank/data' },
  node: { id: 1, domain_name: 'node1.example' },
  os_template: { label: 'debian' },
  dns_resolver: 'inherit',
};

const dataset = {
  id: 10,
  name: 'tank/data',
  full_name: 'tank/data',
  user: { id: 1, login: 'user' },
  used: 5120,
  avail: 15360,
  referenced: 4096,
  refquota: 20480,
  quota: 0,
  snapshots_count: 3,
  mount_count: 1,
  export_count: 2,
  object_state: 'active',
};

function mountItem(page: Page, mountId: number) {
  const layout = (page.viewportSize()?.width ?? 1280) < 768 ? 'card' : 'row';
  return page.getByTestId(`vps.storage.mounts.${layout}.${mountId}`);
}

function mountItemControl(page: Page, mountId: number, control: 'dataset' | 'delete') {
  const layout = (page.viewportSize()?.width ?? 1280) < 768 ? 'card' : 'row';
  return page.getByTestId(`vps.storage.mounts.${layout}.${mountId}.${control}`);
}

test.describe('@smoke VPS storage tab mounts', () => {
  test('creates a user subdataset from the VPS storage entrypoint', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    const childDataset = {
      ...dataset,
      id: 11,
      name: 'storage-child',
      full_name: 'tank/data/storage-child',
      parent: { id: 10 },
      used: 0,
      referenced: 0,
      snapshots_count: 0,
      mount_count: 0,
      export_count: 0,
    };

    await installHaveApiMock(page, {
      user: { id: 1, login: 'user', level: 1 },
      handlers: {
        'GET vpses/123': () => ({ vps }),
        'GET datasets/10': () => dataset,
        'GET datasets/11': () => childDataset,
        'GET ip_addresses': () => ({ ip_addresses: [] }),
        'GET transaction_chains': () => ({ transaction_chains: [], _meta: { total_count: 0 } }),
        'GET vpses/123/mounts': () => ({ mounts: [] }),
        'POST datasets': () => ({ dataset: childDataset }),
      },
    });

    await page.goto('/app/vps/123/storage');

    await page.getByTestId('vps.storage.root_dataset.create_subdataset').click();

    const createModal = page.getByTestId('dataset.manage.create.modal');
    await expect(createModal).toBeVisible();
    await expect(page).toHaveURL(/\/app\/datasets\/10$/);
    await createModal.getByTestId('dataset.manage.create.name').fill('storage-child');

    const createRequest = page.waitForRequest(
      (request) => request.method() === 'POST' && request.url().includes('/api/v7.0/datasets')
    );
    await createModal.getByTestId('dataset.manage.create.submit').click();

    expect((await createRequest).postDataJSON()).toEqual({
      dataset: {
        name: 'storage-child',
        dataset: 10,
        automount: true,
      },
    });
    await expect(page).toHaveURL(/\/app\/datasets\/11$/);
    await expect(page.getByTestId('dataset.header')).toContainText('tank/data/storage-child');
  });

  test('@workflow-matrix creates mount by finding dataset and posting', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    let mounts = [
      {
        id: 1,
        mountpoint: '/mnt/old',
        type: 'nfs',
        mode: 'ro',
        enabled: true,
        on_start_fail: 'ignore',
        use_default_map: true,
        current_state: 'mounted',
        expiration_date: '2026-02-28T00:00:00Z',
        dataset: { id: 9, name: 'tank/old' },
        created_at: '2026-01-31T00:00:00Z',
      },
    ];

    await installHaveApiMock(page, {
      user: { id: 1, login: 'user', level: 1 },
      handlers: {
        'GET vpses/123': () => ({ vps }),
        'GET datasets/10': () => ({ dataset }),
        'GET ip_addresses': () => ({ ip_addresses: [] }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'GET vpses/123/mounts': () => ({ mounts }),
        'GET datasets/find_by_name': () => ({ dataset }),
        'POST vpses/123/mounts': () => {
          const created = {
            id: 2,
            mountpoint: '/mnt/data',
            type: 'nfs',
            mode: 'rw',
            enabled: true,
            on_start_fail: 'ignore',
            use_default_map: true,
            current_state: 'mounted',
            dataset: { ...dataset },
            created_at: '2026-01-31T01:00:00Z',
          };
          mounts = [...mounts, created];
          return { mount: created, _meta: { action_state_id: 703 } };
        },
        'GET action_states/703': () => ({
          action_state: {
            id: 703,
            label: 'Create mount',
            status: true,
            finished: false,
            current: 1,
            total: 2,
          },
        }),
      },
    });

    await page.goto('/app/vps/123/storage');

    await expect(page.getByTestId('vps.storage.page')).toBeVisible();
    await expect(page.getByTestId('vps.storage.root_dataset')).toBeVisible();
    await expect(page.getByTestId('vps.storage.root_dataset.metadata')).toContainText('5.0 GiB');
    await expect(page.getByTestId('vps.storage.root_dataset.metadata')).toContainText('15 GiB');
    await expect(page.getByTestId('vps.storage.root_dataset.metadata')).toContainText('20 GiB');
    await expect(page.getByTestId('vps.storage.no_backup_cta_note')).toContainText('does not offer a normal Create backup button');
    await expect(page.getByTestId('vps.storage.root_dataset.open')).toHaveAttribute('href', '/app/datasets/10');
    await expect(page.getByTestId('vps.storage.root_dataset.create_subdataset')).toHaveAttribute(
      'href',
      '/app/datasets/10?create=subdataset'
    );
    await expect(page.getByTestId('vps.storage.root_dataset.snapshots')).toHaveAttribute('href', '/app/datasets/10/snapshots');
    await expect(page.getByTestId('vps.storage.root_dataset.downloads')).toHaveAttribute('href', '/app/datasets/10/downloads');
    await expect(page.getByTestId('vps.storage.root_dataset.create_snapshot')).toHaveCount(0);
    await expect(page.getByTestId('vps.storage.root_dataset.restore')).toHaveCount(0);
    await expect(page.getByTestId('vps.storage.root_dataset.backup')).toHaveCount(0);
    await expect(mountItem(page, 1)).toBeVisible();
    await expect(mountItemControl(page, 1, 'dataset')).toHaveAttribute('href', '/app/datasets/9');
    await expect(mountItem(page, 1)).toContainText('mounted');
    await expect(mountItem(page, 1)).toContainText('2026');
    await expect(page.getByText('Master enabled')).toHaveCount(0);

    await page.getByTestId('vps.storage.mounts.add').click();
    await expect(page.getByTestId('vps.storage.mounts.create')).toBeVisible();
    await expect(page.getByTestId('vps.storage.mounts.create.master_enabled')).toHaveCount(0);

    await page.getByTestId('vps.storage.mounts.create.dataset').fill('tank/data');
    await page.getByTestId('vps.storage.mounts.create.find_dataset').click();

    await page.getByTestId('vps.storage.mounts.create.mountpoint').fill('/mnt/data');

    const reqPromise = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().includes('/api/v7.0/vpses/123/mounts')
    );

    await page.getByTestId('vps.storage.mounts.create.submit').click();

    const req = await reqPromise;
    expect(req.postDataJSON()).toEqual({
      mount: {
        dataset: 10,
        mountpoint: '/mnt/data',
        type: 'nfs',
        mode: 'rw',
        on_start_fail: 'ignore',
        enabled: true,
        use_default_map: true,
      },
    });

    await expect(page.getByTestId('vps.storage.mounts.create')).toBeHidden();
    await expect(page.getByTestId('modal.action_progress')).toBeVisible();
    await expect(page.getByTestId('modal.action_progress')).toContainText('#703');
    await page.getByTestId('modal.action_progress.continue').click();
    await expect(mountItem(page, 2)).toBeVisible();
  });

  test('deletes mount via confirm dialog', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    let mounts = [
      {
        id: 1,
        mountpoint: '/mnt/old',
        type: 'nfs',
        mode: 'ro',
        enabled: true,
        on_start_fail: 'ignore',
        use_default_map: true,
        dataset: { id: 9, name: 'tank/old' },
        created_at: '2026-01-31T00:00:00Z',
      },
    ];

    await installHaveApiMock(page, {
      user: { id: 1, login: 'user', level: 1 },
      handlers: {
        'GET vpses/123': () => ({ vps }),
        'GET ip_addresses': () => ({ ip_addresses: [] }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'GET vpses/123/mounts': () => ({ mounts }),
        'DELETE vpses/123/mounts/1': () => {
          mounts = mounts.filter((m) => m.id !== 1);
          return { status: true, response: null };
        },
      },
    });

    await page.goto('/app/vps/123/storage');

    await expect(mountItem(page, 1)).toBeVisible();

    await mountItemControl(page, 1, 'delete').click();
    await expect(page.getByTestId('vps.storage.mounts.delete_confirm')).toBeVisible();
    await expect(page.getByTestId('vps.storage.mounts.delete_confirm.confirm')).toBeEnabled();

    const reqPromise = page.waitForRequest(
      (r) => r.method() === 'DELETE' && r.url().includes('/api/v7.0/vpses/123/mounts/1')
    );

    await page.getByTestId('vps.storage.mounts.delete_confirm.confirm').click();

    await reqPromise;

    await expect(page.getByTestId('vps.storage.mounts.delete_confirm')).toBeHidden();
  });

  test('shows admin-only mount controls to admins', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 99 },
      handlers: {
        'GET vpses/123': () => ({ vps }),
        'GET datasets/10': () => ({ dataset }),
        'GET ip_addresses': () => ({ ip_addresses: [] }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'GET vpses/123/mounts': () => ({
          mounts: [
            {
              id: 1,
              mountpoint: '/mnt/old',
              type: 'nfs',
              mode: 'ro',
              enabled: true,
              master_enabled: false,
              on_start_fail: 'ignore',
              use_default_map: true,
              current_state: 'mounted',
              dataset: { id: 9, name: 'tank/old' },
              created_at: '2026-01-31T00:00:00Z',
            },
          ],
        }),
      },
    });

    await page.goto('/admin/vps/123/storage');

    await expect(page.getByTestId('vps.storage.root_dataset.open')).toHaveAttribute('href', '/admin/datasets/10');
    await expect(page.getByTestId('vps.storage.root_dataset.system_context')).toContainText('3 snapshots');
    await expect(page.getByTestId('vps.storage.mounts.table')).toContainText('Master');
    await expect(mountItem(page, 1)).toContainText('No');

    await page.getByTestId('vps.storage.mounts.add').click();
    await expect(page.getByTestId('vps.storage.mounts.create.master_enabled')).toBeVisible();
  });

  test('keeps mounts visible and explains missing root dataset references', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    const vpsWithoutDataset = {
      ...vps,
      dataset: null,
    };

    await installHaveApiMock(page, {
      user: { id: 1, login: 'user', level: 1 },
      handlers: {
        'GET vpses/123': () => ({ vps: vpsWithoutDataset }),
        'GET ip_addresses': () => ({ ip_addresses: [] }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'GET vpses/123/mounts': () => ({
          mounts: [
            {
              id: 1,
              mountpoint: '/mnt/old',
              type: 'nfs',
              mode: 'ro',
              enabled: true,
              on_start_fail: 'ignore',
              use_default_map: true,
              current_state: 'mounted',
              dataset: { id: 9, name: 'tank/old' },
              created_at: '2026-01-31T00:00:00Z',
            },
          ],
        }),
      },
    });

    await page.goto('/app/vps/123/storage');

    await expect(page.getByTestId('vps.storage.root_dataset.empty')).toBeVisible();
    await expect(page.getByTestId('vps.storage.root_dataset.empty')).toContainText('No root dataset reference');
    await expect(page.getByTestId('vps.storage.root_dataset.open')).toHaveCount(0);
    await expect(mountItem(page, 1)).toBeVisible();
    await expect(mountItemControl(page, 1, 'dataset')).toHaveAttribute('href', '/app/datasets/9');
  });
});
