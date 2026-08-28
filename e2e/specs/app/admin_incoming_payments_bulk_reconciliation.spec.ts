import { expect, test } from '@playwright/test';

import { bootstrapVpsAdminWindow } from '../../fixtures/bootstrap';
import { installHaveApiMock } from '../../fixtures/haveapi';
import { withAppUrl } from '../../fixtures/url';

test('admin incoming payments: bulk reconciliation uses visible selection with button confirmation', async ({ page }) => {
  await bootstrapVpsAdminWindow(page);
  const haveApiMock = await installHaveApiMock(page, { user: { id: 1, login: 'admin', level: 100 } });

  const payments = new Map<number, { id: number; state: string; user: { id: number; login: string } | null }>([
    [300, { id: 300, state: 'queued', user: null }],
    [299, { id: 299, state: 'unmatched', user: null }],
    [298, { id: 298, state: 'processed', user: { id: 10, login: 'alice' } }],
  ]);
  const updatedIds: number[] = [];

  function paymentEnvelope(id: number) {
    const payment = payments.get(id) ?? { id, state: 'queued', user: null };
    return {
      id: payment.id,
      state: payment.state,
      date: '2026-02-14T09:00:00Z',
      transaction_id: `TX-${payment.id}`,
      amount: 1000,
      currency: 'CZK',
      account_name: 'Test account',
      vs: String(payment.id),
      user: payment.user,
      user_paid_until: payment.user ? '2026-03-01T00:00:00Z' : null,
      created_at: '2026-02-14T09:00:00Z',
    };
  }

  haveApiMock.addHandler('GET incoming_payments', () => ({
    status: true,
    response: {
      incoming_payments: Array.from(payments.keys())
        .sort((a, b) => b - a)
        .map(paymentEnvelope),
    },
  }));

  for (const id of [299, 300]) {
    haveApiMock.addHandler(`PUT incoming_payments/${id}`, async ({ json }) => {
      const body = json as { incoming_payment?: { state?: unknown } } | undefined;
      const nextState = String(body?.incoming_payment?.state ?? '');
      const payment = payments.get(id);
      if (payment) payment.state = nextState;
      updatedIds.push(id);
      return {
        status: true,
        response: { incoming_payment: paymentEnvelope(id) },
      };
    });
  }

  await page.goto(withAppUrl('/admin/payments/incoming'));

  await expect(page.getByTestId('admin.payments.incoming.bulk.card')).toBeVisible();
  await page.getByTestId('admin.payments.incoming.bulk.select_needs_review').click();
  await expect(page.getByTestId('admin.payments.incoming.bulk.summary')).toContainText(/Eligible: 1/);

  await page.getByTestId('admin.payments.incoming.bulk.action').selectOption('mark_ignored');
  await expect(page.getByTestId('admin.payments.incoming.bulk.summary')).toContainText(/Eligible: 2/);
  await page.getByTestId('admin.payments.incoming.bulk.review.open').click();
  await expect(page.getByTestId('admin.payments.incoming.bulk.review.warning')).toContainText(/Ignored payments are kept outside/);
  await expect(page.getByTestId('admin.payments.incoming.bulk.review.confirm')).toBeEnabled();
  await page.getByTestId('admin.payments.incoming.bulk.review.confirm').click();

  await expect.poll(() => updatedIds.slice().sort((a, b) => a - b)).toEqual([299, 300]);
  await expect(page.getByTestId('admin.payments.incoming.row.300')).toContainText(/Ignored/);
  await expect(page.getByTestId('admin.payments.incoming.row.299')).toContainText(/Ignored/);
  await expect(page.getByTestId('admin.payments.incoming.row.298')).toContainText(/Processed/);
});

