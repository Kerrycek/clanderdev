import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock, setUiSettingsLocalStorage } from '../../fixtures';

test('admin user resource usage and package assignment are separate', async ({ page }) => {
  let packageUserFilter: string | null = null;
  const assignmentUserFilters: Array<string | null> = [];
  await setUiSettingsLocalStorage(page, { language: 'cs' });
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'GET users/53': () => ({ user: { id: 53, login: 'kavman', level: 1 } }),
      'GET environments': () => ({ environments: [{ id: 7, label: 'Production' }, { id: 8, label: 'Playground' }] }),
      'GET cluster_resource_packages': ({ searchParams }) => {
        packageUserFilter = searchParams.get('cluster_resource_package[user]');

        if (packageUserFilter !== '') {
          return { cluster_resource_packages: [{ id: 99, label: 'Personal package', is_personal: true }] };
        }

        return { cluster_resource_packages: [
          { id: 11, label: 'Standard Production' },
          { id: 12, label: 'Standard Playground' },
          { id: 13, label: 'Standard Staging' },
        ] };
      },
      'GET user_cluster_resource_packages': ({ searchParams }) => {
        const userFilter = searchParams.get('user_cluster_resource_package[user]');
        assignmentUserFilters.push(userFilter);

        if (userFilter === '1') {
          return { user_cluster_resource_packages: [
            { id: 30, user: { id: 1, login: 'admin' }, is_personal: true, environment: { id: 7, label: 'Production' }, cluster_resource_package: { id: 99, label: 'Personal package', is_personal: true } },
            { id: 31, user: { id: 1, login: 'admin' }, is_personal: false, environment: { id: 7, label: 'Production' }, cluster_resource_package: { id: 11, label: 'Standard Production', is_personal: false } },
            { id: 32, user: { id: 1, login: 'admin' }, is_personal: false, environment: { id: 8, label: 'Playground' }, cluster_resource_package: { id: 12, label: 'Standard Playground', is_personal: false } },
            // Deliberately return a foreign row to prove the profile fails closed
            // even if a backend filter regresses.
            { id: 90, user: { id: 53, login: 'kavman' }, is_personal: false, environment: { id: 7, label: 'Production' }, cluster_resource_package: { id: 90, label: 'Foreign secret package', is_personal: false } },
          ] };
        }

        return { user_cluster_resource_packages: [
          { id: 20, user: { id: 53, login: 'kavman' }, is_personal: true, environment: { id: 7, label: 'Production' }, cluster_resource_package: { id: 99, label: 'Personal package', is_personal: true } },
          { id: 21, user: { id: 53, login: 'kavman' }, is_personal: false, environment: { id: 7, label: 'Production' }, cluster_resource_package: { id: 11, label: 'Standard Production', is_personal: false } },
          { id: 22, user: { id: 53, login: 'kavman' }, is_personal: false, environment: { id: 8, label: 'Playground' }, cluster_resource_package: { id: 12, label: 'Standard Playground', is_personal: false } },
          { id: 23, user: { id: 53, login: 'kavman' }, is_personal: true, environment: { id: 8, label: 'Playground' }, cluster_resource_package: { id: 98, label: 'Personal package', is_personal: true } },
        ] };
      },
      'GET users/53/cluster_resources': () => ({ cluster_resources: [
        { id: 31, environment: { id: 7, label: 'Production' }, cluster_resource: { id: 2, name: 'cpu', label: 'CPU', stepsize: 1 }, value: 4, used: 2, free: 2 },
        { id: 33, environment: { id: 7, label: 'Production' }, cluster_resource: { id: 3, name: 'memory', label: 'Memory', stepsize: 1 }, value: 4096, used: 4096, free: 0 },
        { id: 34, environment: { id: 7, label: 'Production' }, cluster_resource: { id: 4, name: 'private_ipv4', label: 'Private IPv4 address', stepsize: 1 }, value: 0, used: 0, free: 0 },
      ] }),
      'GET users/1/cluster_resources': () => ({ cluster_resources: [
        { id: 32, environment: { id: 7, label: 'Production' }, cluster_resource: { id: 2, name: 'cpu', label: 'CPU' }, value: 4, used: 1, free: 3 },
        { id: 35, environment: { id: 7, label: 'Production' }, cluster_resource: { id: 4, name: 'private_ipv4', label: 'Private IPv4 address' }, value: 0, used: 0, free: 0 },
      ] }),
      'GET cluster_resource_packages/98/items': () => ({ items: [{ id: 3, value: 0, cluster_resource: { id: 2, label: 'CPU' } }] }),
      'GET cluster_resource_packages/99/items': () => ({ items: [{ id: 4, value: 0, cluster_resource: { id: 2, label: 'CPU' } }] }),
      'GET cluster_resource_packages/11/items': () => ({ items: [{ id: 5, value: 4, cluster_resource: { id: 2, label: 'CPU' } }] }),
      'GET cluster_resource_packages/12/items': () => ({ items: [{ id: 6, value: 2048, cluster_resource: { id: 3, label: 'Memory', name: 'memory' } }] }),
      'POST user_cluster_resource_packages': () => ({ user_cluster_resource_package: { id: 21 } }),
    },
  });

  await page.goto('/admin/users/53/resources/usage');
  await expect(page.getByTestId('admin.user.resource_usage.page')).toBeVisible();
  await expect(page.getByTestId('admin.user.resource_usage.resources.environment.7')).toContainText('CPU');
  await expect(page.getByTestId('admin.user.resource_usage.resources.environment.7')).toContainText('2');
  await expect(page.getByTestId('admin.user.resource_usage.resources.environment.7.resource.31.bar').locator('div').nth(1)).toHaveAttribute('style', 'width: 50%;');
  await expect(page.getByTestId('admin.user.resource_usage.resources.environment.7.resource.33.bar').locator('div').nth(1)).toHaveAttribute('style', 'width: 100%;');
  await expect(page.getByTestId('admin.user.resource_usage.resources.environment.7.resource.34')).toHaveCount(0);

  await page.goto('/admin/users/53/resources');
  await expect(page.getByTestId('admin.user.resources.page')).toBeVisible();
  await expect(page.getByRole('heading', { name: /přiřazené balíčky|assigned packages/i })).toBeVisible();
  await expect(page.getByTestId('admin.user.resources.summary')).toContainText('Standard Production');
  await expect(page.getByTestId('admin.user.resources.summary')).toContainText('Standard Playground');
  const personalSummary = page.getByTestId('admin.user.resources.summary').locator('tbody tr').filter({ hasText: 'Personal package' });
  await expect(personalSummary).toContainText('2×');
  await expect(personalSummary.locator('td').nth(1)).toHaveText('2');
  await expect(page.getByTestId('admin.user.resources.summary').locator('tbody tr')).toHaveCount(3);
  await expect(page.getByTestId('admin.user.resources.environment.7')).toContainText('Standard Production');
  const personalAssignment = page.getByTestId('admin.user.resources.assignment.20');
  await expect(personalAssignment.getByRole('link', { name: /upravit balíček|edit package/i })).toBeVisible();
  await expect(personalAssignment.getByRole('button', { name: /odebrat|remove/i })).toHaveCount(0);
  const standardAssignment = page.getByTestId('admin.user.resources.assignment.21');
  await expect(standardAssignment.getByRole('link', { name: /upravit balíček|edit package/i })).toHaveCount(0);
  await expect(standardAssignment.getByRole('button', { name: /odebrat|remove/i })).toBeVisible();
  await expect.poll(() => packageUserFilter).toBe('');

  const layoutProofScreenshot = process.env['E2E_USER_RESOURCES_LAYOUT_PROOF_SCREENSHOT'];
  if (layoutProofScreenshot) await page.screenshot({ path: layoutProofScreenshot, fullPage: true });

  await page.getByTestId('admin.user.resources.add').click();
  const modal = page.getByTestId('admin.user.resources.add.modal');
  await modal.getByRole('combobox').nth(0).selectOption('7');
  const packageSelect = modal.getByRole('combobox').nth(1);
  await expect(packageSelect.locator('option')).toContainText(['Standard Production', 'Standard Playground', 'Standard Staging']);
  await packageSelect.selectOption('12');
  const proofScreenshot = process.env['E2E_USER_RESOURCES_PROOF_SCREENSHOT'];
  if (proofScreenshot) await page.screenshot({ path: proofScreenshot, fullPage: true });
  await page.getByRole('button', { name: /přidat balíček|add package/i }).last().click();

  await page.goto('/app/profile/resources');
  await expect(page.getByTestId('profile.resources.page')).toBeVisible();
  await expect(page.getByRole('heading', { name: /balíčky a prostředí|packages and environments/i })).toBeVisible();
  await expect(page.getByTestId('profile.resources.packages.environment.7')).toContainText('Personal package');
  await expect(page.getByTestId('profile.resources.packages.environment.7')).toContainText('Standard Production');
  await expect(page.getByTestId('profile.resources.packages.environment.8')).toContainText('Standard Playground');
  await expect(page.getByTestId('profile.resources.packages.assignment.90')).toHaveCount(0);
  await expect(page.getByTestId('profile.resources.page')).not.toContainText('Foreign secret package');
  await expect(page.getByTestId('profile.resources.usage.environment.7')).toContainText('CPU');
  await expect(page.getByTestId('profile.resources.usage.environment.7.resource.32.bar').locator('div').nth(1)).toHaveAttribute('style', 'width: 25%;');
  await expect(page.getByTestId('profile.resources.usage.environment.7.resource.35')).toHaveCount(0);
  await expect(page.getByTestId('profile.resources.page')).not.toContainText(/přidat balíček|add package/i);
  await expect(page.getByTestId('profile.resources.page').getByRole('button')).toHaveCount(0);
  await expect.poll(() => assignmentUserFilters).toContain('1');

  const profileProofScreenshot = process.env['E2E_PROFILE_RESOURCES_PROOF_SCREENSHOT'];
  if (profileProofScreenshot) await page.screenshot({ path: profileProofScreenshot, fullPage: true });
});

