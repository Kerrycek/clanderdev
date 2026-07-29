import { describe, expect, test } from 'vitest';

import { isSecondaryDnsZone } from './DnsZoneModel';

describe('DnsZoneModel', () => {
  test('treats external source zones as secondary zones', () => {
    expect(isSecondaryDnsZone({ id: 1, source: 'external_source' })).toBe(true);
    expect(isSecondaryDnsZone({ id: 1, source: 'external' })).toBe(true);
  });

  test('keeps internal source zones as primary/editable zones', () => {
    expect(isSecondaryDnsZone({ id: 1, source: 'internal_source' })).toBe(false);
    expect(isSecondaryDnsZone({ id: 1, source: 'internal' })).toBe(false);
  });

  test('falls back to explicit secondary type fields', () => {
    expect(isSecondaryDnsZone({ id: 1, type: 'secondary_type' })).toBe(true);
    expect(isSecondaryDnsZone({ id: 1, zone_type: 'secondary' })).toBe(true);
  });
});
