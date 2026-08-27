import { expectArray, haveApiCall } from './haveapi';

export interface UserRef {
  id: number | string;
  login?: string;
  label?: string;
  name?: string;
  [k: string]: unknown;
}

export type UserRequestState =
  | 'awaiting'
  | 'approved'
  | 'denied'
  | 'ignored'
  | 'pending_correction'
  | string;

export interface UserRequestCommon {
  id: number;

  user?: UserRef;
  state?: UserRequestState;

  api_ip_addr?: string;
  api_ip_ptr?: string;
  client_ip_addr?: string;
  client_ip_ptr?: string;

  admin?: UserRef;
  admin_response?: string;

  created_at?: string;
  updated_at?: string;

  label?: string;
  [k: string]: unknown;
}

export interface RegistrationRequest extends UserRequestCommon {
  type?: 'registration';

  // request
  login?: string;
  full_name?: string;
  org_name?: string;
  org_id?: string;
  email?: string;
  address?: string;
  year_of_birth?: number;
  how?: string;
  note?: string;
  os_template?: unknown;
  location?: unknown;
  currency?: string;
  language?: unknown;
  time_zone?: string | null;

  // properties (IP/MAIL checks)
  ip_checked?: boolean;
  ip_request_id?: string;
  ip_success?: boolean;
  ip_message?: string;
  ip_errors?: string;
  ip_proxy?: boolean;
  ip_crawler?: boolean;
  ip_recent_abuse?: boolean;
  ip_vpn?: boolean;
  ip_tor?: boolean;
  ip_fraud_score?: number;

  mail_checked?: boolean;
  mail_request_id?: string;
  mail_success?: boolean;
  mail_message?: string;
  mail_errors?: string;
  mail_valid?: boolean;
  mail_disposable?: boolean;
  mail_timed_out?: boolean;
  mail_deliverability?: string;
  mail_catch_all?: boolean;
  mail_leaked?: boolean;
  mail_suspect?: boolean;
  mail_smtp_score?: number;
  mail_overall_score?: number;
  mail_fraud_score?: number;
  mail_dns_valid?: boolean;
  mail_honeypot?: boolean;
  mail_spam_trap_score?: string;
  mail_recent_abuse?: boolean;
  mail_frequent_complainer?: boolean;
}

export interface ChangeRequest extends UserRequestCommon {
  type?: 'change';

  // request
  change_reason?: string;
  full_name?: string;
  email?: string;
  address?: string;
}

export interface MyRequestListOptions {
  limit?: number;
  fromId?: number;
  state?: string;
  count?: boolean;
  /**
   * Admins are not owner-scoped by the API. In the self-service view, add an
   * explicit user filter so privileged accounts do not download other users'
   * requests before the fail-closed ownership check runs.
   */
  explicitOwnerFilter?: boolean;
}

export class UserRequestOwnershipError extends Error {
  constructor() {
    super('Request ownership could not be verified.');
    this.name = 'UserRequestOwnershipError';
  }
}

function requestOwnerId(request: UserRequestCommon): number | null {
  const owner = request.user;
  if (!owner || typeof owner !== 'object') return null;
  const id = Number(owner.id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return id;
}

/**
 * The API scopes request Index/Show to the signed-in owner for non-admin users.
 * Keep this client-side check as a second fail-closed boundary: a malformed or
 * unexpectedly unscoped response must never be rendered in the My requests UI.
 */
export function assertOwnedUserRequest<T extends UserRequestCommon>(
  request: T,
  expectedUserId: number,
): T {
  if (!Number.isSafeInteger(expectedUserId) || expectedUserId <= 0) {
    throw new UserRequestOwnershipError();
  }
  if (requestOwnerId(request) !== expectedUserId) {
    throw new UserRequestOwnershipError();
  }
  return request;
}

export function assertOwnedUserRequests<T extends UserRequestCommon>(
  requests: T[],
  expectedUserId: number,
): T[] {
  for (const request of requests) assertOwnedUserRequest(request, expectedUserId);
  return requests;
}

export async function createChangeRequest(params: {
  change_reason: string;
  full_name?: string;
  email?: string;
  address?: string;
}) {
  return haveApiCall<ChangeRequest>({
    method: 'POST',
    path: '/user_request/changes',
    namespace: 'change',
    params,
  });
}

export type ResolveUserRequestAction = 'approve' | 'deny' | 'ignore' | 'request_correction';

export async function fetchRegistrationRequests(opts?: {
  limit?: number;
  fromId?: number;
  state?: string;
  q?: string;
  userId?: number;
  adminId?: number;
  apiIpAddr?: string;
  clientIpAddr?: string;
  clientIpPtr?: string;
  count?: boolean;
}) {
  const params: Record<string, unknown> = {};
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.state) params['state'] = opts.state;
  if (opts?.q) params['q'] = opts.q;
  if (opts?.userId !== undefined) params['user'] = opts.userId;
  if (opts?.adminId !== undefined) params['admin'] = opts.adminId;
  if (opts?.apiIpAddr) params['api_ip_addr'] = opts.apiIpAddr;
  if (opts?.clientIpAddr) params['client_ip_addr'] = opts.clientIpAddr;
  if (opts?.clientIpPtr) params['client_ip_ptr'] = opts.clientIpPtr;

  const res = await haveApiCall<RegistrationRequest[]>({
    method: 'GET',
    path: '/user_request/registrations',
    namespace: 'registration',
    params,
    meta: opts?.count ? { count: true } : undefined,
  });

  return {
    ...res,
    data: expectArray<RegistrationRequest>(res.data, 'user_request.registrations#index'),
  };
}

