import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

test('admin user detail: shows header and shortcut links', async ({ page }) => {
  await bootstrapVpsAdminWindow(page);

  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'GET users/42': () => ({
        user: {
          id: 42,
          login: 'alice',
          level: 1,
          full_name: 'Alice Example',
          email: 'alice@example.test',
          created_at: '2026-02-01T00:00:00.000Z',
          last_activity_at: '2026-02-02T00:00:00.000Z',
          address: 'Example street\nExample city',
        },
      }),
    },
  });

  await page.goto('/admin/users/42');

  await expect(page.getByTestId('admin.user.page')).toBeVisible();
  await expect(page.getByTestId('admin.user.header')).toBeVisible();

  await expect(page.getByTestId('admin.user.action.vps')).toHaveAttribute('href', '/admin/vps?user=42');
  await expect(page.getByTestId('admin.user.action.datasets')).toHaveAttribute('href', '/admin/datasets?user=42');
  await expect(page.getByTestId('admin.user.action.dns')).toHaveAttribute('href', '/admin/dns?user=42');
  await expect(page.getByTestId('admin.user.action.requests')).toHaveAttribute('href', '/admin/requests?user=42');
  await expect(page.getByTestId('admin.user.action.user_namespaces')).toHaveAttribute('href', '/admin/user-namespaces/maps?user=42');

  await expect(page.getByTestId('admin.user.refresh')).toBeVisible();
});

test('admin user detail: edit drawer saves safe account fields', async ({ page }) => {
  await bootstrapVpsAdminWindow(page);

  const updates: any[] = [];
  let user = {
    id: 42,
    login: 'alice',
    level: 1,
    full_name: 'Alice Example',
    email: 'alice@example.test',
    mailer_enabled: true,
    info: 'Initial note',
    address: 'Example street',
  };

  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'GET users/42': () => ({ user }),
      'PUT users/42': () => {
        user = {
          ...user,
          full_name: 'Alice Renamed',
          email: 'alice.renamed@example.test',
          level: 21,
          mailer_enabled: false,
          info: 'Support account',
          address: 'New street',
        };
        return { user };
      },
    },
  });

  page.on('request', (req) => {
    const url = new URL(req.url());
    if (req.method() === 'PUT' && url.pathname === '/api/v7.0/users/42') {
      updates.push(req.postDataJSON());
    }
  });

  await page.goto('/admin/users/42');
  await expect(page.getByTestId('admin.user.page')).toBeVisible();

  await page.getByTestId('admin.user.edit.open').click();
  await expect(page.getByTestId('admin.user.edit.drawer')).toBeVisible();
  await page.getByTestId('admin.user.edit.full_name').fill('Alice Renamed');
  await page.getByTestId('admin.user.edit.email').fill('alice.renamed@example.test');
  await page.getByTestId('admin.user.edit.level').fill('21');
  await page.getByTestId('admin.user.edit.mailer_enabled').click();
  await page.getByTestId('admin.user.edit.address').fill('New street');
  await page.getByTestId('admin.user.edit.info').fill('Support account');
  await page.getByTestId('admin.user.edit.save').click();

  await expect(page.getByTestId('admin.user.edit.drawer')).toHaveCount(0);
  await expect(page.getByTestId('admin.user.details.card').getByText('Alice Renamed')).toBeVisible();
  expect(updates).toEqual([
    {
      user: {
        full_name: 'Alice Renamed',
        email: 'alice.renamed@example.test',
        address: 'New street',
        level: 21,
        info: 'Support account',
        mailer_enabled: false,
      },
    },
  ]);
});

test('admin user detail: lifecycle state update sends object state', async ({ page }) => {
  await bootstrapVpsAdminWindow(page);

  const updates: any[] = [];
  let user = {
    id: 42,
    login: 'alice',
    level: 1,
    full_name: 'Alice Example',
    email: 'alice@example.test',
    object_state: 'active',
  };

  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'GET users/42': () => ({ user }),
      'PUT users/42': ({ reqJson }) => {
        const payload = (reqJson as any).user ?? {};
        user = { ...user, ...payload };
        return { user, _meta: { action_state_id: 741 } };
      },
      'GET users': () => ({ users: [] }),
    },
  });

  page.on('request', (req) => {
    const url = new URL(req.url());
    if (req.method() === 'PUT' && url.pathname === '/api/v7.0/users/42') {
      updates.push(req.postDataJSON());
    }
  });

  await page.goto('/admin/users/42');
  await expect(page.getByTestId('admin.user.page')).toBeVisible();

  await expect(page.getByTestId('admin.user.lifecycle.save')).toBeDisabled();
  await page.getByTestId('admin.user.lifecycle.state').selectOption('suspended');
  await expect(page.getByTestId('admin.user.lifecycle.save')).toBeEnabled();
  await page.getByTestId('admin.user.lifecycle.save').click();

  await expect.poll(() => updates.length).toBe(1);
  expect(updates).toEqual([{ user: { object_state: 'suspended' } }]);
});

