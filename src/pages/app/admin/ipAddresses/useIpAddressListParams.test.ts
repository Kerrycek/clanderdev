import { describe, expect, it } from 'vitest';

import {
  hasIpAddressRelationFilter,
  resolveAssignedToInterfaceFilter,
} from './useIpAddressListParams';

describe('resolveAssignedToInterfaceFilter', () => {
  it('keeps the free-address default without an explicit or relation filter', () => {
    expect(resolveAssignedToInterfaceFilter(undefined, false, false)).toBe(false);
  });

  it.each([
    ['vps', { vpsId: 1 }],
    ['user', { userId: 1 }],
    ['network interface', { ifaceId: 1 }],
  ] as const)('shows any occupancy for a %s relation filter', (_label, filters) => {
    expect(hasIpAddressRelationFilter(filters)).toBe(true);
    expect(resolveAssignedToInterfaceFilter(undefined, false, true)).toBeUndefined();
  });

  it('honours an explicit occupancy selection over a relation filter', () => {
    expect(resolveAssignedToInterfaceFilter(true, false, true)).toBe(true);
    expect(resolveAssignedToInterfaceFilter(false, true, true)).toBe(false);
  });

  it('supports an explicit any-occupancy URL', () => {
    expect(resolveAssignedToInterfaceFilter(undefined, true, false)).toBeUndefined();
  });
});
