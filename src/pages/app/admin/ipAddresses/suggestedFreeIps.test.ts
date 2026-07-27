import { describe, expect, it } from 'vitest';

import type { IpAddress } from '../../../../lib/api/ipAddresses';
import type { Location as InfraLocation } from '../../../../lib/api/infra';

import {
  collectSuggestedIpCandidates,
  isPrioritySuggestedIpLocation,
  sampleSuggestedIps,
  selectSuggestedIpLocations,
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
  it('keeps a small balanced sample from every address type', () => {
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

  it('prioritizes production Prague while keeping one location per environment', () => {
    const locations = [
      location(1, 'Brno', 'Production'),
      location(2, 'Playground lab', 'Playground'),
      location(3, 'Praha 2', 'Production'),
      location(4, 'Staging', 'Staging'),
    ];

    expect(selectSuggestedIpLocations(locations).map((item) => item.id)).toEqual([3, 2, 4, 1]);
    expect(isPrioritySuggestedIpLocation(locations[2]!)).toBe(true);
  });

  it('ignores addresses whose network belongs to another primary location', () => {
    const items = [
      locatedIp(1, '37.205.8.1', 3),
      locatedIp(2, '37.205.8.2', 2),
      locatedIp(3, '172.16.4.1', 3),
      ip(4, '37.205.8.4', { network: { id: 1_004 } }),
    ];

    expect(sampleSuggestedIps(items, 3).map((item) => item.id)).toEqual([1, 3]);
  });

  it('scans ascending pages until the priority location has three addresses per type', async () => {
    const requestedCursors: Array<number | undefined> = [];
    const pages = new Map<number | undefined, IpAddress[]>([
      [undefined, [
        locatedIp(1, '37.205.8.1', 3),
        locatedIp(2, '172.16.4.1', 3),
        locatedIp(3, '198.51.100.3', 2),
        locatedIp(4, '198.51.100.4', 2),
      ]],
      [4, [
        locatedIp(5, '37.205.8.2', 3),
        locatedIp(6, '37.205.8.3', 3),
        locatedIp(7, '172.16.4.2', 3),
        locatedIp(8, '172.16.4.3', 3),
      ]],
    ]);

    const result = await collectSuggestedIpCandidates({
      version: 4,
      locationId: 3,
      maxPages: 8,
      pageSize: 4,
      fetchPage: async (fromId) => {
        requestedCursors.push(fromId);
        return pages.get(fromId) ?? [];
      },
    });

    expect(requestedCursors).toEqual([undefined, 4]);
    expect(sampleSuggestedIps(result, 3).map((item) => item.id)).toEqual([1, 5, 6, 2, 7, 8]);
  });
});
