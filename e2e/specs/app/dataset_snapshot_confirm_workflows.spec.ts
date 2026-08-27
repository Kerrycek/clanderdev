import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

test.describe('@smoke Dataset snapshots', () => {
  test('create snapshot deep link opens the create workflow', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 99 },
      handlers: {
        'GET datasets/10': () => ({
          id: 10,
          full_name: 'tank/vps/ds10',
          name: 'ds10',
          used: 2048,
          refquota: 10240,
          snapshots_count: 0,
          mount_count: 0,
          export_count: 0,
          object_state: 'active',
          vps: { id: 300, hostname: 'alpha.example' },
        }),

        'GET datasets/10/snapshots': () => ({ snapshots: [] }),
      },
    });

    await page.goto('/app/datasets/10/snapshots?action=create');

    await expect(page.getByTestId('dataset.snapshots.list')).toBeVisible();
    await expect(page.getByTestId('dataset.snapshots.create.modal')).toBeVisible();
    await expect(page).toHaveURL(/\/app\/datasets\/10\/snapshots$/);
  });

  test('creates snapshot and opens the returned action state progress', async ({ page }) => {
    let created = false;

    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 99 },
      handlers: {
        'GET datasets/10': () => ({
          id: 10,
          full_name: 'tank/vps/ds10',
          name: 'ds10',
          used: 2048,
          refquota: 10240,
          snapshots_count: created ? 1 : 0,
          mount_count: 0,
          export_count: 0,
          object_state: 'active',
          vps: { id: 300, hostname: 'alpha.example' },
        }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'GET datasets/10/snapshots': () => ({
          snapshots: created
            ? [
                {
                  id: 201,
                  dataset: 10,
                  name: 'snap-201',
                  label: 'before-upgrade',
                  created_at: '2026-01-26T00:00:00.000Z',
                },
              ]
            : [],
        }),
        'POST datasets/10/snapshots': () => {
          created = true;
          return {
            snapshot: { id: 201, dataset: 10, name: 'snap-201', label: 'before-upgrade' },
            _meta: { action_state_id: 701 },
          };
        },
        'GET action_states/701': () => ({
          action_state: {
            id: 701,
            label: 'Create snapshot',
            status: true,
            finished: false,
            current: 1,
            total: 2,
          },
        }),
      },
    });

    await page.goto('/app/datasets/10/snapshots');

    await page.getByTestId('dataset.snapshots.create.open').click();
    await page.getByTestId('dataset.snapshots.create.label').fill('before-upgrade');

    const reqPromise = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().includes('/api/v7.0/datasets/10/snapshots')
    );
    await page.getByTestId('dataset.snapshots.create.submit').click();

    expect((await reqPromise).postDataJSON()).toEqual({ snapshot: { label: 'before-upgrade' } });
    await expect(page.getByTestId('modal.action_progress')).toBeVisible();
    await expect(page.getByTestId('modal.action_progress')).toContainText('#701');
    await page.getByTestId('modal.action_progress.continue').click();
    await expect(page.getByTestId('dataset.snapshots.row.201')).toBeVisible();
  });

  test('allows creating snapshot download when dataset state is omitted', async ({ page }) => {
    let downloadCalls = 0;

    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    await installHaveApiMock(page, {
      user: { id: 2, login: 'member', level: 1 },
      handlers: {
        'GET datasets/10': () => ({
          id: 10,
          full_name: 'tank/vps/ds10',
          name: 'ds10',
          used: 2048,
          refquota: 10240,
          snapshots_count: 1,
          mount_count: 0,
          export_count: 0,
          vps: { id: 300, hostname: 'alpha.example' },
        }),
        'GET transaction_chains': () => ({ transaction_chains: [], _meta: { total_count: 0 } }),
        'GET datasets/10/snapshots': () => ({
          snapshots: [
            {
              id: 200,
              dataset: 10,
              name: 'snap-200',
              label: 'snap-200',
              created_at: '2026-01-26T00:00:00.000Z',
            },
          ],
        }),
        'POST snapshot_downloads': () => {
          downloadCalls += 1;
          return {
            snapshot_download: {
              id: 301,
              snapshot: { id: 200, name: 'snap-200' },
              format: 'archive',
              ready: false,
              state: 'pending',
            },
            _meta: { action_state_id: 702 },
          };
        },
        'GET action_states/702': () => ({
          action_state: {
            id: 702,
            label: 'Create snapshot download',
            status: true,
            finished: false,
            current: 0,
            total: 1,
          },
        }),
      },
    });

    await page.goto('/app/datasets/10/snapshots');

    await expect(page.getByTestId('dataset.snapshots.row.200')).toBeVisible();
    await expect(page.getByTestId('dataset.snapshots.row.200.download')).toBeEnabled();

    const reqPromise = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().includes('/api/v7.0/snapshot_downloads')
    );
    await page.getByTestId('dataset.snapshots.row.200.download').click();
    expect((await reqPromise).postDataJSON()).toEqual({
      snapshot_download: {
        snapshot: 200,
        format: 'archive',
        send_mail: true,
      },
    });
    await expect(page.getByTestId('modal.action_progress')).toBeVisible();
    expect(downloadCalls).toBe(1);
  });

  test('explains pending snapshot download delivery', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    await installHaveApiMock(page, {
      user: { id: 2, login: 'member', level: 1 },
      handlers: {
        'GET datasets/10': () => ({
          id: 10,
          full_name: 'tank/vps/ds10',
          name: 'ds10',
          used: 2048,
          refquota: 10240,
          snapshots_count: 1,
          mount_count: 0,
          export_count: 0,
          vps: { id: 300, hostname: 'alpha.example' },
        }),
        'GET transaction_chains': () => ({ transaction_chains: [], _meta: { total_count: 0 } }),
        'GET datasets/10/snapshots': () => ({
          snapshots: [
            {
              id: 200,
              dataset: 10,
              name: 'snap-200',
              label: 'snap-200',
              created_at: '2026-01-26T00:00:00.000Z',
            },
          ],
        }),
        'POST snapshot_downloads': () => ({
          snapshot_download: {
            id: 301,
            snapshot: { id: 200, name: 'snap-200' },
            format: 'archive',
            ready: false,
            state: 'pending',
          },
        }),
      },
    });

    await page.goto('/app/datasets/10/snapshots');

    await page.getByTestId('dataset.snapshots.row.200.download').click();

    const modal = page.getByTestId('dataset.snapshots.download.created');
    await expect(modal).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Backup is being prepared' })).toBeVisible();
    await expect(modal).toContainText('email');
    await expect(modal).toContainText('Downloads');
    await expect(page.getByTestId('dataset.snapshots.download.created.open')).toBeDisabled();
  });

  test('rollback snapshot uses a confirm dialog', async ({ page }) => {
    let rollbackCalls = 0;

    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 99 },
      handlers: {
        'GET datasets/10': () => ({
          id: 10,
          full_name: 'tank/vps/ds10',
          name: 'ds10',
          used: 2048,
          refquota: 10240,
          snapshots_count: 1,
          mount_count: 0,
          export_count: 0,
          object_state: 'active',
          vps: { id: 300, hostname: 'alpha.example' },
        }),

        'GET datasets/10/snapshots': () => ({
          snapshots: [
            {
              id: 200,
              dataset: 10,
              name: 'snap-200',
              label: 'snap-200',
              created_at: '2026-01-26T00:00:00.000Z',
            },
          ],
        }),

        'POST datasets/10/snapshots/200/rollback': () => {
          rollbackCalls += 1;
          return { ok: true };
        },
      },
    });

    await page.goto('/admin/datasets/10/snapshots');

    await expect(page.getByTestId('dataset.snapshots.list')).toBeVisible();
    await expect(page.getByTestId('dataset.snapshots.row.200')).toBeVisible();

    await page.getByTestId('dataset.snapshots.row.200.rollback').click();
    await expect(page.getByTestId('dataset.snapshots.rollback_confirm')).toBeVisible();
    await expect(page.getByTestId('dataset.snapshots.rollback_confirm.confirm')).toBeEnabled();
    await page.getByTestId('dataset.snapshots.rollback_confirm.confirm').click();
    await expect(page.getByTestId('dataset.snapshots.rollback_confirm')).toBeHidden();

    expect(rollbackCalls).toBe(1);
  });

  test('delete snapshot uses a confirm dialog and removes the row', async ({ page }) => {
    let deleted = false;
    let deleteCalls = 0;

    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 99 },
      handlers: {
        'GET datasets/10': () => ({
          id: 10,
          full_name: 'tank/vps/ds10',
          name: 'ds10',
          used: 2048,
          refquota: 10240,
          snapshots_count: 1,
          mount_count: 0,
          export_count: 0,
          object_state: 'active',
          vps: { id: 300, hostname: 'alpha.example' },
        }),

        'GET datasets/10/snapshots': () => {
          if (deleted) {
            return { snapshots: [] };
          }
          return {
            snapshots: [
              {
                id: 200,
                dataset: 10,
                name: 'snap-200',
                label: 'snap-200',
                created_at: '2026-01-26T00:00:00.000Z',
              },
            ],
          };
        },

        'DELETE datasets/10/snapshots/200': () => {
          deleteCalls += 1;
          deleted = true;
          return { ok: true };
        },
      },
    });

    await page.goto('/admin/datasets/10/snapshots');

    await expect(page.getByTestId('dataset.snapshots.list')).toBeVisible();
    await expect(page.getByTestId('dataset.snapshots.row.200')).toBeVisible();

    await page.getByTestId('dataset.snapshots.row.200.delete').click();
    await expect(page.getByTestId('dataset.snapshots.delete_confirm')).toBeVisible();
    await expect(page.getByTestId('dataset.snapshots.delete_confirm.confirm')).toBeEnabled();
    await page.getByTestId('dataset.snapshots.delete_confirm.confirm').click();
    await expect(page.getByTestId('dataset.snapshots.delete_confirm')).toBeHidden();

    await expect(page.getByTestId('dataset.snapshots.row.200')).toHaveCount(0);
    expect(deleteCalls).toBe(1);
  });

  test('dataset owners can download, restore and delete their snapshots', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    let rollbackCalls = 0;
    let deleteCalls = 0;
    let deleted = false;

    await installHaveApiMock(page, {
      user: { id: 2, login: 'member', level: 1 },
      handlers: {
        'GET datasets/10': () => ({
          id: 10,
          full_name: 'tank/vps/ds10',
          name: 'ds10',
          used: 2048,
          refquota: 10240,
          snapshots_count: 1,
          mount_count: 0,
          export_count: 0,
          object_state: 'active',
          vps: { id: 300, hostname: 'alpha.example' },
          user: { id: 2, login: 'member' },
        }),

        'GET datasets/10/snapshots': () => ({
          snapshots: deleted ? [] : [
            {
              id: 200,
              dataset: 10,
              name: 'snap-200',
              label: 'snap-200',
              created_at: '2026-01-26T00:00:00.000Z',
            },
          ],
        }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'POST snapshot_downloads': () => ({
          snapshot_download: {
            id: 501,
            snapshot: { id: 200 },
            ready: true,
            download_url: '/generated/snap-200.tar.gz',
          },
        }),
        'POST datasets/10/snapshots/200/rollback': () => {
          rollbackCalls += 1;
          return { ok: true };
        },
        'DELETE datasets/10/snapshots/200': () => {
          deleteCalls += 1;
          deleted = true;
          return { ok: true };
        },
      },
    });

    await page.goto('/app/datasets/10/snapshots');

    await expect(page.getByTestId('dataset.snapshots.row.200.download')).toBeVisible();
    const downloadReq = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().includes('/api/v7.0/snapshot_downloads')
    );
    await page.getByTestId('dataset.snapshots.row.200.download').click();
    expect((await downloadReq).postDataJSON()).toEqual({
      snapshot_download: {
        snapshot: 200,
        format: 'archive',
        send_mail: true,
      },
    });
    await expect(page.getByTestId('dataset.snapshots.download.created')).toBeVisible();
    await expect(page.getByTestId('dataset.snapshots.download.created.open')).toHaveAttribute('href', /\/generated\/snap-200\.tar\.gz$/);
    await page.getByTestId('dataset.snapshots.download.created.close').click();
    await expect(page.getByTestId('dataset.snapshots.row.200.rollback')).toBeEnabled();
    await page.getByTestId('dataset.snapshots.row.200.rollback').click();
    await page.getByTestId('dataset.snapshots.rollback_confirm.confirm').click();
    await expect(page.getByTestId('dataset.snapshots.rollback_confirm')).toBeHidden();
    expect(rollbackCalls).toBe(1);

    await expect(page.getByTestId('dataset.snapshots.row.200.delete')).toBeEnabled();
    await page.getByTestId('dataset.snapshots.row.200.delete').click();
    await page.getByTestId('dataset.snapshots.delete_confirm.confirm').click();
    await expect(page.getByTestId('dataset.snapshots.row.200')).toHaveCount(0);
    expect(deleteCalls).toBe(1);
  });
});
