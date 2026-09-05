import { expectArray, haveApiCall } from './haveapi';

export interface ResourceRef {
  id: number;
  label?: string;
  login?: string;
  name?: string;
  [k: string]: unknown;
}

export type IncomingPaymentState = 'queued' | 'unmatched' | 'processed' | 'ignored' | string;

export interface IncomingPayment {
  id: number;
  transaction_id?: string;
  state?: IncomingPaymentState;
  date?: string;
  amount?: number;
  currency?: string;
  src_amount?: number;
  src_currency?: string;
  account_name?: string;
  user_ident?: string;
  user?: ResourceRef;
  user_paid_until?: string | null;
  user_message?: string;
  vs?: string;
  ks?: string;
  ss?: string;
  transaction_type?: string;
  comment?: string;
  created_at?: string;
  [k: string]: unknown;
}

export async function fetchIncomingPayments(opts?: {
  limit?: number;
  fromId?: number;
  state?: string;
  count?: boolean;
}) {
  const params: Record<string, unknown> = {};
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.state) params['state'] = opts.state;

  const res = await haveApiCall<IncomingPayment[]>({
    method: 'GET',
    path: '/incoming_payments',
    namespace: 'incoming_payment',
    params,
    meta: opts?.count ? { count: true } : undefined,
  });

  return { ...res, data: expectArray<IncomingPayment>(res.data, 'incoming_payments#index') };
}

export async function fetchIncomingPayment(paymentId: number, opts?: { includes?: string }) {
  return haveApiCall<IncomingPayment>({
    method: 'GET',
    path: `/incoming_payments/${paymentId}`,
    meta: opts?.includes ? { includes: opts.includes } : undefined,
  });
}

export async function updateIncomingPaymentState(paymentId: number, state: IncomingPaymentState) {
  return haveApiCall<IncomingPayment>({
    method: 'PUT',
    path: `/incoming_payments/${paymentId}`,
    namespace: 'incoming_payment',
    params: { state },
  });
}

export interface UserPayment {
  id: number;
  incoming_payment?: ResourceRef;
  user?: ResourceRef;
  amount?: number;
  accounted_by?: ResourceRef;
  from_date?: string;
  to_date?: string;
  created_at?: string;
  [k: string]: unknown;
}

export interface UserPaymentIndexCapabilityDescription {
  input?: {
    parameters?: Record<string, unknown>;
    [k: string]: unknown;
  };
  /** Tolerate HaveAPI's generic single-key response unwrapping. */
  parameters?: Record<string, unknown>;
  [k: string]: unknown;
}

export function userPaymentIndexSupportsPeriod(
  capability: UserPaymentIndexCapabilityDescription | undefined,
): boolean {
  const parameters = capability?.input?.parameters ?? capability?.parameters;
  return Boolean(
    parameters
    && Object.prototype.hasOwnProperty.call(parameters, 'created_from')
    && Object.prototype.hasOwnProperty.call(parameters, 'created_to')
  );
}

export type CreateUserPaymentInput =
  | {
      /** Target user ID */
      user: number;
      /** Attach this incoming payment */
      incoming_payment: number;
    }
  | {
      /** Target user ID */
      user: number;
      /** Manual payment amount (default currency) */
      amount: number;
    };

/**
 * Create an accepted user payment.
 *
 * Modes:
 * - from incoming payment: { user, incoming_payment }
 * - manual: { user, amount }
 */
export async function createUserPayment(opts: CreateUserPaymentInput) {
  const params: Record<string, unknown> = {
    user: opts.user,
  };

  if ('incoming_payment' in opts) params['incoming_payment'] = opts.incoming_payment;
  if ('amount' in opts) params['amount'] = opts.amount;

  return haveApiCall<UserPayment>({
    method: 'POST',
    path: '/user_payments',
    namespace: 'user_payment',
    params,
  });
}

export async function fetchUserPayments(opts?: {
  limit?: number;
  fromId?: number;
  userId?: number;
  accountedById?: number;
  createdFrom?: string;
  createdTo?: string;
  signal?: AbortSignal;
}) {
  const params: Record<string, unknown> = {};
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.userId !== undefined) params['user'] = opts.userId;
  if (opts?.accountedById !== undefined) params['accounted_by'] = opts.accountedById;
  if (opts?.createdFrom !== undefined) params['created_from'] = opts.createdFrom;
  if (opts?.createdTo !== undefined) params['created_to'] = opts.createdTo;

  const res = await haveApiCall<UserPayment[]>({
    method: 'GET',
    path: '/user_payments',
    namespace: 'user_payment',
    params,
    signal: opts?.signal,
  });

  return { ...res, data: expectArray<UserPayment>(res.data, 'user_payments#index') };
}

/** Read the effective index contract before relying on server-side period filters. */
export async function fetchUserPaymentIndexCapability(signal?: AbortSignal) {
  return haveApiCall<UserPaymentIndexCapabilityDescription>({
    method: 'OPTIONS',
    path: '/user_payments?method=GET',
    signal,
  });
}

export async function fetchPaymentInstructions(userId: number) {
  const res = await haveApiCall<string | { instructions?: string }>({
    method: 'GET',
    path: `/users/${userId}/get_payment_instructions`,
  });

  if (typeof res.data === 'string') {
    return { ...res, data: { instructions: res.data } };
  }

  return { ...res, data: { instructions: String(res.data?.instructions ?? '') } };
}

export type IncomeEstimateSelection = 'exactly_until' | 'all_until';

export interface EstimateIncomeInput {
  year: number;
  month: number;
  select: IncomeEstimateSelection;
  duration: number;
}

export interface IncomeEstimate {
  user_count: number;
  estimated_income: number;
}

function finiteApiNumber(value: unknown, field: keyof IncomeEstimate): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`payment_stats#estimate_income: invalid ${field}`);
  }
  return numberValue;
}

/**
 * Estimate income for users matching a paid-until period.
 *
 * The API contract intentionally does not declare a currency for
 * `estimated_income`, so callers must present it as a raw API value.
 */
export async function estimateIncome(input: EstimateIncomeInput, opts?: { signal?: AbortSignal }) {
  const res = await haveApiCall<IncomeEstimate>({
    method: 'GET',
    path: '/payment_stat/estimate_income',
    namespace: 'payment_stat',
    params: {
      year: input.year,
      month: input.month,
      select: input.select,
      duration: input.duration,
    },
    signal: opts?.signal,
  });

  return {
    ...res,
    data: {
      user_count: Math.max(0, Math.trunc(finiteApiNumber(res.data?.user_count, 'user_count'))),
      estimated_income: finiteApiNumber(res.data?.estimated_income, 'estimated_income'),
    },
  };
}