test('admin incoming payments: reconciliation summary links to all unmatched payments', async ({ page }) => {
  await bootstrapVpsAdminWindow(page);
  const haveApiMock = await installHaveApiMock(page, { user: { id: 1, login: 'admin', level: 100 } });
  const requestedStates: string[] = [];

  const payments = [
    { id: 400, state: 'processed', user: null },
    { id: 399, state: 'unmatched', user: null },
    { id: 398, state: 'processed', user: { id: 11, login: 'bob' } },
  ];

  function paymentEnvelope(payment: { id: number; state: string; user: { id: number; login: string } | null }) {
    return {
      id: payment.id,
      state: payment.state,
      date: '2026-02-14T09:00:00Z',
      transaction_id: `TX-${payment.id}`,
      amount: 1000,
      currency: 'CZK',
      account_name: 'Test account',
      vs: String(payment.id),
      user: payment.user,
      user_paid_until: payment.user ? '2026-03-01T00:00:00Z' : null,
      created_at: '2026-02-14T09:00:00Z',
    };
  }

  haveApiMock.addHandler('GET incoming_payments', ({ searchParams }) => {
    const state = String(searchParams.get('incoming_payment[state]') ?? '');
    if (state) requestedStates.push(state);

    const stateTotals: Record<string, number> = {
      queued: 0,
      unmatched: 4,
      ignored: 2,
    };
    const rows = state ? payments.filter((payment) => payment.state === state) : payments;

    return {
      status: true,
      response: {
        incoming_payments: rows.map(paymentEnvelope),
        _meta: { total_count: state ? stateTotals[state] ?? rows.length : rows.length },
      },
    };
  });

  await page.goto(withAppUrl('/admin/payments/incoming'));

  await expect(page.getByTestId('admin.payments.incoming.reconciliation.metric.needs_review')).toContainText(/Needs review/);
  await expect(page.getByTestId('admin.payments.incoming.reconciliation.metric.needs_review')).toContainText(/4/);
  await expect(page.getByTestId('admin.payments.incoming.reconciliation.metric.queued')).toContainText(/Queued/);
  await expect(page.getByTestId('admin.payments.incoming.reconciliation.metric.queued')).toContainText(/0/);
  await expect(page.getByTestId('admin.payments.incoming.reconciliation.processed_without_user')).toHaveCount(0);
  await expect(page.getByTestId('admin.payments.incoming.reconciliation.summary.open_unmatched')).toContainText(/Unmatched: 4/);

  await page.getByTestId('admin.payments.incoming.reconciliation.summary.open_unmatched').click();

  await expect(page).toHaveURL(/state=unmatched/);
  await expect.poll(() => requestedStates).toContain('unmatched');
  await expect(page.locator('[data-testid="admin.payments.incoming.row.399.dot"]:visible')).toBeVisible();
  await expect(page.getByTestId('admin.payments.incoming.row.400')).toHaveCount(0);
});

test('admin incoming payments: only sends supported state filters and opens an exact payment ID', async ({ page }) => {
  await bootstrapVpsAdminWindow(page);
  const haveApiMock = await installHaveApiMock(page, { user: { id: 1, login: 'admin', level: 100 } });
  const indexRequests: URLSearchParams[] = [];

  haveApiMock.addHandler('GET incoming_payments', ({ searchParams }) => {
    indexRequests.push(new URLSearchParams(searchParams));
    return {
      status: true,
      response: {
        incoming_payments: [],
        _meta: { total_count: 0 },
      },
    };
  });

  await page.goto(withAppUrl('/admin/payments/incoming?q=ignored-by-api&user=42&state=queued'));

  await expect(page).toHaveURL(/state=queued/);
  await expect(page).not.toHaveURL(/[?&](?:q|user)=/);
  await expect.poll(() => indexRequests.length).toBeGreaterThan(0);
  for (const request of indexRequests) {
    expect(request.has('incoming_payment[q]')).toBe(false);
    expect(request.has('incoming_payment[user]')).toBe(false);
  }

  await page.getByTestId('admin.payments.incoming.open_id.input').fill('#300');
  await page.getByTestId('admin.payments.incoming.open_id.submit').click();
  await expect(page).toHaveURL(/\/admin\/payments\/incoming\/300$/);
});

test('admin incoming payments: descending keyset jump reaches page five without overlap', async ({ page }) => {
  await bootstrapVpsAdminWindow(page);
  const haveApiMock = await installHaveApiMock(page, { user: { id: 1, login: 'admin', level: 100 } });
  const payments = Array.from({ length: 125 }, (_, index) => ({
    id: 125 - index,
    state: 'processed',
    date: '2026-02-14T09:00:00Z',
    transaction_id: `TX-${125 - index}`,
    amount: 1_000,
    currency: 'CZK',
    account_name: 'Test account',
    vs: String(125 - index),
    user: { id: 10, login: 'alice' },
    user_paid_until: '2026-03-01T00:00:00Z',
    created_at: '2026-02-14T09:00:00Z',
  }));
  const cursors: Array<number | null> = [];

  haveApiMock.addHandler('GET incoming_payments', ({ searchParams }) => {
    const state = searchParams.get('incoming_payment[state]');
    if (state) return { status: true, response: { incoming_payments: [], _meta: { total_count: 0 } } };

    const fromIdRaw = searchParams.get('incoming_payment[from_id]');
    const fromId = fromIdRaw ? Number(fromIdRaw) : null;
    const limit = Number(searchParams.get('incoming_payment[limit]') ?? 25);
    cursors.push(fromId);
    const rows = payments.filter((payment) => fromId === null || payment.id < fromId).slice(0, limit);
    return { status: true, response: { incoming_payments: rows, _meta: { total_count: payments.length } } };
  });

  await page.goto(withAppUrl('/admin/payments/incoming?limit=25'));
  const pagination = page.getByTestId('admin.payments.incoming.pagination.desktop');
  await expect(pagination).toContainText(/1.*5/);
  await pagination.getByTestId('admin.payments.incoming.pagination.desktop.page.5').click();

  await expect(page).toHaveURL(/(?:\?|&)page=5(?:&|$)/);
  await expect(page).toHaveURL(/(?:\?|&)from_id=26(?:&|$)/);
  await expect(page.getByTestId('admin.payments.incoming.row.25')).toBeVisible();
  await expect(page.getByTestId('admin.payments.incoming.row.26')).toHaveCount(0);
  expect(cursors).toEqual(expect.arrayContaining([null, 101, 76, 51, 26]));
});
