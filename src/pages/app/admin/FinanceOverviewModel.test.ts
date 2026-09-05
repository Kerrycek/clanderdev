import { describe, expect, test } from 'vitest';

import {
  classifyFinanceAccount,
  isFinanceAccountInScope,
  normalizeFinancePeriodFilters,
  parseFinancePeriodFilters,
  summarizeFinanceAccounts,
} from './FinanceOverviewModel';

describe('FinanceOverviewModel', () => {
  const now = new Date('2026-09-05T12:00:00.000Z');

  test('classifies paid-until values with explicit missing and invalid rules', () => {
    expect(classifyFinanceAccount({ paid_until: '2026-09-20T12:00:00Z' }, now)).toEqual({
      status: 'paid',
      daysUntilExpiry: 15,
    });
    expect(classifyFinanceAccount({ paid_until: '2026-09-12T11:59:59Z' }, now).status).toBe('due_soon');
    expect(classifyFinanceAccount({ paid_until: '2026-09-12T12:00:00Z' }, now).status).toBe('paid');
    expect(classifyFinanceAccount({ paid_until: '2026-09-05T12:00:00Z' }, now).status).toBe('due_soon');
    expect(classifyFinanceAccount({ paid_until: '2026-09-05T11:59:59Z' }, now).status).toBe('overdue');
    expect(classifyFinanceAccount({ paid_until: null }, now)).toEqual({ status: 'overdue' });
    expect(classifyFinanceAccount({ paid_until: '' }, now)).toEqual({ status: 'overdue' });
    expect(classifyFinanceAccount({ paid_until: '   ' }, now)).toEqual({ status: 'overdue' });
    expect(classifyFinanceAccount({ paid_until: 'not-a-date' }, now)).toEqual({ status: 'invalid' });
    expect(classifyFinanceAccount({ paid_until: 123 as unknown as string }, now)).toEqual({ status: 'invalid' });
  });

  test('defines billing scope independently of paid-until validity', () => {
    expect(isFinanceAccountInScope({ id: 1, monthly_payment: 300, paid_until: 'broken', object_state: 'active' })).toBe(true);
    expect(isFinanceAccountInScope({ id: 2, monthly_payment: 300, paid_until: null, object_state: 'suspended' })).toBe(true);
    expect(isFinanceAccountInScope({ id: 3, monthly_payment: 300, paid_until: null })).toBe(true);
    expect(isFinanceAccountInScope({ id: 4, monthly_payment: 300, paid_until: null, object_state: 'deleted' })).toBe(false);
    expect(isFinanceAccountInScope({ id: 5, monthly_payment: 0, paid_until: null, object_state: 'active' })).toBe(false);
  });

  test('aggregates positive monthly payments for active, suspended and legacy state-less accounts', () => {
    const summary = summarizeFinanceAccounts([
      { id: 1, monthly_payment: 300, paid_until: '2026-10-01T00:00:00Z', object_state: 'active' },
      { id: 2, monthly_payment: 450, paid_until: '2026-09-07T00:00:00Z', object_state: 'suspended' },
      { id: 3, monthly_payment: 125.5, paid_until: '2026-09-01T00:00:00Z' },
      { id: 4, monthly_payment: 50, paid_until: 'broken', object_state: 'active' },
      { id: 5, monthly_payment: 0, paid_until: '2026-09-01T00:00:00Z' },
      { id: 6, monthly_payment: -10, paid_until: '2026-09-01T00:00:00Z' },
      { id: 7, paid_until: null },
      { id: 8, monthly_payment: Number.POSITIVE_INFINITY, paid_until: null },
      { id: 9, monthly_payment: 75, paid_until: null },
      { id: 10, monthly_payment: 999, paid_until: null, object_state: 'deleted' },
    ], now);

    expect(summary).toEqual({
      monthlyPayment: 1_000.5,
      currentMonthExpected: 650.5,
      accountCount: 5,
      paidCount: 1,
      dueSoonCount: 1,
      overdueCount: 2,
      invalidCount: 1,
      excludedAccountCount: 5,
    });
  });

  test('normalizes URL period values and canonicalizes reversed bounds', () => {
    expect(parseFinancePeriodFilters(new URLSearchParams('from=2026-08-01&to=2026-08-31'))).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
    });
    expect(normalizeFinancePeriodFilters({ from: ' 2026-09-30 ', to: '2026-09-01' })).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(normalizeFinancePeriodFilters({ from: '2026-02-30', to: 'yesterday' })).toEqual({
      from: '',
      to: '',
    });
  });

});
