import { describe, expect, test, vi } from 'vitest';

import {
  createUserPayment,
  estimateIncome,
  fetchIncomingPayments,
  fetchPaymentInstructions,
  fetchUserPayments,
} from './payments';

function mockFetchOk(response: unknown): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ status: true, response }),
  }) as unknown as typeof globalThis.fetch;
}

function lastFetchCall() {
  const calls = vi.mocked(globalThis.fetch).mock.calls;
  return calls[calls.length - 1] as [string, RequestInit?];
}

describe('payments API wrappers', () => {
  test('fetchIncomingPayments sends only filters supported by the API contract', async () => {
    globalThis.fetch = mockFetchOk({ incoming_payments: [], _meta: { total_count: 0 } }) as any;

    await fetchIncomingPayments({ limit: 25, fromId: 200, state: 'queued' });

    const [url] = lastFetchCall();
    const u = new URL(url);

    expect(u.pathname).toBe('/v7.0/incoming_payments');
    expect(u.searchParams.get('incoming_payment[limit]')).toBe('25');
    expect(u.searchParams.get('incoming_payment[from_id]')).toBe('200');
    expect(u.searchParams.get('incoming_payment[state]')).toBe('queued');
    expect(u.searchParams.has('incoming_payment[q]')).toBe(false);
    expect(u.searchParams.has('incoming_payment[user]')).toBe(false);
  });

  test('fetchIncomingPayments can request total count metadata', async () => {
    globalThis.fetch = mockFetchOk({ incoming_payments: [], _meta: { total_count: 4 } }) as any;

    await fetchIncomingPayments({ limit: 1, state: 'unmatched', count: true });

    const [url] = lastFetchCall();
    const u = new URL(url);

    expect(u.searchParams.get('incoming_payment[limit]')).toBe('1');
    expect(u.searchParams.get('incoming_payment[state]')).toBe('unmatched');
    expect(u.searchParams.get('_meta[count]')).toBe('true');
  });

  test('createUserPayment sends namespaced incoming-payment payload', async () => {
    globalThis.fetch = mockFetchOk({ user_payment: { id: 9 } }) as any;

    await createUserPayment({ user: 7, incoming_payment: 15 });

    const [url, init] = lastFetchCall();
    const u = new URL(url);
    const body = JSON.parse(String((init as RequestInit).body));

    expect(u.pathname).toBe('/v7.0/user_payments');
    expect((init as RequestInit).method).toBe('POST');
    expect(body).toEqual({ user_payment: { user: 7, incoming_payment: 15 } });
  });

  test('fetchUserPayments forwards user and accounted_by filters', async () => {
    globalThis.fetch = mockFetchOk({ user_payments: [], _meta: { total_count: 0 } }) as any;

    await fetchUserPayments({ limit: 10, fromId: 55, userId: 7, accountedById: 2 });

    const [url] = lastFetchCall();
    const u = new URL(url);

    expect(u.pathname).toBe('/v7.0/user_payments');
    expect(u.searchParams.get('user_payment[limit]')).toBe('10');
    expect(u.searchParams.get('user_payment[from_id]')).toBe('55');
    expect(u.searchParams.get('user_payment[user]')).toBe('7');
    expect(u.searchParams.get('user_payment[accounted_by]')).toBe('2');
  });

  test('fetchPaymentInstructions uses user subresource path', async () => {
    globalThis.fetch = mockFetchOk({ instructions: 'Use VS 123.' }) as any;

    const res = await fetchPaymentInstructions(7);

    const [url] = lastFetchCall();
    const u = new URL(url);

    expect(u.pathname).toBe('/v7.0/users/7/get_payment_instructions');
    expect(res.data.instructions).toBe('Use VS 123.');
  });

  test('fetchPaymentInstructions normalizes legacy string responses', async () => {
    globalThis.fetch = mockFetchOk('Account: 123456/0100\nVS: 42') as any;

    const res = await fetchPaymentInstructions(42);

    expect(res.data.instructions).toBe('Account: 123456/0100\nVS: 42');
  });

  test('estimateIncome uses the singular custom action and namespaced GET parameters', async () => {
    globalThis.fetch = mockFetchOk({ user_count: 12, estimated_income: 36_000 });

    const res = await estimateIncome({
      year: 2026,
      month: 8,
      select: 'exactly_until',
      duration: 3,
    });

    const [url, init] = lastFetchCall();
    const u = new URL(url);

    expect(u.pathname).toBe('/v7.0/payment_stat/estimate_income');
    expect((init as RequestInit).method).toBe('GET');
    expect(u.searchParams.get('payment_stat[year]')).toBe('2026');
    expect(u.searchParams.get('payment_stat[month]')).toBe('8');
    expect(u.searchParams.get('payment_stat[select]')).toBe('exactly_until');
    expect(u.searchParams.get('payment_stat[duration]')).toBe('3');
    expect(res.data).toEqual({ user_count: 12, estimated_income: 36_000 });
  });

  test('estimateIncome accepts a wrapped action response and rejects malformed totals', async () => {
    globalThis.fetch = mockFetchOk({ payment_stats: { user_count: '4', estimated_income: '1200' } });

    const res = await estimateIncome({ year: 2026, month: 7, select: 'all_until', duration: 1 });
    expect(res.data).toEqual({ user_count: 4, estimated_income: 1200 });

    globalThis.fetch = mockFetchOk({ user_count: 4, estimated_income: 'not-a-number' });
    await expect(
      estimateIncome({ year: 2026, month: 7, select: 'all_until', duration: 1 })
    ).rejects.toThrow('invalid estimated_income');
  });
});
