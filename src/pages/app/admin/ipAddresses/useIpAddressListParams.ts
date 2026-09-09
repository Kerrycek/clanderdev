import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { parseBoolParam, parseNonNegativeInt, parsePositiveInt } from '../../../../lib/parse';
import type { IpListOrder } from './ipAddressListSemantics';

export function hasIpAddressRelationFilter(filters: {
  vpsId?: number;
  userId?: number;
  ifaceId?: number;
}): boolean {
  return filters.vpsId !== undefined || filters.userId !== undefined || filters.ifaceId !== undefined;
}

export function resolveAssignedToInterfaceFilter(
  explicit: boolean | undefined,
  occupancyExplicitlyAny: boolean,
  relationFilterActive: boolean
): boolean | undefined {
  if (explicit !== undefined) return explicit;
  return occupancyExplicitlyAny || relationFilterActive ? undefined : false;
}

export function ipDetailBasePath(basePath: string, pathname: string): string {
  const networkingPrefix = `${basePath}/networking/ip-addresses`;
  return pathname.startsWith(networkingPrefix) ? networkingPrefix : `${basePath}/ip-addresses`;
}

export function useIpAddressListParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const legacyQuery = useMemo(() => String(searchParams.get('q') ?? '').trim(), [searchParams]);
  const addr = useMemo(() => String(searchParams.get('addr') ?? ''), [searchParams]);
  const prefixNum = useMemo(() => {
    const parsed = parseNonNegativeInt(searchParams.get('prefix'));
    if (parsed === undefined || parsed < 0 || parsed > 128) return undefined;
    return parsed;
  }, [searchParams]);
  const vpsId = useMemo(() => parsePositiveInt(searchParams.get('vps')), [searchParams]);
  const userId = useMemo(() => parsePositiveInt(searchParams.get('user')), [searchParams]);
  const networkId = useMemo(() => parsePositiveInt(searchParams.get('network')), [searchParams]);
  const ifaceId = useMemo(() => parsePositiveInt(searchParams.get('network_interface')), [searchParams]);
  const locationId = useMemo(() => parsePositiveInt(searchParams.get('location')), [searchParams]);
  const versionNum = useMemo<4 | 6 | undefined>(() => {
    const value = String(searchParams.get('version') ?? '').trim();
    if (value === '4') return 4;
    if (value === '6') return 6;
    return undefined;
  }, [searchParams]);
  const occupancyExplicitlyAny = searchParams.get('occupancy') === 'any';
  const relationFilterImpliesAnyOccupancy = hasIpAddressRelationFilter({ vpsId, userId, ifaceId });
  const assignedToInterface = useMemo(() => {
    const selected = parseBoolParam(searchParams.get('assigned_to_interface'));
    return resolveAssignedToInterfaceFilter(
      selected,
      occupancyExplicitlyAny,
      relationFilterImpliesAnyOccupancy
    );
  }, [occupancyExplicitlyAny, relationFilterImpliesAnyOccupancy, searchParams]);
  const order = useMemo<IpListOrder>(() => {
    const value = String(searchParams.get('order') ?? '').trim().toLowerCase();
    if (value === 'asc' || value === 'interface' || value === 'desc') return value;
    return 'desc';
  }, [searchParams]);

  const setTextParam = (key: string, value: string | undefined) => {
    const trimmed = String(value ?? '').trim();
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (trimmed) next.set(key, trimmed);
      else next.delete(key);
      return next;
    });
  };

  const setIntParam = (key: string, value: number | undefined | null) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        next.set(key, String(Math.floor(value)));
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const setResolvedUserFilter = (value: number | undefined | null) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        next.set('user', String(Math.floor(value)));
      } else {
        next.delete('user');
      }

      // `q` was emitted by an older UI even though IpAddress.Index does not
      // support it. Never combine a resolved owner with that stale no-op.
      next.delete('q');
      next.delete('from_id');
      next.delete('page');
      return next;
    });
  };

  const setBoolParamInUrl = (key: string, value: boolean | undefined) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value === true) {
        next.set(key, '1');
        next.delete('occupancy');
      } else if (value === false) {
        next.set(key, '0');
        next.delete('occupancy');
      } else {
        next.delete(key);
        next.set('occupancy', 'any');
      }
      return next;
    });
  };

  const setAddressFilter = (nextAddr: string, nextPrefix?: string) => {
    const addrValue = nextAddr.trim();
    const prefixValue = String(nextPrefix ?? '').trim();
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (addrValue) next.set('addr', addrValue);
      else next.delete('addr');
      if (prefixValue) next.set('prefix', prefixValue);
      else next.delete('prefix');
      return next;
    });
  };

  const clearUrlFilters = () => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      [
        'q',
        'addr',
        'prefix',
        'vps',
        'user',
        'network',
        'network_interface',
        'location',
        'version',
        'assigned_to_interface',
        'occupancy',
        'order',
      ].forEach((key) => next.delete(key));
      return next;
    });
  };

  const assignedFilterExplicit = searchParams.has('assigned_to_interface') || occupancyExplicitlyAny;
  const filtersActive = Boolean(
    legacyQuery ||
      addr.trim() ||
      prefixNum !== undefined ||
      vpsId !== undefined ||
      userId !== undefined ||
      networkId !== undefined ||
      ifaceId !== undefined ||
      locationId !== undefined ||
      versionNum !== undefined ||
      assignedFilterExplicit,
  );

  return {
    searchParams,
    setSearchParams,
    legacyQuery,
    addr,
    prefixNum,
    vpsId,
    userId,
    networkId,
    ifaceId,
    locationId,
    versionNum,
    occupancyExplicitlyAny,
    assignedToInterface,
    order,
    setTextParam,
    setIntParam,
    setResolvedUserFilter,
    setBoolParamInUrl,
    setAddressFilter,
    clearUrlFilters,
    assignedFilterExplicit,
    filtersActive,
  };
}
