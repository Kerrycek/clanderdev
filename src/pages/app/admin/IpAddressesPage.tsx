import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { useAppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';

import { fetchIpAddresses } from '../../../lib/api/ipAddresses';
import { fetchLocations, type Location as InfraLocation } from '../../../lib/api/infra';
import { cursorFromDescendingPage } from '../../../lib/lockIndex';
import { useKeysetPagination } from '../../../lib/hooks/useKeysetPagination';

import { ListShell } from '../../../components/layout/ListShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { FilterChip } from '../../../components/ui/FilterChip';
import { LoadingState } from '../../../components/ui/LoadingState';

import { IpAddressesFilters } from './ipAddresses/IpAddressesFilters';
import { IpAddressesListMobile } from './ipAddresses/IpAddressesListMobile';
import { IpAddressesListTable } from './ipAddresses/IpAddressesListTable';
import { isDefaultHiddenLegacyNetwork } from './ipAddresses/ipAddressListSemantics';
import { selectSuggestedIpLocations } from './ipAddresses/suggestedFreeIps';
import { ipDetailBasePath as resolveIpDetailBasePath, useIpAddressListParams } from './ipAddresses/useIpAddressListParams';
import { useIpAddressSmartSearch } from './ipAddresses/useIpAddressSmartSearch';
import { useProgressiveSuggestedIpQueries } from './ipAddresses/useProgressiveSuggestedIpQueries';
import { configuredLegacyIpAddressesUrl } from './ipAddresses/legacyIpAddressesUrl';

export function IpAddressesPage() {
  const { basePath } = useAppMode();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const legacyFallbackUrl = configuredLegacyIpAddressesUrl();
  const {
    searchParams: sp,
    setSearchParams: setSp,
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
  } = useIpAddressListParams();

  const na = t('common.na');

  const ipDetailBasePath = resolveIpDetailBasePath(basePath, location.pathname);
  const openIp = (ipId: number) => navigate(`${ipDetailBasePath}/${ipId}`);

  const {
    smart,
    setSmart,
    smartErrors,
    clearSmartErrors,
    dismissSmartErrors,
    smartNeedle,
    smartInputRef,
    helpOpen,
    setHelpOpen,
    smartResolving,
    smartSearchBlocked,
    clearFilters,
    applySmartText,
    smartSuggestions,
  } = useIpAddressSmartSearch({
    searchParams: sp,
    setSearchParams: setSp,
    legacyQuery,
    openIp,
    setAddressFilter,
    clearUrlFilters,
  });

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [userLookup, setUserLookup] = useState('');

  useEffect(() => {
    if (advancedOpen) return;
    setUserLookup(userId !== undefined ? String(userId) : '');
  }, [advancedOpen, userId]);

  const pagination = useKeysetPagination({
    id: 'admin.ip_addresses.list',
    filterKey: JSON.stringify({
      addr: addr.trim(),
      prefixNum,
      vpsId,
      userId,
      networkId,
      ifaceId,
      locationId,
      versionNum,
      assignedToInterface,
      occupancyExplicitlyAny,
      order,
      scope: basePath,
    }),
    searchParams: sp,
    setSearchParams: setSp,
    defaultLimit: 50,
    allowedLimits: [25, 50, 100],
  });

  const locationsQ = useQuery({
    queryKey: ['locations', 'ip_addresses', 'active'],
    queryFn: async () => (await fetchLocations({ limit: 200, includes: 'environment' })).data,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const environmentLocations = useMemo(() => (locationsQ.data ?? []) as InfraLocation[], [locationsQ.data]);
  const suggestedLocations = useMemo(
    () => selectSuggestedIpLocations(environmentLocations),
    [environmentLocations]
  );
  const showingSuggestedFreeIps = !filtersActive && !smartSearchBlocked && suggestedLocations.length > 0;
  const suggested = useProgressiveSuggestedIpQueries(
    suggestedLocations,
    showingSuggestedFreeIps
  );

  const listQ = useQuery({
    queryKey: [
      'ip_addresses',
      'index',
      {
        limit: pagination.limit,
        fromId: pagination.fromId,
        addr: addr.trim() || undefined,
        prefix: prefixNum,
        vps: vpsId,
        user: userId,
        network: networkId,
        networkInterface: ifaceId,
        location: locationId,
        version: versionNum,
        assignedToInterface,
        occupancyExplicitlyAny,
        order,
      },
    ],
    queryFn: async () =>
      (
        await fetchIpAddresses({
          limit: pagination.limit,
          fromId: pagination.fromId,
          addr: addr.trim() || undefined,
          prefix: prefixNum,
          vps: vpsId,
          user: userId,
          network: networkId,
          networkInterface: ifaceId,
          location: locationId,
          version: versionNum,
          assignedToInterface,
          order: order === 'desc' ? undefined : order,
          purpose: 'vps',
          includes: 'network__primary_location__environment,network_interface,vps,user,charged_environment',
        })
      ).data,
    staleTime: 10_000,
    enabled:
      !locationsQ.isLoading &&
      !showingSuggestedFreeIps &&
      !legacyQuery &&
      !smartResolving &&
      !smartSearchBlocked,
  });

  const loadedPageData = showingSuggestedFreeIps ? suggested.data : (listQ.data ?? []);
  const rawPageData = smartSearchBlocked ? [] : loadedPageData;
  const activeListLoading = smartResolving || (showingSuggestedFreeIps
    ? suggested.isLoading
    : listQ.isLoading);
  const activeListError = showingSuggestedFreeIps
    ? suggested.error
    : listQ.error;
  const hideLegacyNetworksByDefault =
    networkId === undefined &&
    vpsId === undefined &&
    userId === undefined &&
    ifaceId === undefined &&
    !addr.trim() &&
    prefixNum === undefined &&
    versionNum === undefined;
  const pageData = useMemo(
    () => (hideLegacyNetworksByDefault ? rawPageData.filter((ip) => !isDefaultHiddenLegacyNetwork(ip)) : rawPageData),
    [hideLegacyNetworksByDefault, rawPageData]
  );
  const locationFallback = useMemo(
    () => (showingSuggestedFreeIps ? null : environmentLocations.find((item) => Number(item.id) === locationId) ?? null),
    [environmentLocations, locationId, showingSuggestedFreeIps]
  );
  const pageCursor = useMemo(() => cursorFromDescendingPage(rawPageData), [rawPageData]);
  const hasMore = !showingSuggestedFreeIps && rawPageData.length >= pagination.limit;
  const canNext = pagination.hasForward || (hasMore && pageCursor !== null);
  const canPaginate = !showingSuggestedFreeIps && (pagination.stack.length > 1 || rawPageData.length > 0);

  const activeFilterChips = useMemo(() => {
    const chips: React.ReactNode[] = [];
    if (addr.trim()) {
      const label = prefixNum !== undefined ? `addr:${addr.trim()}/${prefixNum}` : `addr:${addr.trim()}`;
      chips.push(
        <FilterChip
          key="addr"
          label={label}
          onRemove={() => {
            setTextParam('addr', undefined);
            if (prefixNum !== undefined) setTextParam('prefix', undefined);
          }}
          testId="admin.ip_addresses.chip.addr"
        />
      );
    }
    if (!addr.trim() && prefixNum !== undefined) {
      chips.push(<FilterChip key="prefix" label={`prefix:${prefixNum}`} onRemove={() => setTextParam('prefix', undefined)} testId="admin.ip_addresses.chip.prefix" />);
    }
    if (vpsId !== undefined) chips.push(<FilterChip key="vps" label={`vps:#${vpsId}`} onRemove={() => setIntParam('vps', undefined)} testId="admin.ip_addresses.chip.vps" />);
    if (userId !== undefined) chips.push(<FilterChip key="user" label={`user:#${userId}`} onRemove={() => setIntParam('user', undefined)} testId="admin.ip_addresses.chip.user" />);
    if (networkId !== undefined) {
      chips.push(<FilterChip key="network" label={`network:#${networkId}`} onRemove={() => setIntParam('network', undefined)} testId="admin.ip_addresses.chip.network" />);
    }
    if (ifaceId !== undefined) {
      chips.push(
        <FilterChip key="iface" label={`iface:#${ifaceId}`} onRemove={() => setIntParam('network_interface', undefined)} testId="admin.ip_addresses.chip.iface" />
      );
    }
    if (locationId !== undefined) {
      chips.push(
        <FilterChip key="location" label={`location:#${locationId}`} onRemove={() => setIntParam('location', undefined)} testId="admin.ip_addresses.chip.location" />
      );
    }
    if (versionNum !== undefined) {
      chips.push(
        <FilterChip key="version" label={versionNum === 4 ? 'IPv4' : 'IPv6'} onRemove={() => setTextParam('version', undefined)} testId="admin.ip_addresses.chip.version" />
      );
    }
    if (assignedFilterExplicit && assignedToInterface !== undefined) {
      chips.push(
        <FilterChip
          key="assigned"
          label={assignedToInterface ? t('admin.ip_addresses.chip.assigned_true') : t('admin.ip_addresses.chip.assigned_false')}
          onRemove={() => setBoolParamInUrl('assigned_to_interface', undefined)}
          testId="admin.ip_addresses.chip.assigned"
        />
      );
    }

    smartErrors.forEach((error, idx) => {
      chips.push(
        <FilterChip
          key={`err.${idx}`}
          label={error}
          tone="danger"
          onRemove={dismissSmartErrors}
          testId={`admin.ip_addresses.chip.error.${idx}`}
        />
      );
    });

    return chips;
  }, [addr, assignedFilterExplicit, assignedToInterface, dismissSmartErrors, ifaceId, locationId, networkId, prefixNum, setBoolParamInUrl, setIntParam, setTextParam, smartErrors, t, userId, versionNum, vpsId]);

  const shareUrl = useMemo(() => (typeof window !== 'undefined' ? window.location.href : ''), [sp]);
  const hasActiveFilters = filtersActive || smartSearchBlocked;

  return (
    <ListShell
      testId="admin.ip_addresses.page"
      header={
        <PageHeader
          title={t('admin.ip_addresses.title')}
          description={t('admin.ip_addresses.subtitle')}
          meta={
            showingSuggestedFreeIps
              ? <span className="text-xs text-faint">{t('admin.ip_addresses.suggested_free')}</span>
              : hasActiveFilters ? <span className="text-xs text-faint">{t('admin.ip_addresses.filter_hint')}</span> : null
          }
          testId="admin.ip_addresses.list.header"
        />
      }
      filters={
        <IpAddressesFilters
          smart={smart}
          setSmart={setSmart}
          smartErrors={smartErrors}
          clearSmartErrors={clearSmartErrors}
          smartInputRef={smartInputRef}
          smartNeedle={smartNeedle}
          helpOpen={helpOpen}
          setHelpOpen={setHelpOpen}
          advancedOpen={advancedOpen}
          setAdvancedOpen={setAdvancedOpen}
          activeFilterChips={activeFilterChips}
          smartSuggestions={smartSuggestions}
          applySmartText={applySmartText}
          filtersActive={hasActiveFilters}
          shareUrl={shareUrl}
          clearFilters={clearFilters}
          addr={addr}
          prefixNum={prefixNum}
          vpsId={vpsId}
          userLookup={userLookup}
          setUserLookup={setUserLookup}
          networkId={networkId}
          ifaceId={ifaceId}
          locationId={locationId}
          environmentLocations={environmentLocations}
          versionNum={versionNum}
          assignedToInterface={assignedToInterface}
          order={order}
          setTextParam={setTextParam}
          setIntParam={setIntParam}
          setResolvedUserFilter={setResolvedUserFilter}
          setBoolParamInUrl={setBoolParamInUrl}
        />
      }
    >
      {locationsQ.isLoading || activeListLoading ? (
        <LoadingState testId="admin.ip_addresses.loading" />
      ) : locationsQ.isError || activeListError ? (
        <ErrorState
          testId="admin.ip_addresses.error"
          error={locationsQ.error ?? activeListError}
          onRetry={() => {
            void locationsQ.refetch();
            if (showingSuggestedFreeIps) suggested.retryErrors();
            else void listQ.refetch();
          }}
          actions={{
            primary: {
              label: t('common.retry'),
              onClick: () => {
                void locationsQ.refetch();
                if (showingSuggestedFreeIps) suggested.retryErrors();
                else void listQ.refetch();
              },
            },
            secondary: legacyFallbackUrl ? {
              label: t('admin.ip_addresses.open_legacy'),
              href: legacyFallbackUrl,
            } : undefined,
          }}
        />
      ) : pageData.length === 0 ? (
        <EmptyState
          testId="admin.ip_addresses.empty"
          title={hasActiveFilters ? t('empty.list.no_matches.title') : t('admin.ip_addresses.empty')}
          body={hasActiveFilters ? t('empty.list.no_matches.body') : undefined}
          actionLabel={hasActiveFilters ? t('common.clear_filters') : undefined}
          onAction={hasActiveFilters ? clearFilters : undefined}
        />
      ) : (
        <>
          {suggested.partialError ? (
            <Alert
              className="mb-3"
              variant="warn"
              title={t('admin.ip_addresses.suggested_partial_error')}
              testId="admin.ip_addresses.suggested.partial_error"
            >
              <Button
                className="mt-2"
                variant="secondary"
                size="sm"
                onClick={suggested.retryErrors}
                testId="admin.ip_addresses.suggested.retry"
              >
                {t('common.retry')}
              </Button>
            </Alert>
          ) : null}
          {suggested.isLoadingMore ? (
            <div className="mb-3 text-xs text-faint" data-testid="admin.ip_addresses.suggested.loading">
              {t('admin.ip_addresses.suggested_loading')}
            </div>
          ) : null}
          <IpAddressesListMobile
            pageData={pageData}
            ipDetailBasePath={ipDetailBasePath}
            basePath={basePath}
            na={na}
            locationFallback={locationFallback}
            canPaginate={canPaginate}
            pagination={{
              page: pagination.page,
              pageCount: pagination.stack.length,
              canPrev: pagination.canPrev,
              canNext,
              onPrev: pagination.goPrev,
              onNext: () => pagination.goNext(pageCursor),
              onGoToPage: pagination.goToPage,
              limit: pagination.limit,
              allowedLimits: pagination.allowedLimits,
              onLimitChange: pagination.setLimit,
            }}
          />

          <IpAddressesListTable
            pageData={pageData}
            ipDetailBasePath={ipDetailBasePath}
            basePath={basePath}
            na={na}
            locationFallback={locationFallback}
            canPaginate={canPaginate}
            pagination={{
              page: pagination.page,
              pageCount: pagination.stack.length,
              canPrev: pagination.canPrev,
              canNext,
              onPrev: pagination.goPrev,
              onNext: () => pagination.goNext(pageCursor),
              onGoToPage: pagination.goToPage,
              limit: pagination.limit,
              allowedLimits: pagination.allowedLimits,
              onLimitChange: pagination.setLimit,
            }}
          />
        </>
      )}
    </ListShell>
  );
}
