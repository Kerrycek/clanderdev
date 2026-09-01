import { expectArray, haveApiCall } from './haveapi';

export interface ResourceRef {
  id: number;
  label?: string;
  login?: string;
  api_ip_addr?: string;
  [k: string]: unknown;
}

export interface ObjectHistoryEvent {
  id: number;
  user?: ResourceRef;
  user_session?: ResourceRef;
  object?: string;
  object_id?: number;
  event_type?: string;
  event_data?: unknown;
  created_at?: string;
  [k: string]: unknown;
}

export async function fetchObjectHistoryEvents(opts?: {
  limit?: number;
  fromId?: number;
  /** Request an exact total for the active server-side filters. */
  count?: boolean;
  userId?: number;
  userSessionId?: number;
  object?: string;
  objectId?: number;
  eventType?: string;
}) {
  const params: Record<string, unknown> = {};
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;

  if (opts?.userId !== undefined) params['user'] = opts.userId;
  if (opts?.userSessionId !== undefined) params['user_session'] = opts.userSessionId;

  const obj = opts?.object ? String(opts.object).trim() : '';
  if (obj) params['object'] = obj;

  if (opts?.objectId !== undefined) params['object_id'] = opts.objectId;

  const et = opts?.eventType ? String(opts.eventType).trim() : '';
  if (et) params['event_type'] = et;

  const res = await haveApiCall<ObjectHistoryEvent[]>({
    method: 'GET',
    path: '/object_histories',
    namespace: 'object_history',
    params,
    meta: { includes: 'user,user_session', ...(opts?.count ? { count: true } : {}) },
  });

  return { ...res, data: expectArray<ObjectHistoryEvent>(res.data, 'object_histories#index') };
}

export async function fetchObjectHistoryEvent(historyId: number) {
  return haveApiCall<ObjectHistoryEvent>({
    method: 'GET',
    path: `/object_histories/${historyId}`,
  });
}
