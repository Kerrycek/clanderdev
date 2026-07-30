import { describe, expect, it } from 'vitest';

import type { IpAddress } from '../../../../lib/api/ipAddresses';
import type { Location as InfraLocation } from '../../../../lib/api/infra';

import {
  collectSuggestedIpCandidates,
  keepSuccessfulSuggestedIpQueries,
  sampleSuggestedIps,
  sampleSuggestedIpsByLocationAndType,
  selectSuggestedIpLocations,
  suggestedLocationMaxPages,
  SUGGESTED_IP_QUERY_CONCURRENCY,
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

    expect(selectSuggestedIpLocations(locations).map((item) => item.id)).toEqual([3, 1, 2, 4, 5]);
    expect(locations.map(suggestedLocationMaxPages)).toEqual([8, 1, 8, 1, 1]);
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

  it('scans ascending pages until every available IPv4 bucket reaches its quota', async () => {
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

  it('keeps non-priority location scans to one request', async () => {
    let requests = 0;

    await collectSuggestedIpCandidates({
      version: 4,
      locationId: 2,
      maxPages: 1,
      pageSize: 1,
      fetchPage: async () => {
        requests += 1;
        return [locatedIp(requests, `198.51.100.${requests}`, 2)];
      },
    });

    expect(requests).toBe(1);
  });

  it('keeps successful location queries when a secondary location fails', async () => {
    const result = await keepSuccessfulSuggestedIpQueries([
      () => Promise.resolve({ locationId: 3, items: [locatedIp(1, '198.51.100.1', 3)] }),
      () => Promise.reject(new Error('Brno is temporarily unavailable')),
      () => Promise.resolve({ locationId: 2, items: [locatedIp(2, '198.51.100.2', 2)] }),
    ]);

    expect(result.map((item) => item.locationId)).toEqual([3, 2]);
  });

  it('preserves an error when every suggested-location query fails', async () => {
    await expect(keepSuccessfulSuggestedIpQueries([
      () => Promise.reject(new Error('Praha is unavailable')),
      () => Promise.reject(new Error('Brno is unavailable')),
    ])).rejects.toThrow('Praha is unavailable');
  });

  it('runs suggested-location queries with a maximum concurrency of six', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    const result = await keepSuccessfulSuggestedIpQueries(
      Array.from({ length: 18 }, (_, index) => async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return index;
      })
    );

    expect(maxInFlight).toBeLessThanOrEqual(SUGGESTED_IP_QUERY_CONCURRENCY);
    expect(maxInFlight).toBe(SUGGESTED_IP_QUERY_CONCURRENCY);
    expect(result).toEqual(Array.from({ length: 18 }, (_, index) => index));
  });

  it('orders the combined sample by type and then by prioritized location', () => {
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
      201, 202, 203,
      301, 302, 303,
      111, 112, 113,
      211, 212, 213,
      311, 312, 313,
      121, 122, 123,
      221, 222, 223,
      321, 322, 323,
    ]);
  });
});
