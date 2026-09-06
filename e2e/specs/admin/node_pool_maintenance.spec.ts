import { expect, test, type Page } from '@playwright/test';

import {
  bootstrapVpsAdminWindow,
  installHaveApiMock,
  setUiSettingsLocalStorage,
  type HaveApiHandler,
} from '../../fixtures';

const node = {
  id: 5,
  domain_name: 'node5.example',
  fqdn: 'node5.example',
  status: true,
  maintenance_lock: 'no',
  role: 'hypervisor',
  hypervisor_type: 'vpsadminos',
  pool_state: 'online',
  pool_scan: 'none',
};

function pool(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    node: 5,
    label: `pool-${id}`,
    name: `tank-${id}`,
    role: 'hypervisor',
    state: 'online',
    scan: 'none',
    total_space: 2048,
    used_space: 1024,
    available_space: 1024,
    maintenance_lock: 'no',
    maintenance_lock_reason: '',
    ...overrides,
  };
}

async function installAdminNodeHandlers(
  page: Page,
  handlers: Record<string, HaveApiHandler>,
) {
  await setUiSettingsLocalStorage(page, { language: 'en' });
  await bootstrapVpsAdminWindow(page, { sessionToken: 'POOL_MAINTENANCE' });
  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'GET nodes/5': () => ({ node }),
      'GET nodes': () => ({ nodes: [node] }),
      'GET nodes/public_status': () => [],
      'GET nodes/5/statuses': () => ({ statuses: [] }),
      'GET transactions': () => ({ transactions: [] }),
      ...handlers,
    },
  });
}

test('@pr-smoke @pr-smoke-mobile admin locks and unlocks a real pool, while inherited maintenance stays read-only', async ({
  page,
}) => {
  const pools = [
    pool(11, { label: 'Fast pool' }),
    pool(12, {
      label: 'Inherited pool',
      maintenance_lock: 'master_lock',
      maintenance_lock_reason: 'Location maintenance',
    }),
  ];
  const payloads: unknown[] = [];
  let poolReads = 0;
  let nodeReads = 0;

  await installAdminNodeHandlers(page, {
    'GET nodes/5': () => {
      nodeReads += 1;
      return { node };
    },
    'GET pools': () => {
      poolReads += 1;
      return { pools };
    },
    'POST pools/11/set_maintenance': ({ reqJson }) => {
      payloads.push(reqJson);
      const input = (reqJson as { pool?: { lock?: boolean; reason?: string } })?.pool ?? {};
      pools[0].maintenance_lock = input.lock ? 'lock' : 'no';
      pools[0].maintenance_lock_reason = input.lock ? String(input.reason ?? '') : '';
      return {};
    },
  });

  await page.goto('/admin/nodes/5?section=storage');

  const directControl = 'admin.node.storage.pool.11.maintenance';
  const inheritedControl = 'admin.node.storage.pool.12.maintenance';
  await expect(page.getByTestId(`${directControl}.lock`)).toBeVisible();
  await expect(page.getByTestId(inheritedControl)).toContainText('Inherited lock');
  await expect(page.getByTestId(`${inheritedControl}.details`)).toContainText(
    'inherited from higher-level infrastructure',
  );
  await expect(page.getByTestId(`${inheritedControl}.reason`)).toContainText('Location maintenance');
  await expect(page.getByTestId(`${inheritedControl}.lock`)).toHaveCount(0);
  await expect(page.getByTestId(`${inheritedControl}.unlock`)).toHaveCount(0);
  await expect(
    page.getByTestId('admin.node.storage.aggregate').locator('[data-testid$=".maintenance.section"]'),
  ).toHaveCount(0);

  await page.getByTestId(`${directControl}.lock`).click();
  await expect(page.getByTestId(`${directControl}.lock_dialog`)).toBeVisible();
  await page.getByTestId(`${directControl}.reason`).fill('Disk replacement');
  await page.getByTestId(`${directControl}.lock_dialog.cancel`).click();
  await expect(page.getByTestId(`${directControl}.lock_dialog`)).toHaveCount(0);
  expect(payloads).toEqual([]);

  await page.getByTestId(`${directControl}.lock`).click();
  await page.getByTestId(`${directControl}.reason`).fill('Disk replacement');
  await page.getByTestId(`${directControl}.lock_dialog.confirm`).click();

  await expect.poll(() => payloads).toEqual([
    { pool: { lock: true, reason: 'Disk replacement' } },
  ]);
  await expect.poll(() => poolReads).toBeGreaterThan(1);
  await expect(page.getByTestId(`${directControl}.unlock`)).toBeVisible();
  await expect(page.getByTestId(`${directControl}.details`)).toContainText('locked directly');
  await expect(page.getByTestId(`${directControl}.reason`)).toContainText('Disk replacement');
  expect(nodeReads).toBe(1);

  await page.getByTestId(`${directControl}.unlock`).click();
  await expect(page.getByTestId(`${directControl}.unlock_dialog`)).toContainText('Disk replacement');
  await page.getByTestId(`${directControl}.unlock_dialog.confirm`).click();

  await expect.poll(() => payloads).toEqual([
    { pool: { lock: true, reason: 'Disk replacement' } },
    { pool: { lock: false } },
  ]);
  await expect(page.getByTestId(`${directControl}.lock`)).toBeVisible();
  await expect(page.getByTestId(`${directControl}.details`)).toHaveCount(0);
  expect(nodeReads).toBe(1);
});

