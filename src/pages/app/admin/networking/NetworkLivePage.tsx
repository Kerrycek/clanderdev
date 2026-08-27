import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import { useI18n } from '../../../../app/i18n';
import { FilterBar } from '../../../../components/layout/FilterBar';
import { ListShell } from '../../../../components/layout/ListShell';
import { PageHeader } from '../../../../components/layout/PageHeader';
import { Button } from '../../../../components/ui/Button';
import { ErrorState } from '../../../../components/ui/ErrorState';
import { LoadingState } from '../../../../components/ui/LoadingState';
import { NodeLookupInput } from '../../../../components/ui/NodeLookupInput';
import { Select, type SelectOption } from '../../../../components/ui/Select';
import { UserLookupInput } from '../../../../components/ui/UserLookupInput';
import { VpsLookupInput } from '../../../../components/ui/VpsLookupInput';
import { fetchEnvironments, fetchLocations } from '../../../../lib/api/infra';
import { fetchNetworkInterfaces } from '../../../../lib/api/networkInterfaces';
import {
  fetchNetworkInterfaceMonitor,
  type NetworkInterfaceMonitorRow,
} from '../../../../lib/api/networking';
import { parsePositiveInt } from '../../../../lib/parse';
import { TIER_A_VISIBLE_MS } from '../../../../lib/refreshTiers';
import { useDocumentVisibility } from '../../../../lib/useDocumentVisibility';
import { NetworkLiveDashboard, type AdminLiveSample } from './NetworkLiveDashboard';
import { trafficTotals } from './networkLiveModel';

const LIVE_HISTORY_POINTS = 60;
const DEFAULT_LIMIT = 50;
const LIVE_POLL_MS = TIER_A_VISIBLE_MS * 2;
const LIVE_ORDER = '-updated_at';

function optionLabel(value: { id: number; label?: string; domain?: string; description?: string }): string {
  return String(value.label ?? value.domain ?? value.description ?? `#${value.id}`).trim();
}

