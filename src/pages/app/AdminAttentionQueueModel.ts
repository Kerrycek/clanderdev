import type { IncomingPayment } from '../../lib/api/payments';
import type { ChangeRequest, RegistrationRequest } from '../../lib/api/requests';
import type { TransactionChain } from '../../lib/api/transactions';
import type { UserRole } from '../../lib/roles';

export type AdminAttentionKind =
  | 'registration-request'
  | 'change-request'
  | 'unmatched-payment'
  | 'failed-transaction';

export type AdminAttentionTone = 'danger' | 'warn' | 'info';

export interface AdminAttentionItem {
  key: string;
  id: number;
  kind: AdminAttentionKind;
  tone: AdminAttentionTone;
  priority: number;
  label: string;
  createdAt?: string;
  to: string;
}

export interface AdminAttentionSources {
  registrations?: RegistrationRequest[];
  changes?: ChangeRequest[];
  unmatchedPayments?: IncomingPayment[];
  failedTransactions?: TransactionChain[];
  fatalTransactions?: TransactionChain[];
}

export interface AdminAttentionSourcePermissions {
  requests: boolean;
  payments: boolean;
  transactions: boolean;
}

const PRIORITY: Record<AdminAttentionKind, number> = {
  'unmatched-payment': 10,
  'failed-transaction': 20,
  'registration-request': 30,
  'change-request': 31,
};

export function adminAttentionSourcePermissions(role: UserRole): AdminAttentionSourcePermissions {
  if (role === 'admin') {
    return { requests: true, payments: true, transactions: true };
  }

  if (role === 'support') {
    return { requests: true, payments: false, transactions: true };
  }

  return { requests: false, payments: false, transactions: false };
}

function validId(value: unknown): number | undefined {
  const id = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(id) || id <= 0) return undefined;
  return Math.floor(id);
}

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (text) return text;
  }
  return undefined;
}

function requestLabel(request: RegistrationRequest | ChangeRequest): string {
  return (
    firstText(
      'login' in request ? request.login : undefined,
      request.user?.login,
      request.full_name,
      request.user?.name,
      request.user?.label,
      'email' in request ? request.email : undefined,
      request.label,
    ) ?? `#${request.id}`
  );
}

function paymentLabel(payment: IncomingPayment): string {
  return (
    firstText(
      payment.account_name,
      payment.user?.login,
      payment.user?.label,
      payment.user_ident,
      payment.vs,
      payment.transaction_id,
    ) ?? `#${payment.id}`
  );
}

function transactionLabel(chain: TransactionChain): string {
  return firstText(chain.label) ?? `#${chain.id}`;
}

function item(input: Omit<AdminAttentionItem, 'key' | 'priority'>): AdminAttentionItem {
  return {
    ...input,
    key: `${input.kind}:${input.id}`,
    priority: PRIORITY[input.kind],
  };
}

function requestItems(basePath: string, requests: Array<RegistrationRequest | ChangeRequest>, kind: 'registration-request' | 'change-request') {
  const type = kind === 'registration-request' ? 'registration' : 'change';
  return requests.flatMap((request) => {
    const id = validId(request.id);
    if (!id || request.state !== 'awaiting') return [];
    return [
      item({
        id,
        kind,
        tone: 'warn',
        label: requestLabel(request),
        createdAt: request.created_at,
        to: `${basePath}/requests/${type}/${id}`,
      }),
    ];
  });
}

function paymentItems(basePath: string, payments: IncomingPayment[]) {
  return payments.flatMap((payment) => {
    const id = validId(payment.id);
    if (!id || payment.state !== 'unmatched') return [];
    return [
      item({
        id,
        kind: 'unmatched-payment',
        tone: 'danger',
        label: paymentLabel(payment),
        createdAt: payment.date ?? payment.created_at,
        to: `${basePath}/payments/incoming/${id}`,
      }),
    ];
  });
}

function transactionItems(
  basePath: string,
  chains: TransactionChain[],
) {
  return chains.flatMap((chain) => {
    const id = validId(chain.id);
    const state = firstText(chain.state)?.toLowerCase();
    if (!id || (state !== 'failed' && state !== 'fatal')) return [];
    return [
      item({
        id,
        kind: 'failed-transaction',
        tone: 'danger',
        label: transactionLabel(chain),
        createdAt: chain.created_at,
        to: `${basePath}/transactions/${id}`,
      }),
    ];
  });
}

function timeValue(value?: string): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

export function selectAdminAttentionItems(
  sources: AdminAttentionSources,
  options: { basePath?: string; limit?: number } = {},
): AdminAttentionItem[] {
  const basePath = options.basePath ?? '/admin';
  const limit = Math.max(0, Math.floor(options.limit ?? 5));

  const items = [
    ...requestItems(basePath, sources.registrations ?? [], 'registration-request'),
    ...requestItems(basePath, sources.changes ?? [], 'change-request'),
    ...paymentItems(basePath, sources.unmatchedPayments ?? []),
    ...transactionItems(
      basePath,
      [...(sources.failedTransactions ?? []), ...(sources.fatalTransactions ?? [])],
    ),
  ];

  const unique = new Map<string, AdminAttentionItem>();
  for (const candidate of items) unique.set(candidate.key, candidate);

  return [...unique.values()]
    .sort((a, b) => a.priority - b.priority || timeValue(a.createdAt) - timeValue(b.createdAt) || a.id - b.id)
    .slice(0, limit);
}
