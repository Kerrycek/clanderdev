import type { IpAddress } from '../../../../lib/api/ipAddresses';
import type { Location as InfraLocation } from '../../../../lib/api/infra';

import {
  ipAddressText,
  isDefaultHiddenLegacyNetwork,
  isPrivateIp,
  isUnallocatedIp,
} from './ipAddressListSemantics';

export const SUGGESTED_IPS_PER_TYPE = 3;
export const SUGGESTED_IP_QUERY_LIMIT = 50;
export const SUGGESTED_LOCATION_LIMIT = 12;

type SuggestedIpBucket = 'public4' | 'private4' | 'ipv6';

export interface SuggestedIpQuery {
  locationId: number;
  version: 4 | 6;
  role?: 'public_access' | 'private_access';
}

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

  return selected.slice(0, SUGGESTED_LOCATION_LIMIT);
}

/**
 * Build one bounded API request for every visible location/address type.
 *
 * Filtering IPv4 by network role prevents public and private pools from
 * displacing each other in the API's ID-ordered result. IPv6 remains a single
 * bucket, matching the UI. The plan is location-major so the browser starts
 * Prague and Brno production requests first and can paint those rows while
 * lower-priority locations are still loading.
 */
export function buildSuggestedIpQueryPlan(locations: InfraLocation[]): SuggestedIpQuery[] {
  return locations.flatMap((location) => [
    { locationId: location.id, version: 4 as const, role: 'public_access' as const },
    { locationId: location.id, version: 4 as const, role: 'private_access' as const },
    { locationId: location.id, version: 6 as const },
  ]);
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
