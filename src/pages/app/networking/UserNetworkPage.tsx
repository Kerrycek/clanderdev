import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '../../../app/auth';
import { useAppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';
import { useObjectScope } from '../../../app/objectScope';
import { ListShell } from '../../../components/layout/ListShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { clsx } from '../../../components/ui/clsx';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { LoadingState } from '../../../components/ui/LoadingState';
import { Select } from '../../../components/ui/Select';
import { StatusDot } from '../../../components/ui/StatusDot';
import { TableCard } from '../../../components/ui/TableCard';
import type { ResourceRef } from '../../../lib/api/appTypes';
import { fetchIpAddresses, type IpAddress } from '../../../lib/api/ipAddresses';
import type { NetworkInterface } from '../../../lib/api/networkInterfaces';
import {
  fetchIpAddressAssignments,
  type IpAddressAssignment,
} from '../../../lib/api/networking';
import { fetchVpsList } from '../../../lib/api/vps';
import { AssignIpAddressModal } from './AssignIpAddressModal';
import {
  assignableIpKind,
  ipAddressLabel,
  isAssignedIp,
  isOwnedByUser,
  resourceId,
  type AssignableIpKind,
  uniqueIpAddresses,
} from './IpAddressAssignmentModel';
import { UserNetworkTrafficCard } from './UserNetworkTrafficCard';
import { UserNetworkLiveCard } from './UserNetworkLiveCard';

type KindFilter = 'all' | AssignableIpKind;
type NetworkTab = 'addresses' | 'traffic' | 'live';

interface ScopedIpAddress {
  ip: IpAddress;
  vpsId: number | null;
}

function assignmentIpAddress(assignment: IpAddressAssignment): ScopedIpAddress | null {
  const source = assignment.ip_address;
  if (!source || typeof source !== 'object' || !resourceId(source)) return null;

  const embedded = source as IpAddress & { ip_addr?: string };
  const assignmentVps = assignment.vps ?? embedded.vps;
  const networkInterface = embedded.network_interface;
  const expandedInterface = networkInterface && typeof networkInterface === 'object'
    ? { ...networkInterface, vps: (networkInterface as NetworkInterface).vps ?? assignmentVps }
    : networkInterface;
  const ip: IpAddress = {
    ...embedded,
    addr: embedded.addr ?? embedded.ip_addr ?? assignment.ip_addr,
    prefix: embedded.prefix ?? assignment.ip_prefix,
    vps: embedded.vps ?? assignmentVps,
    network_interface: expandedInterface,
  };

  return {
    ip,
    vpsId: resourceId(assignmentVps) ?? ipVpsId(ip),
  };
}

async function fetchAssignedIpAddresses(userId?: number): Promise<ScopedIpAddress[]> {
  const assignments = (
    await fetchIpAddressAssignments({
      limit: 250,
      user: userId,
      active: true,
      order: 'newest',
      includes:
        'ip_address__network__primary_location__environment,' +
        'ip_address__network_interface__vps,user,vps',
    })
  ).data;
  const seen = new Set<number>();
  return assignments.flatMap((assignment) => {
    const scoped = assignmentIpAddress(assignment);
    if (!scoped || seen.has(scoped.ip.id)) return [];
    seen.add(scoped.ip.id);
    return [scoped];
  });
}

function interfaceId(ip: IpAddress): number | null {
  return resourceId(ip.network_interface as ResourceRef | number | string | null | undefined);
}

function interfaceName(ip: IpAddress): string {
  const networkInterface = ip.network_interface as NetworkInterface | ResourceRef | null | undefined;
  if (!networkInterface || typeof networkInterface !== 'object') return '—';
  return String((networkInterface as NetworkInterface).name ?? '').trim() || (interfaceId(ip) ? `#${interfaceId(ip)}` : '—');
}

function ipVpsId(ip: IpAddress): number | null {
  const direct = resourceId(ip.vps as ResourceRef | number | string | null | undefined);
  if (direct) return direct;
  const networkInterface = ip.network_interface as NetworkInterface | ResourceRef | null | undefined;
  if (!networkInterface || typeof networkInterface !== 'object') return null;
  return resourceId((networkInterface as NetworkInterface).vps);
}

function locationLabel(ip: IpAddress): string {
  const primary = ip.network?.primary_location;
  const location = String(primary?.label ?? '').trim();
  const environment = String(primary?.environment?.label ?? '').trim();
  if (location && environment) return `${location} · ${environment}`;
  return location || environment || '—';
}

function kindTranslationKey(kind: AssignableIpKind) {
  if (kind === 'ipv4_private') return 'network.user.kind.ipv4_private' as const;
  if (kind === 'ipv6') return 'network.user.kind.ipv6' as const;
  return 'network.user.kind.ipv4_public' as const;
}

function NetworkTabButton(props: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={props.active}
      className={clsx(
        'inline-flex min-h-10 items-center rounded-md px-4 py-2 text-sm font-medium transition',
        props.active
          ? 'bg-surface-2 text-fg ring-1 ring-border'
          : 'text-muted hover:bg-surface-2 hover:text-fg'
      )}
      onClick={props.onClick}
      data-testid={props.testId}
    >
      {props.children}
    </button>
  );
}