export function NetworkLivePage() {
  const { t } = useI18n();
  const [sp, setSp] = useSearchParams();
  const documentVisible = useDocumentVisibility();
  const [history, setHistory] = useState<AdminLiveSample[]>([]);

  const userId = parsePositiveInt(sp.get('user'));
  const vpsId = parsePositiveInt(sp.get('vps'));
  const nodeId = parsePositiveInt(sp.get('node'));
  const environmentId = parsePositiveInt(sp.get('environment'));
  const locationId = parsePositiveInt(sp.get('location'));
  const networkInterfaceId = parsePositiveInt(sp.get('network_interface'));
  const rawLimit = parsePositiveInt(sp.get('limit')) ?? DEFAULT_LIMIT;
  const limit = [50, 100, 250].includes(rawLimit) ? rawLimit : DEFAULT_LIMIT;
  const paused = sp.get('paused') === '1';
  const polling = documentVisible && !paused;
  const [nodeLookup, setNodeLookup] = useState(() => nodeId ? String(nodeId) : '');
  const [userLookup, setUserLookup] = useState(() => userId ? String(userId) : '');
  const previousNodeId = useRef(nodeId);
  const previousUserId = useRef(userId);

  useEffect(() => {
    if (previousNodeId.current === nodeId) return;
    previousNodeId.current = nodeId;
    if (parsePositiveInt(nodeLookup) !== nodeId) setNodeLookup(nodeId ? String(nodeId) : '');
  }, [nodeId, nodeLookup]);

  useEffect(() => {
    if (previousUserId.current === userId) return;
    previousUserId.current = userId;
    if (parsePositiveInt(userLookup) !== userId) setUserLookup(userId ? String(userId) : '');
  }, [userId, userLookup]);

  useEffect(() => {
    if (!sp.has('order')) return;
    const next = new URLSearchParams(sp);
    next.delete('order');
    setSp(next, { replace: true });
  }, [setSp, sp]);

  const environmentsQ = useQuery({
    queryKey: ['environments', 'network-live'],
    queryFn: async () => (await fetchEnvironments({ limit: 250 })).data,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const locationsQ = useQuery({
    queryKey: ['locations', 'network-live'],
    queryFn: async () => (await fetchLocations({ limit: 500, includes: 'environment' })).data,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const interfacesQ = useQuery({
    queryKey: ['network_interfaces', 'network-live', { vpsId }],
    queryFn: async () => (await fetchNetworkInterfaces(vpsId as number, { limit: 250 })).data,
    enabled: vpsId !== undefined,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const listQ = useQuery({
    queryKey: [
      'network_interface_monitor',
      'list',
      { userId, vpsId, nodeId, environmentId, locationId, networkInterfaceId, limit },
    ],
    queryFn: async () => (
      await fetchNetworkInterfaceMonitor({
        user: userId,
        environment: environmentId,
        location: locationId,
        node: nodeId,
        vps: vpsId,
        networkInterface: networkInterfaceId,
        order: LIVE_ORDER,
        limit,
        includes:
          'network_interface__vps__user,' +
          'network_interface__vps__node__location__environment',
      })
    ).data,
    refetchInterval: polling ? LIVE_POLL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: polling,
    staleTime: 2_000,
  });

  const setParams = (values: Record<string, string | undefined>) => {
    const next = new URLSearchParams(sp);
    for (const [key, value] of Object.entries(values)) {
      if (value && value.trim()) next.set(key, value.trim());
      else next.delete(key);
    }
    setSp(next, { replace: true });
  };

  const rows = useMemo<NetworkInterfaceMonitorRow[]>(() => listQ.data ?? [], [listQ.data]);
  const totals = useMemo(() => trafficTotals(rows), [rows]);
  const filterSignature = [
    userId,
    vpsId,
    nodeId,
    environmentId,
    locationId,
    networkInterfaceId,
    limit,
  ].join(':');

  useEffect(() => {
    setHistory([]);
  }, [filterSignature]);

  useEffect(() => {
    if (!listQ.dataUpdatedAt || rows.length === 0) return;
    const timestamp = Math.floor(listQ.dataUpdatedAt / 1_000);
    const sample = { timestamp, bytesIn: totals.bytesIn, bytesOut: totals.bytesOut };
    setHistory((previous) => {
      const withoutSameTimestamp = previous.filter((item) => item.timestamp !== timestamp);
      return [...withoutSameTimestamp, sample].slice(-LIVE_HISTORY_POINTS);
    });
  }, [listQ.dataUpdatedAt, rows.length, totals.bytesIn, totals.bytesOut]);

  const environmentOptions = useMemo<SelectOption[]>(() => {
    const options = (environmentsQ.data ?? []).map((environment) => ({
      value: String(environment.id),
      label: optionLabel(environment),
    }));
    if (environmentId && !options.some((option) => option.value === String(environmentId))) {
      options.unshift({ value: String(environmentId), label: `#${environmentId}` });
    }
    return [{ value: '', label: t('common.all') }, ...options];
  }, [environmentId, environmentsQ.data, t]);

  const locationOptions = useMemo<SelectOption[]>(() => {
    const options = (locationsQ.data ?? [])
      .filter((location) => !environmentId || Number(location.environment?.id) === environmentId)
      .map((location) => ({
        value: String(location.id),
        label: optionLabel(location),
      }));
    if (locationId && !options.some((option) => option.value === String(locationId))) {
      options.unshift({ value: String(locationId), label: `#${locationId}` });
    }
    return [{ value: '', label: t('common.all') }, ...options];
  }, [environmentId, locationId, locationsQ.data, t]);

  const interfaceOptions = useMemo<SelectOption[]>(() => {
    const options = (interfacesQ.data ?? []).map((networkInterface) => ({
      value: String(networkInterface.id),
      label: `${networkInterface.name || `#${networkInterface.id}`} (#${networkInterface.id})`,
    }));
    if (networkInterfaceId && !options.some((option) => option.value === String(networkInterfaceId))) {
      options.unshift({ value: String(networkInterfaceId), label: `#${networkInterfaceId}` });
    }
    return [{
      value: '',
      label: vpsId ? t('common.all') : t('admin.network_live.filter.interface_requires_vps'),
    }, ...options];
  }, [interfacesQ.data, networkInterfaceId, t, vpsId]);

  const filtersActive = Boolean(
    userId || vpsId || nodeId || environmentId || locationId || networkInterfaceId,
  );
  const clearFilters = () => {
    const next = new URLSearchParams();
    if (paused) next.set('paused', '1');
    setSp(next, { replace: true });
  };

  return (
    <ListShell
      testId="admin.network_live.page"
      header={(
        <PageHeader
          title={t('admin.network_live.title')}
          description={t('admin.network_live.subtitle')}
        />
      )}
      filters={(
        <FilterBar
          left={(
            <div className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Select
                label={t('admin.network_live.filter.environment')}
                testId="admin.network_live.filter.environment"
                value={environmentId ? String(environmentId) : ''}
                onChange={(event) => setParams({ environment: event.target.value, location: undefined })}
                options={environmentOptions}
              />
              <Select
                label={t('admin.network_live.filter.location')}
                testId="admin.network_live.filter.location"
                value={locationId ? String(locationId) : ''}
                onChange={(event) => setParams({ location: event.target.value })}
                options={locationOptions}
              />
              <div>
                <div className="mb-1 text-xs font-semibold text-muted">{t('admin.network_live.filter.node')}</div>
                <NodeLookupInput
                  testId="admin.network_live.filter.node"
                  ariaLabel={t('admin.network_live.filter.node')}
                  value={nodeLookup}
                  onChange={(value) => {
                    setNodeLookup(value);
                    const nextNodeId = parsePositiveInt(value);
                    if (nextNodeId !== nodeId) {
                      setParams({ node: nextNodeId ? String(nextNodeId) : undefined });
                    }
                  }}
                  placeholder={t('admin.network_live.filter.node.placeholder')}
                  loadingLabel={t('common.loading')}
                  noResultsLabel={t('common.no_results')}
                />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-muted">{t('admin.network_live.filter.user')}</div>
                <UserLookupInput
                  testId="admin.network_live.filter.user"
                  ariaLabel={t('admin.network_live.filter.user')}
                  value={userLookup}
                  onChange={(value) => {
                    setUserLookup(value);
                    const nextUserId = parsePositiveInt(value);
                    if (nextUserId !== userId) {
                      setParams({
                        user: nextUserId ? String(nextUserId) : undefined,
                        vps: undefined,
                        network_interface: undefined,
                      });
                    }
                  }}
                  placeholder={t('admin.network_live.filter.user.placeholder')}
                />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-muted">{t('admin.network_live.filter.vps')}</div>
                <VpsLookupInput
                  testId="admin.network_live.filter.vps"
                  ariaLabel={t('admin.network_live.filter.vps')}
                  value={vpsId ?? null}
                  userId={userId}
                  onChange={(value) => setParams({
                    vps: value == null ? undefined : String(value),
                    network_interface: undefined,
                  })}
                  placeholder={t('admin.network_live.filter.vps.placeholder')}
                />
              </div>
              <Select
                label={t('admin.network_live.filter.interface')}
                testId="admin.network_live.filter.interface"
                value={networkInterfaceId ? String(networkInterfaceId) : ''}
                disabled={!vpsId && !networkInterfaceId}
                onChange={(event) => setParams({ network_interface: event.target.value })}
                options={interfaceOptions}
              />
            </div>
          )}
          right={(
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-28">
                <Select
                  label={t('admin.network_live.filter.limit')}
                  testId="admin.network_live.filter.limit"
                  value={String(limit)}
                  onChange={(event) => setParams({ limit: event.target.value })}
                  options={[50, 100, 250].map((value) => ({ value: String(value), label: String(value) }))}
                />
              </div>
              {filtersActive ? (
                <Button
                  variant="secondary"
                  testId="admin.network_live.filter.clear"
                  onClick={clearFilters}
                >
                  {t('common.clear_filters')}
                </Button>
              ) : null}
            </div>
          )}
        />
      )}
    >
      {listQ.isLoading ? (
        <LoadingState />
      ) : listQ.isError ? (
        <ErrorState
          title={t('admin.network_live.load_error')}
          error={listQ.error}
          onRetry={() => void listQ.refetch()}
        />
      ) : (
        <NetworkLiveDashboard
          rows={rows}
          history={history}
          paused={paused}
          documentVisible={documentVisible}
          isFetching={listQ.isFetching}
          onTogglePaused={() => {
            setParams({ paused: paused ? undefined : '1' });
            if (paused) void listQ.refetch();
          }}
          onRefresh={() => void listQ.refetch()}
        />
      )}
    </ListShell>
  );
}
