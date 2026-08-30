import React, { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';
import { useToasts } from '../../../app/toasts';
import { DetailShell } from '../../../components/layout/DetailShell';
import { fetchEnvironments } from '../../../lib/api/infra';
import {
  assignIpAddressRoute,
  assignIpAddressRouteWithHostAddress,
  fetchIpAddress,
  freeIpAddressRoute,
  updateIpAddress,
} from '../../../lib/api/ipAddresses';
import { fetchNetworkInterfaces } from '../../../lib/api/networkInterfaces';
import {
  assignHostIpAddress,
  createHostIpAddress,
  deleteHostIpAddress,
  fetchHostIpAddresses,
  freeHostIpAddress,
  updateHostIpAddress,
  type HostIpAddress,
} from '../../../lib/api/networking';
import { formatDateTime } from '../../../lib/format';

import { ActionButton } from '../../../components/ui/ActionButton';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { LinkButton } from '../../../components/ui/LinkButton';
import { CopyButton } from '../../../components/ui/CopyButton';
import { Button } from '../../../components/ui/Button';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Input } from '../../../components/ui/Input';
import { LoadingState } from '../../../components/ui/LoadingState';
import { Modal } from '../../../components/ui/Modal';
import { ObjectHeader } from '../../../components/ui/ObjectHeader';
import { Select } from '../../../components/ui/Select';
import { Table } from '../../../components/ui/Table';
import { Textarea } from '../../../components/ui/Textarea';
import { UserLookupInput } from '../../../components/ui/UserLookupInput';
import { VpsLookupInput } from '../../../components/ui/VpsLookupInput';
import { HostIpAddressRowActions } from './ipAddresses/HostIpAddressRowActions';

