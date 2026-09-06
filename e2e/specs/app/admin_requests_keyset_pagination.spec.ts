import { test, expect } from '@playwright/test';

import { bootstrapVpsAdminWindow } from '../../fixtures/bootstrap';
import { installHaveApiMock } from '../../fixtures/haveapi';
import { withAppUrl } from '../../fixtures/url';

function makeRegistration(id: number) {
  return {
    id,
    state: id === 299 ? 'denied' : 'awaiting',
    label: `Registration #${id}`,
    user: { id: 1000 + id, login: `user${id}` },
    api_ip_addr: '203.0.113.10',
    client_ip_addr: '198.51.100.20',
    created_at: '2026-02-14T10:00:00Z',
    // fraud scores to exercise the risk badge
    ip_fraud_score: id % 100,
    mail_fraud_score: (id + 10) % 100,
  };
}

function makeChange(id: number) {
  return {
    id,
    state: 'awaiting',
    label: `Change #${id}`,
    user: { id: 2000 + id, login: `user${id}` },
    api_ip_addr: '203.0.113.10',
    client_ip_addr: '198.51.100.20',
    created_at: '2026-02-14T10:00:00Z',
  };
}

function pageSlice(descIds: number[], fromId: number | null, limit: number): number[] {
  const filtered = fromId ? descIds.filter((id) => id < fromId) : descIds;
  return filtered.slice(0, limit);
}

test('admin requests: keyset pagination merges registrations + changes', async ({ page }) => {
  await bootstrapVpsAdminWindow(page);
  const haveApiMock = await installHaveApiMock(page, { user: { id: 1, login: 'admin', level: 100 } });
  const registrationStates: Array<string | null> = [];
  const changeStates: Array<string | null> = [];

  // Interleaved ids: registrations are even, changes are odd.
  const registrations = Array.from({ length: 60 }, (_, i) => 300 - i).filter((id) => id % 2 === 0);
  const changes = Array.from({ length: 60 }, (_, i) => 300 - i).filter((id) => id % 2 === 1);

  haveApiMock.addHandler('GET user_request/registrations', ({ searchParams }) => {
    registrationStates.push(searchParams.get('registration[state]'));
    const limit = Number(searchParams.get('registration[limit]') ?? 25);
    const fromIdRaw = searchParams.get('registration[from_id]');
    const fromId = fromIdRaw ? Number(fromIdRaw) : null;

    const ids = pageSlice(registrations, fromId, limit);
    return {
      status: true,
      response: {
        registrations: ids.map(makeRegistration),
      },
    };
  });

  haveApiMock.addHandler('GET user_request/changes', ({ searchParams }) => {
    changeStates.push(searchParams.get('change[state]'));
    const limit = Number(searchParams.get('change[limit]') ?? 25);
    const fromIdRaw = searchParams.get('change[from_id]');
    const fromId = fromIdRaw ? Number(fromIdRaw) : null;

    const ids = pageSlice(changes, fromId, limit);
    return {
      status: true,
      response: {
        changes: ids.map(makeChange),
      },
    };
  });

  await page.goto(withAppUrl('/admin/requests?limit=25'));

  // First page should contain the newest mixed ids.
  const table = page.getByTestId('admin.requests.table');
  await expect(table).toBeVisible();
  await expect.poll(() => registrationStates.at(-1)).toBe('awaiting');
  await expect.poll(() => changeStates.at(-1)).toBe('awaiting');
  await expect(table.getByTestId('admin.requests.row.registration.300')).toBeVisible();
  const change299 = table.getByTestId('admin.requests.row.change.299');
  await expect(change299).toBeVisible();
  await expect(change299.getByTestId('admin.requests.row.change.299.dot')).toHaveClass(/bg-warn/);

  // Next page should advance by the last id on page 1 (300..276 => cursor 276).
  const registrationCalls = registrationStates.length;
  const changeCalls = changeStates.length;
  await page.getByTestId('admin.requests.pagination.desktop.next').click();

  await expect(page).toHaveURL(/from_id=276/);
  await expect.poll(() => registrationStates.length).toBeGreaterThan(registrationCalls);
  await expect.poll(() => changeStates.length).toBeGreaterThan(changeCalls);
  expect(registrationStates.at(-1)).toBe('awaiting');
  expect(changeStates.at(-1)).toBe('awaiting');
  await expect(table.getByTestId('admin.requests.row.change.275')).toBeVisible();
  await expect(table.getByTestId('admin.requests.row.registration.274')).toBeVisible();
});