export async function fetchRegistrationRequest(requestId: number) {
  return haveApiCall<RegistrationRequest>({
    method: 'GET',
    path: `/user_request/registrations/${requestId}`,
  });
}

export async function fetchMyRegistrationRequests(
  expectedUserId: number,
  opts?: MyRequestListOptions,
) {
  const { explicitOwnerFilter = false, ...listOptions } = opts ?? {};
  const res = await fetchRegistrationRequests({
    ...listOptions,
    userId: explicitOwnerFilter ? expectedUserId : undefined,
    count: listOptions.count,
  });
  return {
    ...res,
    data: assertOwnedUserRequests(res.data, expectedUserId),
  };
}

export async function fetchMyRegistrationRequest(requestId: number, expectedUserId: number) {
  const res = await fetchRegistrationRequest(requestId);
  return {
    ...res,
    data: assertOwnedUserRequest(res.data, expectedUserId),
  };
}

export async function resolveRegistrationRequest(
  requestId: number,
  params: {
    action: ResolveUserRequestAction;
    reason?: string;

    // optional overrides
    login?: string;
    full_name?: string;
    org_name?: string;
    org_id?: string;
    email?: string;
    address?: string;

    // approve options
    activate?: boolean;
    create_vps?: boolean;
    node?: number;
  }
) {
  return haveApiCall<void>({
    method: 'POST',
    path: `/user_request/registrations/${requestId}/resolve`,
    namespace: 'registration',
    params,
  });
}


export async function previewRegistrationRequest(requestId: number, token: string) {
  return haveApiCall<RegistrationRequest>({
    method: 'GET',
    path: `/user_request/registrations/${requestId}/${encodeURIComponent(token)}`,
  });
}

export async function updateRegistrationRequestByToken(
  requestId: number,
  token: string,
  params: {
    login: string;
    full_name: string;
    org_name?: string;
    org_id?: string;
    email: string;
    address: string;
    year_of_birth: number;
    how?: string;
    note?: string;
    os_template: number;
    location: number;
    currency: string;
    language: number;
  }
) {
  return haveApiCall<RegistrationRequest>({
    method: 'PUT',
    path: `/user_request/registrations/${requestId}/${encodeURIComponent(token)}`,
    namespace: 'registration',
    params,
  });
}

export async function fetchChangeRequests(opts?: {
  limit?: number;
  fromId?: number;
  state?: string;
  q?: string;
  userId?: number;
  adminId?: number;
  apiIpAddr?: string;
  clientIpAddr?: string;
  clientIpPtr?: string;
  count?: boolean;
}) {
  const params: Record<string, unknown> = {};
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.state) params['state'] = opts.state;
  if (opts?.q) params['q'] = opts.q;
  if (opts?.userId !== undefined) params['user'] = opts.userId;
  if (opts?.adminId !== undefined) params['admin'] = opts.adminId;
  if (opts?.apiIpAddr) params['api_ip_addr'] = opts.apiIpAddr;
  if (opts?.clientIpAddr) params['client_ip_addr'] = opts.clientIpAddr;
  if (opts?.clientIpPtr) params['client_ip_ptr'] = opts.clientIpPtr;

  const res = await haveApiCall<ChangeRequest[]>({
    method: 'GET',
    path: '/user_request/changes',
    namespace: 'change',
    params,
    meta: opts?.count ? { count: true } : undefined,
  });

  return {
    ...res,
    data: expectArray<ChangeRequest>(res.data, 'user_request.changes#index'),
  };
}

export async function fetchChangeRequest(requestId: number) {
  return haveApiCall<ChangeRequest>({
    method: 'GET',
    path: `/user_request/changes/${requestId}`,
  });
}

export async function fetchMyChangeRequests(
  expectedUserId: number,
  opts?: MyRequestListOptions,
) {
  const { explicitOwnerFilter = false, ...listOptions } = opts ?? {};
  const res = await fetchChangeRequests({
    ...listOptions,
    userId: explicitOwnerFilter ? expectedUserId : undefined,
    count: listOptions.count,
  });
  return {
    ...res,
    data: assertOwnedUserRequests(res.data, expectedUserId),
  };
}

export async function fetchMyChangeRequest(requestId: number, expectedUserId: number) {
  const res = await fetchChangeRequest(requestId);
  return {
    ...res,
    data: assertOwnedUserRequest(res.data, expectedUserId),
  };
}

export async function resolveChangeRequest(
  requestId: number,
  params: {
    action: ResolveUserRequestAction;
    reason?: string;

    // optional overrides
    full_name?: string;
    email?: string;
    address?: string;
    change_reason?: string;
  }
) {
  return haveApiCall<void>({
    method: 'POST',
    path: `/user_request/changes/${requestId}/resolve`,
    namespace: 'change',
    params,
  });
}
