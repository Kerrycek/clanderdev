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
export const SUGGESTED_PRIORITY_LOCATION_MAX_PAGES = 8;
export const SUGGESTED_LOCATION_LIMIT = 12;

type SuggestedIpBucket = 'public4' | 'private4' | 'ipv6';

function normalizedLocationText(location: InfraLocation): string {
  return `${location.label ?? ''} ${location.environment?.label ?? ''}`.toLocaleLowerCase('cs');
}

function isPrahaLocation(location: InfraLocation): boolean {
  const text = normalizedLocationText(location);
  return text.includes('praha') || text.includes('prague');
}

function isProductionLocation(location: InfraLocation): boolean {
  const text = normalizedLocationText(location);
  return text.includes('production') || text.includes('prod');
}

export function isPrioritySuggestedIpLocation(location: InfraLocation): boolean {
  return isPrahaLocation(location) && isProductionLocation(location);
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

    if (isPraha && isProduction) return 0;
    if (isPraha) return 1;
    if (isProduction) return 2;
    if (label.includes('brno')) return 3;
    if (label.includes('playground')) return 4;
    if (label.includes('staging')) return 5;
    return 6;
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

  add(ordered.find(isPrioritySuggestedIpLocation));

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
    .filter((ip) => {
      if (locationId === undefined) return true;
      return primaryLocationId(ip) === locationId;
    });
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
  maxPages: number;
  pageSize?: number;
}): Promise<IpAddress[]> {
  const pageSize = opts.pageSize ?? SUGGESTED_IP_QUERY_LIMIT;
  const collected: IpAddress[] = [];
  const seenIds = new Set<number>();
  const seenCursors = new Set<number>();
  let fromId: number | undefined;

  for (let pageNumber = 0; pageNumber < opts.maxPages; pageNumber += 1) {
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
