import type { IpAddress } from '../../../../lib/api/ipAddresses';
import type { Location as InfraLocation } from '../../../../lib/api/infra';

import {
  ipAddressText,
  isDefaultHiddenLegacyNetwork,
  isPrivateIp,
  isUnallocatedIp,
} from './ipAddressListSemantics';

export const SUGGESTED_IPS_PER_TYPE = 3;
export const SUGGESTED_IP_QUERY_LIMIT = 150;
export const SUGGESTED_IP_QUERY_CONCURRENCY = 6;
export const SUGGESTED_PRIORITY_LOCATION_MAX_PAGES = 8;
export const SUGGESTED_OTHER_LOCATION_MAX_PAGES = 1;
export const SUGGESTED_LOCATION_LIMIT = 12;

type SuggestedIpBucket = 'public4' | 'private4' | 'ipv6';

function normalizedLocationText(location: InfraLocation): string {
  return `${location.label ?? ''} ${location.environment?.label ?? ''}`.toLocaleLowerCase('cs');
}

function isPrahaLocation(location: InfraLocation): boolean {
  const text = normalizedLocationText(location);
  return text.includes('praha') || text.includes('prague');
}

function isBrnoLocation(location: InfraLocation): boolean {
  return normalizedLocationText(location).includes('brno');
}

function isProductionLocation(location: InfraLocation): boolean {
  const text = normalizedLocationText(location);
  return text.includes('production') || text.includes('prod');
}

function isPrahaProductionLocation(location: InfraLocation): boolean {
  return isPrahaLocation(location) && isProductionLocation(location);
}

function isBrnoProductionLocation(location: InfraLocation): boolean {
  return isBrnoLocation(location) && isProductionLocation(location);
}

export function suggestedLocationMaxPages(location: InfraLocation): number {
  return isPrahaProductionLocation(location) || isBrnoProductionLocation(location)
    ? SUGGESTED_PRIORITY_LOCATION_MAX_PAGES
    : SUGGESTED_OTHER_LOCATION_MAX_PAGES;
}

function environmentKey(location: InfraLocation): string {
  const environment = location.environment;
  if (environment?.id !== undefined) return String(environment.id);
  if (environment?.label) return environment.label;
  return 'unknown';
}

export function suggestedLocationOrder(a: InfraLocation, b: InfraLocation): number {
  const priority = (location: InfraLocation) => {
    const label = normalizedLocationText(location);
    const isPraha = isPrahaLocation(location);
    const isProduction = isProductionLocation(location);

    const isBrno = isBrnoLocation(location);

    if (isPraha && isProduction) return 0;
    if (isBrno && isProduction) return 1;
    if (isProduction) return 2;
    if (isPraha) return 3;
    if (isBrno) return 4;
    if (label.includes('playground')) return 5;
    if (label.includes('staging')) return 6;
    return 7;
  };

  return priority(a) - priority(b) || String(a.label ?? '').localeCompare(String(b.label ?? ''), 'cs');
}

export function selectSuggestedIpLocations(locations: InfraLocation[]): InfraLocation[] {
  const ordered = [...locations].sort(suggestedLocationOrder);
  const selected: InfraLocation[] = [];
  const selectedIds = new Set<number>();

  const add = (location: InfraLocation | undefined) => {
    if (!location || selectedIds.has(location.id)) return;
    selected.push(location);
    selectedIds.add(location.id);
  };

  add(ordered.find(isPrahaProductionLocation));
  add(ordered.find(isBrnoProductionLocation));

  const coveredEnvironments = new Set(selected.map(environmentKey));
  for (const location of ordered) {
    const key = environmentKey(location);
    if (coveredEnvironments.has(key)) continue;
    add(location);
    coveredEnvironments.add(key);
  }

  for (const location of ordered) add(location);

  return selected.slice(0, SUGGESTED_LOCATION_LIMIT);
}

function suggestedIpBucket(ip: IpAddress): SuggestedIpBucket {
  const isV6 = (ipAddressText(ip) ?? '').includes(':');
  const isPrivate = isPrivateIp(ip);

  if (isV6) return 'ipv6';
  return isPrivate ? 'private4' : 'public4';
}

