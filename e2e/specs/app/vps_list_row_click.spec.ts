import type { Locator, Page } from '@playwright/test';

import { expect, test } from '../../fixtures/playwright';
import { bootstrapVpsAdminWindow } from '../../fixtures/bootstrap';
import { installHaveApiMock } from '../../fixtures/haveapi';

function makeVps(id: number) {
  return {
    id,
    hostname: `vps${id}.example`,
    object_state: 'active',
    is_running: true,
    uptime: 12345,
    cpu: 4,
    memory: 4096,
    diskspace: 200_000,
    node: { id: 1, domain_name: 'node1', location: { id: 1, label: 'Praha' } },
    user: { id: 42, login: 'RowOwnerOnly' },
  };
}

async function visibleVpsItem(page: Page, id: number): Promise<{ item: Locator; actionPrefix: string }> {
  const viewport = page.viewportSize();

  if (!viewport || viewport.width >= 768) {
    const row = page.getByTestId(`vps.row.${id}`);
    await expect(row).toBeVisible();
    return { item: row, actionPrefix: `vps.row.${id}` };
  }

  const card = page.getByTestId(`vps.card.${id}`);
  await expect(card).toBeVisible();
  return { item: card, actionPrefix: `vps.card.${id}` };
}

async function navigateWithinApp(page: Page, path: string) {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, '', nextPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

test.describe('@workflow-matrix @smoke VPS list row navigation', () => {
  test('clicking a row navigates to VPS detail', async ({ page }) => {
    const vps = makeVps(300);

    await installHaveApiMock(page, {
      handlers: {
        'GET vpses': () => ({ vpses: [vps] }),
        'GET vpses/300': () => ({ vps }),
        'GET ip_addresses': () => ({ ip_addresses: [] }),
        'GET vpses/300/statuses': () => ({ statuses: [] }),
      },
    });

    await bootstrapVpsAdminWindow(page);

    await page.goto('/app/vps');
    const { item } = await visibleVpsItem(page, 300);

    await item.getByRole('link', { name: 'vps300.example' }).click();

    await expect(page).toHaveURL(/\/app\/vps\/300/);
    await expect(page.getByTestId('vps.header')).toBeVisible();
  });

  test('using the row stop icon does not trigger row navigation', async ({ page }) => {
    const vps = makeVps(300);

    await installHaveApiMock(page, {
      handlers: {
        'GET vpses': () => ({ vpses: [vps] }),
      },
    });

    await bootstrapVpsAdminWindow(page);

    await page.goto('/app/vps');
    const { actionPrefix } = await visibleVpsItem(page, 300);

    await page.getByTestId(`${actionPrefix}.action.stop`).click();

    await expect(page).toHaveURL(/\/app\/vps(?:\?|$)/);
    await expect(page.getByTestId('vps.list.power_confirm')).toBeVisible();
  });

  test('clicking user delete action opens confirmation without row navigation and sends empty delete payload', async ({ page }) => {
    const vps = makeVps(300);

    await installHaveApiMock(page, {
      user: { id: 42, login: 'owner', level: 1 },
      handlers: {
        'GET vpses': () => ({ vpses: [vps] }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'DELETE vpses/300': () => ({ _meta: { action_state_id: 901 } }),
      },
    });

    await bootstrapVpsAdminWindow(page);

    await page.goto('/app/vps');
    const { actionPrefix } = await visibleVpsItem(page, 300);

    await page.getByTestId(`${actionPrefix}.action.delete`).click();

    await expect(page).toHaveURL(/\/app\/vps(?:\?|$)/);
    await expect(page.getByTestId('vps.list.delete_confirm')).toBeVisible();
    await expect(page.getByTestId('vps.list.delete_confirm.lazy')).toHaveCount(0);

    const reqPromise = page.waitForRequest(
      (r) => r.method() === 'DELETE' && r.url().includes('/api/v7.0/vpses/300')
    );

    await expect(page.getByTestId('vps.list.delete_confirm.confirm_text')).toHaveCount(0);

    await page.getByTestId('vps.list.delete_confirm.confirm').click();

    const req = await reqPromise;
    expect(req.postDataJSON()).toEqual({});
    await expect(page).toHaveURL(/\/app\/vps(?:\?|$)/);
  });

  test('admin list delete keeps lazy delete as the legacy default', async ({ page }) => {
    const vps = makeVps(300);

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 99 },
      handlers: {
        'GET vpses': () => ({ vpses: [vps] }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'DELETE vpses/300': () => ({ _meta: { action_state_id: 902 } }),
      },
    });

    await bootstrapVpsAdminWindow(page);

    await page.goto('/admin/vps');
    const { actionPrefix } = await visibleVpsItem(page, 300);

    await page.getByTestId(`${actionPrefix}.action.delete`).click();

    await expect(page).toHaveURL(/\/admin\/vps(?:\?|$)/);
    await expect(page.getByTestId('vps.list.delete_confirm')).toBeVisible();
    await expect(page.getByTestId('vps.list.delete_confirm.lazy')).toBeChecked();

    const reqPromise = page.waitForRequest(
      (r) => r.method() === 'DELETE' && r.url().includes('/api/v7.0/vpses/300')
    );

    await expect(page.getByTestId('vps.list.delete_confirm.confirm_text')).toHaveCount(0);

    await page.getByTestId('vps.list.delete_confirm.confirm').click();

    const req = await reqPromise;
    expect(req.postDataJSON()).toEqual({ vps: { lazy: true } });
    await expect(page).toHaveURL(/\/admin\/vps(?:\?|$)/);
  });

  test('admin delete keeps its submit-time payload while the reused list switches to user mode', async ({ page }) => {
    const vps = makeVps(300);
    let releaseGuard = () => {};
    let markGuardStarted = () => {};
    const guardRelease = new Promise<void>((resolve) => { releaseGuard = resolve; });
    const guardStarted = new Promise<void>((resolve) => { markGuardStarted = resolve; });

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 99 },
      handlers: {
        'GET vpses': () => ({ vpses: [vps] }),
        'GET transaction_chains': async ({ searchParams }) => {
          const isDeleteGuard =
            searchParams.get('transaction_chain[class_name]') === 'Vps'
            && searchParams.get('transaction_chain[row_id]') === '300';
          if (isDeleteGuard) {
            markGuardStarted();
            await guardRelease;
          }
          return { transaction_chains: [] };
        },
        'DELETE vpses/300': () => ({ _meta: { action_state_id: 903 } }),
      },
    });
    await bootstrapVpsAdminWindow(page);

    await page.goto('/admin/vps');
    const { actionPrefix } = await visibleVpsItem(page, 300);
    await page.getByTestId(`${actionPrefix}.action.delete`).click();
    await expect(page.getByTestId('vps.list.delete_confirm.lazy')).toBeChecked();

    const deleteRequest = page.waitForRequest(
      (request) => request.method() === 'DELETE' && request.url().includes('/api/v7.0/vpses/300')
    );
    await page.getByTestId('vps.list.delete_confirm.confirm').click();
    await guardStarted;

    await navigateWithinApp(page, '/app/vps');
    await expect(page).toHaveURL(/\/app\/vps(?:\?|$)/);
    await expect(page.getByTestId('vps.list.create')).toHaveAttribute('href', '/app/vps/new');

    releaseGuard();
    const request = await deleteRequest;
    expect(request.postDataJSON()).toEqual({ vps: { lazy: true } });
  });

  test('my VPS view hides redundant owner context while admin view keeps it', async ({ page }) => {
    const vps = makeVps(300);

    await installHaveApiMock(page, {
      user: { id: 42, login: 'RowOwnerOnly', level: 99 },
      handlers: {
        'GET vpses': () => ({ vpses: [vps] }),
      },
    });

    await bootstrapVpsAdminWindow(page);

    await page.goto('/app/vps');
    const { item: myItem } = await visibleVpsItem(page, 300);
    await expect(myItem.getByText('RowOwnerOnly')).toHaveCount(0);
    await expect(myItem.getByText('Praha')).toBeVisible();
    await expect(myItem.getByText('node1')).toBeVisible();

    await page.goto('/admin/vps');
    const { item: adminItem } = await visibleVpsItem(page, 300);
    await expect(adminItem.getByText('RowOwnerOnly')).toBeVisible();
  });

  test('mobile row actions keep touch-friendly targets', async ({ page }) => {
    const vps = makeVps(300);

    await page.setViewportSize({ width: 390, height: 844 });
    await installHaveApiMock(page, {
      handlers: {
        'GET vpses': () => ({ vpses: [vps] }),
      },
    });

    await bootstrapVpsAdminWindow(page);

    await page.goto('/app/vps');
    const action = page.getByTestId('vps.card.300.action.console');
    await expect(action).toBeVisible();

    const box = await action.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });

  test('desktop row actions fit inside the viewport without clipping', async ({ page }) => {
    const vps = makeVps(300);

    await page.setViewportSize({ width: 1280, height: 900 });
    await installHaveApiMock(page, {
      handlers: {
        'GET vpses': () => ({ vpses: [vps] }),
      },
    });

    await bootstrapVpsAdminWindow(page);

    await page.goto('/app/vps');
    await visibleVpsItem(page, 300);

    const tableFits = await page.getByTestId('vps.table').evaluate((table) => {
      const rect = table.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= document.documentElement.clientWidth;
    });

    expect(tableFits).toBe(true);
    await expect(page.getByTestId('vps.row.300.action.delete')).toBeInViewport();
  });
});
