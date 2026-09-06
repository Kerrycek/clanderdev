import type { ResolveUserRequestAction } from '../../../lib/api/requests';

import type {
  RequestResolveOverrides,
  RequestReviewType,
  ReviewableRequest,
} from './RequestReviewTypes';

export function safePositiveInteger(value: string | undefined): number | undefined {
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  const number = Number(text);
  if (!Number.isFinite(number)) return undefined;
  const integer = Math.floor(number);
  return integer > 0 ? integer : undefined;
}

export function resourceId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return resourceId(record['id'] ?? record['value']);
  }
  return null;
}

export function firstResourceId(
  source: Record<string, unknown> | null | undefined,
  keys: string[],
): number | null {
  if (!source) return null;
  for (const key of keys) {
    const id = resourceId(source[key]);
    if (id) return id;
  }
  return null;
}

export function requestOperationalLinks(request: ReviewableRequest | undefined) {
  return {
    actionStateId: firstResourceId(request, [
      'action_state',
      'action_state_id',
      'resolve_action_state',
      'resolve_action_state_id',
    ]),
    transactionChainId: firstResourceId(request, [
      'transaction_chain',
      'transaction_chain_id',
      'resolve_transaction_chain',
      'resolve_transaction_chain_id',
    ]),
    transactionId: firstResourceId(request, [
      'transaction',
      'transaction_id',
      'resolve_transaction',
      'resolve_transaction_id',
    ]),
  };
}

export function requestReviewActions(
  reqType: RequestReviewType,
  request: ReviewableRequest | undefined,
  isAdmin: boolean,
): ResolveUserRequestAction[] {
  if (!isAdmin || !request) return [];
  const state = String(request.state ?? '').trim();
  const canRequestCorrection = reqType === 'registration';

  if (state === 'approved') return canRequestCorrection ? ['deny', 'ignore', 'request_correction'] : ['deny', 'ignore'];
  if (state === 'denied') return canRequestCorrection ? ['approve', 'ignore', 'request_correction'] : ['approve', 'ignore'];
  if (state === 'ignored') return canRequestCorrection ? ['approve', 'deny', 'request_correction'] : ['approve', 'deny'];

  const actions: ResolveUserRequestAction[] = ['approve', 'deny', 'ignore'];
  if (canRequestCorrection && state === 'awaiting') {
    actions.push('request_correction');
  }
  return actions;
}

export function requestActionVariant(
  action: ResolveUserRequestAction,
): 'primary' | 'secondary' | 'danger' {
  if (action === 'approve') return 'primary';
  if (action === 'deny' || action === 'ignore') return 'danger';
  return 'secondary';
}

export function requestActionNeedsReason(action: ResolveUserRequestAction): boolean {
  return action === 'deny' || action === 'request_correction';
}

function stringField(request: ReviewableRequest, key: string): string {
  const value = request[key];
  return typeof value === 'string' ? value : '';
}

export function emptyRequestOverrides(): RequestResolveOverrides {
  return {
    login: '',
    fullName: '',
    orgName: '',
    orgId: '',
    email: '',
    address: '',
    changeReason: '',
  };
}

export function requestOverrides(
  reqType: RequestReviewType,
  request: ReviewableRequest,
): RequestResolveOverrides {
  if (reqType === 'registration') {
    return {
      login: stringField(request, 'login'),
      fullName: stringField(request, 'full_name'),
      orgName: stringField(request, 'org_name'),
      orgId: stringField(request, 'org_id'),
      email: stringField(request, 'email'),
      address: stringField(request, 'address'),
      changeReason: '',
    };
  }

  return {
    login: '',
    fullName: stringField(request, 'full_name'),
    orgName: '',
    orgId: '',
    email: stringField(request, 'email'),
    address: stringField(request, 'address'),
    changeReason: stringField(request, 'change_reason'),
  };
}