function parseIdParam(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function idFromResourceRef(v: any): number | null {
  if (!v) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === 'object') {
    if (typeof v.id === 'number') return v.id;
    if (typeof v.id === 'string') {
      const n = Number(v.id);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

function labelFromResourceRef(v: any, fields: string[] = ['label', 'name', 'hostname', 'login', 'addr']): string {
  if (!v) return '—';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    for (const field of fields) {
      const raw = v[field];
      if (raw !== undefined && raw !== null && String(raw).trim()) return String(raw);
    }
    const id = idFromResourceRef(v);
    if (id) return `#${id}`;
  }
  return '—';
}

function parsePositiveId(raw: string): number | null {
  const n = Number(raw.trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

function hostAddr(row: HostIpAddress): string {
  return String((row as any).addr ?? (row as any).ip_addr ?? `#${row.id}`);
}

export function IpAddressDetailPage() {
  const { basePath } = useAppMode();
  const { t } = useI18n();
  const { pushToast } = useToasts();
  const qc = useQueryClient();
  const params = useParams();
  const location = useLocation();
  const ipId = parseIdParam(params['ipAddressId']);
  const [routeOpen, setRouteOpen] = useState(false);
  const [routeVps, setRouteVps] = useState<number | null>(null);
  const [routeInterface, setRouteInterface] = useState('');
  const [routeVia, setRouteVia] = useState('');
  const [routeWithHost, setRouteWithHost] = useState(false);
  const [confirmFreeRoute, setConfirmFreeRoute] = useState(false);
  const [ownerUser, setOwnerUser] = useState('');
  const [ownerEnvironment, setOwnerEnvironment] = useState('');
  const [createHostsOpen, setCreateHostsOpen] = useState(false);
  const [createHostsValue, setCreateHostsValue] = useState('');
  const [ptrEditor, setPtrEditor] = useState<HostIpAddress | null>(null);
  const [ptrValue, setPtrValue] = useState('');
  const [deleteHost, setDeleteHost] = useState<HostIpAddress | null>(null);
  const [assignHost, setAssignHost] = useState<HostIpAddress | null>(null);
  const [assignHostVps, setAssignHostVps] = useState<number | null>(null);
  const [assignHostInterface, setAssignHostInterface] = useState('');

  const q = useQuery({
    queryKey: ['ip_addresses', ipId],
    queryFn: async () => {
      if (!ipId) throw new Error(t('admin.ip.invalid_id'));
      return (await fetchIpAddress(ipId, { includes: 'network,user,network_interface,network_interface.vps,route_via' })).data;
    },
    enabled: Boolean(ipId),
    staleTime: 30_000,
  });

  const ip = q.data ?? null;
  const hostAddrsQ = useQuery({
    queryKey: ['host_ip_addresses', 'by_ip', ipId],
    queryFn: async () => (await fetchHostIpAddresses({ ipAddress: ipId as number, limit: 250 })).data,
    enabled: Boolean(ipId && ip),
  });
  const netifsQ = useQuery({
    queryKey: ['network_interface', 'list', { vpsId: routeVps, limit: 100 }],
    queryFn: async () => (await fetchNetworkInterfaces(routeVps as number, { limit: 100 })).data,
    enabled: routeOpen && Boolean(routeVps),
  });
  const hostAssignNetifsQ = useQuery({
    queryKey: ['network_interface', 'host-ip-assign', { vpsId: assignHostVps, limit: 100 }],
    queryFn: async () => (await fetchNetworkInterfaces(assignHostVps as number, { limit: 100 })).data,
    enabled: Boolean(assignHost && assignHostVps),
  });
  const environmentsQ = useQuery({
    queryKey: ['environments', 'ip-owner'],
    queryFn: async () => (await fetchEnvironments({ limit: 250 })).data,
    staleTime: 60_000,
  });
  const isLoading = Boolean(ipId) && q.isLoading;
  const isError = Boolean(ipId) && (q.isError || !ip);

  useEffect(() => {
    if (!ip || !location.hash) return;

    const target = document.getElementById(location.hash.slice(1));
    if (!target) return;

    window.setTimeout(() => {
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 0);
  }, [ip, location.hash]);

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['ip_addresses'] }),
      qc.invalidateQueries({ queryKey: ['host_ip_addresses'] }),
      qc.invalidateQueries({ queryKey: ['ip_address_assignments'] }),
      q.refetch(),
      hostAddrsQ.refetch(),
    ]);
  };

  const assignRouteM = useMutation({
    mutationFn: async () => {
      if (!ipId) throw new Error(t('admin.ip.invalid_id'));
      const networkInterface = parsePositiveId(routeInterface);
      if (!networkInterface) throw new Error(t('admin.ip.route.validation.interface'));
      const via = routeVia.trim() ? parsePositiveId(routeVia) : null;
      if (routeVia.trim() && !via) throw new Error(t('admin.ip.route.validation.route_via'));

      if (routeWithHost) {
        return assignIpAddressRouteWithHostAddress(ipId, { network_interface: networkInterface });
      }
      return assignIpAddressRoute(ipId, { network_interface: networkInterface, route_via: via });
    },
    onSuccess: async () => {
      setRouteOpen(false);
      setRouteVps(null);
      setRouteInterface('');
      setRouteVia('');
      setRouteWithHost(false);
      await invalidate();
      pushToast({ variant: 'ok', title: t('admin.ip.route.toast.assigned') });
    },
  });

  const freeRouteM = useMutation({
    mutationFn: async () => {
      if (!ipId) throw new Error(t('admin.ip.invalid_id'));
      return freeIpAddressRoute(ipId);
    },
    onSuccess: async () => {
      setConfirmFreeRoute(false);
      await invalidate();
      pushToast({ variant: 'ok', title: t('admin.ip.route.toast.freed') });
    },
  });

  const updateOwnerM = useMutation({
    mutationFn: async () => {
      if (!ipId) throw new Error(t('admin.ip.invalid_id'));
      const user = ownerUser.trim() ? parsePositiveId(ownerUser) : null;
      if (ownerUser.trim() && !user) throw new Error(t('admin.ip.owner.validation.user'));
      const payload: Record<string, unknown> = { user };
      if (user) {
        const environment = parsePositiveId(ownerEnvironment);
        if (!environment) throw new Error(t('admin.ip.owner.validation.environment'));
        payload['environment'] = environment;
      }
      return updateIpAddress(ipId, payload);
    },
    onSuccess: async () => {
      setOwnerUser('');
      setOwnerEnvironment('');
      await invalidate();
      pushToast({ variant: 'ok', title: t('admin.ip.owner.toast.saved') });
    },
  });

  const createHostsM = useMutation({
    mutationFn: async () => {
      if (!ipId) throw new Error(t('admin.ip.invalid_id'));
      const addrs = createHostsValue.split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
      if (addrs.length === 0) throw new Error(t('admin.ip.hosts.validation.empty'));
      for (const addr of addrs) {
        await createHostIpAddress({ ip_address: ipId, addr });
      }
      return addrs.length;
    },
    onSuccess: async (count) => {
      setCreateHostsOpen(false);
      setCreateHostsValue('');
      await invalidate();
      pushToast({ variant: 'ok', title: t('admin.ip.hosts.toast.created', { count }) });
    },
  });

  const updatePtrM = useMutation({
    mutationFn: async () => {
      if (!ptrEditor) throw new Error(t('admin.ip.hosts.validation.missing'));
      return updateHostIpAddress(ptrEditor.id, { reverse_record_value: ptrValue.trim() });
    },
    onSuccess: async () => {
      setPtrEditor(null);
      setPtrValue('');
      await invalidate();
      pushToast({ variant: 'ok', title: t('admin.ip.hosts.toast.ptr_saved') });
    },
  });

  const hostAssignM = useMutation({
    mutationFn: async () => {
      if (!assignHost) throw new Error(t('admin.ip.hosts.validation.missing'));
      const networkInterface = parsePositiveId(assignHostInterface);
      if (!networkInterface) throw new Error(t('admin.ip.route.validation.interface'));
      return assignHostIpAddress(assignHost.id, { network_interface: networkInterface });
    },
    onSuccess: async () => {
      setAssignHost(null);
      setAssignHostVps(null);
      setAssignHostInterface('');
      await invalidate();
      pushToast({ variant: 'ok', title: t('admin.ip.hosts.toast.assigned') });
    },
  });

  const hostFreeM = useMutation({
    mutationFn: async (hostId: number) => freeHostIpAddress(hostId),
    onSuccess: async () => {
      await invalidate();
      pushToast({ variant: 'ok', title: t('admin.ip.hosts.toast.freed') });
    },
  });

  const hostDeleteM = useMutation({
    mutationFn: async () => {
      if (!deleteHost) throw new Error(t('admin.ip.hosts.validation.missing'));
      return deleteHostIpAddress(deleteHost.id);
    },
    onSuccess: async () => {
      setDeleteHost(null);
      await invalidate();
      pushToast({ variant: 'ok', title: t('admin.ip.hosts.toast.deleted') });
    },
  });

  const anyMutationError = assignRouteM.error || freeRouteM.error || updateOwnerM.error || createHostsM.error || updatePtrM.error || hostAssignM.error || hostFreeM.error || hostDeleteM.error;

  return (
    <DetailShell testId="admin.ip_address.page">
      {!ipId ? (
        <ErrorState
          testId="admin.ip_address.invalid_id"
          kindOverride="not_found"
          title={t('admin.ip.invalid_id')}
          body={t('error.not_found.body')}
          backTo={`${basePath}/ip-addresses`}
          showStatusLink={false}
          showDetails={false}
          detailsExtra={{ page: 'admin.ip_address.detail', ipId: null }}
        />
      ) : isLoading ? (
        <LoadingState testId="admin.ip_address.loading" />
      ) : isError ? (
        <ErrorState
          testId="admin.ip_address.error"
          title={t('admin.ip.load_error')}
          error={q.error}
          onRetry={() => void q.refetch()}
          backTo={`${basePath}/ip-addresses`}
          detailsExtra={{ page: 'admin.ip_address.detail', ipId }}
        />
      ) : ip ? (
        <>
          {(() => {
            const addr = String((ip as any).addr ?? '').trim() || `#${(ip as any).id}`;
            const prefix = typeof (ip as any).prefix === 'number' ? (ip as any).prefix : undefined;
            const network = (ip as any).network;
            const networkStr =
              network && (network.address || network.id)
                ? `${network.address ?? ''}${network.prefix ? '/' + network.prefix : ''}`.trim()
                : undefined;

            const vpsId = idFromResourceRef((ip as any).vps);
            const userId = idFromResourceRef((ip as any).user);
            const netifId = idFromResourceRef((ip as any).network_interface);
            const routed = Boolean((ip as any).routed || netifId);
            const hostRows = hostAddrsQ.data ?? [];

            const title = `${addr}${prefix ? `/${prefix}` : ''}`;

            return (
              <>
                <ObjectHeader
                  testId="admin.ip_address.header"
                  title={title}
                  titleAfter={
                    <>
                      <Badge variant="neutral">#{(ip as any).id}</Badge>
                      {routed ? <Badge variant="black">{t('admin.ip.routed_badge')}</Badge> : null}
                    </>
                  }
                  kicker={
                    <>
                      <Link className="underline" to={`${basePath}/ip-addresses`}>
                        {t('admin.ip_addresses.title')}
                      </Link>
                      <span className="text-faint"> · </span>
                      <span>#{(ip as any).id}</span>
                    </>
                  }
                  meta={networkStr ? networkStr : ' '}
                  actions={
                    <>
                      <CopyButton text={title} />
                      {vpsId ? (
                        <LinkButton
                          to={`${basePath}/vps/${vpsId}`}
                          variant="secondary"
                          testId="admin.ip.action.vps"
                          title={t('common.open_vps')}
                        >
                          {t('object_kind.vps')} #{vpsId}
                        </LinkButton>
                      ) : null}
                      {userId ? (
                        <LinkButton
                          to={`${basePath}/users/${userId}`}
                          variant="secondary"
                          testId="admin.ip.action.user"
                          title={t('admin.ip.open_user')}
                        >
                          {t('admin.ip.open_user')} #{userId}
                        </LinkButton>
                      ) : null}
                      <Button testId="admin.ip_address.refresh" variant="secondary" onClick={() => void q.refetch()}>
                        {t('common.refresh')}
                      </Button>
                    </>
                  }
                />

                <Card testId="admin.ip_address.details.card">
                  <CardHeader title={t('common.details')} />
                  <CardBody>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <div className="text-xs text-muted">{t('admin.ip.field.network')}</div>
                        <div className="text-sm">{networkStr || t('common.na')}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted">{t('admin.ip.field.routed')}</div>
                        <div className="text-sm">{routed ? t('common.yes') : t('common.no')}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted">{t('admin.ip.field.user_id')}</div>
                        <div className="text-sm">{userId ?? t('common.na')}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted">{t('admin.ip.field.vps_id')}</div>
                        <div className="text-sm">{vpsId ?? t('common.na')}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted">{t('admin.ip.field.interface')}</div>
                        <div className="text-sm">{labelFromResourceRef((ip as any).network_interface)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted">{t('admin.ip.field.route_via')}</div>
                        <div className="text-sm">{labelFromResourceRef((ip as any).route_via, ['addr', 'ip_addr', 'label', 'name'])}</div>
                      </div>
                      {(ip as any).created_at ? (
                        <div>
                          <div className="text-xs text-muted">{t('admin.ip.field.created')}</div>
                          <div className="text-sm">{formatDateTime((ip as any).created_at)}</div>
                        </div>
                      ) : null}
                    </div>
                  </CardBody>
                </Card>

                {anyMutationError ? (
                  <Alert variant="danger" title={t('admin.ip.action_error')}>
                    {String((anyMutationError as any)?.message ?? anyMutationError)}
                  </Alert>
                ) : null}

                <Card testId="admin.ip_address.route.card" className="scroll-mt-24" id="route">
                  <CardHeader
                    title={t('admin.ip.route.title')}
                    subtitle={t('admin.ip.route.subtitle')}
                    actions={
                      <div className="flex flex-wrap gap-2">
                        {routed ? (
                          <ActionButton
                            variant="danger"
                            testId="admin.ip.route.free"
                            loading={freeRouteM.isPending}
                            onClick={() => setConfirmFreeRoute(true)}
                          >
                            {t('admin.ip.route.free')}
                          </ActionButton>
                        ) : (
                          <Button
                            variant="primary"
                            testId="admin.ip.route.assign.open"
                            onClick={() => {
                              setRouteOpen(true);
                              setRouteVps(null);
                              setRouteInterface('');
                              setRouteVia('');
                              setRouteWithHost(false);
                            }}
                          >
                            {t('admin.ip.route.assign')}
                          </Button>
                        )}
                      </div>
                    }
                  />
                  <CardBody>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <div className="text-xs text-muted">{t('admin.ip.field.interface')}</div>
                        <div className="text-sm">{labelFromResourceRef((ip as any).network_interface)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted">{t('admin.ip.field.vps_id')}</div>
                        <div className="text-sm">{vpsId ?? t('common.na')}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted">{t('admin.ip.field.route_via')}</div>
                        <div className="text-sm">{labelFromResourceRef((ip as any).route_via, ['addr', 'ip_addr', 'label', 'name'])}</div>
                      </div>
                    </div>
                  </CardBody>
                </Card>

                <Card testId="admin.ip_address.owner.card" className="scroll-mt-24" id="owner">
                  <CardHeader title={t('admin.ip.owner.title')} subtitle={t('admin.ip.owner.subtitle')} />
                  <CardBody className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
                    <label className="block">
                      <div className="mb-1 text-sm font-medium">{t('admin.ip.owner.user')}</div>
                      <UserLookupInput value={ownerUser} onChange={setOwnerUser} placeholder={userId ? `#${userId}` : t('admin.ip.owner.unassigned')} allowRawId />
                    </label>
                    <label className="block">
                      <div className="mb-1 text-sm font-medium">{t('admin.ip.owner.environment')}</div>
                      <Select
                        value={ownerEnvironment}
                        onChange={(e) => setOwnerEnvironment(e.target.value)}
                        disabled={environmentsQ.isLoading}
                        options={[
                          { value: '', label: t('admin.ip.owner.environment.placeholder') },
                          ...(environmentsQ.data ?? []).map((env: any) => ({
                            value: String(env.id),
                            label: String(env.label ?? env.name ?? `#${env.id}`),
                          })),
                        ]}
                      />
                    </label>
                    <ActionButton loading={updateOwnerM.isPending} disabled={!ownerUser.trim() && !userId} onClick={() => updateOwnerM.mutate()}>
                      {ownerUser.trim() ? t('admin.ip.owner.save') : t('admin.ip.owner.clear')}
                    </ActionButton>
                  </CardBody>
                </Card>

                <Card testId="admin.ip_address.hosts.card" className="relative min-w-0 max-w-full overflow-x-hidden scroll-mt-24" id="hosts">
                  <CardHeader
                    title={t('admin.ip.hosts.title')}
                    subtitle={t('admin.ip.hosts.subtitle')}
                    actions={
                      <Button variant="primary" testId="admin.ip.hosts.create.open" onClick={() => setCreateHostsOpen(true)}>
                        {t('admin.ip.hosts.create')}
                      </Button>
                    }
                  />
                  <CardBody>
                    {hostAddrsQ.isLoading ? (
                      <LoadingState testId="admin.ip.hosts.loading" />
                    ) : hostAddrsQ.isError ? (
                      <ErrorState title={t('admin.ip.hosts.load_error')} error={hostAddrsQ.error} />
                    ) : hostRows.length === 0 ? (
                      <div className="text-sm text-muted">{t('admin.ip.hosts.empty')}</div>
                    ) : (
                      <div className="max-w-full overflow-x-auto">
                        <Table testId="admin.ip.hosts.table" minWidth="md">
                        <thead>
                          <tr>
                            <th>{t('admin.ip.hosts.field.address')}</th>
                            <th>{t('admin.ip.hosts.field.ptr')}</th>
                            <th>{t('admin.ip.hosts.field.assigned')}</th>
                            <th>{t('admin.ip.hosts.field.flags')}</th>
                            <th><span className="sr-only">{t('common.actions')}</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          {hostRows.map((host) => (
                            <tr key={host.id} data-testid={`admin.ip.hosts.row.${host.id}`}>
                              <td className="font-mono text-sm">{hostAddr(host)}</td>
                              <td className="max-w-80 truncate">{String((host as any).reverse_record_value ?? t('common.na'))}</td>
                              <td>{host.assigned === false ? t('common.no') : t('common.yes')}</td>
                              <td>
                                <div className="flex flex-wrap gap-1">
                                  {(host as any).user_created ? <Badge tone="neutral">{t('common.custom')}</Badge> : null}
                                  {host.assigned === false ? <Badge tone="warn">{t('common.unassigned')}</Badge> : <Badge tone="ok">{t('common.assigned')}</Badge>}
                                </div>
                              </td>
                              <td className="text-right">
                                <HostIpAddressRowActions
                                  assigned={host.assigned !== false}
                                  userCreated={Boolean((host as any).user_created)}
                                  testIdPrefix={`admin.ip.hosts.row.${host.id}`}
                                  assignLoading={hostAssignM.isPending}
                                  freeLoading={hostFreeM.isPending}
                                  onEditPtr={() => {
                                    setPtrEditor(host);
                                    setPtrValue(String((host as any).reverse_record_value ?? ''));
                                  }}
                                  onAssign={() => {
                                    setAssignHost(host);
                                    setAssignHostVps(null);
                                    setAssignHostInterface('');
                                  }}
                                  onFree={() => hostFreeM.mutate(host.id)}
                                  onDelete={() => setDeleteHost(host)}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        </Table>
                      </div>
                    )}
                  </CardBody>
                </Card>

                <Modal
                  open={routeOpen}
                  title={t('admin.ip.route.assign_title')}
                  onClose={() => setRouteOpen(false)}
                  footer={
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => setRouteOpen(false)} disabled={assignRouteM.isPending}>{t('common.cancel')}</Button>
                      <ActionButton loading={assignRouteM.isPending} disabled={!routeInterface.trim()} onClick={() => assignRouteM.mutate()}>
                        {t('admin.ip.route.assign')}
                      </ActionButton>
                    </div>
                  }
                >
                  <div className="space-y-4">
                    <label className="block">
                      <div className="mb-1 text-sm font-medium">{t('admin.ip.route.vps')}</div>
                      <VpsLookupInput value={routeVps} onChange={setRouteVps} placeholder={t('admin.ip.route.vps.placeholder')} />
                    </label>
                    <label className="block">
                      <div className="mb-1 text-sm font-medium">{t('admin.ip.route.interface')}</div>
                      <Select
                        value={routeInterface}
                        onChange={(e) => setRouteInterface(e.target.value)}
                        disabled={!routeVps || netifsQ.isLoading}
                        options={[
                          { value: '', label: t('admin.ip.route.interface.placeholder') },
                          ...(netifsQ.data ?? []).map((ni: any) => ({
                            value: String(ni.id),
                            label: `${ni.name ?? `#${ni.id}`} (#${ni.id})`,
                          })),
                        ]}
                      />
                    </label>
                    {!routeWithHost ? (
                      <label className="block">
                        <div className="mb-1 text-sm font-medium">{t('admin.ip.route.route_via')}</div>
                        <Input value={routeVia} onChange={(e) => setRouteVia(e.target.value)} placeholder={t('admin.ip.route.route_via.placeholder')} />
                      </label>
                    ) : null}
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={routeWithHost}
                        onChange={(e) => {
                          setRouteWithHost(e.target.checked);
                          if (e.target.checked) setRouteVia('');
                        }}
                        className="mt-1 h-4 w-4"
                      />
                      <span>
                        <span className="font-medium">{t('admin.ip.route.with_host')}</span>
                        <span className="block text-xs text-muted">{t('admin.ip.route.with_host_help')}</span>
                      </span>
                    </label>
                  </div>
                </Modal>

                <Modal
                  open={createHostsOpen}
                  title={t('admin.ip.hosts.create_title')}
                  onClose={() => setCreateHostsOpen(false)}
                  footer={
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => setCreateHostsOpen(false)} disabled={createHostsM.isPending}>{t('common.cancel')}</Button>
                      <ActionButton loading={createHostsM.isPending} disabled={!createHostsValue.trim()} onClick={() => createHostsM.mutate()}>
                        {t('admin.ip.hosts.create')}
                      </ActionButton>
                    </div>
                  }
                >
                  <Textarea rows={6} value={createHostsValue} onChange={(e) => setCreateHostsValue(e.target.value)} placeholder={t('admin.ip.hosts.create_placeholder')} />
                  <div className="mt-1 text-xs text-muted">{t('admin.ip.hosts.create_help')}</div>
                </Modal>

                <Modal
                  open={Boolean(ptrEditor)}
                  title={t('admin.ip.hosts.ptr_title')}
                  onClose={() => setPtrEditor(null)}
                  footer={
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => setPtrEditor(null)} disabled={updatePtrM.isPending}>{t('common.cancel')}</Button>
                      <ActionButton loading={updatePtrM.isPending} onClick={() => updatePtrM.mutate()}>
                        {t('common.save')}
                      </ActionButton>
                    </div>
                  }
                >
                  <label className="block">
                    <div className="mb-1 text-sm font-medium">{ptrEditor ? hostAddr(ptrEditor) : ''}</div>
                    <Input value={ptrValue} onChange={(e) => setPtrValue(e.target.value)} placeholder="host.example.org." />
                  </label>
                  <div className="mt-1 text-xs text-muted">{t('admin.ip.hosts.ptr_help')}</div>
                </Modal>

                <Modal
                  open={Boolean(assignHost)}
                  title={t('admin.ip.hosts.assign_title')}
                  onClose={() => setAssignHost(null)}
                  footer={
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => setAssignHost(null)} disabled={hostAssignM.isPending}>{t('common.cancel')}</Button>
                      <ActionButton loading={hostAssignM.isPending} disabled={!assignHostInterface.trim()} onClick={() => hostAssignM.mutate()}>
                        {t('admin.ip.hosts.assign')}
                      </ActionButton>
                    </div>
                  }
                >
                  <div className="space-y-4">
                    <label className="block">
                      <div className="mb-1 text-sm font-medium">{t('admin.ip.route.vps')}</div>
                      <VpsLookupInput value={assignHostVps} onChange={setAssignHostVps} placeholder={t('admin.ip.route.vps.placeholder')} />
                    </label>
                    <label className="block">
                      <div className="mb-1 text-sm font-medium">{t('admin.ip.route.interface')}</div>
                      <Select
                        value={assignHostInterface}
                        onChange={(e) => setAssignHostInterface(e.target.value)}
                        disabled={!assignHostVps || hostAssignNetifsQ.isLoading}
                        options={[
                          { value: '', label: t('admin.ip.route.interface.placeholder') },
                          ...(hostAssignNetifsQ.data ?? []).map((ni: any) => ({
                            value: String(ni.id),
                            label: `${ni.name ?? `#${ni.id}`} (#${ni.id})`,
                          })),
                        ]}
                      />
                    </label>
                    <div className="text-xs text-muted">{t('admin.ip.hosts.assign_help')}</div>
                  </div>
                </Modal>

                <ConfirmDialog
                  open={confirmFreeRoute}
                  title={t('admin.ip.route.free_confirm.title')}
                  description={t('admin.ip.route.free_confirm.desc', { ip: title })}
                  danger
                  confirmLabel={t('admin.ip.route.free')}
                  confirmLoading={freeRouteM.isPending}
                  onCancel={() => setConfirmFreeRoute(false)}
                  onConfirm={() => freeRouteM.mutate()}
                />

                <ConfirmDialog
                  open={Boolean(deleteHost)}
                  title={t('admin.ip.hosts.delete_confirm.title')}
                  description={deleteHost ? t('admin.ip.hosts.delete_confirm.desc', { host: hostAddr(deleteHost) }) : undefined}
                  danger
                  confirmLabel={t('common.delete')}
                  confirmLoading={hostDeleteM.isPending}
                  onCancel={() => setDeleteHost(null)}
                  onConfirm={() => hostDeleteM.mutate()}
                />
              </>
            );
          })()}
        </>
      ) : null}
    </DetailShell>
  );
}
