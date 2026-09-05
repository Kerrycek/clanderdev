import type { UserAccount } from '../../../lib/api/userAccounts';
import type { User } from '../../../lib/api/users';

export const FINANCE_DUE_SOON_DAYS = 7;

export type FinanceAccount = Pick<User, 'id' | 'monthly_payment' | 'paid_until' | 'object_state'>
  | (Pick<UserAccount, 'id' | 'monthly_payment' | 'paid_until'> & { object_state?: unknown });

export type FinanceAccountStatus = 'paid' | 'due_soon' | 'overdue' | 'invalid';

export interface FinanceAccountStatusResult {
  status: FinanceAccountStatus;
  daysUntilExpiry?: number;
}

export interface FinanceOverviewSummary {
  /** Sum and status counts share the account scope documented by summarizeFinanceAccounts. */
  monthlyPayment: number;
  /** Legacy-style estimate for accounts due in the current UTC calendar month. */
  currentMonthExpected: number;
  accountCount: number;
  paidCount: number;
  dueSoonCount: number;
  overdueCount: number;
  invalidCount: number;
  /** Accounts outside the monthly-payment/object-state scope. */
  excludedAccountCount: number;
}

export interface FinancePeriodFilters {
  /** Inclusive UTC calendar date in YYYY-MM-DD format, or an empty string. */
  from: string;
  /** Inclusive UTC calendar date in YYYY-MM-DD format, or an empty string. */
  to: string;
}

const DAY_MS = 86_400_000;

function positiveFiniteMonthlyPayment(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function isIncludedObjectState(value: unknown): boolean {
  // Older payment-enabled API responses did not expose object_state at all.
  if (value === null || value === undefined) return true;
  return value === 'active' || value === 'suspended';
}

function parsePaidUntil(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return Number.NaN;
  if (!value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

/** Billing overview scope shared by totals and account drill-downs. */
export function isFinanceAccountInScope(account: FinanceAccount): boolean {
  return positiveFiniteMonthlyPayment(account.monthly_payment) !== null && isIncludedObjectState(account.object_state);
}

/**
 * Classify an account's paid-until value.
 *
 * Missing values are overdue because the account has no recorded paid period.
 * Present but unparsable values are kept separate as invalid data. The due-soon
 * window starts now and ends immediately before the same instant in seven days.
 */
export function classifyFinanceAccount(
  account: Pick<FinanceAccount, 'paid_until'>,
  now: Date = new Date(),
): FinanceAccountStatusResult {
  const nowTimestamp = now.getTime();
  if (!Number.isFinite(nowTimestamp)) throw new RangeError('Finance overview requires a valid current date');

  const paidUntilTimestamp = parsePaidUntil(account.paid_until);
  if (paidUntilTimestamp === null) return { status: 'overdue' };
  if (!Number.isFinite(paidUntilTimestamp)) return { status: 'invalid' };

  const daysUntilExpiry = Math.ceil((paidUntilTimestamp - nowTimestamp) / DAY_MS);
  if (paidUntilTimestamp < nowTimestamp) return { status: 'overdue', daysUntilExpiry };
  if (paidUntilTimestamp < nowTimestamp + FINANCE_DUE_SOON_DAYS * DAY_MS) {
    return { status: 'due_soon', daysUntilExpiry };
  }
  return { status: 'paid', daysUntilExpiry };
}

export function summarizeFinanceAccounts(
  accounts: readonly FinanceAccount[],
  now: Date = new Date(),
): FinanceOverviewSummary {
  const nowTimestamp = now.getTime();
  if (!Number.isFinite(nowTimestamp)) throw new RangeError('Finance overview requires a valid current date');

  const currentMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const nextMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const summary: FinanceOverviewSummary = {
    monthlyPayment: 0,
    currentMonthExpected: 0,
    accountCount: 0,
    paidCount: 0,
    dueSoonCount: 0,
    overdueCount: 0,
    invalidCount: 0,
    excludedAccountCount: 0,
  };

  for (const account of accounts) {
    const monthlyPayment = positiveFiniteMonthlyPayment(account.monthly_payment);
    if (monthlyPayment === null || !isFinanceAccountInScope(account)) {
      summary.excludedAccountCount += 1;
      continue;
    }

    summary.accountCount += 1;
    summary.monthlyPayment += monthlyPayment;

    const paidUntilTimestamp = parsePaidUntil(account.paid_until);
    if (
      paidUntilTimestamp === null ||
      (Number.isFinite(paidUntilTimestamp) && paidUntilTimestamp >= currentMonthStart && paidUntilTimestamp < nextMonthStart)
    ) {
      summary.currentMonthExpected += monthlyPayment;
    }

    const classification = classifyFinanceAccount(account, now);
    if (classification.status === 'paid') summary.paidCount += 1;
    if (classification.status === 'due_soon') summary.dueSoonCount += 1;
    if (classification.status === 'overdue') summary.overdueCount += 1;
    if (classification.status === 'invalid') summary.invalidCount += 1;
  }

  return summary;
}

function normalizeDateOnly(value: unknown): string {
  if (typeof value !== 'string') return '';
  const candidate = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return '';

  const timestamp = Date.parse(`${candidate}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) return '';
  return new Date(timestamp).toISOString().slice(0, 10) === candidate ? candidate : '';
}

/** Normalize individual URL values and canonicalize a reversed range. */
export function normalizeFinancePeriodFilters(
  input: Partial<Record<keyof FinancePeriodFilters, unknown>>,
): FinancePeriodFilters {
  const from = normalizeDateOnly(input.from);
  const to = normalizeDateOnly(input.to);

  if (from && to && from > to) return { from: to, to: from };
  return { from, to };
}

export function parseFinancePeriodFilters(
  searchParams: Pick<URLSearchParams, 'get'>,
): FinancePeriodFilters {
  return normalizeFinancePeriodFilters({
    from: searchParams.get('from'),
    to: searchParams.get('to'),
  });
}
