import type { ChangeRequest, RegistrationRequest, UserRef, UserRequestState } from '../../../lib/api/requests';

export type RequestTypeFilter = 'all' | 'registration' | 'change';
export type RequestRowType = 'registration' | 'change';

export type UnifiedRequestRow =
  | (RegistrationRequest & { _type: 'registration' })
  | (ChangeRequest & { _type: 'change' });

export type RequestFilterKey =
  | 'q'
  | 'type'
  | 'state'
  | 'user'
  | 'admin'
  | 'api_ip'
  | 'client_ip'
  | 'client_ptr'
  | 'id';

export const DEFAULT_ADMIN_REQUEST_STATE = 'awaiting';
export const ALL_ADMIN_REQUEST_STATES = 'all';
const ADMIN_REQUEST_FILTER_PARAMS = ['type', 'q', 'user', 'admin', 'api_ip', 'client_ip', 'client_ptr'];

export function resetAdminRequestPaginationOnFilterChange(next: URLSearchParams, current: URLSearchParams): void {
  const stateChanged = adminRequestStateFilterFromUrl(next.get('state')) !== adminRequestStateFilterFromUrl(current.get('state'));
  if (!stateChanged && !ADMIN_REQUEST_FILTER_PARAMS.some((key) => next.get(key) !== current.get(key))) return;
  next.delete('from_id');
  next.delete('page');
}

export function safeNumber(value: string | undefined | null): number | undefined {
  const t = String(value ?? '').trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  const i = Math.floor(n);
  if (i <= 0) return undefined;
  return i;
}

export function requestTypeFilterFromUrl(value: string | null | undefined): RequestTypeFilter {
  const t = String(value ?? '').trim();
  if (t === 'registration' || t === 'change') return t;
  return 'all';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

export function userLabel(user: UserRef | unknown): string {
  if (!isRecord(user)) return '—';
  const login = user['login'];
  const label = user['label'];
  const name = user['name'];
  const id = user['id'];
  if (typeof login === 'string' && login.trim()) return login;
  if (typeof label === 'string' && label.trim()) return label;
  if (typeof name === 'string' && name.trim()) return name;
  if (typeof id === 'number' && Number.isFinite(id)) return `#${Math.floor(id)}`;
  if (typeof id === 'string' && id.trim()) return `#${id.trim()}`;
  return '—';
}

export function requestKey(request: UnifiedRequestRow): string {
  return `${request._type}-${Number(request.id)}`;
}

export function requestId(request: UnifiedRequestRow): number {
  return Number(request.id);
}

export function requestType(request: UnifiedRequestRow): RequestRowType {
  return request._type;
}

export function requestState(request: UnifiedRequestRow): UserRequestState {
  return String(request.state ?? '').trim();
}

export function requestLabel(request: UnifiedRequestRow): string {
  return String(request.label ?? '').trim() || '—';
}

export function requestIpValue(request: UnifiedRequestRow, key: 'api_ip_addr' | 'client_ip_addr'): string {
  const value = request[key];
  return typeof value === 'string' && value.trim() ? value : '—';
}

export function requestDateValue(request: UnifiedRequestRow, key: 'created_at' | 'updated_at'): string | undefined {
  const value = request[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function mergeByIdDesc(registrations: RegistrationRequest[], changes: ChangeRequest[], limit: number): UnifiedRequestRow[] {
  const out: UnifiedRequestRow[] = [];
  let i = 0;
  let j = 0;

  const regRows = registrations.map((request) => ({ ...request, _type: 'registration' as const }));
  const changeRows = changes.map((request) => ({ ...request, _type: 'change' as const }));

  while (out.length < limit && (i < regRows.length || j < changeRows.length)) {
    const regId = i < regRows.length ? Number(regRows[i]?.id) : -1;
    const changeId = j < changeRows.length ? Number(changeRows[j]?.id) : -1;

    if (regId >= changeId) {
      const item = regRows[i];
      if (item) out.push(item);
      i++;
    } else {
      const item = changeRows[j];
      if (item) out.push(item);
      j++;
    }
  }

  return out;
}

export function registrationRows(registrations: RegistrationRequest[]): UnifiedRequestRow[] {
  return registrations.map((request) => ({ ...request, _type: 'registration' as const }));
}

export function changeRows(changes: ChangeRequest[]): UnifiedRequestRow[] {
  return changes.map((request) => ({ ...request, _type: 'change' as const }));
}

export function defaultStateOptions(): string[] {
  return ['', 'awaiting', 'pending_correction', 'approved', 'denied', 'ignored'];
}

export function adminRequestStateFilterFromUrl(value: string | null | undefined): string {
  const state = String(value ?? '').trim();
  if (state === ALL_ADMIN_REQUEST_STATES) return state;
  if (state && defaultStateOptions().includes(state)) return state;
  return DEFAULT_ADMIN_REQUEST_STATE;
}

export function adminRequestApiState(state: string | null | undefined): string | undefined {
  const normalized = adminRequestStateFilterFromUrl(state);
  return normalized === ALL_ADMIN_REQUEST_STATES ? undefined : normalized;
}

export function canonicalKey(rawKey: string): RequestFilterKey | null {
  const k = rawKey.trim().toLowerCase();
  if (!k) return null;
  if (k === 'q' || k === 'search' || k === 'text' || k === 'query') return 'q';
  if (k === 'type' || k === 't' || k === 'kind') return 'type';
  if (k === 'state' || k === 's' || k === 'status') return 'state';
  if (k === 'user' || k === 'u' || k === 'owner') return 'user';
  if (k === 'admin' || k === 'a' || k === 'operator' || k === 'op') return 'admin';
  if (k === 'api' || k === 'api_ip' || k === 'api_ip_addr' || k === 'apiip') return 'api_ip';
  if (k === 'client' || k === 'client_ip' || k === 'client_ip_addr' || k === 'clientip') return 'client_ip';
  if (k === 'ptr' || k === 'client_ptr' || k === 'client_ip_ptr' || k === 'clientptr') return 'client_ptr';
  if (k === 'id' || k === '#') return 'id';
  return null;
}

export function parseTypeValue(value: string): RequestTypeFilter | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v === 'all' || v === '*') return 'all';
  if (v === 'registration' || v === 'registrations' || v === 'reg' || v === 'r') return 'registration';
  if (v === 'change' || v === 'changes' || v === 'c') return 'change';
  return null;
}

export function resolveStateValue(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;

  if (v === ALL_ADMIN_REQUEST_STATES || v === '*') return ALL_ADMIN_REQUEST_STATES;

  const known = defaultStateOptions().filter((x) => x);
  const exact = known.find((state) => state.toLowerCase() === v);
  if (exact) return exact;

  const prefixed = known.filter((state) => state.toLowerCase().startsWith(v));
  if (prefixed.length === 1) return prefixed[0] ?? null;
  return null;
}

export function visibleRequestRows(rows: UnifiedRequestRow[], state: string | undefined): UnifiedRequestRow[] {
  const normalized = adminRequestStateFilterFromUrl(state);
  if (normalized === ALL_ADMIN_REQUEST_STATES) return rows;
  return rows.filter((row) => requestState(row) === normalized);
}
