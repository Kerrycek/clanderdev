import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

const TOTAL_ROWS = 125;
const PAGE_SIZE = 25;

function pageRows<T extends { id: number }>(rows: T[], searchParams: URLSearchParams, namespace: string): T[] {
  const fromIdRaw = searchParams.get(`${namespace}[from_id]`);
  const fromId = fromIdRaw ? Number(fromIdRaw) : null;
  const limit = Number(searchParams.get(`${namespace}[limit]`) ?? PAGE_SIZE);
  return rows.filter((row) => fromId === null || row.id > fromId).slice(0, limit);
}

async function saveScreenshot(page: Page, name: string) {
  const directory = process.env.E2E_ADMIN_LIST_SCREENSHOT_DIR;
  if (!directory) return;
  const absoluteDirectory = path.resolve(directory);
  await mkdir(absoluteDirectory, { recursive: true });
  await page.screenshot({ path: path.join(absoluteDirectory, name), fullPage: true });
}

test.describe('@smoke Admin audit and users pagination consistency', () => {
  test('audit shows the exact total and jumps directly to page five on desktop', async ({ page }) => {
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    const events = Array.from({ length: TOTAL_ROWS }, (_, index) => {
      const id = index + 1;
      return {
        id,
        user: { id: 1, login: 'admin' },
        user_session: { id: 10, api_ip_addr: '203.0.113.10' },
        object: 'Vps',
        object_id: id,
        event_type: 'update',
        event_data: { field: 'hostname' },
        created_at: '2026-08-28T08:00:00Z',
      };
    });
    const cursors: Array<number | null> = [];
    let countRequested = false;

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 100 },
      handlers: {
        'GET object_histories': ({ searchParams }) => {
          const fromIdRaw = searchParams.get('object_history[from_id]');
          cursors.push(fromIdRaw ? Number(fromIdRaw) : null);
          if (searchParams.get('_meta[count]') === 'true') countRequested = true;
          return {
            object_histories: pageRows(events, searchParams, 'object_history'),
            _meta: { total_count: events.length },
          };
        },
      },
    });

    await page.goto('/admin/audit?limit=25');

    const pagination = page.getByTestId('admin.audit.pagination.top');
    await expect(pagination).toContainText(/1.*5/);
    await pagination.getByTestId('admin.audit.pagination.top.page.5').click();

    await expect(page).toHaveURL(/(?:\?|&)page=5(?:&|$)/);
    await expect(page).toHaveURL(/(?:\?|&)from_id=100(?:&|$)/);
    await expect(page.getByTestId('admin.audit.row.101')).toBeVisible();
    await expect(page.getByTestId('admin.audit.row.100')).toHaveCount(0);
    await expect(pagination).toContainText(/5.*5/);
    expect(countRequested).toBe(true);
    expect(cursors).toEqual(expect.arrayContaining([null, 25, 50, 75, 100]));

    await saveScreenshot(page, 'admin-audit-page-5-desktop.png');
  });

  test('users shows the exact total and jumps directly to page five on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });

    const users = Array.from({ length: TOTAL_ROWS }, (_, index) => {
      const id = index + 1;
      return {
        id,
        login: `user${id}`,
        full_name: `User ${id}`,
        email: `user${id}@example.test`,
        level: 1,
        last_activity_at: '2026-08-28T08:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
      };
    });
    const cursors: Array<number | null> = [];
    let countRequested = false;

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 100 },
      handlers: {
        'GET users': ({ searchParams }) => {
          const fromIdRaw = searchParams.get('user[from_id]');
          cursors.push(fromIdRaw ? Number(fromIdRaw) : null);
          if (searchParams.get('_meta[count]') === 'true') countRequested = true;
          return {
            users: pageRows(users, searchParams, 'user'),
            _meta: { total_count: users.length },
          };
        },
      },
    });

    await page.goto('/admin/users?limit=25');

    const pagination = page.getByTestId('admin.users.pagination.mobile');
    await expect(pagination).toContainText(/1.*5/);
    await pagination.getByTestId('admin.users.pagination.mobile.page.5').click();

    await expect(page).toHaveURL(/(?:\?|&)page=5(?:&|$)/);
    await expect(page).toHaveURL(/(?:\?|&)from_id=100(?:&|$)/);
    await expect(page.getByTestId('admin.users.card.101')).toBeVisible();
    await expect(page.getByTestId('admin.users.card.100')).toHaveCount(0);
    await expect(pagination).toContainText(/5.*5/);
    expect(countRequested).toBe(true);
    expect(cursors).toEqual(expect.arrayContaining([null, 25, 50, 75, 100]));

    await saveScreenshot(page, 'admin-users-page-5-mobile.png');
  });
});
