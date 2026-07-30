import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock, jsonFulfill } from '../../fixtures';

test.describe('NAS datasets alias', () => {
  test('renders NAS alias with primary-role datasets, owner rows, and unlimited capacity usage', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    let requestedRole: string | null = null;
    let requestedIncludes: string | null = null;

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 99 },
      handlers: {
        'GET datasets': ({ searchParams }) => {
          const role = searchParams.get('dataset[role]');
          requestedRole = role;
          requestedIncludes = searchParams.get('_meta[includes]');
          if (role !== 'primary') return { datasets: [], _meta: { total_count: 0 } };
          return {
            datasets: [
              {
                id: 53,
                full_name: '53/kerryhobordel',
                name: 'kerryhobordel',
                user: { id: 44, login: 'alice' },
                used: 1_900 * 1024,
                avail: 1_400 * 1024,
                snapshots_count: 1,
                mount_count: 0,
                export_count: 0,
                object_state: 'active',
              },
            ],
            _meta: { total_count: 1 },
          };
        },
      },
    });
    await page.goto('/admin/nas');

    await expect(page.getByTestId('datasets.list.header')).toContainText('NAS');
    const row = page.getByTestId('datasets.row.53');
    await expect(row).toBeVisible();
    await expect(row).toContainText('kerryhobordel');
    await expect(row).toContainText('1.9 TiB');

    const segments = row.getByRole('img', { name: 'Dataset space usage' }).locator('[style*="width"]');
    await expect(segments).toHaveCount(2);
    await expect(segments.nth(0)).toHaveCSS('width', /.+/);

    const widths = await segments.evaluateAll((elements) =>
      elements.map((element) => Number.parseFloat((element as HTMLElement).style.width))
    );
    expect(widths[0]).toBeCloseTo((1_900 / 3_300) * 100, 3);
    expect(widths[1]).toBeCloseTo((1_400 / 3_300) * 100, 3);

    expect(requestedRole).toBe('primary');
    expect(requestedIncludes).toBe('user');

    const proofScreenshot = process.env.E2E_NAS_USAGE_PROOF_SCREENSHOT?.trim();
    if (proofScreenshot) {
      await page.screenshot({ path: proofScreenshot, fullPage: true });
    }

    await page.getByTestId('datasets.filters.advanced.open').click();
    await expect(page.getByTestId('datasets.advanced.vps')).toHaveCount(0);
  });

  test('hides empty relation columns in NAS list too', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 99 },
      handlers: {
        'GET datasets': ({ searchParams }) => {
          const role = searchParams.get('dataset[role]');
          if (role !== 'primary') return { datasets: [], _meta: { total_count: 0 } };
          return {
            datasets: [
              {
                id: 911,
                full_name: 'tank/nas/plain',
                name: 'plain',
                user: { id: 55, login: 'plain' },
                used: 128,
                refquota: 4096,
              },
            ],
            _meta: { total_count: 1 },
          };
        },
      },
    });

    await page.goto('/admin/nas');

    await expect(page.getByTestId('datasets.row.911')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Snapshots' })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Mounts' })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Exports' })).toHaveCount(0);
  });

  test('creates a NAS subdataset from the NAS list', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    let payload: Record<string, unknown> | undefined;
    const parentQueries: Array<string | null> = [];

    await installHaveApiMock(page, {
      user: { id: 1, login: 'alice', level: 1 },
      handlers: {
        'GET datasets': ({ searchParams }) => {
          const user = searchParams.get('dataset[user]');
          parentQueries.push(user);

          return {
            datasets: [
              {
                id: 901,
                full_name: 'tank/nas/alice',
                name: 'alice',
                user: { id: 1, login: 'alice' },
                used: 1024,
                refquota: 4096,
              },
              {
                id: 999,
                full_name: 'tank/nas/another-user',
                name: 'another-user',
                user: { id: 99, login: 'another-user' },
                used: 1024,
                refquota: 4096,
              },
            ],
          };
        },
        'POST datasets': (ctx) => {
          payload = ctx.params;
          return {
            dataset: {
              id: 902,
              full_name: 'tank/nas/alice/projects',
              name: 'projects',
            },
          };
        },
        'GET datasets/902': () => ({
          dataset: { id: 902, full_name: 'tank/nas/alice/projects', name: 'projects' },
        }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
      },
    });

    await page.goto('/app/nas');
    await page.getByTestId('nas.create.open').click();
    await expect(page).toHaveURL('/app/nas/new');
    await expect(page.getByTestId('nas.create.parent')).toHaveValue('');
    await expect(page.getByTestId('nas.create.parent').locator('option[value="901"]')).toHaveCount(1);
    await expect(page.getByTestId('nas.create.parent').locator('option[value="999"]')).toHaveCount(0);
    expect(parentQueries).toContain(null);
    await expect(page.getByTestId('nas.create.advanced_properties')).not.toHaveAttribute('open');
    await expect(page.getByTestId('nas.create.recordsize')).not.toBeVisible();
    await expect(page.getByTestId('nas.create.compression')).not.toBeVisible();
    await expect(page.getByTestId('nas.create.atime')).not.toBeVisible();
    await expect(page.getByTestId('nas.create.relatime')).not.toBeVisible();

    await page.getByTestId('nas.create.parent').selectOption('901');
    await page.getByTestId('nas.create.name').fill('projects');
    await page.getByTestId('nas.create.refquota').fill('8');
    await page.getByTestId('nas.create.submit').click();

    await expect.poll(() => payload?.dataset as Record<string, unknown> | undefined).toEqual({
      dataset: 901,
      name: 'projects',
      automount: true,
      refquota: 8192,
    });
    await expect(page).toHaveURL('/app/nas/902');
  });

  test('keeps NAS dataset details and management navigation under NAS', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    const datasets: Record<number, any> = {
      901: {
        id: 901,
        full_name: 'tank/nas/alice',
        name: 'alice',
        user: { id: 44, login: 'alice' },
        used: 1024,
        avail: 10240,
        quota: 0,
        refquota: 4096,
        recordsize: 131072,
        compression: true,
        atime: false,
        relatime: false,
        sync: 'standard',
        snapshots_count: 1,
        mount_count: 0,
        export_count: 0,
        object_state: 'active',
      },
      902: {
        id: 902,
        full_name: 'tank/nas/alice/projects',
        name: 'projects',
        user: { id: 44, login: 'alice' },
        used: 0,
        avail: 10240,
        quota: 0,
        refquota: 8192,
        recordsize: 131072,
        compression: true,
        atime: false,
        relatime: false,
        sync: 'standard',
        snapshots_count: 0,
        mount_count: 0,
        export_count: 0,
        object_state: 'active',
      },
    };

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 99 },
      handlers: {
        'GET datasets': ({ searchParams }) => {
          const role = searchParams.get('dataset[role]');
          if (role !== 'primary') return { datasets: [], _meta: { total_count: 0 } };
          return { datasets: [datasets[901]], _meta: { total_count: 1 } };
        },
        'GET datasets/901': () => datasets[901],
        'GET datasets/902': () => datasets[902],
        'GET transaction_chains': () => ({ transaction_chains: [], _meta: { total_count: 0 } }),
        'POST datasets': () => {
          return { dataset: datasets[902] };
        },
      },
    });

    await page.goto('/admin/nas');
    await page.getByRole('link', { name: 'tank/nas/alice' }).click();

    await expect(page).toHaveURL(/\/admin\/nas\/901$/);
    await expect(page.getByTestId('dataset.header')).toContainText('NAS');
    await expect(page.getByRole('link', { name: 'Snapshots' })).toHaveAttribute('href', '/admin/nas/901/snapshots');
    await expect(page.getByRole('link', { name: 'Downloads' })).toHaveAttribute('href', '/admin/nas/901/downloads');

    await page.getByTestId('dataset.manage.create.open').click();
    const createModal = page.getByTestId('dataset.manage.create.modal');
    await createModal.getByTestId('dataset.manage.create.name').fill('projects');
    await createModal.getByTestId('dataset.manage.create.refquota').fill('8');
    await createModal.getByTestId('dataset.manage.create.submit').click();

    await expect(page).toHaveURL(/\/admin\/nas\/902$/);
  });

  test('shows NAS-specific empty state and keeps filter clearing available', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    await installHaveApiMock(page, {
      user: { id: 1, login: 'alice', level: 1 },
      handlers: {
        'GET datasets': () => ({ datasets: [], _meta: { total_count: 0 } }),
      },
    });

    await page.goto('/app/nas');

    await expect(page.getByTestId('datasets.list.empty')).toContainText('No NAS datasets found');

    await page.getByTestId('datasets.search.input').fill('missing-nas');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('datasets.active_filters')).toContainText('q:missing-nas');
    await expect(page.getByTestId('datasets.list.empty')).toContainText('No results');
    await page.getByTestId('datasets.filter.clear').click();
    await expect(page.getByTestId('datasets.active_filters')).toHaveCount(0);
  });

  test('shows NAS-specific load error state', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    await installHaveApiMock(page, {
      user: { id: 1, login: 'alice', level: 1 },
      handlers: {
        'GET datasets': () => jsonFulfill({ status: false, message: 'storage node unavailable', response: null }, 503),
      },
    });

    await page.goto('/app/nas');

    await expect(page.getByTestId('datasets.list.error')).toContainText('Failed to load NAS datasets');
    await expect(page.getByTestId('datasets.list.error.retry')).toBeVisible();
  });
});
