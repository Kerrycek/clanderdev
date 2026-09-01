import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

const vps = {
  id: 123,
  hostname: 'history.example.test',
  object_state: 'active',
  is_running: true,
  enable_network: true,
  cpus: 2,
  memory: 2048,
  swap: 0,
  diskspace: 20_480,
  node: { id: 1, domain_name: 'node1.example.test', location: { id: 2, label: 'Praha' } },
  user: { id: 42, login: 'owner' },
};

function event(id: number, eventType = 'resources') {
  return {
    id,
    created_at: `2026-08-31T12:${String(id % 60).padStart(2, '0')}:00Z`,
    event_type: eventType,
    user: { id: 42, login: 'owner' },
    user_session: { id: 80, api_ip_addr: '198.51.100.42' },
    object: 'Vps',
    object_id: 123,
    event_data: { cpus: [1, 2], root_password: ['secret-before', 'secret-after'] },
  };
}

test('@pr-smoke @pr-smoke-mobile VPS history uses an exact object scope, responsive layout and safe summaries', async ({ page }, testInfo) => {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST_HISTORY' });

  const requests: URLSearchParams[] = [];
  await installHaveApiMock(page, {
    user: { id: 42, login: 'owner', level: 1 },
    handlers: {
      'GET vpses/123': () => ({ vps }),
      'GET ip_addresses': () => ({ ip_addresses: [] }),
      'GET transaction_chains': () => ({ transaction_chains: [] }),
      'GET object_histories': ({ searchParams }) => {
        requests.push(new URLSearchParams(searchParams));
        const eventType = searchParams.get('object_history[event_type]');
        return { object_histories: [event(1, eventType || 'resources')] };
      },
    },
  });

  await page.goto('/app/vps/123/history');

  await expect(page.getByTestId('vps.history.page')).toBeVisible();
  await expect(page.getByRole('link', { name: /History|Historie/ })).toBeVisible();

  if (testInfo.project.name === 'mobile-chrome') {
    await expect(page.getByTestId('vps.history.card.1')).toBeVisible();
    await expect(page.getByTestId('vps.history.table')).not.toBeVisible();
  } else {
    await expect(page.getByTestId('vps.history.row.1')).toBeVisible();
    await expect(page.getByTestId('vps.history.mobile')).not.toBeVisible();
  }

  await expect(page.getByTestId('vps.history.page')).toContainText('cpus');
  await expect(page.getByTestId('vps.history.page')).toContainText('root_password');
  await expect(page.getByText('secret-before')).toHaveCount(0);
  await expect(page.getByText('secret-after')).toHaveCount(0);

  const proofScreenshot = process.env.E2E_VPS_HISTORY_SCREENSHOT?.trim();
  if (proofScreenshot) {
    const suffix = testInfo.project.name === 'mobile-chrome' ? '-mobile' : '-desktop';
    await page.screenshot({ path: proofScreenshot.replace(/\.png$/i, `${suffix}.png`), fullPage: true });
  }

  await expect.poll(() => requests.length).toBeGreaterThan(0);
  const initial = requests[0]!;
  expect(initial.get('object_history[object]')).toBe('Vps');
  expect(initial.get('object_history[object_id]')).toBe('123');
  expect(initial.get('object_history[limit]')).toBe('26');
  expect(initial.get('object_history[user]')).toBeNull();
  expect(initial.get('_meta[includes]')).toBe('user,user_session');

  await page.getByTestId('vps.history.filter.event_type').fill('route_add');
  await expect.poll(() => requests.some((request) => request.get('object_history[event_type]') === 'route_add')).toBe(true);
  await expect(page.getByTestId('vps.history.page')).toContainText('route_add');
  await expect(page).toHaveURL(/event_type=route_add/);
});

test('@pr-smoke VPS history uses ascending keyset pagination and opens admin audit detail', async ({ page }, testInfo) => {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST_HISTORY_ADMIN' });

  const firstPage = Array.from({ length: 26 }, (_, index) => event(index + 1));
  const seenFromIds: Array<string | null> = [];
  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'GET vpses/123': () => ({ vps }),
      'GET ip_addresses': () => ({ ip_addresses: [] }),
      'GET transaction_chains': () => ({ transaction_chains: [] }),
      'GET object_histories': ({ searchParams }) => {
        const fromId = searchParams.get('object_history[from_id]');
        seenFromIds.push(fromId);
        return { object_histories: fromId === '25' ? [event(26, 'stop')] : firstPage };
      },
      'GET object_histories/26': () => ({ object_history: event(26, 'stop') }),
    },
  });

  await page.goto('/admin/vps/123/history');
  const itemPrefix = testInfo.project.name === 'mobile-chrome' ? 'vps.history.card' : 'vps.history.row';
  await expect(page.getByTestId(`${itemPrefix}.1`)).toBeVisible();

  await page.getByTestId('vps.history.pagination.next').click();
  await expect(page.getByTestId(`${itemPrefix}.26`)).toBeVisible();
  expect(seenFromIds).toContain('25');
  await expect(page).toHaveURL(/from_id=25/);
  await expect(page.getByTestId('vps.history.pagination.next')).toBeDisabled();

  await page.getByTestId(`${itemPrefix}.26`).click();
  await expect(page).toHaveURL(/\/admin\/audit\/26/);
  await expect(page.getByTestId('admin.audit.detail')).toBeVisible();
});

test('an exactly full terminal VPS history page does not offer an empty next page', async ({ page }, testInfo) => {
  await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST_HISTORY_EXACT_LIMIT' });

  await installHaveApiMock(page, {
    user: { id: 42, login: 'owner', level: 1 },
    handlers: {
      'GET vpses/123': () => ({ vps }),
      'GET ip_addresses': () => ({ ip_addresses: [] }),
      'GET transaction_chains': () => ({ transaction_chains: [] }),
      'GET object_histories': () => ({
        object_histories: Array.from({ length: 25 }, (_, index) => event(index + 1)),
      }),
    },
  });

  await page.goto('/app/vps/123/history');
  const itemPrefix = testInfo.project.name === 'mobile-chrome' ? 'vps.history.card' : 'vps.history.row';
  await expect(page.getByTestId(`${itemPrefix}.25`)).toBeVisible();
  await expect(page.getByTestId('vps.history.pagination.next')).toBeDisabled();
});
