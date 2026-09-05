import { describe, expect, it } from 'vitest';

import type { ChangeRequest, RegistrationRequest } from '../../../lib/api/requests';
import {
  ALL_ADMIN_REQUEST_STATES,
  DEFAULT_ADMIN_REQUEST_STATE,
  adminRequestApiState,
  adminRequestStateFilterFromUrl,
  canonicalKey,
  mergeByIdDesc,
  parseTypeValue,
  requestKey,
  requestTypeFilterFromUrl,
  resetAdminRequestPaginationOnFilterChange,
  resolveStateValue,
  safeNumber,
  userLabel,
  visibleRequestRows,
} from './RequestsModel';

describe('RequestsModel', () => {
  it('normalizes numeric and enum-like filter inputs', () => {
    expect(safeNumber('42')).toBe(42);
    expect(safeNumber('0')).toBeUndefined();
    expect(requestTypeFilterFromUrl('registration')).toBe('registration');
    expect(requestTypeFilterFromUrl('bad')).toBe('all');
    expect(parseTypeValue('reg')).toBe('registration');
    expect(parseTypeValue('c')).toBe('change');
    expect(resolveStateValue('pend')).toBe('pending_correction');
    expect(resolveStateValue('all')).toBe(ALL_ADMIN_REQUEST_STATES);
    expect(adminRequestStateFilterFromUrl(null)).toBe(DEFAULT_ADMIN_REQUEST_STATE);
    expect(adminRequestStateFilterFromUrl('bad')).toBe(DEFAULT_ADMIN_REQUEST_STATE);
    expect(adminRequestStateFilterFromUrl('pending_correction')).toBe('pending_correction');
    expect(adminRequestApiState(ALL_ADMIN_REQUEST_STATES)).toBeUndefined();
    expect(adminRequestApiState(undefined)).toBe(DEFAULT_ADMIN_REQUEST_STATE);
    expect(canonicalKey('apiip')).toBe('api_ip');
  });

  it('labels user references safely', () => {
    expect(userLabel({ id: 5, login: 'alice' })).toBe('alice');
    expect(userLabel({ id: 5 })).toBe('#5');
    expect(userLabel(null)).toBe('—');
  });

  it('resets a stale cursor only when an admin request filter changes', () => {
    const current = new URLSearchParams('state=all&from_id=700&page=2&limit=50');
    const changed = new URLSearchParams('from_id=700&page=2&limit=50');
    resetAdminRequestPaginationOnFilterChange(changed, current);
    expect(changed.toString()).toBe('limit=50');

    const unchanged = new URLSearchParams(current);
    resetAdminRequestPaginationOnFilterChange(unchanged, current);
    expect(unchanged.get('from_id')).toBe('700');
    expect(unchanged.get('page')).toBe('2');

    const canonicalDefault = new URLSearchParams('from_id=700&page=2&limit=50');
    resetAdminRequestPaginationOnFilterChange(canonicalDefault, new URLSearchParams('state=awaiting&from_id=700&page=2&limit=50'));
    expect(canonicalDefault.get('from_id')).toBe('700');
  });

  it('merges registrations and changes by descending id and shows only the selected work queue', () => {
    const registrations: RegistrationRequest[] = [
      { id: 300, state: 'awaiting' },
      { id: 298, state: 'ignored' },
    ];
    const changes: ChangeRequest[] = [
      { id: 299, state: 'pending_correction' },
      { id: 297, state: 'approved' },
    ];

    const merged = mergeByIdDesc(registrations, changes, 10);
    expect(merged.map((row) => requestKey(row))).toEqual(['registration-300', 'change-299', 'registration-298', 'change-297']);
    expect(visibleRequestRows(merged, undefined).map((row) => requestKey(row))).toEqual(['registration-300']);
    expect(visibleRequestRows(merged, 'awaiting').map((row) => requestKey(row))).toEqual(['registration-300']);
    expect(visibleRequestRows(merged, 'pending_correction').map((row) => requestKey(row))).toEqual(['change-299']);
    expect(visibleRequestRows(merged, 'ignored').map((row) => requestKey(row))).toEqual(['registration-298']);
    expect(visibleRequestRows(merged, ALL_ADMIN_REQUEST_STATES).map((row) => requestKey(row))).toEqual([
      'registration-300',
      'change-299',
      'registration-298',
      'change-297',
    ]);

    const corrected = merged.map((row) => requestKey(row) === 'change-299' ? { ...row, state: 'awaiting' } : row);
    expect(visibleRequestRows(corrected, undefined).map((row) => requestKey(row))).toEqual(['registration-300', 'change-299']);
  });
});
