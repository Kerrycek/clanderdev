import { fetchDnsZones, type DnsZone } from '../api/dns';
import { fetchIpAddresses, type IpAddress } from '../api/ipAddresses';
import { fetchVps, fetchVpsList, type Vps } from '../api/vps';

const DNS_ZONE_SCAN_LIMIT = 100;
const DNS_ZONE_CACHE_TTL_MS = 30_000;

interface DnsZoneCacheEntry {
  expiresAt: number;
  zones: DnsZone[];
}

const dnsZoneCache = new Map<string, DnsZoneCacheEntry>();
const dnsZoneInflight = new Map<string, Promise<DnsZone[]>>();

export type UserGlobalSearchGroup = 'vps' | 'ips' | 'dns_zones';

export interface UserGlobalSearchResult {
  key: string;
  group: UserGlobalSearchGroup;
  primary: string;
  secondary: string;
  href: string;
  id: number;
  resource: 'Vps' | 'IpAddress' | 'DnsZone';
  raw: unknown;
}

export type UserGlobalSearchT = (key: string, vars?: Record<string, unknown>) => string;

interface BuildUserGlobalSearchResultsOptions {
  basePath: string;
  query: string;
  vpses: Vps[];
  ipAddresses: IpAddress[];
  dnsZones: DnsZone[];
  t: UserGlobalSearchT;
  kinds?: UserGlobalSearchGroup[];
  limitPerGroup?: number;
}

interface SearchUserObjectsOptions {
  basePath: string;
  query: string;
  t: UserGlobalSearchT;
  /** Explicit API filter used by an administrator in My view. */
  scopeUserId?: number;
  /** Used to reject an exact-ID VPS result that clearly belongs to somebody else. */
  expectedUserId?: number;
  kinds?: UserGlobalSearchGroup[];
  limitPerGroup?: number;
  signal?: AbortSignal;
}

function positiveId(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? value : null;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
  if (!value || typeof value !== 'object') return null;
  return positiveId((value as { id?: unknown }).id);
}

function exactVpsId(query: string): number | null {
  const match = query.trim().match(/^(?:vps\s*)?#?(\d+)$/i);
  return match ? positiveId(match[1]) : null;
}

function addressLabel(ip: IpAddress): string {
  const addr = String(ip.addr ?? '').trim();
  if (!addr) return `#${ip.id}`;
  return typeof ip.prefix === 'number' ? `${addr}/${ip.prefix}` : addr;
}

interface IpAddressFilter {
  addr: string;
  prefix?: number;
}

function isIpv6Address(value: string): boolean {
  if (!value.includes(':') || !/^[0-9a-f:]+$/i.test(value)) return false;
  const halves = value.split('::');
  if (halves.length > 2) return false;

  const groups = halves.flatMap((half) => {
    if (!half) return [];
    return half.split(':');
  });
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return false;
  return halves.length === 2 ? groups.length < 8 : groups.length === 8;
}

function ipAddressFilter(query: string): IpAddressFilter | null {
  const raw = query.trim();
  if (!raw) return null;

  const slashAt = raw.indexOf('/');
  const addr = (slashAt === -1 ? raw : raw.slice(0, slashAt)).trim();
  const prefixRaw = slashAt === -1 ? '' : raw.slice(slashAt + 1).trim();
  if (!addr || (slashAt !== -1 && !/^\d+$/.test(prefixRaw))) return null;

  const ipv4Parts = addr.split('.');
  const ipv4 = ipv4Parts.length === 4
    && ipv4Parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
  const ipv6 = isIpv6Address(addr);
  if (!ipv4 && !ipv6) return null;

  if (!prefixRaw) return { addr };
  const prefix = Number(prefixRaw);
  const maxPrefix = ipv4 ? 32 : 128;
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) return null;
  return { addr, prefix };
}

function dnsZoneMatchesQuery(zone: DnsZone, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase().replace(/\.+$/, '');
  if (!needle) return false;

  return [zone.name, zone.label].some((value) => (
    String(value ?? '').trim().toLocaleLowerCase().replace(/\.+$/, '').includes(needle)
  ));
}