test('admin user detail: resets lifecycle draft when the user route changes', async ({ page }) => {
  await bootstrapVpsAdminWindow(page);
  const updates: string[] = [];
  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'GET users/42': () => ({ user: { id: 42, login: 'alice', level: 1, object_state: 'active' } }),
      'GET users/43': () => ({ user: { id: 43, login: 'bob', level: 1, object_state: 'active' } }),
      'GET users': () => ({ users: [] }),
      'PUT users/42': () => { updates.push('42'); return { user: { id: 42, object_state: 'suspended' } }; },
      'PUT users/43': () => { updates.push('43'); return { user: { id: 43, object_state: 'active' } }; },
    },
  });

  await page.goto('/admin/users/42');
  await page.getByTestId('admin.user.lifecycle.state').selectOption('suspended');
  await expect(page.getByTestId('admin.user.lifecycle.save')).toBeEnabled();
  await page.evaluate(() => {
    window.history.pushState({}, '', '/admin/users/43');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByTestId('admin.user.lifecycle.state')).toHaveValue('active');
  await expect(page.getByTestId('admin.user.lifecycle.save')).toBeDisabled();
  expect(updates).toEqual([]);
});

test('admin user detail: expiration-only update accepts a synchronous response without action state', async ({ page }) => {
  await bootstrapVpsAdminWindow(page);

  let updateRequests = 0;
  let user = {
    id: 42,
    login: 'alice',
    level: 1,
    object_state: 'active',
    expiration_date: null as string | null,
    remind_after_date: null as string | null,
  };
  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'GET users/42': () => ({ user }),
      'PUT users/42': ({ reqJson }) => {
        updateRequests += 1;
        const payload = (reqJson as { user?: Record<string, unknown> }).user ?? {};
        user = { ...user, ...payload };
        return { user, _meta: {} };
      },
    },
  });

  await page.goto('/admin/users/42');
  await page.getByTestId('admin.user.lifecycle.expiration').fill('2026-09-01T12:00');
  await page.getByTestId('admin.user.lifecycle.save').click();

  await expect.poll(() => updateRequests).toBe(1);
  await expect(page.getByTestId('admin.user.mutation.uncertain')).toHaveCount(0);
  await expect(page.getByTestId('admin.user.lifecycle.save')).toBeDisabled();
});

for (const scenario of [
  {
    name: 'missing action state',
    response: (user: Record<string, unknown>) => ({ user, _meta: {} }),
  },
  {
    name: 'lost transport response',
    response: () => ({ status: 200, contentType: 'application/json', body: '{' }),
  },
] as const) {
  test(`admin user detail: ${scenario.name} is reload-safe and requires review before acknowledgement`, async ({ page }) => {
    await bootstrapVpsAdminWindow(page);

    const user = {
      id: 42,
      login: 'alice',
      level: 1,
      full_name: 'Alice Example',
      email: 'alice@example.test',
      object_state: 'active',
    };
    let updateRequests = 0;
    let releaseResponse: (() => void) | undefined;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });

    await installHaveApiMock(page, {
      user: { id: 1, login: 'admin', level: 100 },
      handlers: {
        'GET users/42': () => ({ user }),
        'PUT users/42': async () => {
          updateRequests += 1;
          await responseGate;
          return scenario.response(user);
        },
        'GET users': () => ({ users: [] }),
      },
    });

    await page.goto('/admin/users/42');
    await page.getByTestId('admin.user.lifecycle.state').selectOption('suspended');
    await page.getByTestId('admin.user.lifecycle.save').click();

    await expect(page.getByTestId('admin.user.mutation.pending')).toBeVisible();
    await expect(page.getByTestId('admin.user.mutation.acknowledge')).toHaveCount(0);
    await expect.poll(() => updateRequests).toBe(1);

    releaseResponse?.();
    await expect(page.getByTestId('admin.user.mutation.uncertain')).toBeVisible();
    await expect(page.getByTestId('admin.user.mutation.acknowledge')).toBeDisabled();
    await expect(page.getByTestId('admin.user.lifecycle.save')).toBeDisabled();

    await page.reload();
    await expect(page.getByTestId('admin.user.mutation.uncertain')).toBeVisible();
    await expect(page.getByTestId('admin.user.lifecycle.save')).toBeDisabled();
    await expect.poll(() => updateRequests).toBe(1);

    await page.getByTestId('admin.user.mutation.open_tasks').click();
    await expect(page.getByTestId('tasks.drawer')).toBeVisible();
    await page.getByTestId('tasks.close-button').click();
    await expect(page.getByTestId('admin.user.mutation.acknowledge')).toBeDisabled();

    await page.getByTestId('admin.user.mutation.refresh').click();
    await expect(page.getByTestId('admin.user.mutation.acknowledge')).toBeEnabled();
    await expect.poll(() => updateRequests).toBe(1);

    await page.getByTestId('admin.user.mutation.acknowledge').click();
    await expect(page.getByTestId('admin.user.mutation.uncertain')).toHaveCount(0);
    await expect.poll(() => updateRequests).toBe(1);
  });
}
