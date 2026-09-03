import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import { useI18n } from '../../../../app/i18n';
import { useToasts } from '../../../../app/toasts';
import {
  assignHostIpAddress,
  deleteHostIpAddress,
  fetchHostIpAddresses,
  freeHostIpAddress,
  updateHostIpAddress,
  type HostIpAddress,
} from '../../../../lib/api/networking';
import { fetchNetworkInterfaces } from '../../../../lib/api/networkInterfaces';
import { useKeysetPagination } from '../../../../lib/hooks/useKeysetPagination';
import { cursorFromDescendingPage } from '../../../../lib/lockIndex';
import { parseBoolParam, parsePositiveInt } from '../../../../lib/parse';
import { ListShell } from '../../../../components/layout/ListShell';
import { PageHeader } from '../../../../components/layout/PageHeader';
import { FilterBar } from '../../../../components/layout/FilterBar';
import { Button } from '../../../../components/ui/Button';
import { ActionButton } from '../../../../components/ui/ActionButton';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { ErrorState } from '../../../../components/ui/ErrorState';
import { Input } from '../../../../components/ui/Input';
import { KeysetPagination } from '../../../../components/ui/KeysetPagination';
import { LoadingState } from '../../../../components/ui/LoadingState';
import { Modal } from '../../../../components/ui/Modal';
import { Select } from '../../../../components/ui/Select';
import { StatusDot } from '../../../../components/ui/StatusDot';
import { TableCard } from '../../../../components/ui/TableCard';
import { Badge } from '../../../../components/ui/Badge';
import { clsx } from '../../../../components/ui/clsx';
import { UserLookupInput } from '../../../../components/ui/UserLookupInput';
import { VpsLookupInput } from '../../../../components/ui/VpsLookupInput';
import { toneSurfaceClass } from '../../../../components/ui/tone';
import { HostIpAddressRowActions } from '../ipAddresses/HostIpAddressRowActions';

function idOf(v: any): number | null {
  if (!v) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && typeof v.id === 'number') return v.id;
  return null;
}

function ipAddrLabel(row: HostIpAddress): string {
  const ip = (row as any).ip_address;
  if (ip && typeof ip === 'object') {
    const addr = String((ip as any).ip_addr ?? (ip as any).addr ?? '').trim();
    if (addr) return addr;
  }
  return '—';
}

function vpsLabel(row: HostIpAddress): string {
  const ni = (row as any).ip_address?.network_interface;
  const vps = ni && typeof ni === 'object' ? (ni as any).vps : undefined;
  if (vps && typeof vps === 'object') {
    const hostname = String((vps as any).hostname ?? '').trim();
    const id = idOf(vps);
    if (hostname && id) return `${hostname} (#${id})`;
    if (hostname) return hostname;
    if (id) return `#${id}`;
  }
  return '—';
}

function userLabel(row: HostIpAddress): string {
  const user = (row as any).ip_address?.user;
  if (user && typeof user === 'object') {
    const login = String((user as any).login ?? '').trim();
    const id = idOf(user);
    if (login && id) return `${login} (#${id})`;
    if (login) return login;
    if (id) return `#${id}`;
  }
  return '—';
}

function ifaceLabel(row: HostIpAddress): string {
  const iface = (row as any).ip_address?.network_interface;
  if (iface && typeof iface === 'object') {
    const name = String((iface as any).name ?? '').trim();
    const id = idOf(iface);
    if (name && id) return `${name} (#${id})`;
    if (name) return name;
    if (id) return `#${id}`;
  }
  return '—';
}

function rowVariant(row: HostIpAddress): 'warn' | undefined {
  return row.assigned === false ? 'warn' : undefined;
}

function hostAddr(row: HostIpAddress): string {
  return String((row as any).addr ?? (row as any).ip_addr ?? `#${row.id}`);
}

function isDefaultHiddenLegacyHostIp(row: HostIpAddress): boolean {
  const address = `${hostAddr(row)} ${ipAddrLabel(row)}`.toLowerCase();
  return (
    address.startsWith('83.167.228.') ||
    address.includes(' 83.167.228.') ||
    address.startsWith('2a01:430:17:') ||
    address.includes(' 2a01:430:17:')
  );
}