test('profile packages use English, recover from an error and show an empty state', async ({ page }) => {
  let shouldFail = true;
  let resourcesShouldFail = true;
  await setUiSettingsLocalStorage(page, { language: 'en' });
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
  await installHaveApiMock(page, {
    user: { id: 1, login: 'member', level: 1 },
    handlers: {
      'GET user_cluster_resource_packages': () => {
        if (shouldFail) {
          return {
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ status: false, message: 'temporary failure', response: null }),
          };
        }
        return { user_cluster_resource_packages: [] };
      },
      'GET users/1/cluster_resources': () => {
        if (resourcesShouldFail) {
          return {
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ status: false, message: 'temporary failure', response: null }),
          };
        }
        return { cluster_resources: [] };
      },
    },
  });

  await page.goto('/app/profile/resources');
  await expect(page.getByRole('heading', { name: 'Packages and environments' })).toBeVisible();
  const error = page.getByTestId('profile.resources.packages.error');
  await expect(error).toContainText('Packages could not be loaded');
  const usageError = page.getByTestId('profile.resources.usage.error');
  await expect(usageError).toContainText('Resource usage could not be loaded');

  shouldFail = false;
  resourcesShouldFail = false;
  await error.getByRole('button', { name: 'Retry' }).click();
  await usageError.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByTestId('profile.resources.packages.empty')).toContainText('No assigned packages');
  await expect(page.getByTestId('profile.resources.usage')).toContainText('No resources');

  const mobileProofScreenshot = process.env['E2E_PROFILE_RESOURCES_MOBILE_PROOF_SCREENSHOT'];
  if (mobileProofScreenshot) await page.screenshot({ path: mobileProofScreenshot, fullPage: true });
});
