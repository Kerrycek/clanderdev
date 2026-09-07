import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, failEnvelope, installHaveApiMock } from '../../fixtures';

function ownedDataset(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    full_name: 'tank/vps/ds10',
    name: 'ds10',
    user: { id: 2, login: 'member' },
    used: 2048,
    avail: 10240,
    quota: 0,
    refquota: 10240,
    recordsize: 131072,
    compression: true,
    atime: false,
    relatime: false,
    sync: 'standard',
    snapshots_count: 2,
    mount_count: 0,
    export_count: 0,
    object_state: 'active',
    vps: { id: 300, hostname: 'alpha.example' },
    ...overrides,
  };
}

test.describe('Dataset management actions', () => {
  test('keeps completed and failed recent transaction chains on the overview', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    const requestedStates: Array<string | null> = [];

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 99 },
      handlers: {
        'GET datasets/10': () => ownedDataset(),
        'GET transaction_chains': ({ searchParams }) => {
          const className = searchParams.get('transaction_chain[class_name]');
          const rowId = searchParams.get('transaction_chain[row_id]');
          const state = searchParams.get('transaction_chain[state]');
          if (className !== 'Dataset' || rowId !== '10') return { transaction_chains: [] };
          requestedStates.push(state);
          return {
            transaction_chains: state ? [] : [
              { id: 912, label: 'Completed snapshot task', state: 'done' },
              { id: 911, label: 'Failed snapshot task', state: 'failed' },
            ],
          };
        },
      },
    });

    await page.goto('/admin/datasets/10');

    const history = page.getByTestId('dataset.overview.transactions');
    await expect(history).toContainText('Completed snapshot task');
    await expect(history).toContainText('Failed snapshot task');
    expect(requestedStates).toContain(null);
  });

  test('creates, edits, and deletes a dataset from the overview', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    const datasets: Record<number, any> = {
      10: {
        id: 10,
        full_name: 'tank/vps/ds10',
        name: 'ds10',
        used: 2048,
        avail: 10240,
        quota: 0,
        refquota: 10240,
        recordsize: 131072,
        compression: true,
        atime: false,
        relatime: false,
        sync: 'standard',
        snapshots_count: 2,
        mount_count: 0,
        export_count: 0,
        object_state: 'active',
        vps: { id: 300, hostname: 'alpha.example' },
      },
    };

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 99 },
      handlers: {
        'GET datasets': () => ({ datasets: Object.values(datasets), _meta: { total_count: Object.keys(datasets).length } }),
        'GET datasets/10': () => datasets[10],
        'GET datasets/11': () => datasets[11],
        'GET transaction_chains': () => ({ transaction_chains: [], _meta: { total_count: 0 } }),
        'POST datasets': () => {
          datasets[11] = {
            ...datasets[10],
            id: 11,
            name: 'appdata',
            full_name: 'tank/vps/ds10/appdata',
            refquota: 12288,
            quota: 0,
            recordsize: 131072,
          };
          return { dataset: datasets[11] };
        },
        'PUT datasets/11': () => {
          datasets[11] = { ...datasets[11], quota: 20480, sync: 'disabled' };
          return { status: true, response: null };
        },
        'DELETE datasets/11': () => {
          delete datasets[11];
          return { status: true, response: null };
        },
      },
    });

    await page.goto('/admin/datasets/10');
    await expect(page.getByTestId('dataset.manage')).toBeVisible();

    await page.getByTestId('dataset.manage.create.open').click();
    const createModal = page.getByTestId('dataset.manage.create.modal');
    await createModal.getByTestId('dataset.manage.create.name').fill('appdata');
    await createModal.getByTestId('dataset.manage.create.refquota').fill('12');

    const createReq = page.waitForRequest((r) => r.method() === 'POST' && r.url().includes('/api/v7.0/datasets'));
    await createModal.getByTestId('dataset.manage.create.submit').click();
    expect((await createReq).postDataJSON()).toEqual({
      dataset: {
        name: 'appdata',
        dataset: 10,
        automount: true,
        refquota: 12288,
      },
    });

    await expect(page).toHaveURL(/\/admin\/datasets\/11$/);
    await expect(page.getByTestId('dataset.header')).toContainText('tank/vps/ds10/appdata');

    await page.getByTestId('dataset.manage.quota').fill('20');
    await page.getByTestId('dataset.manage.advanced_properties.summary').click();
    await page.getByTestId('dataset.manage.sync').selectOption('disabled');
    await page.getByTestId('dataset.manage.admin_override').click();

    const editReq = page.waitForRequest((r) => r.method() === 'PUT' && r.url().includes('/api/v7.0/datasets/11'));
    await page.getByTestId('dataset.manage.edit.submit').click();
    expect((await editReq).postDataJSON()).toMatchObject({
      dataset: {
        quota: 20480,
        refquota: 12288,
        sync: 'disabled',
        admin_override: true,
      },
    });

    await page.getByTestId('dataset.manage.delete.open').click();
    await expect(page.getByTestId('dataset.manage.delete.confirm')).toBeVisible();
    await expect(page.getByTestId('dataset.manage.delete.confirm.confirm')).toBeEnabled();

    const deleteReq = page.waitForRequest((r) => r.method() === 'DELETE' && r.url().includes('/api/v7.0/datasets/11'));
    await page.getByTestId('dataset.manage.delete.confirm.confirm').click();
    await deleteReq;
    await expect(page).toHaveURL(/\/admin\/datasets$/);
  });

  test('lets a normal user create and safely delete an owned subdataset', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    let deleteCalls = 0;
    const datasets: Record<number, any> = {
      10: {
        id: 10,
        full_name: 'tank/vps/ds10',
        name: 'ds10',
        user: { id: 2, login: 'member' },
        used: 2048,
        avail: 10240,
        quota: 0,
        refquota: 10240,
        recordsize: 131072,
        compression: true,
        atime: false,
        relatime: false,
        sync: 'standard',
        snapshots_count: 2,
        mount_count: 0,
        export_count: 0,
        object_state: 'active',
        vps: { id: 300, hostname: 'alpha.example' },
      },
    };

    await installHaveApiMock(page, {
      user: { id: 2, login: 'member', level: 1 },
      handlers: {
        'GET datasets': () => ({
          datasets: Object.values(datasets),
          _meta: { total_count: Object.keys(datasets).length },
        }),
        'GET datasets/10': () => datasets[10],
        'GET datasets/11': () => datasets[11],
        'GET transaction_chains': () => ({ transaction_chains: [], _meta: { total_count: 0 } }),
        'POST datasets': () => {
          datasets[11] = {
            ...datasets[10],
            id: 11,
            name: 'appdata',
            full_name: 'tank/vps/ds10/appdata',
            parent: { id: 10 },
          };
          return { dataset: datasets[11] };
        },
        'DELETE datasets/11': () => {
          deleteCalls += 1;
          delete datasets[11];
          return { status: true, response: null };
        },
      },
    });

    await page.goto('/app/datasets/10');
    await expect(page.getByTestId('dataset.manage')).toBeVisible();

    await expect(page.getByTestId('dataset.manage.create.open')).toBeVisible();
    await expect(page.getByTestId('dataset.manage.delete.open')).toHaveCount(0);
    await expect(page.getByTestId('dataset.manage.sharenfs')).toHaveCount(0);
    await expect(page.getByTestId('dataset.manage.admin_lock_type')).toHaveCount(0);
    await expect(page.getByTestId('dataset.manage.admin_override')).toHaveCount(0);

    await page.getByTestId('dataset.manage.create.open').click();
    await page.getByTestId('dataset.manage.create.advanced_properties.summary').click();
    await expect(page.getByTestId('dataset.manage.create.recordsize')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('dataset.manage.create.modal')).toHaveCount(0);

    await page.getByTestId('dataset.manage.create.open').click();
    const createModal = page.getByTestId('dataset.manage.create.modal');
    await createModal.getByTestId('dataset.manage.create.name').fill('appdata');
    await expect(createModal.getByTestId('dataset.manage.create.advanced_properties')).not.toHaveAttribute('open');
    await expect(createModal.getByTestId('dataset.manage.create.recordsize')).not.toBeVisible();
    await expect(createModal.getByTestId('dataset.manage.create.sync')).not.toBeVisible();
    await expect(createModal.getByTestId('dataset.manage.create.atime')).not.toBeVisible();
    await expect(createModal.getByTestId('dataset.manage.create.relatime')).not.toBeVisible();
    await expect(createModal.getByTestId('dataset.manage.create.sharenfs')).toHaveCount(0);
    await expect(createModal.getByTestId('dataset.manage.create.admin_lock_type')).toHaveCount(0);
    await expect(createModal.getByTestId('dataset.manage.create.admin_override')).toHaveCount(0);

    const createReq = page.waitForRequest((request) =>
      request.method() === 'POST' && request.url().includes('/api/v7.0/datasets')
    );
    await createModal.getByTestId('dataset.manage.create.submit').click();
    expect((await createReq).postDataJSON()).toEqual({
      dataset: {
        name: 'appdata',
        dataset: 10,
        automount: true,
      },
    });

    await expect(page).toHaveURL(/\/app\/datasets\/11$/);
    await expect(page.getByTestId('dataset.manage.delete.open')).toBeVisible();
    await expect(page.getByTestId('dataset.manage.sharenfs')).toHaveCount(0);
    await expect(page.getByTestId('dataset.manage.admin_lock_type')).toHaveCount(0);
    await expect(page.getByTestId('dataset.manage.admin_override')).toHaveCount(0);

    await page.getByTestId('dataset.manage.delete.open').click();
    await expect(page.getByTestId('dataset.manage.delete.confirm')).toContainText(
      'tank/vps/ds10/appdata'
    );
    await page.getByTestId('dataset.manage.delete.confirm.cancel').click();
    await expect(page.getByTestId('dataset.manage.delete.confirm')).toBeHidden();
    expect(deleteCalls).toBe(0);

    await page.getByTestId('dataset.manage.delete.open').click();
    const deleteReq = page.waitForRequest((request) =>
      request.method() === 'DELETE' && request.url().includes('/api/v7.0/datasets/11')
    );
    await page.getByTestId('dataset.manage.delete.confirm.confirm').click();
    await deleteReq;
    expect(deleteCalls).toBe(1);
    await expect(page).toHaveURL(/\/app\/datasets$/);
  });

  test('sends only quota fields and preserves untouched advanced properties on update', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    let updateCalls = 0;
    await installHaveApiMock(page, {
      user: { id: 2, login: 'member', level: 1 },
      handlers: {
        'GET datasets/10': () => ownedDataset({ sync: 'always' }),
        'GET transaction_chains': () => ({ transaction_chains: [], _meta: { total_count: 0 } }),
        'PUT datasets/10': () => {
          updateCalls += 1;
          return { status: true, response: null };
        },
      },
    });

    await page.goto('/app/datasets/10');
    await expect(page.getByTestId('dataset.manage')).toBeVisible();
    await expect(page.getByTestId('dataset.manage.sharenfs')).toHaveCount(0);
    await expect(page.getByTestId('dataset.manage.admin_lock_type')).toHaveCount(0);
    await expect(page.getByTestId('dataset.manage.admin_override')).toHaveCount(0);

    await page.getByTestId('dataset.manage.quota').fill('20');
    await page.getByTestId('dataset.manage.refquota').fill('12');
    await expect(page.getByTestId('dataset.manage.advanced_properties')).not.toHaveAttribute('open');
    await expect(page.getByTestId('dataset.manage.sync')).not.toBeVisible();

    const updateRequest = page.waitForRequest((request) =>
      request.method() === 'PUT' && request.url().includes('/api/v7.0/datasets/10')
    );
    await page.getByTestId('dataset.manage.edit.submit').click();

    expect((await updateRequest).postDataJSON()).toEqual({
      dataset: {
        quota: 20480,
        refquota: 12288,
      },
    });
    expect(updateCalls).toBe(1);
  });

  test('does not fabricate missing admin properties during an advanced update', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 99 },
      handlers: {
        'GET datasets/10': () => ownedDataset({ sync: 'always' }),
        'GET transaction_chains': () => ({ transaction_chains: [], _meta: { total_count: 0 } }),
        'PUT datasets/10': () => ({ status: true, response: null }),
      },
    });

    await page.goto('/admin/datasets/10');
    await page.getByTestId('dataset.manage.advanced_properties.summary').click();
    await page.getByTestId('dataset.manage.compression').uncheck();

    const updateRequest = page.waitForRequest((request) =>
      request.method() === 'PUT' && request.url().includes('/api/v7.0/datasets/10')
    );
    await page.getByTestId('dataset.manage.edit.submit').click();

    expect((await updateRequest).postDataJSON()).toEqual({
      dataset: {
        refquota: 10240,
        compression: false,
        atime: false,
        relatime: false,
        recordsize: 131072,
        sync: 'always',
      },
    });
  });

  test('sends advanced user fields without admin-only properties when creating a subdataset', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    const child = ownedDataset({
      id: 12,
      full_name: 'tank/vps/ds10/archive',
      name: 'archive',
      parent: { id: 10 },
    });
    let createCalls = 0;

    await installHaveApiMock(page, {
      user: { id: 2, login: 'member', level: 1 },
      handlers: {
        'GET datasets/10': () => ownedDataset(),
        'GET datasets/12': () => child,
        'GET transaction_chains': () => ({ transaction_chains: [], _meta: { total_count: 0 } }),
        'POST datasets': () => {
          createCalls += 1;
          return { dataset: child };
        },
      },
    });

    await page.goto('/app/datasets/10');
    await page.getByTestId('dataset.manage.create.open').click();
    const createModal = page.getByTestId('dataset.manage.create.modal');
    await expect(createModal).toBeVisible();

    await createModal.getByTestId('dataset.manage.create.name').fill('archive');
    await createModal.getByTestId('dataset.manage.create.automount').uncheck();
    await createModal.getByTestId('dataset.manage.create.quota').fill('20');
    await createModal.getByTestId('dataset.manage.create.refquota').fill('12');
    await createModal.getByTestId('dataset.manage.create.advanced_properties.summary').click();
    await createModal.getByTestId('dataset.manage.create.compression').uncheck();
    await createModal.getByTestId('dataset.manage.create.atime').check();
    await createModal.getByTestId('dataset.manage.create.relatime').check();
    await createModal.getByTestId('dataset.manage.create.recordsize').fill('64');
    await createModal.getByTestId('dataset.manage.create.sync').selectOption('disabled');
    await expect(createModal.getByTestId('dataset.manage.create.sharenfs')).toHaveCount(0);
    await expect(createModal.getByTestId('dataset.manage.create.admin_lock_type')).toHaveCount(0);
    await expect(createModal.getByTestId('dataset.manage.create.admin_override')).toHaveCount(0);

    const createRequest = page.waitForRequest((request) =>
      request.method() === 'POST' && request.url().includes('/api/v7.0/datasets')
    );
    await createModal.getByTestId('dataset.manage.create.submit').click();

    expect((await createRequest).postDataJSON()).toEqual({
      dataset: {
        name: 'archive',
        dataset: 10,
        automount: false,
        quota: 20480,
        refquota: 12288,
        compression: false,
        atime: true,
        relatime: true,
        recordsize: 65536,
        sync: 'disabled',
      },
    });
    expect(createCalls).toBe(1);
    await expect(page).toHaveURL(/\/app\/datasets\/12$/);
  });

  test('keeps a failed user create open and allows a successful retry', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    const child = ownedDataset({
      id: 11,
      full_name: 'tank/vps/ds10/retry-data',
      name: 'retry-data',
      parent: { id: 10 },
    });
    let createCalls = 0;

    await installHaveApiMock(page, {
      user: { id: 2, login: 'member', level: 1 },
      handlers: {
        'GET datasets/10': () => ownedDataset(),
        'GET datasets/11': () => child,
        'GET transaction_chains': () => ({ transaction_chains: [], _meta: { total_count: 0 } }),
        'POST datasets': () => {
          createCalls += 1;
          return createCalls === 1
            ? failEnvelope('Temporary dataset create failure')
            : { dataset: child };
        },
      },
    });

    await page.goto('/app/datasets/10');
    await page.getByTestId('dataset.manage.create.open').click();
    const createModal = page.getByTestId('dataset.manage.create.modal');
    const submit = createModal.getByTestId('dataset.manage.create.submit');
    await createModal.getByTestId('dataset.manage.create.name').fill('retry-data');

    await submit.click();
    await expect(createModal).toBeVisible();
    await expect(createModal.getByText('Temporary dataset create failure', { exact: true })).toBeVisible();
    await expect(createModal.getByTestId('dataset.manage.create.name')).toHaveValue('retry-data');
    await expect(submit).toBeEnabled();
    expect(createCalls).toBe(1);

    await submit.click();
    await expect(page).toHaveURL(/\/app\/datasets\/11$/);
    expect(createCalls).toBe(2);
  });

  test('disables create while the request is pending and prevents a double submit', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    const child = ownedDataset({
      id: 11,
      full_name: 'tank/vps/ds10/single-submit',
      name: 'single-submit',
      parent: { id: 10 },
    });
    let createCalls = 0;
    let releaseCreate!: () => void;
    const createMayFinish = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });

    await installHaveApiMock(page, {
      user: { id: 2, login: 'member', level: 1 },
      handlers: {
        'GET datasets/10': () => ownedDataset(),
        'GET datasets/11': () => child,
        'GET transaction_chains': () => ({ transaction_chains: [], _meta: { total_count: 0 } }),
        'POST datasets': async () => {
          createCalls += 1;
          await createMayFinish;
          return { dataset: child };
        },
      },
    });

    await page.goto('/app/datasets/10');
    await page.getByTestId('dataset.manage.create.open').click();
    const createModal = page.getByTestId('dataset.manage.create.modal');
    const submit = createModal.getByTestId('dataset.manage.create.submit');
    await createModal.getByTestId('dataset.manage.create.name').fill('single-submit');

    await submit.click();
    await expect.poll(() => createCalls).toBe(1);
    await expect(submit).toBeDisabled();
    await submit.evaluate((button: HTMLButtonElement) => button.click());

    releaseCreate();
    await expect(page).toHaveURL(/\/app\/datasets\/11$/);
    expect(createCalls).toBe(1);
  });

  test('active transaction chain disables user create and delete without a mutation request', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    let createCalls = 0;
    let deleteCalls = 0;
    await installHaveApiMock(page, {
      user: { id: 2, login: 'member', level: 1 },
      handlers: {
        'GET datasets/11': () => ownedDataset({
          id: 11,
          full_name: 'tank/vps/ds10/appdata',
          name: 'appdata',
          parent: { id: 10 },
        }),
        'GET transaction_chains': ({ searchParams }) => {
          const className = searchParams.get('transaction_chain[class_name]');
          const rowId = searchParams.get('transaction_chain[row_id]');
          if (className === 'Dataset' && rowId === '11') {
            return {
              transaction_chains: [
                {
                  id: 700,
                  state: 'running',
                  label: 'dataset-busy',
                  created_at: '2026-07-23T12:00:00.000Z',
                },
              ],
            };
          }
          return { transaction_chains: [] };
        },
        'POST datasets': () => {
          createCalls += 1;
          return { dataset: ownedDataset({ id: 12, parent: { id: 11 } }) };
        },
        'DELETE datasets/11': () => {
          deleteCalls += 1;
          return { status: true, response: null };
        },
      },
    });

    await page.goto('/app/datasets/11');
    const createButton = page.getByTestId('dataset.manage.create.open');
    const deleteButton = page.getByTestId('dataset.manage.delete.open');
    await expect(createButton).toBeDisabled();
    await expect(deleteButton).toBeDisabled();

    await createButton.evaluate((button: HTMLButtonElement) => button.click());
    await deleteButton.evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.getByTestId('dataset.manage.create.modal')).toHaveCount(0);
    await expect(page.getByTestId('dataset.manage.delete.confirm')).toBeHidden();
    expect(createCalls).toBe(0);
    expect(deleteCalls).toBe(0);
  });

  test('rejects a direct create deep-link for a foreign dataset without issuing POST', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    let createCalls = 0;

    const foreignDataset = {
      id: 21,
      full_name: 'tank/vps/foreign',
      name: 'foreign',
      user: { id: 99, login: 'someone-else' },
      parent: { id: 10 },
      object_state: 'active',
    };

    await installHaveApiMock(page, {
      user: { id: 2, login: 'member', level: 1 },
      handlers: {
        'GET datasets/21': () => foreignDataset,
        'GET transaction_chains': () => ({ transaction_chains: [], _meta: { total_count: 0 } }),
        'POST datasets': () => {
          createCalls += 1;
          return { dataset: foreignDataset };
        },
      },
    });

    await page.goto('/app/datasets/21?create=subdataset');
    await expect(page.getByTestId('dataset.manage')).toBeVisible();
    await expect(page.getByTestId('dataset.manage.create.modal')).toHaveCount(0);
    await expect(page.getByTestId('dataset.manage.create.open')).toHaveCount(0);
    await expect(page.getByTestId('dataset.manage.delete.open')).toHaveCount(0);
    await expect(page.getByTestId('dataset.manage.edit.submit')).toBeDisabled();
    await expect(page.getByTestId('dataset.manage.sharenfs')).toHaveCount(0);
    await expect(page.getByTestId('dataset.manage.admin_lock_type')).toHaveCount(0);
    await expect(page.getByTestId('dataset.manage.admin_override')).toHaveCount(0);
    await expect(page).toHaveURL(/\/app\/datasets\/21$/);
    expect(createCalls).toBe(0);
  });

  test('hides admin-only dataset controls for admins in my view', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 99 },
      handlers: {
        'GET datasets/10': () => ({
          id: 10,
          full_name: 'tank/vps/ds10',
          name: 'ds10',
          user: { id: 1, login: 'admin' },
          used: 2048,
          avail: 10240,
          quota: 0,
          refquota: 10240,
          recordsize: 131072,
          compression: true,
          atime: false,
          relatime: false,
          sync: 'standard',
          snapshots_count: 2,
          mount_count: 0,
          export_count: 0,
          object_state: 'active',
          vps: { id: 300, hostname: 'alpha.example' },
        }),
        'GET transaction_chains': () => ({ transaction_chains: [], _meta: { total_count: 0 } }),
      },
    });

    await page.goto('/app/datasets/10');
    await expect(page.getByTestId('dataset.manage')).toBeVisible();

    await expect(page.getByTestId('dataset.overview.actions')).toHaveCount(0);
    await expect(page.getByTestId('dataset.manage.create.open')).toBeVisible();
    await expect(page.getByTestId('dataset.manage.delete.open')).toHaveCount(0);
    await expect(page.getByTestId('dataset.manage.sharenfs')).toHaveCount(0);
    await expect(page.getByTestId('dataset.manage.admin_lock_type')).toHaveCount(0);
    await expect(page.getByTestId('dataset.manage.admin_override')).toHaveCount(0);
  });
});