test('a failed pool lock is guarded against duplicate submits and can be retried with its reason', async ({
  page,
}) => {
  const pools = [pool(11, { label: 'Retry pool' })];
  const payloads: unknown[] = [];
  let releaseFailure: (() => void) | undefined;
  const firstResponse = new Promise<void>((resolve) => {
    releaseFailure = resolve;
  });

  await installAdminNodeHandlers(page, {
    'GET pools': () => ({ pools }),
    'POST pools/11/set_maintenance': async ({ reqJson }) => {
      payloads.push(reqJson);
      if (payloads.length === 1) {
        await firstResponse;
        return {
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            status: false,
            message: 'pool maintenance unavailable',
            response: null,
          }),
        };
      }

      pools[0].maintenance_lock = 'lock';
      pools[0].maintenance_lock_reason = 'Keep this reason';
      return {};
    },
  });

  const control = 'admin.node.storage.pool.11.maintenance';
  await page.goto('/admin/nodes/5?section=storage');
  await page.getByTestId(`${control}.lock`).click();
  await page.getByTestId(`${control}.reason`).fill('Keep this reason');
  await page.getByTestId(`${control}.lock_dialog.confirm`).click();

  await expect.poll(() => payloads).toHaveLength(1);
  const confirm = page.getByTestId(`${control}.lock_dialog.confirm`);
  await expect(confirm).toBeDisabled();
  await expect(page.getByTestId(`${control}.lock_dialog.cancel`)).toBeDisabled();
  await confirm.evaluate((button: HTMLButtonElement) => button.click());
  expect(payloads).toHaveLength(1);

  releaseFailure?.();
  await expect(page.getByTestId('toast.viewport')).toContainText('pool maintenance unavailable');
  await expect(page.getByTestId(`${control}.lock_dialog`)).toBeVisible();
  await expect(page.getByTestId(`${control}.reason`)).toHaveValue('Keep this reason');
  await expect(page.getByTestId(`${control}.lock_dialog.confirm`)).toBeEnabled();

  await page.getByTestId(`${control}.lock_dialog.confirm`).click();
  await expect.poll(() => payloads).toEqual([
    { pool: { lock: true, reason: 'Keep this reason' } },
    { pool: { lock: true, reason: 'Keep this reason' } },
  ]);
  await expect(page.getByTestId(`${control}.unlock`)).toBeVisible();
});

test('an ordinary user cannot reach pool maintenance controls or invoke the admin-only action', async ({
  page,
}) => {
  let poolReads = 0;
  let mutations = 0;

  await setUiSettingsLocalStorage(page, { language: 'en' });
  await bootstrapVpsAdminWindow(page, { sessionToken: 'POOL_MAINTENANCE_USER' });
  await installHaveApiMock(page, {
    user: { id: 2, login: 'member', level: 1 },
    handlers: {
      'GET pools': () => {
        poolReads += 1;
        return { pools: [pool(11)] };
      },
      'POST pools/11/set_maintenance': () => {
        mutations += 1;
        return {};
      },
    },
  });

  await page.goto('/admin/nodes/5?section=storage');

  await expect(page.getByTestId('auth.admin-required')).toBeVisible();
  await expect(page.locator('[data-testid^="admin.node.storage.pool."][data-testid$=".maintenance"]')).toHaveCount(0);
  expect(poolReads).toBe(0);
  expect(mutations).toBe(0);
});
