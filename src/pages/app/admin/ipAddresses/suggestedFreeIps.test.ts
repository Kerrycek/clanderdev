import { describe, expect, it } from 'vitest';

import type { IpAddress } from '../../../../lib/api/ipAddresses';
import type { Location as InfraLocation } from '../../../../lib/api/infra';

import {
  buildSuggestedIpQueryPlan,
  sampleSuggestedIps,
  sampleSuggestedIpsByLocationAndType,
  selectSuggestedIpLocations,
  SUGGESTED_LOCATION_LIMIT,
  SUGGESTED_IP_QUERY_LIMIT,
} from './suggestedFreeIps';

function ip(id: number, addr: string, extra: Partial<IpAddress> = {}): IpAddress {
  return { id, addr, ...extra };
}

function locatedIp(id: number, addr: string, locationId: number, extra: Partial<IpAddress> = {}): IpAddress {
  return ip(id, addr, {
    network: { id: 1_000 + locationId, primary_location: { id: locationId } },
    ...extra,
  });
}

function location(id: number, label: string, environment: string): InfraLocation {
  const environmentIds: Record<string, number> = {
    Production: 1,
    Playground: 2,
    Staging: 3,
  };

  return { id, label, environment: { id: environmentIds[environment] ?? id * 10, label: environment } };
}

describe('suggested free IP helpers', () => {
  it('keeps at most three public IPv4, private IPv4 and IPv6 addresses', () => {
    const items: IpAddress[] = [
      ...[1, 2, 3, 4].map((id) => ip(id, `37.205.10.${id}`)),
      ...[11, 12, 13, 14].map((id) => ip(id, `10.0.0.${id}`)),
      ...[21, 22, 23, 24].map((id) => ip(id, `2a03:3b40:fe:a1::${id}`)),
      ...[31, 32, 33, 34].map((id) => ip(id, `fd00::${id}`)),
      ip(99, '198.51.100.99', { user: { id: 1 } }),
    ];

    expect(sampleSuggestedIps(items).map((item) => item.id)).toEqual([
      1, 2, 3,
      11, 12, 13,
      21, 22, 23,
    ]);
  });

  it('prioritizes production Prague and Brno before other relevant locations', () => {
    const locations = [
      location(1, 'Brno', 'Production'),
      location(2, 'Playground lab', 'Playground'),
      location(3, 'Praha 2', 'Production'),
      location(4, 'Staging', 'Staging'),
      location(5, 'Ostrava', 'Production'),
    ];

    expect(selectSuggestedIpLocations(locations).map((item) => item.id)).toEqual([3, 1, 2, 4]);
  });

  it('keeps Prague and Brno plus a bounded representative set of other environments', () => {
    const locations = [
      location(1, 'Brno', 'Production'),
      location(2, 'Playground lab', 'Playground'),
      location(3, 'Praha 2', 'Production'),
      location(4, 'Staging', 'Staging'),
      location(5, 'Ostrava', 'Production'),
      location(6, 'Second playground', 'Playground'),
      location(7, 'Second staging', 'Staging'),
    ];

    expect(selectSuggestedIpLocations(locations).map((item) => item.id)).toEqual([3, 1, 2, 7]);
    expect(SUGGESTED_LOCATION_LIMIT).toBe(6);
  });

  it('caps the representative query plan at eighteen exact location/type requests', () => {
    const locations = [
      location(1, 'Brno', 'Production'),
      location(2, 'Playground lab', 'Playground'),
      location(3, 'Praha 2', 'Production'),
      location(4, 'Staging', 'Staging'),
      location(5, 'Testing', 'Testing'),
      location(6, 'Development', 'Development'),
      location(7, 'Integration', 'Integration'),
      location(8, 'Overflow', 'Overflow'),
    ];

    const selected = selectSuggestedIpLocations(locations);
    const plan = buildSuggestedIpQueryPlan(selected);

    expect(selected).toHaveLength(SUGGESTED_LOCATION_LIMIT);
    expect(plan).toHaveLength(18);
    selected.forEach((item) => {
      expect(plan.filter((query) => query.locationId === item.id)).toEqual([
        { locationId: item.id, version: 4, role: 'public_access' },
        { locationId: item.id, version: 4, role: 'private_access' },
        { locationId: item.id, version: 6 },
      ]);
    });
  });

  it('keeps each location sample scoped to the network primary location', () => {
    const items = [
      locatedIp(1, '37.205.8.1', 3),
      locatedIp(2, '37.205.8.2', 2),
      locatedIp(3, '172.16.4.1', 3),
      locatedIp(4, '2a03:3b40:3::1', 3),
      locatedIp(5, '2a03:3b40:3::2', 2),
      ip(6, '37.205.8.6', { network: { id: 1_006 } }),
    ];

    expect(sampleSuggestedIps(items, 3).map((item) => item.id)).toEqual([1, 3, 4]);
  });

  it('uses one small bounded query per location and address type', () => {
    const locations = [
      location(3, 'Praha 2', 'Production'),
      location(1, 'Brno', 'Production'),
      location(2, 'Playground lab', 'Playground'),
    ];

    expect(SUGGESTED_IP_QUERY_LIMIT).toBe(50);
    expect(buildSuggestedIpQueryPlan(locations)).toEqual([
      { locationId: 3, version: 4, role: 'public_access' },
      { locationId: 3, version: 4, role: 'private_access' },
      { locationId: 3, version: 6 },
      { locationId: 1, version: 4, role: 'public_access' },
      { locationId: 1, version: 4, role: 'private_access' },
      { locationId: 1, version: 6 },
      { locationId: 2, version: 4, role: 'public_access' },
      { locationId: 2, version: 4, role: 'private_access' },
      { locationId: 2, version: 6 },
    ]);
  });

  it('orders the combined sample by prioritized location and then by type', () => {
    const locationItems = (locationId: number, base: number): IpAddress[] => [
      ...[1, 2, 3, 4].map((offset) => locatedIp(base + offset, `198.51.${locationId}.${offset}`, locationId)),
      ...[11, 12, 13, 14].map((offset) => locatedIp(base + offset, `10.${locationId}.0.${offset}`, locationId)),
      ...[21, 22, 23, 24].map((offset) => locatedIp(base + offset, `2a03:3b40:${locationId}::${offset}`, locationId)),
    ];

    const result = sampleSuggestedIpsByLocationAndType([
      { locationId: 3, items: locationItems(3, 100) },
      { locationId: 1, items: locationItems(1, 200) },
      { locationId: 2, items: locationItems(2, 300) },
    ]);

    expect(result.map((item) => item.id)).toEqual([
      101, 102, 103,
      111, 112, 113,
      121, 122, 123,
      201, 202, 203,
      211, 212, 213,
      221, 222, 223,
      301, 302, 303,
      311, 312, 313,
      321, 322, 323,
    ]);
  });
});
