import { describe, expect, test } from 'vitest';

import { adminAttentionSourcePermissions, selectAdminAttentionItems } from './AdminAttentionQueueModel';

describe('adminAttentionSourcePermissions', () => {
  test('keeps financial data admin-only', () => {
    expect(adminAttentionSourcePermissions('admin')).toEqual({
      requests: true,
      payments: true,
      transactions: true,
    });
    expect(adminAttentionSourcePermissions('support')).toEqual({
      requests: true,
      payments: false,
      transactions: true,
    });
    expect(adminAttentionSourcePermissions('user')).toEqual({
      requests: false,
      payments: false,
      transactions: false,
    });
  });
});
describe('selectAdminAttentionItems', () => {
  test('orders urgent work first and creates direct admin links', () => {
    const rows = selectAdminAttentionItems({
      registrations: [{ id: 14, state: 'awaiting', login: 'new-member', created_at: '2026-08-02T10:00:00Z' }],
      changes: [{ id: 15, state: 'approved', full_name: 'Already done' }],
      unmatchedPayments: [{ id: 22, state: 'unmatched', account_name: 'Missing variable symbol', date: '2026-08-03' }],
      failedTransactions: [{ id: 31, state: 'failed', label: 'VPS create', created_at: '2026-08-01T10:00:00Z' }],
    });

    expect(rows.map((row) => row.kind)).toEqual([
      'unmatched-payment',
      'failed-transaction',
      'registration-request',
    ]);
    expect(rows[0]?.to).toBe('/admin/payments/incoming/22');
    expect(rows[1]?.to).toBe('/admin/transactions/31');
    expect(rows[2]?.to).toBe('/admin/requests/registration/14');
  });

  test('limits the concrete queue and sorts older work first within a priority', () => {
    const rows = selectAdminAttentionItems(
      {
        changes: [
          { id: 9, state: 'awaiting', created_at: '2026-08-09T12:00:00Z' },
          { id: 7, state: 'awaiting', created_at: '2026-08-07T12:00:00Z' },
          { id: 8, state: 'awaiting', created_at: '2026-08-08T12:00:00Z' },
        ],
      },
      { limit: 2 },
    );

    expect(rows.map((row) => row.id)).toEqual([7, 8]);
  });

  test('ignores non-actionable payment and transaction states', () => {
    const rows = selectAdminAttentionItems({
      registrations: [{ id: 1, state: 'pending_correction' }],
      unmatchedPayments: [{ id: 2, state: 'processed' }],
      failedTransactions: [{ id: 3, state: 'queued' }],
    });

    expect(rows).toEqual([]);
  });

  test('deduplicates failed and fatal query results', () => {
    const duplicate = { id: 50, state: 'fatal', label: 'Broken chain' };
    const rows = selectAdminAttentionItems({ failedTransactions: [duplicate], fatalTransactions: [duplicate] });
    expect(rows).toHaveLength(1);
  });
});
