import { expect, test } from '@playwright/test';

import {
  bootstrapVpsAdminWindow,
  installHaveApiMock,
  setUiSettingsLocalStorage,
} from '../../fixtures';

function failedResponse(message: string, status = 403) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify({ status: false, message, response: null }),
  };
}

test('@pr-smoke environment and location maintenance lock and unlock with exact payloads and readback', async ({
  page,
}) => {
  const environment = {
    id: 4,
    label: 'Production',
    domain: 'vpsfree.cz',
    can_create_vps: true,
    can_destroy_vps: true,
    vps_lifetime: 0,
    max_vps_count: 0,
    user_ip_ownership: true,
    maintenance_lock: 'no',
    maintenance_lock_reason: '',
  };
  const location = {
    id: 7,
    label: 'Prague DC1',
    domain: 'prg1.vpsfree.cz',
    environment: { id: 4, label: 'Production' },
    has_ipv6: true,
    maintenance_lock: 'no',
    maintenance_lock_reason: '',
  };
  const environmentPayloads: unknown[] = [];
  const locationPayloads: unknown[] = [];

  await setUiSettingsLocalStorage(page, { language: 'en' });
  await bootstrapVpsAdminWindow(page, { sessionToken: 'CLUSTER_MAINTENANCE' });
  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'GET environments': () => ({ environments: [environment], _meta: { total_count: 1 } }),
      'GET locations': () => ({ locations: [location], _meta: { total_count: 1 } }),
      'POST environments/4/set_maintenance': ({ reqJson }) => {
        environmentPayloads.push(reqJson);
        const input = (reqJson as any)?.environment ?? {};
        environment.maintenance_lock = input.lock ? 'lock' : 'no';
        environment.maintenance_lock_reason = input.lock ? String(input.reason ?? '') : '';
        return {};
      },
      'POST locations/7/set_maintenance': ({ reqJson }) => {
        locationPayloads.push(reqJson);
        const input = (reqJson as any)?.location ?? {};
        location.maintenance_lock = input.lock ? 'lock' : 'no';
        location.maintenance_lock_reason = input.lock ? String(input.reason ?? '') : '';
        return {};
      },
    },
  });

  const environmentControl = 'admin.cluster.environments.row.4.maintenance';
  await page.goto('/admin/cluster/environments');
  await expect(page.getByTestId(`${environmentControl}.lock`)).toBeVisible();
  await page.getByTestId(`${environmentControl}.lock`).click();
  await page.getByTestId(`${environmentControl}.reason`).fill('Network maintenance');
  await page.getByTestId(`${environmentControl}.lock_dialog.confirm`).click();

  await expect.poll(() => environmentPayloads).toEqual([
    { environment: { lock: true, reason: 'Network maintenance' } },
  ]);
  await expect(page.getByTestId(`${environmentControl}.unlock`)).toBeVisible();
  await expect(page.getByTestId(`${environmentControl}.lock`)).toHaveCount(0);

  await page.getByTestId(`${environmentControl}.unlock`).click();
  await expect(page.getByTestId(`${environmentControl}.unlock_dialog`)).toContainText('Network maintenance');
  await page.getByTestId(`${environmentControl}.unlock_dialog.confirm`).click();

  await expect.poll(() => environmentPayloads).toEqual([
    { environment: { lock: true, reason: 'Network maintenance' } },
    { environment: { lock: false } },
  ]);
  await expect(page.getByTestId(`${environmentControl}.lock`)).toBeVisible();

  const locationControl = 'admin.cluster.locations.row.7.maintenance';
  await page.goto('/admin/cluster/locations');
  await expect(page.getByTestId(`${locationControl}.lock`)).toBeVisible();
  await page.getByTestId(`${locationControl}.lock`).click();
  await page.getByTestId(`${locationControl}.reason`).fill('Power maintenance');
  await page.getByTestId(`${locationControl}.lock_dialog.confirm`).click();

  await expect.poll(() => locationPayloads).toEqual([
    { location: { lock: true, reason: 'Power maintenance' } },
  ]);
  await expect(page.getByTestId(`${locationControl}.unlock`)).toBeVisible();
  await page.getByTestId(`${locationControl}.unlock`).click();
  await expect(page.getByTestId(`${locationControl}.unlock_dialog`)).toContainText('Power maintenance');
  await page.getByTestId(`${locationControl}.unlock_dialog.confirm`).click();

  await expect.poll(() => locationPayloads).toEqual([
    { location: { lock: true, reason: 'Power maintenance' } },
    { location: { lock: false } },
  ]);
  await expect(page.getByTestId(`${locationControl}.lock`)).toBeVisible();
});

test('maintenance errors preserve the environment and location dialogs for a safe retry', async ({ page }) => {
  const environmentPayloads: unknown[] = [];
  const locationPayloads: unknown[] = [];

  await setUiSettingsLocalStorage(page, { language: 'en' });
  await bootstrapVpsAdminWindow(page, { sessionToken: 'CLUSTER_MAINTENANCE_ERRORS' });
  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'GET environments': () => ({
        environments: [{
          id: 4,
          label: 'Production',
          domain: 'vpsfree.cz',
          can_create_vps: true,
          can_destroy_vps: true,
          maintenance_lock: 'no',
        }],
      }),
      'GET locations': () => ({
        locations: [{
          id: 7,
          label: 'Prague DC1',
          domain: 'prg1.vpsfree.cz',
          environment: { id: 4, label: 'Production' },
          maintenance_lock: 'no',
        }],
      }),
      'POST environments/4/set_maintenance': ({ reqJson }) => {
        environmentPayloads.push(reqJson);
        return failedResponse('environment maintenance denied');
      },
      'POST locations/7/set_maintenance': ({ reqJson }) => {
        locationPayloads.push(reqJson);
        return failedResponse('location maintenance unavailable', 503);
      },
    },
  });

  const environmentControl = 'admin.cluster.environments.row.4.maintenance';
  await page.goto('/admin/cluster/environments');
  await page.getByTestId(`${environmentControl}.lock`).click();
  await page.getByTestId(`${environmentControl}.reason`).fill('Keep this environment draft');
  await page.getByTestId(`${environmentControl}.lock_dialog.confirm`).click();

  await expect(page.getByTestId(`${environmentControl}.lock_dialog`)).toBeVisible();
  await expect(page.getByTestId(`${environmentControl}.reason`)).toHaveValue('Keep this environment draft');
  await expect(page.getByTestId('toast.viewport')).toContainText('environment maintenance denied');
  expect(environmentPayloads).toEqual([
    { environment: { lock: true, reason: 'Keep this environment draft' } },
  ]);
  await page.getByTestId(`${environmentControl}.lock_dialog.cancel`).click();

  const locationControl = 'admin.cluster.locations.row.7.maintenance';
  await page.goto('/admin/cluster/locations');
  await page.getByTestId(`${locationControl}.lock`).click();
  await page.getByTestId(`${locationControl}.reason`).fill('Keep this location draft');
  await page.getByTestId(`${locationControl}.lock_dialog.confirm`).click();

  await expect(page.getByTestId(`${locationControl}.lock_dialog`)).toBeVisible();
  await expect(page.getByTestId(`${locationControl}.reason`)).toHaveValue('Keep this location draft');
  await expect(page.getByTestId('toast.viewport')).toContainText('location maintenance unavailable');
  expect(locationPayloads).toEqual([
    { location: { lock: true, reason: 'Keep this location draft' } },
  ]);
});
