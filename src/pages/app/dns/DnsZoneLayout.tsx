import React from 'react';
import { Link, Outlet, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { useAppMode } from '../../../app/appMode';
import { useObjectScope } from '../../../app/objectScope';
import { useI18n } from '../../../app/i18n';
import { fetchDnsZone } from '../../../lib/api/dns';
import { objectRef } from '../../../lib/objectRef';

import { ErrorState } from '../../../components/ui/ErrorState';
import { LoadingState } from '../../../components/ui/LoadingState';
import { Badge } from '../../../components/ui/Badge';
import { LockBadge } from '../../../components/ui/LockBadge';
import { LockStateStaleAlert } from '../../../components/ui/LockStateStaleAlert';
import { ObjectHeader } from '../../../components/ui/ObjectHeader';
import { TabsNav } from '../../../components/ui/TabsNav';

import { useChrome } from '../../../components/layout/ChromeContext';
import { DetailShell } from '../../../components/layout/DetailShell';

import { DnsZoneContextProvider } from './DnsZoneContext';
import { DnsZoneRecentTransactionsCard } from './DnsZoneRecentTransactionsCard';
import { ScopeMismatchCard } from '../../../components/layout/ScopeMismatchCard';
import { useDnsZoneTransactionChains } from './useDnsZoneTransactionChains';
import { isSecondaryDnsZone } from './DnsZoneModel';

function zoneTitle(z: any): string {
  return String(z?.name ?? z?.label ?? `Zone #${z?.id}`);
}

function zoneRoleLabel(t: (key: string) => string, role: unknown): string {
  const value = String(role ?? '');
  if (value === 'forward_role') return t('dns.zones.role.forward');
  if (value === 'reverse_role') return t('dns.zones.role.reverse');
  return value.replace(/[_-]+/g, ' ');
}

export function DnsZoneLayout() {
  const { basePath } = useAppMode();
  const scope = useObjectScope();
  const { t } = useI18n();
  const chrome = useChrome();
  const location = useLocation();
  const params = useParams();
  const zoneId = Number(params['zoneId']);

  const tx = useDnsZoneTransactionChains(zoneId);

  const zoneQ = useQuery({
    queryKey: ['dns_zones', 'show', zoneId],
    queryFn: async () => (await fetchDnsZone(zoneId)).data,
    enabled: Number.isFinite(zoneId) && zoneId > 0,
  });

  if (!Number.isFinite(zoneId) || zoneId <= 0) {
    return (
      <ErrorState
        testId="dns.zone.invalid_id"
        kindOverride="not_found"
        title={t('dns.zone.layout.invalid_id')}
        body={t('error.not_found.body')}
        backTo={`${basePath}/dns`}
        showStatusLink={false}
        showDetails={false}
        detailsExtra={{ page: 'dns.zone.detail', zoneId }}
      />
    );
  }

  if (zoneQ.isLoading) return <LoadingState testId="dns.zone.loading" label={t('dns.zone.layout.loading')} />;

  if (zoneQ.isError) {
    return (
      <ErrorState
        testId="dns.zone.error"
        title={t('dns.zone.layout.load_failed')}
        error={zoneQ.error}
        onRetry={() => void zoneQ.refetch()}
        backTo={`${basePath}/dns`}
        detailsExtra={{ page: 'dns.zone.detail', zoneId, scope: scope.scope }}
      />
    );
  }

  const zone = zoneQ.data!;
  const zoneRef = objectRef('DnsZone', zone.id);
  const busyLocalLock = chrome.isLocallyLocked(zoneRef);

  const ownerId = typeof zone.user?.id === 'number' ? zone.user.id : undefined;

  if (
    scope.mineUserId !== undefined &&
    ownerId !== undefined &&
    Number.isFinite(scope.mineUserId) &&
    ownerId !== scope.mineUserId
  ) {
    const adminHref = location.pathname.replace(/^\/app\b/, '/admin') + location.search + location.hash;
    return (
      <ScopeMismatchCard
        objectKind={t('object_kind.dns_zone')}
        objectLabel={zoneTitle(zone)}
        ownerUserId={ownerId}
        adminHref={adminHref}
        backHref={`${basePath}/dns`}
        testId="dns.scope-mismatch"
      />
    );
  }

  const secondaryZone = isSecondaryDnsZone(zone);
  const tabs = secondaryZone
    ? [
        { label: t('dns.zone.tabs.transfers'), to: `${basePath}/dns/zones/${zone.id}/transfers` },
        { label: t('dns.zone.tabs.servers'), to: `${basePath}/dns/zones/${zone.id}/servers` },
        { label: t('dns.zone.tabs.settings'), to: `${basePath}/dns/zones/${zone.id}/settings` },
      ]
    : [
        { label: t('dns.zone.tabs.records'), to: `${basePath}/dns/zones/${zone.id}`, end: true },
        { label: t('dns.zone.tabs.transfers'), to: `${basePath}/dns/zones/${zone.id}/transfers` },
        { label: t('dns.zone.tabs.dnssec'), to: `${basePath}/dns/zones/${zone.id}/dnssec` },
        { label: t('dns.zone.tabs.servers'), to: `${basePath}/dns/zones/${zone.id}/servers` },
        { label: t('dns.zone.tabs.settings'), to: `${basePath}/dns/zones/${zone.id}/settings` },
        { label: t('dns.zone.tabs.logs'), to: `${basePath}/dns/zones/${zone.id}/logs` },
      ];

  return (
    <DnsZoneContextProvider
      value={{
        zone,
        refetch: () => void zoneQ.refetch(),
        zoneRef,
        busyLocalLock,
        chains: tx.chains,
        chainsLoading: tx.chainsLoading,
        chainsError: tx.chainsError,
        busyTransaction: tx.busyTransaction,
        chainsStale: tx.chainsStale,
        activeChainIds: tx.activeChainIds,
        concernClasses: tx.concernClasses,
        refetchChains: tx.refetch,
      }}
    >
      <DetailShell>
        <ObjectHeader
          testId="dns.zone.header"
          kicker={
            <>
              <Link to={`${basePath}/dns`} className="text-accent hover:underline">
                {t('dns.zones.page.title')}
              </Link>
              <span className="text-faint"> · </span>
              <span>#{zone.id}</span>
            </>
          }
          title={zoneTitle(zone)}
          badges={
            <>
              {tx.busyTransaction ? (
                <LockBadge
                  kind="transaction"
                  t={t}
                  chainIds={tx.activeChainIds}
                  showDetails
                />
              ) : busyLocalLock ? (
                <LockBadge kind="local" t={t} />
              ) : null}

              {zone.enabled === true ? (
                <Badge variant="ok">{t('common.enabled')}</Badge>
              ) : (
                <Badge variant="warn">{t('common.disabled')}</Badge>
              )}
              {zone.dnssec_enabled === true ? (
                <Badge variant="ok">{t('dns.zones.badge.dnssec')}</Badge>
              ) : (
                <Badge variant="neutral">{t('dns.zones.badge.no_dnssec')}</Badge>
              )}
              {secondaryZone ? <Badge variant="info">{t('dns.zones.source.external')}</Badge> : null}
              {zone.role ? <Badge variant="neutral">{zoneRoleLabel(t, zone.role)}</Badge> : null}
            </>
          }
          right={
            <div className="text-sm text-muted">
              <div className="text-xs">{t('dns.zones.field.serial')}</div>
              <div className="font-medium text-fg">{typeof zone.serial === 'number' ? zone.serial : t('common.na')}</div>
            </div>
          }
          tabs={<TabsNav items={tabs} />}
        />

        {tx.chainsStale ? (
          <LockStateStaleAlert chainIds={tx.activeChainIds} error={tx.chainsError} onRetry={tx.refetch} />
        ) : null}

        <Outlet />

        <div className="mt-6">
          <DnsZoneRecentTransactionsCard />
        </div>
      </DetailShell>
    </DnsZoneContextProvider>
  );
}