function primaryLocationId(ip: IpAddress): number | undefined {
  const value = ip.network?.primary_location?.id;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function eligibleSuggestedIps(items: IpAddress[], locationId?: number): IpAddress[] {
  return items
    .filter((ip) => !isDefaultHiddenLegacyNetwork(ip))
    .filter(isUnallocatedIp)
    .filter((ip) => locationId === undefined || primaryLocationId(ip) === locationId);
}

export function hasSuggestedIpQuota(items: IpAddress[], version: 4 | 6, locationId?: number): boolean {
  const counts: Record<SuggestedIpBucket, number> = {
    public4: 0,
    private4: 0,
    ipv6: 0,
  };

  eligibleSuggestedIps(items, locationId).forEach((ip) => {
    counts[suggestedIpBucket(ip)] += 1;
  });

  const buckets: SuggestedIpBucket[] = version === 4
    ? ['public4', 'private4']
    : ['ipv6'];

  return buckets.every((bucket) => counts[bucket] >= SUGGESTED_IPS_PER_TYPE);
}

export async function collectSuggestedIpCandidates(opts: {
  fetchPage: (fromId?: number) => Promise<IpAddress[]>;
  version: 4 | 6;
  locationId: number;
  maxPages?: number;
  pageSize?: number;
}): Promise<IpAddress[]> {
  const pageSize = opts.pageSize ?? SUGGESTED_IP_QUERY_LIMIT;
  const maxPages = opts.maxPages ?? SUGGESTED_OTHER_LOCATION_MAX_PAGES;
  const collected: IpAddress[] = [];
  const seenIds = new Set<number>();
  const seenCursors = new Set<number>();
  let fromId: number | undefined;

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const page = await opts.fetchPage(fromId);
    page.forEach((ip) => {
      if (seenIds.has(ip.id)) return;
      seenIds.add(ip.id);
      collected.push(ip);
    });

    if (hasSuggestedIpQuota(collected, opts.version, opts.locationId)) break;
    if (page.length < pageSize) break;

    const cursor = page.reduce<number | undefined>((max, ip) => {
      if (!Number.isFinite(ip.id) || ip.id <= 0) return max;
      return max === undefined || ip.id > max ? ip.id : max;
    }, undefined);

    if (cursor === undefined || seenCursors.has(cursor)) break;
    seenCursors.add(cursor);
    fromId = cursor;
  }

  return collected;
}

export async function keepSuccessfulSuggestedIpQueries<T>(
  queryFactories: Array<() => Promise<T>>,
  concurrency = SUGGESTED_IP_QUERY_CONCURRENCY
): Promise<T[]> {
  const requestedConcurrency = Number.isFinite(concurrency) ? Math.floor(concurrency) : SUGGESTED_IP_QUERY_CONCURRENCY;
  const workerCount = Math.min(queryFactories.length, Math.max(1, requestedConcurrency));
  const successful: Array<{ index: number; value: T }> = [];
  const failed: Array<{ index: number; reason: unknown }> = [];
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < queryFactories.length) {
      const index = nextIndex;
      nextIndex += 1;
      const factory = queryFactories[index];
      if (!factory) continue;

      try {
        successful.push({ index, value: await factory() });
      } catch (reason) {
        failed.push({ index, reason });
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (successful.length > 0) {
    return successful
      .sort((a, b) => a.index - b.index)
      .map((result) => result.value);
  }

  const firstFailure = failed.sort((a, b) => a.index - b.index)[0];
  if (firstFailure) throw firstFailure.reason;
  throw new Error('No suggested IP address query completed');
}

export function sampleSuggestedIps(items: IpAddress[], locationId?: number): IpAddress[] {
  const buckets: Record<SuggestedIpBucket, IpAddress[]> = {
    public4: [],
    private4: [],
    ipv6: [],
  };

  eligibleSuggestedIps(items, locationId)
    .forEach((ip) => {
      buckets[suggestedIpBucket(ip)].push(ip);
    });

  return (['public4', 'private4', 'ipv6'] as const)
    .flatMap((bucket) => buckets[bucket].slice(0, SUGGESTED_IPS_PER_TYPE));
}

export function sampleSuggestedIpsByLocationAndType(
  locations: Array<{ locationId: number; items: IpAddress[] }>
): IpAddress[] {
  const seenIds = new Set<number>();

  return (['public4', 'private4', 'ipv6'] as const).flatMap((bucket) =>
    locations.flatMap(({ locationId, items }) =>
      eligibleSuggestedIps(items, locationId)
        .filter((ip) => suggestedIpBucket(ip) === bucket)
        .slice(0, SUGGESTED_IPS_PER_TYPE)
        .filter((ip) => {
          if (seenIds.has(ip.id)) return false;
          seenIds.add(ip.id);
          return true;
        })
    )
  );
}
