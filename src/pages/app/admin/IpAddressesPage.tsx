import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { useAppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';
import { useToasts } from '../../../app/toasts';

import { fetchIpAddresses, type IpAddress } from '../../../lib/api/ipAddresses';
import { fetchLocations, type Location as InfraLocation } from '../../../lib/api/infra';
import { cursorFromDescendingPage } from '../../../lib/lockIndex';
import { useKeysetPagination } from '../../../lib/hooks/useKeysetPagination';
import { parseNonNegativeInt, parsePositiveInt } from '../../../lib/parse';
import { parseNumericToken, splitKeyValueToken, tokenizeSmartInput, unquoteSmartValue } from '../../../lib/smartFilter';

import { ListShell } from '../../../components/layout/ListShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { FilterChip } from '../../../components/ui/FilterChip';
import { LoadingState } from '../../../components/ui/LoadingState';
import type { SmartFilterSuggestion } from '../../../components/ui/SmartFilterInput';

import { IpAddressesFilters } from './ipAddresses/IpAddressesFilters';
import { IpAddressesListMobile } from './ipAddresses/IpAddressesListMobile';
import { IpAddressesListTable } from './ipAddresses/IpAddressesListTable';
import {
  canonicalKey,
  isDefaultHiddenLegacyNetwork,
  looksLikeIpish,
  parseBoolToken,
  resolveOrderValue,
  resolveVersionValue,
} from './ipAddresses/ipAddressListSemantics';
import {
  collectSuggestedIpCandidates,
  keepSuccessfulSuggestedIpQueries,
  sampleSuggestedIpsByLocationAndType,
  selectSuggestedIpLocations,
  suggestedLocationMaxPages,
  SUGGESTED_IP_QUERY_LIMIT,
} from './ipAddresses/suggestedFreeIps';
import { ipDetailBasePath as resolveIpDetailBasePath, useIpAddressListParams } from './ipAddresses/useIpAddressListParams';
export function IpAddressesPage() {
  const { basePath } = useAppMode();
  const { t } = useI18n();
  const toasts = useToasts();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    searchParams: sp,
    setSearchParams: setSp,
    qText,
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
    setBoolParamInUrl,
    setAddressFilter,
    clearUrlFilters,
    assignedFilterExplicit,
    filtersActive,
  } = useIpAddressListParams();

  const na = t('common.na');

  const ipDetailBasePath = resolveIpDetailBasePath(basePath, location.pathname);

  const [smart, setSmart] = useState('');
  const [smartErrors, setSmartErrors] = useState<string[]>([]);
  const smartNeedle = smart.trim();
  const smartInputRef = useRef<HTMLInputElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [userLookup, setUserLookup] = useState('');

  useEffect(() => {
    if (advancedOpen) return;
    setUserLookup(userId !== undefined ? String(userId) : '');
  }, [advancedOpen, userId]);

  useEffect(() => {
    if (smartNeedle === '?') setHelpOpen(true);
  }, [smartNeedle]);

  const clearFilters = () => {
    setSmart('');
    setSmartErrors([]);
    clearUrlFilters();
  };

  const pagination = useKeysetPagination({
    id: 'admin.ip_addresses.list',
    filterKey: JSON.stringify({
      q: qText.trim(),
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
    staleTime: 60_000,
  });

  const environmentLocations = useMemo(() => (locationsQ.data ?? []) as InfraLocation[], [locationsQ.data]);
  const suggestedLocations = useMemo(
    () => selectSuggestedIpLocations(environmentLocations),
    [environmentLocations]
  );
  const showingSuggestedFreeIps = !filtersActive && suggestedLocations.length > 0;

  const suggestedQ = useQuery({
    queryKey: ['ip_addresses', 'suggested_free', suggestedLocations.map((item) => item.id)],
    queryFn: async () => {
      const pages = await keepSuccessfulSuggestedIpQueries(
        suggestedLocations.flatMap((suggestedLocation) => ([4, 6] as const).map((version) => async () => ({
          locationId: suggestedLocation.id,
          data: await collectSuggestedIpCandidates({
            version,
            locationId: suggestedLocation.id,
            maxPages: suggestedLocationMaxPages(suggestedLocation),
            fetchPage: async (fromId) => (
              await fetchIpAddresses({
                limit: SUGGESTED_IP_QUERY_LIMIT,
                fromId,
                location: suggestedLocation.id,
                version,
                user: null,
                assignedToInterface: false,
                order: 'asc',
                purpose: 'vps',
                includes: 'network__primary_location__environment,network_interface,vps,user,charged_environment',
              })
            ).data,
          }),
        })))
      );

      const byLocation = new Map<number, IpAddress[]>();
      pages.forEach((page) => {
        byLocation.set(page.locationId, [...(byLocation.get(page.locationId) ?? []), ...page.data]);
      });

      return sampleSuggestedIpsByLocationAndType(
        suggestedLocations.map((suggestedLocation) => ({
          locationId: suggestedLocation.id,
          items: byLocation.get(suggestedLocation.id) ?? [],
        }))
      );
    },
    staleTime: 10_000,
    enabled: showingSuggestedFreeIps,
  });

  const listQ = useQuery({
    queryKey: [
      'ip_addresses',
      'index',
      {
        limit: pagination.limit,
        fromId: pagination.fromId,
        q: qText.trim() || undefined,
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
          q: qText.trim() || undefined,
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
    enabled: !locationsQ.isLoading && !showingSuggestedFreeIps,
  });

  const activeListQ = showingSuggestedFreeIps ? suggestedQ : listQ;
  const rawPageData = activeListQ.data ?? [];
  const hideLegacyNetworksByDefault = networkId === undefined && !qText.trim() && !addr.trim() && prefixNum === undefined && versionNum === undefined;
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

  const openIp = (ipId: number) => navigate(`${ipDetailBasePath}/${ipId}`);

  const applySmartText = (raw: string) => {
    const input = String(raw ?? '').trim();
    if (!input) return;

    if (input === '?') {
      setHelpOpen(true);
      return;
    }

    const tokens = tokenizeSmartInput(input);

    if (tokens.length === 1) {
      const num = parseNumericToken(tokens[0] ?? '');
      if (num) {
        openIp(num);
        setSmart('');
        setSmartErrors([]);
        return;
      }
    }

    const plain: string[] = [];
    const errors: string[] = [];

    tokens.forEach((token) => {
      const kv = splitKeyValueToken(token);
      if (!kv) {
        plain.push(unquoteSmartValue(token));
        return;
      }

      const key = canonicalKey(kv.rawKey);
      if (!key) {
        plain.push(unquoteSmartValue(token));
        return;
      }

      const valueRaw = unquoteSmartValue(kv.rawValue);
      if (!valueRaw.trim()) {
        errors.push(t('filters.smart.error.missing_value', { key: kv.rawKey.trim() }));
        return;
      }

      switch (key) {
        case 'id': {
          const id = parseNumericToken(valueRaw);
          if (!id) errors.push(t('admin.ip_addresses.smart.error.id', { value: valueRaw }));
          else openIp(id);
          return;
        }
        case 'q':
          setTextParam('q', valueRaw);
          return;
        case 'addr': {
          const match = valueRaw.trim().match(/^(.+?)\/(\d+)$/);
          if (match && match[1] && match[2]) {
            setAddressFilter(match[1], match[2]);
          } else {
            setAddressFilter(valueRaw.trim());
          }
          return;
        }
        case 'prefix': {
          const prefix = parseNonNegativeInt(valueRaw);
          if (prefix === undefined || prefix < 0 || prefix > 128) errors.push(t('admin.ip_addresses.smart.error.prefix', { value: valueRaw }));
          else setTextParam('prefix', String(prefix));
          return;
        }
        case 'vps':
        case 'user':
        case 'network':
        case 'iface':
        case 'location': {
          const id = parsePositiveInt(valueRaw);
          if (!id) {
            errors.push(t('admin.ip_addresses.smart.error.int', { key, value: valueRaw }));
            return;
          }
          const targetKey = key === 'iface' ? 'network_interface' : key;
          setIntParam(targetKey, id);
          return;
        }
        case 'version': {
          const version = resolveVersionValue(valueRaw);
          if (!version) errors.push(t('admin.ip_addresses.smart.error.version', { value: valueRaw }));
          else setTextParam('version', String(version));
          return;
        }
        case 'assigned': {
          const parsed = parseBoolToken(valueRaw);
          if (parsed === null) errors.push(t('admin.ip_addresses.smart.error.bool', { key: 'assigned', value: valueRaw }));
          else setBoolParamInUrl('assigned_to_interface', parsed);
          return;
        }
        case 'order': {
          const parsed = resolveOrderValue(valueRaw);
          if (!parsed) errors.push(t('admin.ip_addresses.smart.error.order', { value: valueRaw }));
          else setTextParam('order', parsed === 'desc' ? undefined : parsed);
          return;
        }
      }
    });

    const qPlain = plain.join(' ').trim();
    if (qPlain) {
      const match = qPlain.match(/^(.+?)\/(\d+)$/);
      if (match && match[1] && (match[1].includes('.') || match[1].includes(':'))) setTextParam('q', match[1]);
      else setTextParam('q', qPlain);
    }

    setSmart('');
    setSmartErrors(errors);
    if (errors.length > 0) {
      toasts.pushToast({ variant: 'danger', title: errors[0] ?? t('common.unknown_error') });
    }
  };

  const smartSuggestions: SmartFilterSuggestion[] = useMemo(() => {
    const suggestions: SmartFilterSuggestion[] = [];
    if (!smartNeedle) return suggestions;

    if (smartNeedle === '?') {
      suggestions.push({
        id: 'help',
        primary: t('filters.help.open'),
        secondary: t('filters.help.suggestion.secondary'),
        onPick: () => setHelpOpen(true),
        testId: 'admin.ip_addresses.smart.suggest.help',
      });
      return suggestions;
    }

    const tokens = tokenizeSmartInput(smartNeedle);
    if (tokens.length === 1) {
      const kv = splitKeyValueToken(tokens[0] ?? '');
      if (kv && canonicalKey(kv.rawKey)) return suggestions;
    }

    const num = parseNumericToken(smartNeedle);
    if (num) {
      suggestions.push({
        id: 'open',
        primary: t('admin.ip_addresses.smart.suggest.open', { id: num }),
        secondary: t('admin.ip_addresses.smart.suggest.open.secondary'),
        onPick: () => {
          openIp(num);
          setSmart('');
          setSmartErrors([]);
        },
        testId: 'admin.ip_addresses.smart.suggest.open',
      });
    }

    if (looksLikeIpish(smartNeedle)) {
      const match = smartNeedle.match(/^(.+?)\/(\d+)$/);
      const q = match && match[1] ? match[1] : smartNeedle;
      const prefix = match && match[2] ? match[2] : null;

      suggestions.push({
        id: 'search',
        primary: t('admin.ip_addresses.smart.suggest.search', { q }),
        secondary: t('admin.ip_addresses.smart.suggest.search.secondary'),
        onPick: () => {
          setTextParam('q', q);
          setSmart('');
          setSmartErrors([]);
        },
        testId: 'admin.ip_addresses.smart.suggest.search',
      });

      suggestions.push({
        id: 'addr',
        primary: prefix
          ? t('admin.ip_addresses.smart.suggest.addr_prefix', { addr: q, prefix })
          : t('admin.ip_addresses.smart.suggest.addr', { addr: q }),
        secondary: t('admin.ip_addresses.smart.suggest.addr.secondary'),
        onPick: () => {
          setTextParam('addr', q);
          setTextParam('prefix', prefix || undefined);
          setSmart('');
          setSmartErrors([]);
        },
        testId: 'admin.ip_addresses.smart.suggest.addr',
      });
    }

    return suggestions;
  }, [openIp, setTextParam, smartNeedle, t]);

  const activeFilterChips = useMemo(() => {
    const chips: React.ReactNode[] = [];
    if (qText.trim()) {
      chips.push(<FilterChip key="q" label={`q:${qText.trim()}`} onRemove={() => setTextParam('q', undefined)} testId="admin.ip_addresses.chip.q" />);
    }
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
          onRemove={() => setSmartErrors([])}
          testId={`admin.ip_addresses.chip.error.${idx}`}
        />
      );
    });

    return chips;
  }, [addr, assignedFilterExplicit, assignedToInterface, ifaceId, locationId, networkId, prefixNum, qText, setBoolParamInUrl, setIntParam, setTextParam, smartErrors, t, userId, versionNum, vpsId]);

  const shareUrl = useMemo(() => (typeof window !== 'undefined' ? window.location.href : ''), [sp]);

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
              : filtersActive ? <span className="text-xs text-faint">{t('admin.ip_addresses.filter_hint')}</span> : null
          }
          testId="admin.ip_addresses.list.header"
        />
      }
      filters={
        <IpAddressesFilters
          smart={smart}
          setSmart={setSmart}
          smartErrors={smartErrors}
          clearSmartErrors={() => setSmartErrors([])}
          smartInputRef={smartInputRef}
          smartNeedle={smartNeedle}
          helpOpen={helpOpen}
          setHelpOpen={setHelpOpen}
          advancedOpen={advancedOpen}
          setAdvancedOpen={setAdvancedOpen}
          activeFilterChips={activeFilterChips}
          smartSuggestions={smartSuggestions}
          applySmartText={applySmartText}
          filtersActive={filtersActive}
          shareUrl={shareUrl}
          clearFilters={clearFilters}
          qText={qText}
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
          setBoolParamInUrl={setBoolParamInUrl}
        />
      }
    >
      {locationsQ.isLoading || activeListQ.isLoading ? (
        <LoadingState testId="admin.ip_addresses.loading" />
      ) : locationsQ.isError || activeListQ.isError ? (
        <ErrorState
          testId="admin.ip_addresses.error"
          error={locationsQ.error ?? activeListQ.error}
          onRetry={() => {
            void locationsQ.refetch();
            void activeListQ.refetch();
          }}
          actions={{
            primary: {
              label: t('common.retry'),
              onClick: () => {
                void locationsQ.refetch();
                void activeListQ.refetch();
              },
            },
            secondary: {
              label: t('admin.ip_addresses.open_legacy'),
              href: `${basePath}/ip-addresses`,
            },
          }}
        />
      ) : pageData.length === 0 ? (
        <EmptyState
          testId="admin.ip_addresses.empty"
          title={filtersActive ? t('empty.list.no_matches.title') : t('admin.ip_addresses.empty')}
          body={filtersActive ? t('empty.list.no_matches.body') : undefined}
          actionLabel={filtersActive ? t('common.clear_filters') : undefined}
          onAction={filtersActive ? clearFilters : undefined}
        />
      ) : (
        <>
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
