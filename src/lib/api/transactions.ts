import { expectArray, haveApiCall } from './haveapi';
import type { ResourceRef } from './appTypes';
import type { Node } from './nodes';
import type { User } from './users';

export interface TransactionChain {
  id: number;
  label?: string;
  state?: string;
  size?: number;
  progress?: number;
  created_at?: string;
  concerns?: unknown;
  [k: string]: unknown;
}

export interface Transaction {
  id: number;
  transaction_chain?: ResourceRef;
  node?: Node | ResourceRef;
  user?: User | ResourceRef;
  type?: number;
  name?: string;
  vps?: ResourceRef;
  depends_on?: ResourceRef;
  urgent?: boolean;
  priority?: number;
  success?: number;
  done?: string;
  input?: unknown;
  output?: unknown;
  created_at?: string;
  started_at?: string;
  finished_at?: string;
  [k: string]: unknown;
}

export async function fetchTransactionChains(opts?: {
  limit?: number;
  fromId?: number;
  state?: string;
  name?: string;
  className?: string;
  rowId?: number;
  userId?: number;
  userSessionId?: number;
  count?: boolean;
}) {
  const params: Record<string, string | number | boolean> = {};
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.state) params['state'] = opts.state;
  if (opts?.name) params['name'] = opts.name;
  if (opts?.className) params['class_name'] = opts.className;
  if (opts?.rowId !== undefined) params['row_id'] = opts.rowId;
  if (opts?.userId !== undefined) params['user'] = opts.userId;
  if (opts?.userSessionId !== undefined) params['user_session'] = opts.userSessionId;

  const res = await haveApiCall<TransactionChain[]>({
    method: 'GET',
    path: '/transaction_chains',
    namespace: 'transaction_chain',
    params,
    meta: opts?.count ? { count: true } : undefined,
  });
  return { ...res, data: expectArray<TransactionChain>(res.data, 'transaction_chains') };
}

/**
 * Convenience helper: fetch only active (non-finished) transaction chains.
 *
 * Chain state space observed in vpsAdmin: staged, queued, rollbacking, done,
 * failed, fatal, resolved.
 */
export async function fetchActiveTransactionChains(opts?: {
  limit?: number;
  fromId?: number;
  name?: string;
  className?: string;
  rowId?: number;
  userId?: number;
  userSessionId?: number;
}) {
  const limit = opts?.limit ?? 100;
  const states = ['staged', 'queued', 'rollbacking'] as const;

  const res = await Promise.all(
    states.map((st) =>
      fetchTransactionChains({
        limit,
        fromId: opts?.fromId,
        state: st,
        name: opts?.name,
        className: opts?.className,
        rowId: opts?.rowId,
        userId: opts?.userId,
        userSessionId: opts?.userSessionId,
      })
    )
  );

  const combined = res.flatMap((r) => r.data ?? []);
  const byId = new Map<number, TransactionChain>();
  for (const c of combined) {
    const id = typeof c.id === 'number' ? c.id : Number(c.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    byId.set(id, c);
  }

  return [...byId.values()].sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
}

export async function fetchTransactionChain(chainId: number) {
  return haveApiCall<TransactionChain>({
    method: 'GET',
    path: `/transaction_chains/${chainId}`,
  });
}

export async function fetchTransactions(opts?: {
  limit?: number;
  fromId?: number;
  transactionChainId?: number;
  nodeId?: number;
  userId?: number;
  type?: number;
  success?: number;
  done?: string;
  q?: string;
}) {
  const params: Record<string, string | number | boolean> = {};
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.transactionChainId !== undefined) params['transaction_chain'] = opts.transactionChainId;
  if (opts?.nodeId !== undefined) params['node'] = opts.nodeId;
  if (opts?.userId !== undefined) params['user'] = opts.userId;
  if (opts?.type !== undefined) params['type'] = opts.type;
  if (opts?.success !== undefined) params['success'] = opts.success;
  if (opts?.done) params['done'] = opts.done;
  if (opts?.q) params['q'] = opts.q;

  const res = await haveApiCall<Transaction[]>({
    method: 'GET',
    path: '/transactions',
    namespace: 'transaction',
    params,
  });
  return { ...res, data: expectArray<Transaction>(res.data, 'transactions') };
}

export async function fetchTransaction(transactionId: number) {
  return haveApiCall<Transaction>({
    method: 'GET',
    path: `/transactions/${transactionId}`,
  });
}
