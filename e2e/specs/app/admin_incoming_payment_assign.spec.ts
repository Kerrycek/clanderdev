import { test, expect } from '@playwright/test';

import { bootstrapVpsAdminWindow } from '../../fixtures/bootstrap';
import { installHaveApiMock } from '../../fixtures/haveapi';
import { withAppUrl } from '../../fixtures/url';

test('admin incoming payment: assign to user', async ({ page }) => {
  await bootstrapVpsAdminWindow(page);
  const haveApiMock = await installHaveApiMock(page, { user: { id: 1, login: 'admin', level: 100 } });

  let assigned = false;
  let assignedUser: { id: number; login: string } | null = null;
  let state: string = 'unmatched';

  const paymentId = 300;

  function paymentEnvelope() {
    return {
      id: paymentId,
      state,
      date: '2026-02-14T09:00:00Z',
      transaction_id: 'TX-300',
      amount: 1000,
      currency: 'CZK',
      src_amount: 40,
      src_currency: 'EUR',
      account_name: 'Test account',
      vs: '123456',
      user_message: 'hello',
      user_ident: 'VS:123456',
      comment: 'mock',
      user: assigned ? assignedUser : null,
      user_paid_until: assigned ? '2026-03-01T00:00:00Z' : null,
      created_at: '2026-02-14T09:00:00Z',
    };
  }

  haveApiMock.addHandler('GET incoming_payments', ({ searchParams }) => {
    const limit = Number(searchParams.get('incoming_payment[limit]') ?? 25);
    const fromIdRaw = searchParams.get('incoming_payment[from_id]');
    const fromId = fromIdRaw ? Number(fromIdRaw) : null;

    const ids = Array.from({ length: 60 }, (_, i) => 300 - i).filter((id) => (fromId ? id < fromId : true)).slice(0, limit);

    return {
      status: true,
      response: {
        incoming_payments: ids.map((id) => ({ ...paymentEnvelope(), id })),
      },
    };
  });

  haveApiMock.addHandler('GET incoming_payments/300', () => {
    return {
      status: true,
      response: {
        incoming_payment: paymentEnvelope(),
      },
    };
  });

  haveApiMock.addHandler('GET users/123', () => ({
    user: { id: 123, login: 'alice', full_name: 'Alice Example', email: 'alice@example.test' },
  }));

  haveApiMock.addHandler('PUT incoming_payments/300', async ({ json }) => {
    state = String(json?.incoming_payment?.state ?? state);
    return {
      status: true,
      response: {
        incoming_payment: paymentEnvelope(),
      },
    };
  });

  haveApiMock.addHandler('POST user_payments', async ({ json }) => {
    const userId = Number(json?.user_payment?.user);
    assigned = true;
    assignedUser = { id: userId, login: 'alice' };

    return {
      status: true,
      _meta: {
        action_state_id: 9001,
      },
      response: {
        user_payment: {
          id: 7001,
          user: assignedUser,
          incoming_payment: { id: paymentId },
          amount: json?.user_payment?.amount ?? 1000,
          created_at: '2026-02-14T09:05:00Z',
        },
      },
    };
  });

  await page.goto(withAppUrl('/admin/payments/incoming/300'));

  await expect(page.getByTestId('admin.payments.incoming.state.save')).toBeDisabled();
  await page.getByTestId('admin.payments.incoming.state.select').selectOption('ignored');
  await expect(page.getByTestId('admin.payments.incoming.state.save')).toBeEnabled();
  await page.getByTestId('admin.payments.incoming.state.select').selectOption('unmatched');
  await expect(page.getByTestId('admin.payments.incoming.state.save')).toBeDisabled();

  await expect(page.getByTestId('admin.payments.incoming.assign.user_id')).toBeVisible();
  await expect(page.getByTestId('admin.payments.incoming.assign.review')).toContainText(/Assignment review/);
  await expect(page.getByTestId('admin.payments.incoming.assign.submit')).toBeDisabled();

  await page.getByTestId('admin.payments.incoming.assign.user_id').fill('123');
  await expect(page.getByTestId('admin.payments.incoming.assign.review.user')).toContainText('#123');
  await expect(page.getByTestId('admin.payments.incoming.assign.review.state')).toContainText(/Processed/);
  await expect(page.getByTestId('admin.payments.incoming.assign.submit')).toBeEnabled();

  await page.getByTestId('admin.payments.incoming.assign.submit').click();

  // After refetch, the user should be visible and the assign button disabled.
  await expect(page.getByTestId('admin.payments.incoming.detail.300.state')).toHaveText(/Processed/);
  await expect(page.getByTestId('admin.payments.incoming.assign.inline')).toHaveCount(0);
  await expect(page.getByText('alice')).toBeVisible();
});

test('admin incoming payment: route change drops the previous payment edits without writing', async ({ page }) => {
  await bootstrapVpsAdminWindow(page);

  const payment = (id: number) => ({
    id,
    state: 'unmatched',
    date: '2026-02-14T09:00:00Z',
    transaction_id: `TX-${id}`,
    amount: 1000,
    currency: 'CZK',
    account_name: 'Test account',
    vs: String(id),
    user: null,
    created_at: '2026-02-14T09:00:00Z',
  });
  await installHaveApiMock(page, {
    user: { id: 1, login: 'admin', level: 100 },
    handlers: {
      'GET incoming_payments/300': () => ({ incoming_payment: payment(300) }),
      'GET incoming_payments/301': () => ({ incoming_payment: payment(301) }),
      'GET users/123': () => ({ user: { id: 123, login: 'alice' } }),
      'PUT incoming_payments/300': () => ({ incoming_payment: payment(300) }),
      'PUT incoming_payments/301': () => ({ incoming_payment: payment(301) }),
      'POST user_payments': () => ({ user_payment: { id: 1 } }),
    },
  });
  const mutations: string[] = [];
  page.on('request', (request) => {
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())
      && /\/api\/v7\.0\/(?:incoming_payments|user_payments)/.test(request.url())
    ) {
      mutations.push(request.url());
    }
  });

  await page.goto(withAppUrl('/admin/payments/incoming/300'));
  await page.getByTestId('admin.payments.incoming.state.select').selectOption('ignored');
  await page.getByTestId('admin.payments.incoming.assign.user_id').fill('123');
  await expect(page.getByTestId('admin.payments.incoming.state.save')).toBeEnabled();
  await expect(page.getByTestId('admin.payments.incoming.assign.submit')).toBeEnabled();

  await page.evaluate(() => {
    window.history.pushState({}, '', '/admin/payments/incoming/301');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  await expect(page.getByTestId('admin.payments.incoming.detail.301.state')).toBeVisible();
  await expect(page.getByTestId('admin.payments.incoming.state.select')).toHaveValue('unmatched');
  await expect(page.getByTestId('admin.payments.incoming.state.save')).toBeDisabled();
  await expect(page.getByTestId('admin.payments.incoming.assign.user_id')).toHaveValue('');
  await expect(page.getByTestId('admin.payments.incoming.assign.submit')).toBeDisabled();
  expect(mutations).toEqual([]);
});
