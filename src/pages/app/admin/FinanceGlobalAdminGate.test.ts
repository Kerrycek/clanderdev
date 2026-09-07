import { describe, expect, it } from 'vitest';

import { canViewGlobalFinance } from './FinanceGlobalAdminGate';

describe('canViewGlobalFinance', () => {
  it('allows only API administrators to see organization-wide totals', () => {
    expect(canViewGlobalFinance('admin')).toBe(true);
    expect(canViewGlobalFinance('support')).toBe(false);
    expect(canViewGlobalFinance('user')).toBe(false);
    expect(canViewGlobalFinance('unknown')).toBe(false);
  });
});
