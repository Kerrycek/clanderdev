import { useEffect, useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';

import { fetchIpAddresses, type IpAddress } from '../../../../lib/api/ipAddresses';
import type { Location as InfraLocation } from '../../../../lib/api/infra';

import {
  buildSuggestedIpQueryPlan,
  PRIORITY_LOCATION_COUNT,
  sampleSuggestedIpsByLocationAndType,
  SUGGESTED_IP_QUERY_LIMIT,
} from './suggestedFreeIps';

const SUGGESTED_IP_REQUEST_TIMEOUT_MS = 12_000;

function createRequestTimeoutSignal(parentSignal: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();

  if (parentSignal.aborted) abort();
  else parentSignal.addEventListener('abort', abort, { once: true });

  const timeoutId = window.setTimeout(abort, SUGGESTED_IP_REQUEST_TIMEOUT_MS);

  return {
    signal: controller.signal,
    cleanup: () => {
      window.clearTimeout(timeoutId);
      parentSignal.removeEventListener('abort', abort);
    },
  };
}

export function useProgressiveSuggestedIpQueries(
  locations: InfraLocation[],
  enabled: boolean
) {
  const queryPlan = useMemo(() => buildSuggestedIpQueryPlan(locations), [locations]);
  const progressKey = `${enabled ? 'visible' : 'hidden'}:${locations
    .map((item) => item.id)
    .join(',')}`;
  const [progress, setProgress] = useState(() => ({
    key: progressKey,
    count: PRIORITY_LOCATION_COUNT,
  }));
  const activeLocationCount = progress.key === progressKey
    ? progress.count
    : PRIORITY_LOCATION_COUNT;

  useEffect(() => {
    if (progress.key === progressKey) return;
    setProgress({ key: progressKey, count: PRIORITY_LOCATION_COUNT });
  }, [progress.key, progressKey]);

  const queries = useQueries({
    queries: queryPlan.map((query, index) => ({
      queryKey: ['ip_addresses', 'suggested_free', query.locationId, query.version, query.role ?? 'any'],
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const timedSignal = createRequestTimeoutSignal(signal);
        try {
          return (
            await fetchIpAddresses({
              limit: SUGGESTED_IP_QUERY_LIMIT,
              location: query.locationId,
              version: query.version,
              role: query.role,
              user: null,
              assignedToInterface: false,
              order: 'asc',
              purpose: 'vps',
              includes: 'network__primary_location__environment',
              signal: timedSignal.signal,
            })
          ).data;
        } finally {
          timedSignal.cleanup();
        }
      },
      staleTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 0,
      enabled: enabled && index < activeLocationCount * 3,
    })),
  });
  const activeQueryCount = Math.min(queryPlan.length, activeLocationCount * 3);
  const activeQueries = queries.slice(0, activeQueryCount);
  const activeQueriesSettled = activeQueries.every(
    (query) => !query.isPending && !query.isFetching
  );

  useEffect(() => {
    if (!enabled || !activeQueriesSettled || activeLocationCount >= locations.length) return;
    setProgress((current) => ({
      key: progressKey,
      count: current.key === progressKey ? current.count + 1 : PRIORITY_LOCATION_COUNT,
    }));
  }, [activeLocationCount, activeQueriesSettled, enabled, locations.length, progressKey]);

  const data = useMemo(() => {
    const byLocation = new Map<number, IpAddress[]>();
    queries.forEach((query, index) => {
      const locationId = queryPlan[index]?.locationId;
      if (locationId === undefined || !query.data) return;
      byLocation.set(locationId, [...(byLocation.get(locationId) ?? []), ...query.data]);
    });

    return sampleSuggestedIpsByLocationAndType(
      locations.map((location) => ({
        locationId: location.id,
        items: byLocation.get(location.id) ?? [],
      }))
    );
  }, [locations, queries, queryPlan]);
  const pending = activeQueries.some((query) => query.isPending || query.isFetching);
  const error = activeQueries.find((query) => query.isError)?.error;
  const partialError = data.length > 0 && activeQueries.some((query) => query.isError);

  return {
    data,
    error: data.length === 0 ? error : undefined,
    isLoading: data.length === 0 && (
      pending || (enabled && activeLocationCount < locations.length)
    ),
    isLoadingMore: enabled && (activeLocationCount < locations.length || pending),
    partialError,
    retryErrors: () => {
      activeQueries.forEach((query) => {
        if (query.isError) void query.refetch();
      });
    },
  };
}