function dnsZoneCacheKey(scopeUserId?: number, expectedUserId?: number): string | null {
  const userId = positiveId(scopeUserId) ?? positiveId(expectedUserId);
  return userId === null ? null : `user:${userId}`;
}

function descendingPageCursor(rows: DnsZone[]): number | null {
  let cursor: number | null = null;
  for (const row of rows) {
    const id = positiveId(row.id);
    if (id === null) continue;
    if (cursor === null || id < cursor) cursor = id;
  }
  return cursor;
}

async function fetchAllDnsZones(opts: {
  scopeUserId?: number;
  signal?: AbortSignal;
}): Promise<DnsZone[]> {
  const zones = new Map<number, DnsZone>();
  const seenCursors = new Set<number>();
  let fromId: number | undefined;

  for (;;) {
    const page = await fetchDnsZones({
      limit: DNS_ZONE_SCAN_LIMIT,
      fromId,
      user: opts.scopeUserId,
      signal: opts.signal,
    });
    for (const zone of page.data) {
      const id = positiveId(zone.id);
      if (id !== null) zones.set(id, zone);
    }

    if (page.data.length < DNS_ZONE_SCAN_LIMIT) return Array.from(zones.values());

    const nextCursor = descendingPageCursor(page.data);
    if (nextCursor === null || seenCursors.has(nextCursor)) {
      throw new Error('DNS zone pagination stalled before all zones were loaded');
    }
    seenCursors.add(nextCursor);
    fromId = nextCursor;
  }
}

function aborted(signal: AbortSignal): Error {
  if (typeof DOMException !== 'undefined') return new DOMException('Aborted', 'AbortError');
  return Object.assign(new Error('Aborted'), { name: 'AbortError' });
}