export function HostIpAddressesPage() {
  const { t } = useI18n();
  const { pushToast } = useToasts();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const [ptrEditor, setPtrEditor] = useState<HostIpAddress | null>(null);
  const [ptrValue, setPtrValue] = useState('');
  const [deleteHost, setDeleteHost] = useState<HostIpAddress | null>(null);
  const [assignHost, setAssignHost] = useState<HostIpAddress | null>(null);
  const [assignVps, setAssignVps] = useState<number | null>(null);
  const [assignInterface, setAssignInterface] = useState('');

  const q = String(sp.get('q') ?? '').trim();
  const userId = parsePositiveInt(sp.get('user'));
  const vpsId = parsePositiveInt(sp.get('vps'));
  const assigned = parseBoolParam(sp.get('assigned'));
  const limit = parsePositiveInt(sp.get('limit')) ?? 50;

  const paging = useKeysetPagination({
    id: 'admin.host_ip_addresses.list',
    filterKey: JSON.stringify({ q, userId, vpsId, assigned }),
    searchParams: sp,
    setSearchParams: setSp,
    defaultLimit: limit,
    allowedLimits: [25, 50, 100],
  });

  const listQ = useQuery({
    queryKey: ['host_ip_addresses', 'list', { q, userId, vpsId, assigned, limit: paging.limit, fromId: paging.cursor ?? null }],
    queryFn: async () =>
      (await fetchHostIpAddresses({ q: q || undefined, user: userId, vps: vpsId, assigned, limit: paging.limit, fromId: paging.cursor ?? undefined })).data,
    placeholderData: (prev) => prev,
  });

  const netifsQ = useQuery({
    queryKey: ['network_interface', 'host-ip-assign', { vpsId: assignVps, limit: 100 }],
    queryFn: async () => (await fetchNetworkInterfaces(assignVps as number, { limit: 100 })).data,
    enabled: Boolean(assignHost && assignVps),
  });

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['host_ip_addresses'] }),
      qc.invalidateQueries({ queryKey: ['ip_addresses'] }),
      qc.invalidateQueries({ queryKey: ['ip_address_assignments'] }),
      listQ.refetch(),
    ]);
  };

  const updatePtrM = useMutation({
    mutationFn: async () => {
      if (!ptrEditor) throw new Error(t('admin.host_ip_addresses.action.error_missing'));
      return updateHostIpAddress(ptrEditor.id, { reverse_record_value: ptrValue.trim() });
    },
    onSuccess: async () => {
      setPtrEditor(null);
      setPtrValue('');
      await refresh();
      pushToast({ variant: 'ok', title: t('admin.host_ip_addresses.toast.ptr_saved') });
    },
  });

  const assignM = useMutation({
    mutationFn: async () => {
      if (!assignHost) throw new Error(t('admin.host_ip_addresses.action.error_missing'));
      const networkInterface = Number(assignInterface.trim());
      if (!Number.isInteger(networkInterface) || networkInterface <= 0) throw new Error(t('admin.host_ip_addresses.assign.interface_required'));
      return assignHostIpAddress(assignHost.id, { network_interface: networkInterface });
    },
    onSuccess: async () => {
      setAssignHost(null);
      setAssignVps(null);
      setAssignInterface('');
      await refresh();
      pushToast({ variant: 'ok', title: t('admin.host_ip_addresses.toast.assigned') });
    },
  });

  const freeM = useMutation({
    mutationFn: async (hostId: number) => freeHostIpAddress(hostId),
    onSuccess: async () => {
      await refresh();
      pushToast({ variant: 'ok', title: t('admin.host_ip_addresses.toast.freed') });
    },
  });

  const deleteM = useMutation({
    mutationFn: async () => {
      if (!deleteHost) throw new Error(t('admin.host_ip_addresses.action.error_missing'));
      return deleteHostIpAddress(deleteHost.id);
    },
    onSuccess: async () => {
      setDeleteHost(null);
      await refresh();
      pushToast({ variant: 'ok', title: t('admin.host_ip_addresses.toast.deleted') });
    },
  });

  const filtersActive = Boolean(q || userId || vpsId || assigned !== undefined);
  const rawRows = listQ.data ?? [];
  const rows = useMemo(
    () => (filtersActive ? rawRows : rawRows.filter((row) => !isDefaultHiddenLegacyHostIp(row))),
    [filtersActive, rawRows]
  );
  const nextCursor = cursorFromDescendingPage(rows, (r) => Number((r as any).id));
  const canNext = Boolean(nextCursor);

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(sp);
    if (value && value.trim()) next.set(key, value.trim());
    else next.delete(key);
    ['from_id', 'page'].forEach((k) => next.delete(k));
    setSp(next);
  };

  const clearFilters = () => {
    const next = new URLSearchParams();
    next.set('limit', String(paging.limit));
    setSp(next);
  };

  return (
    <ListShell
      testId="admin.host_ip_addresses.page"
      header={<PageHeader title={t('admin.host_ip_addresses.title')} description={t('admin.host_ip_addresses.subtitle')} />}
      filters={
        <FilterBar
          left={
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-full max-w-sm">
                <Input testId="admin.host_ip_addresses.filter.q" value={q} onChange={(e) => setParam('q', e.target.value)} placeholder={t('admin.host_ip_addresses.filter.q.placeholder')} />
              </div>
              <div className="w-64">
                <UserLookupInput testId="admin.host_ip_addresses.filter.user" value={userId ? String(userId) : ''} onChange={(v) => setParam('user', v)} placeholder={t('admin.host_ip_addresses.filter.user.placeholder')} />
              </div>
              <div className="w-64">
                <VpsLookupInput testId="admin.host_ip_addresses.filter.vps" value={vpsId ?? null} onChange={(v) => setParam('vps', v == null ? '' : String(v))} placeholder={t('admin.host_ip_addresses.filter.vps.placeholder')} />
              </div>
            </div>
          }
          right={
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-40">
                <Select
                  testId="admin.host_ip_addresses.filter.assigned"
                  value={assigned === undefined ? 'all' : assigned ? 'true' : 'false'}
                  onChange={(e) => setParam('assigned', e.target.value === 'all' ? '' : e.target.value)}
                  options={[
                    { value: 'all', label: t('admin.host_ip_addresses.filter.assigned.all') },
                    { value: 'true', label: t('admin.host_ip_addresses.filter.assigned.true') },
                    { value: 'false', label: t('admin.host_ip_addresses.filter.assigned.false') },
                  ]}
                />
              </div>
              {filtersActive ? <Button variant="secondary" testId="admin.host_ip_addresses.filter.clear" onClick={clearFilters}>{t('common.clear_filters')}</Button> : null}
            </div>
          }
        />
      }
    >
      {listQ.isLoading ? <LoadingState /> : listQ.isError ? <ErrorState title={t('admin.host_ip_addresses.load_error')} /> : rows.length === 0 ? (
        <EmptyState title={t('admin.host_ip_addresses.empty')} />
      ) : (
        <TableCard
          testId="admin.host_ip_addresses.table"
          className="relative min-w-0 max-w-full overflow-x-hidden"
          footer={<KeysetPagination testId="admin.host_ip_addresses.pagination" page={paging.page} pageCount={paging.pageCount} canPrev={paging.canPrev} canNext={canNext} onPrev={paging.goPrev} onNext={() => paging.goNext(nextCursor ?? null)} onGoToPage={paging.goToPage} limit={paging.limit} onLimitChange={paging.setLimit} />}
        >
          <thead>
            <tr>
              <th aria-label={t('common.state')} />
              <th>{t('admin.host_ip_addresses.field.address')}</th>
              <th>{t('admin.host_ip_addresses.field.route')}</th>
              <th>{t('admin.host_ip_addresses.field.interface')}</th>
              <th>{t('admin.host_ip_addresses.field.vps')}</th>
              <th>{t('admin.host_ip_addresses.field.user')}</th>
              <th>{t('admin.host_ip_addresses.field.ptr')}</th>
              <th>{t('admin.host_ip_addresses.field.flags')}</th>
              <th><span className="sr-only">{t('common.actions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const id = Number((row as any).id);
              const variant = rowVariant(row);
              return (
                <tr key={id} data-testid={`admin.host_ip_addresses.row.${id}`} data-row-variant={variant} className={clsx(variant ? toneSurfaceClass(variant) : undefined)}>
                  <td><StatusDot variant={variant ?? 'ok'} testId={`admin.host_ip_addresses.row.${id}.dot`} /></td>
                  <td className="font-medium tabular-nums">{String((row as any).addr ?? `#${id}`)}</td>
                  <td className="tabular-nums">{ipAddrLabel(row)}</td>
                  <td>{ifaceLabel(row)}</td>
                  <td>{vpsLabel(row)}</td>
                  <td>{userLabel(row)}</td>
                  <td className="max-w-80 truncate">{String((row as any).reverse_record_value ?? t('common.na'))}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={row.assigned === false ? 'warn' : 'ok'}>{row.assigned === false ? t('common.unassigned') : t('common.assigned')}</Badge>
                      {(row as any).user_created ? <Badge tone="neutral">{t('common.custom')}</Badge> : null}
                    </div>
                  </td>
                  <td className="text-right">
                    <HostIpAddressRowActions
                      assigned={row.assigned !== false}
                      userCreated={Boolean((row as any).user_created)}
                      testIdPrefix={`admin.host_ip_addresses.row.${id}`}
                      assignLoading={assignM.isPending}
                      freeLoading={freeM.isPending}
                      onEditPtr={() => {
                        setPtrEditor(row);
                        setPtrValue(String((row as any).reverse_record_value ?? ''));
                      }}
                      onAssign={() => {
                        setAssignHost(row);
                        setAssignVps(null);
                        setAssignInterface('');
                      }}
                      onFree={() => freeM.mutate(id)}
                      onDelete={() => setDeleteHost(row)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableCard>
      )}

      {(updatePtrM.error || assignM.error || freeM.error || deleteM.error) ? (
        <ErrorState
          title={t('admin.host_ip_addresses.action.error')}
          error={updatePtrM.error || assignM.error || freeM.error || deleteM.error}
          testId="admin.host_ip_addresses.action.error"
        />
      ) : null}

      <Modal
        open={Boolean(ptrEditor)}
        title={t('admin.host_ip_addresses.ptr.title')}
        onClose={() => setPtrEditor(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPtrEditor(null)} disabled={updatePtrM.isPending}>
              {t('common.cancel')}
            </Button>
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
        <div className="mt-1 text-xs text-muted">{t('admin.host_ip_addresses.ptr.help')}</div>
      </Modal>

      <Modal
        open={Boolean(assignHost)}
        title={t('admin.host_ip_addresses.assign.title')}
        onClose={() => setAssignHost(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAssignHost(null)} disabled={assignM.isPending}>
              {t('common.cancel')}
            </Button>
            <ActionButton loading={assignM.isPending} disabled={!assignInterface.trim()} onClick={() => assignM.mutate()}>
              {t('admin.host_ip_addresses.action.assign')}
            </ActionButton>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <div className="mb-1 text-sm font-medium">{t('admin.host_ip_addresses.assign.vps')}</div>
            <VpsLookupInput value={assignVps} onChange={setAssignVps} placeholder={t('admin.host_ip_addresses.assign.vps.placeholder')} />
          </label>
          <label className="block">
            <div className="mb-1 text-sm font-medium">{t('admin.host_ip_addresses.assign.interface')}</div>
            <Select
              value={assignInterface}
              onChange={(e) => setAssignInterface(e.target.value)}
              disabled={!assignVps || netifsQ.isLoading}
              options={[
                { value: '', label: t('admin.host_ip_addresses.assign.interface.placeholder') },
                ...(netifsQ.data ?? []).map((ni: any) => ({
                  value: String(ni.id),
                  label: `${ni.name ?? `#${ni.id}`} (#${ni.id})`,
                })),
              ]}
            />
          </label>
          <div className="text-xs text-muted">{t('admin.host_ip_addresses.assign.help')}</div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteHost)}
        title={t('admin.host_ip_addresses.delete.title')}
        description={deleteHost ? t('admin.host_ip_addresses.delete.desc', { host: hostAddr(deleteHost) }) : undefined}
        danger
        confirmLabel={t('common.delete')}
        confirmLoading={deleteM.isPending}
        onCancel={() => setDeleteHost(null)}
        onConfirm={() => deleteM.mutate()}
      />
    </ListShell>
  );
}