export function UserNetworkPage() {
  const auth = useAuth();
  const { basePath } = useAppMode();
  const { t } = useI18n();
  const scope = useObjectScope();
  const [searchParams, setSearchParams] = useSearchParams();
  const userId = resourceId(auth.user?.id as number | string | undefined);
  const scopedUserId = scope.mineUserId;
  const requestedTab = searchParams.get('tab');
  const activeTab: NetworkTab = requestedTab === 'traffic' || requestedTab === 'live'
    ? requestedTab
    : 'addresses';
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [assignOpen, setAssignOpen] = useState(false);
  const [initialIp, setInitialIp] = useState<IpAddress | null>(null);

  const vpsesQ = useQuery({
    queryKey: ['vps', 'list', 'user-network', { userId, limit: 250 }],
    queryFn: async () => (
      await fetchVpsList({
        limit: 250,
        user: scopedUserId,
        includes: 'node__location__environment,user',
      })
    ).data,
    enabled: activeTab === 'addresses',
    staleTime: 10_000,
  });

  const assignedQ = useQuery({
    queryKey: ['ip_address_assignment', 'user-network', 'active', { userId, scopedUserId }],
    queryFn: () => fetchAssignedIpAddresses(scopedUserId),
    enabled: activeTab === 'addresses' && userId !== null,
    staleTime: 5_000,
  });

  const detachedQ = useQuery({
    queryKey: ['ip_address', 'user-network', 'detached-owned', { userId }],
    queryFn: async () => (
      await fetchIpAddresses({
        limit: 250,
        assignedToInterface: false,
        user: scopedUserId,
        includes: 'network__primary_location__environment,network_interface__vps,user',
      })
    ).data,
    enabled: activeTab === 'addresses' && userId !== null,
    staleTime: 5_000,
  });

  const vpsById = useMemo(() => new Map((vpsesQ.data ?? []).map((vps) => [vps.id, vps])), [vpsesQ.data]);
  const assignedVpsByIpId = useMemo(
    () => new Map((assignedQ.data ?? []).map(({ ip, vpsId }) => [ip.id, vpsId])),
    [assignedQ.data]
  );
  const assignedIpIds = useMemo(
    () => new Set((assignedQ.data ?? []).map(({ ip }) => ip.id)),
    [assignedQ.data]
  );

  const rows = useMemo(() => {
    // Results fetched through a user's VPS are authoritative even when the
    // API omits the nested network_interface.vps relation from the response.
    const assigned = (assignedQ.data ?? [])
      .filter(({ vpsId }) => vpsId === null || vpsById.has(vpsId))
      .map(({ ip }) => ip);
    const detached = (detachedQ.data ?? []).filter((ip) => isOwnedByUser(ip, userId));
    const visible = uniqueIpAddresses([...assigned, ...detached]);
    if (kindFilter === 'all') return visible;
    return visible.filter((ip) => assignableIpKind(ip) === kindFilter);
  }, [assignedQ.data, detachedQ.data, kindFilter, userId, vpsById]);

  const ownedDetachedIps = useMemo(
    () => (detachedQ.data ?? []).filter((ip) => isOwnedByUser(ip, userId)),
    [detachedQ.data, userId]
  );

  const loading = vpsesQ.isLoading || assignedQ.isLoading || (detachedQ.isLoading && rows.length === 0);
  const error = vpsesQ.error ?? assignedQ.error ?? (rows.length === 0 ? detachedQ.error : null);

  const openAssignment = (ip?: IpAddress) => {
    setInitialIp(ip ?? null);
    setAssignOpen(true);
  };

  const selectTab = (tab: NetworkTab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'addresses') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next);
  };

  const refresh = () => {
    void vpsesQ.refetch();
    void assignedQ.refetch();
    void detachedQ.refetch();
  };

  const rowActions = (ip: IpAddress) => {
    const vpsId = assignedVpsByIpId.get(ip.id) ?? ipVpsId(ip);
    if ((assignedIpIds.has(ip.id) || isAssignedIp(ip)) && vpsId) {
      return (
        <Button to={`${basePath}/vps/${vpsId}/network`} variant="secondary" size="sm">
          {t('network.user.action.open_vps')}
        </Button>
      );
    }
    return (
      <Button
        variant="primary"
        size="sm"
        testId={`network.user.ip.${ip.id}.assign`}
        onClick={() => openAssignment(ip)}
      >
        {t('network.user.action.assign')}
      </Button>
    );
  };

  return (
    <ListShell
      testId="network.user.page"
      header={
        <PageHeader
          title={t('network.user.title')}
          description={t('network.user.subtitle')}
          testId="network.user.header"
          actions={activeTab === 'addresses' ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={refresh}>{t('common.refresh')}</Button>
              <Button variant="primary" testId="network.user.add" onClick={() => openAssignment()}>
                {t('network.user.action.add')}
              </Button>
            </div>
          ) : undefined}
        />
      }
      filters={
        <div className="space-y-4">
          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label={t('network.user.tabs.aria')}
            data-testid="network.user.tabs"
          >
            <NetworkTabButton
              active={activeTab === 'addresses'}
              onClick={() => selectTab('addresses')}
              testId="network.user.tab.addresses"
            >
              {t('network.user.tab.addresses')}
            </NetworkTabButton>
            <NetworkTabButton
              active={activeTab === 'traffic'}
              onClick={() => selectTab('traffic')}
              testId="network.user.tab.traffic"
            >
              {t('network.user.tab.traffic')}
            </NetworkTabButton>
            <NetworkTabButton
              active={activeTab === 'live'}
              onClick={() => selectTab('live')}
              testId="network.user.tab.live"
            >
              {t('network.user.tab.live')}
            </NetworkTabButton>
          </div>

          {activeTab === 'addresses' ? (
            <Card>
              <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,240px)_1fr] sm:items-end">
                <Select
                  label={t('network.user.filter.kind')}
                  testId="network.user.filter.kind"
                  value={kindFilter}
                  onChange={(event) => setKindFilter(event.target.value as KindFilter)}
                  options={[
                    { value: 'all', label: t('network.user.filter.kind.all') },
                    { value: 'ipv4_public', label: t('network.user.kind.ipv4_public') },
                    { value: 'ipv4_private', label: t('network.user.kind.ipv4_private') },
                    { value: 'ipv6', label: t('network.user.kind.ipv6') },
                  ]}
                />
                <div className="text-sm text-muted">{t('network.user.scope_hint')}</div>
              </div>
            </Card>
          ) : null}
        </div>
      }
    >
      {activeTab === 'traffic' ? (
        <UserNetworkTrafficCard userId={userId} isAdmin={scopedUserId !== undefined} />
      ) : null}

      {activeTab === 'live' ? (
        <UserNetworkLiveCard userId={userId} isAdmin={scopedUserId !== undefined} />
      ) : null}

      {activeTab === 'addresses' && (loading ? (
        <LoadingState testId="network.user.loading" />
      ) : error ? (
        <ErrorState error={error} testId="network.user.error" onRetry={refresh} />
      ) : rows.length === 0 ? (
        <EmptyState
          testId="network.user.empty"
          title={kindFilter === 'all' ? t('network.user.empty') : t('network.user.empty_filtered')}
          body={t('network.user.empty_body')}
          actionLabel={t('network.user.action.add')}
          onAction={() => openAssignment()}
        />
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {rows.map((ip) => {
              const vpsId = assignedVpsByIpId.get(ip.id) ?? ipVpsId(ip);
              const vps = vpsId ? vpsById.get(vpsId) : undefined;
              const assigned = assignedIpIds.has(ip.id) || isAssignedIp(ip);
              return (
                <Card key={ip.id} testId={`network.user.ip.card.${ip.id}`}>
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <StatusDot variant={assigned ? 'ok' : 'warn'} />
                        <span className="break-all font-mono font-semibold">{ipAddressLabel(ip)}</span>
                      </div>
                      <Badge variant={assignableIpKind(ip) === 'ipv4_private' ? 'neutral' : 'info'}>
                        {t(kindTranslationKey(assignableIpKind(ip)))}
                      </Badge>
                    </div>
                    <div className="grid gap-1 text-xs text-muted">
                      <span>{t('network.user.field.location')}: {locationLabel(ip)}</span>
                      <span>{t('network.user.field.vps')}: {vps?.hostname ?? (vpsId ? `#${vpsId}` : '—')}</span>
                      <span>{t('network.user.field.interface')}: {interfaceName(ip)}</span>
                    </div>
                    <div className="flex justify-end">{rowActions(ip)}</div>
                  </div>
                </Card>
              );
            })}
          </div>

          <TableCard className="hidden md:block" minWidth="md" tableTestId="network.user.table">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="w-8 px-4 py-2" aria-label={t('common.state')} />
                <th className="px-4 py-2">{t('network.user.field.address')}</th>
                <th className="px-4 py-2">{t('network.user.field.type')}</th>
                <th className="px-4 py-2">{t('network.user.field.location')}</th>
                <th className="px-4 py-2">{t('network.user.field.vps')}</th>
                <th className="px-4 py-2">{t('network.user.field.interface')}</th>
                <th className="px-4 py-2 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((ip) => {
                const vpsId = assignedVpsByIpId.get(ip.id) ?? ipVpsId(ip);
                const vps = vpsId ? vpsById.get(vpsId) : undefined;
                const assigned = assignedIpIds.has(ip.id) || isAssignedIp(ip);
                return (
                  <tr key={ip.id} data-testid={`network.user.ip.row.${ip.id}`} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3"><StatusDot variant={assigned ? 'ok' : 'warn'} /></td>
                    <td className="px-4 py-3 font-mono text-sm font-medium">{ipAddressLabel(ip)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={assignableIpKind(ip) === 'ipv4_private' ? 'neutral' : 'info'}>
                        {t(kindTranslationKey(assignableIpKind(ip)))}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted">{locationLabel(ip)}</td>
                    <td className="px-4 py-3 text-sm">
                      {vpsId ? (
                        <Link className="text-accent hover:underline" to={`${basePath}/vps/${vpsId}`}>
                          {vps?.hostname ?? `#${vpsId}`}
                        </Link>
                      ) : <span className="text-faint">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted">{interfaceName(ip)}</td>
                    <td className="px-4 py-3 text-right">{rowActions(ip)}</td>
                  </tr>
                );
              })}
            </tbody>
          </TableCard>
        </>
      ))}

      {activeTab === 'addresses' ? <AssignIpAddressModal
        open={assignOpen}
        availableVpses={vpsesQ.data ?? []}
        initialIp={initialIp}
        ownedDetachedIps={ownedDetachedIps}
        onClose={() => {
          setAssignOpen(false);
          setInitialIp(null);
        }}
        onAssigned={refresh}
      /> : null}
    </ListShell>
  );
}