function waitForPromise<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(aborted(signal));

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(aborted(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

async function fetchCachedDnsZones(opts: {
  scopeUserId?: number;
  expectedUserId?: number;
  signal?: AbortSignal;
}): Promise<DnsZone[]> {
  const key = dnsZoneCacheKey(opts.scopeUserId, opts.expectedUserId);
  if (key === null) {
    return fetchAllDnsZones({ scopeUserId: opts.scopeUserId, signal: opts.signal });
  }

  const cached = dnsZoneCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.zones;
  if (cached) dnsZoneCache.delete(key);

  let pending = dnsZoneInflight.get(key);
  if (!pending) {
    pending = fetchAllDnsZones({ scopeUserId: opts.scopeUserId })
      .then((zones) => {
        dnsZoneCache.set(key, {
          expiresAt: Date.now() + DNS_ZONE_CACHE_TTL_MS,
          zones,
        });
        return zones;
      })
      .finally(() => dnsZoneInflight.delete(key));
    dnsZoneInflight.set(key, pending);
  }

  return waitForPromise(pending, opts.signal);
}

function associatedVps(ip: IpAddress): { id: number; hostname?: string } | null {
  const direct = ip.vps;
  const networkInterface = ip.network_interface;
  const nested = networkInterface && typeof networkInterface === 'object'
    ? (networkInterface as { vps?: unknown }).vps
    : undefined;
  const candidate = direct ?? nested;
  const id = positiveId(candidate);
  if (!id) return null;
  const hostname = candidate && typeof candidate === 'object'
    ? String((candidate as { hostname?: unknown }).hostname ?? '').trim()
    : '';
  return { id, hostname: hostname || undefined };
}

function relatedVpses(ip: IpAddress): unknown[] {
  const networkInterface = ip.network_interface;
  const nested = networkInterface && typeof networkInterface === 'object'
    ? (networkInterface as { vps?: unknown }).vps
    : undefined;

  return [ip.vps, nested].filter((candidate) => positiveId(candidate) !== null);
}

function ipAddressBelongsToUser(ip: IpAddress, expectedUserId?: number): boolean {
  const userId = positiveId(expectedUserId);
  if (userId === null) return false;

  if (positiveId(ip.user) === userId) return true;

  return relatedVpses(ip).some((vps) => (
    vps !== null
    && typeof vps === 'object'
    && positiveId((vps as { user?: unknown }).user) === userId
  ));
}

function hasKind(kinds: ReadonlySet<UserGlobalSearchGroup>, kind: UserGlobalSearchGroup): boolean {
  return kinds.has(kind);
}

export function buildUserGlobalSearchResults(
  opts: BuildUserGlobalSearchResultsOptions
): UserGlobalSearchResult[] {
  const limit = Math.max(1, Math.min(8, opts.limitPerGroup ?? 5));
  const kinds = new Set<UserGlobalSearchGroup>(opts.kinds ?? ['vps', 'ips', 'dns_zones']);
  const vpsResults = new Map<number, UserGlobalSearchResult>();
  const ipResults = new Map<number, UserGlobalSearchResult>();
  const zoneResults = new Map<number, UserGlobalSearchResult>();

  if (hasKind(kinds, 'vps')) {
    for (const vps of opts.vpses) {
      if (!positiveId(vps.id) || vpsResults.has(vps.id)) continue;
      const hostname = String(vps.hostname ?? '').trim();
      vpsResults.set(vps.id, {
        key: `vps:${vps.id}`,
        group: 'vps',
        primary: hostname || opts.t('common.vps_ref', { id: vps.id }),
        secondary: opts.t('common.vps_ref', { id: vps.id }),
        href: `${opts.basePath}/vps/${vps.id}`,
        id: vps.id,
        resource: 'Vps',
        raw: vps,
      });
    }
  }

  for (const ip of opts.ipAddresses) {
    if (!positiveId(ip.id)) continue;
    const label = addressLabel(ip);
    const vps = associatedVps(ip);

    if (hasKind(kinds, 'vps') && vps && !vpsResults.has(vps.id)) {
      vpsResults.set(vps.id, {
        key: `vps:${vps.id}`,
        group: 'vps',
        primary: vps.hostname || opts.t('common.vps_ref', { id: vps.id }),
        secondary: opts.t('palette.result.vps.matched_ip', { ip: label }),
        href: `${opts.basePath}/vps/${vps.id}`,
        id: vps.id,
        resource: 'Vps',
        raw: ip,
      });
    }

    if (!hasKind(kinds, 'ips') || ipResults.has(ip.id)) continue;
    ipResults.set(ip.id, {
      key: `ip:${ip.id}`,
      group: 'ips',
      primary: label,
      secondary: vps
        ? opts.t('palette.result.ip.assigned_vps', {
            vps: vps.hostname || opts.t('common.vps_ref', { id: vps.id }),
          })
        : opts.t('palette.result.ip.owned'),
      href: vps ? `${opts.basePath}/vps/${vps.id}/network` : `${opts.basePath}/networking`,
      id: ip.id,
      resource: 'IpAddress',
      raw: ip,
    });
  }

  if (hasKind(kinds, 'dns_zones')) {
    for (const zone of opts.dnsZones) {
      if (!positiveId(zone.id) || zoneResults.has(zone.id)) continue;
      const name = String(zone.name ?? '').trim();
      const label = String(zone.label ?? '').trim();
      zoneResults.set(zone.id, {
        key: `dns:${zone.id}`,
        group: 'dns_zones',
        primary: name || label || opts.t('common.resource_ref', {
          resource: opts.t('object_kind.dns_zone'),
          id: zone.id,
        }),
        secondary: label && label !== name
          ? label
          : opts.t('common.resource_ref', {
              resource: opts.t('object_kind.dns_zone'),
              id: zone.id,
            }),
        href: `${opts.basePath}/dns/zones/${zone.id}`,
        id: zone.id,
        resource: 'DnsZone',
        raw: zone,
      });
    }
  }

  return [
    ...Array.from(vpsResults.values()).slice(0, limit),
    ...Array.from(ipResults.values()).slice(0, limit),
    ...Array.from(zoneResults.values()).slice(0, limit),
  ];
}

function exactVpsBelongsToExpectedUser(vps: Vps, expectedUserId?: number): boolean {
  if (expectedUserId === undefined) return true;
  const ownerId = positiveId(vps.user);
  return ownerId === expectedUserId;
}

export async function searchUserObjects(opts: SearchUserObjectsOptions): Promise<UserGlobalSearchResult[]> {
  const query = opts.query.trim();
  if (!query) return [];

  const limit = Math.max(1, Math.min(8, opts.limitPerGroup ?? 5));
  const kinds = new Set<UserGlobalSearchGroup>(opts.kinds ?? ['vps', 'ips', 'dns_zones']);
  const requestedVpsId = hasKind(kinds, 'vps') ? exactVpsId(query) : null;
  const ipFilter = hasKind(kinds, 'ips') || hasKind(kinds, 'vps')
    ? ipAddressFilter(query)
    : null;

  const vpsListPromise = hasKind(kinds, 'vps')
    ? fetchVpsList({
        limit,
        hostnameAny: query,
        user: opts.scopeUserId,
        includes: 'user',
        signal: opts.signal,
      }).then((res) => (
        requestedVpsId === null
          ? res.data
          : res.data.filter((vps) => exactVpsBelongsToExpectedUser(vps, opts.expectedUserId))
      ))
    : Promise.resolve([] as Vps[]);
  const exactVpsPromise = requestedVpsId
    ? fetchVps(requestedVpsId, { includes: 'user', signal: opts.signal })
        .then((res) => exactVpsBelongsToExpectedUser(res.data, opts.expectedUserId) ? [res.data] : [])
    : Promise.resolve([] as Vps[]);
  const ipPromise = ipFilter
    ? fetchIpAddresses({
        limit,
        addr: ipFilter.addr,
        prefix: ipFilter.prefix,
        user: opts.scopeUserId,
        includes: 'network_interface__vps__user,user',
        signal: opts.signal,
      }).then((res) => {
        const expectedUserId = positiveId(opts.expectedUserId) ?? positiveId(opts.scopeUserId) ?? undefined;
        return res.data.filter((ip) => ipAddressBelongsToUser(ip, expectedUserId));
      })
    : Promise.resolve([] as IpAddress[]);
  const dnsPromise = hasKind(kinds, 'dns_zones')
    ? fetchCachedDnsZones({
        scopeUserId: opts.scopeUserId,
        expectedUserId: opts.expectedUserId,
        signal: opts.signal,
      }).then((zones) => zones.filter((zone) => dnsZoneMatchesQuery(zone, query)))
    : Promise.resolve([] as DnsZone[]);

  const [vpsListResult, exactVpsResult, ipResult, dnsResult] = await Promise.allSettled([
    vpsListPromise,
    exactVpsPromise,
    ipPromise,
    dnsPromise,
  ]);
  if (opts.signal?.aborted) return [];

  const requestedSearchStatuses = [
    hasKind(kinds, 'vps')
      ? vpsListResult.status === 'fulfilled'
        || (requestedVpsId !== null && exactVpsResult.status === 'fulfilled')
      : null,
    ipFilter ? ipResult.status === 'fulfilled' : null,
    hasKind(kinds, 'dns_zones') ? dnsResult.status === 'fulfilled' : null,
  ].filter((status): status is boolean => status !== null);

  // Keep useful matches when one optional index is unavailable, but surface an
  // error when every requested index failed instead of pretending there are no
  // results.
  if (requestedSearchStatuses.length > 0 && requestedSearchStatuses.every((status) => !status)) {
    const firstFailure = [vpsListResult, exactVpsResult, ipResult, dnsResult]
      .find((result): result is PromiseRejectedResult => result.status === 'rejected');
    throw firstFailure?.reason ?? new Error('User search failed');
  }

  const vpsList = vpsListResult.status === 'fulfilled' ? vpsListResult.value : [];
  const exactVps = exactVpsResult.status === 'fulfilled' ? exactVpsResult.value : [];
  const ipAddresses = ipResult.status === 'fulfilled' ? ipResult.value : [];
  const dnsZones = dnsResult.status === 'fulfilled' ? dnsResult.value : [];

  return buildUserGlobalSearchResults({
    basePath: opts.basePath,
    query,
    vpses: [...exactVps, ...vpsList],
    ipAddresses,
    dnsZones,
    t: opts.t,
    kinds: Array.from(kinds),
    limitPerGroup: limit,
  });
}
