import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';

import { useAppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';
import { useChrome } from '../../../components/layout/ChromeContext';
import { Alert } from '../../../components/ui/Alert';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { KeysetPagination } from '../../../components/ui/KeysetPagination';
import { LoadingState } from '../../../components/ui/LoadingState';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import { fetchDnsServerZones, fetchDnsServers, createDnsServerZone, deleteDnsServerZone, type DnsServerZone } from '../../../lib/api/dns';
import { formatDateTime } from '../../../lib/format';
import { useKeysetPagination } from '../../../lib/hooks/useKeysetPagination';
import { cursorFromDescendingPage } from '../../../lib/lockIndex';
import { getMetaActionStateId } from '../../../lib/api/haveapi';
import { formatErrorMessage } from '../../../lib/errors';

import { useDnsZoneContext } from './DnsZoneContext';
import { preflightDnsZoneNotBusy } from './dnsPreflight';

function serverName(x: any): string {
  const server: any = x?.dns_server ?? {};
  return String(server.name ?? (typeof server.id === 'number' ? `#${server.id}` : '—'));
}

function zoneTypeLabel(v: unknown, t: (key: string) => string): string {
  const s = String(v ?? '');
  if (s === 'primary_type' || s === 'primary') return t('dns.zone.servers.type.primary');
  if (s === 'secondary_type' || s === 'secondary') return t('dns.zone.servers.type.secondary');
  return s;
}

export function DnsZoneServersPage() {
  const { mode } = useAppMode();
  const { t } = useI18n();
  const chrome = useChrome();
  const { zone, zoneRef, busyLocalLock, busyTransaction, concernClasses, refetchChains } = useDnsZoneContext();
  const isAdmin = mode === 'admin';

  const [searchParams, setSearchParams] = useSearchParams();
  const pagination = useKeysetPagination({
    id: `dns.server_zones.${zone.id}`,
    filterKey: JSON.stringify({ zoneId: zone.id }),
    searchParams,
    setSearchParams,
    defaultLimit: 50,
    allowedLimits: [25, 50, 100],
  });

  const listQ = useQuery({
    queryKey: ['dns_server_zones', zone.id, pagination.page, pagination.limit, pagination.fromId],
    queryFn: async () => fetchDnsServerZones({ dns_zone: zone.id, limit: pagination.limit, fromId: pagination.fromId }),
  });

  const serversQ = useQuery({
    queryKey: ['dns_servers', 'lookup'],
    queryFn: async () => (await fetchDnsServers({ limit: 200 })).data,
    enabled: isAdmin,
    staleTime: 30_000,
  });

  const rows = listQ.data?.data ?? [];
  const cursor = useMemo(() => cursorFromDescendingPage(rows as any), [rows]);
  const hasMore = rows.length >= pagination.limit;

  const [createOpen, setCreateOpen] = useState(false);
  const [serverId, setServerId] = useState('');
  const [zoneType, setZoneType] = useState('primary_type');
  const [confirmDelete, setConfirmDelete] = useState<DnsServerZone | null>(null);

  const createM = useMutation({
    mutationFn: async () => {
      if (!serverId) throw new Error('missing server');
      await preflightDnsZoneNotBusy({ zoneId: zone.id, t, concernClasses, knownBusy: busyLocalLock || busyTransaction });
      return createDnsServerZone({ dns_server: Number(serverId), dns_zone: zone.id, type: zoneType });
    },
    onMutate: () => chrome.acquireLocalLock(zoneRef),
    onSuccess: (res) => {
      const actionStateId = getMetaActionStateId((res as any)?.meta);
      if (actionStateId !== undefined) {
        chrome.trackActionState(actionStateId, {
          actionLabelKey: 'action.dns.server_zone.create.label',
          objectLabel: String((zone as any).name ?? `Zone #${zone.id}`),
          object: zoneRef,
        });
      }
      setCreateOpen(false);
      setServerId('');
      setZoneType('primary_type');
      void listQ.refetch();
      refetchChains();
    },
    onError: (err: any) => { if (err?.code === 'BUSY') chrome.openTasks(); },
    onSettled: () => chrome.releaseLocalLock(zoneRef),
  });

  const deleteM = useMutation({
    mutationFn: async () => {
      if (!confirmDelete) throw new Error('missing server zone');
      await preflightDnsZoneNotBusy({ zoneId: zone.id, t, concernClasses, knownBusy: busyLocalLock || busyTransaction });
      return deleteDnsServerZone(confirmDelete.id);
    },
    onMutate: () => chrome.acquireLocalLock(zoneRef),
    onSuccess: (res) => {
      const actionStateId = getMetaActionStateId((res as any)?.meta);
      if (actionStateId !== undefined) {
        chrome.trackActionState(actionStateId, {
          actionLabelKey: 'action.dns.server_zone.delete.label',
          objectLabel: String((zone as any).name ?? `Zone #${zone.id}`),
          object: zoneRef,
        });
      }
      setConfirmDelete(null);
      void listQ.refetch();
      refetchChains();
    },
    onError: (err: any) => { if (err?.code === 'BUSY') chrome.openTasks(); },
    onSettled: () => chrome.releaseLocalLock(zoneRef),
  });

  if (listQ.isLoading) return <LoadingState testId="dns.servers.loading" label={t('dns.zone.servers.loading')} />;
  if (listQ.isError) return <ErrorState testId="dns.servers.error" title={t('dns.zone.servers.load_failed')} error={listQ.error} onRetry={() => void listQ.refetch()} showBack={false} />;

  const serverOptions = [{ value: '', label: t('common.select') }, ...((serversQ.data ?? []).map((s: any) => ({ value: String(s.id), label: String(s.name ?? `#${s.id}`) })) )];

  return (
    <div className="space-y-6" data-testid="dns.servers.page">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-fg">{t('dns.zone.servers.title')}</h2>
          <p className="mt-1 text-sm text-muted">{t('dns.zone.servers.description')}</p>
        </div>
        {isAdmin ? <Button onClick={() => setCreateOpen(true)} testId="dns.servers.create.open">{t('common.create')}</Button> : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState testId="dns.servers.empty" title={t('dns.zone.servers.empty')} body={t('dns.zone.servers.empty_body')} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-list">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-faint">
                  <th className="py-2 pl-4 pr-3">{t('dns.zone.servers.table.server')}</th>
                  <th className="py-2 pr-3">{t('dns.zone.servers.table.type')}</th>
                  <th className="py-2 pr-3">{t('dns.zone.servers.table.serial')}</th>
                  <th className="py-2 pr-3">{t('dns.zone.servers.table.loaded')}</th>
                  <th className="py-2 pr-3">{t('dns.zone.servers.table.refresh')}</th>
                  <th className="py-2 pr-3">{t('dns.zone.servers.table.expires')}</th>
                  <th className="py-2 pr-3">{t('dns.zone.servers.table.last_check')}</th>
                  {isAdmin ? <th className="py-2 pr-4">{t('common.actions')}</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border" data-testid={`dns.servers.row.${row.id}`}>
                    <td className="py-2 pl-4 pr-3 font-medium text-fg">{serverName(row as any)}</td>
                    <td className="py-2 pr-3"><Badge variant="neutral">{zoneTypeLabel((row as any).type, t)}</Badge></td>
                    <td className="py-2 pr-3">{typeof (row as any).serial === 'number' ? Number((row as any).serial) : t('common.na')}</td>
                    <td className="py-2 pr-3">{(row as any).loaded_at ? formatDateTime(String((row as any).loaded_at)) : t('common.na')}</td>
                    <td className="py-2 pr-3">{(row as any).refresh_at ? formatDateTime(String((row as any).refresh_at)) : t('common.na')}</td>
                    <td className="py-2 pr-3">{(row as any).expires_at ? formatDateTime(String((row as any).expires_at)) : t('common.na')}</td>
                    <td className="py-2 pr-3">{(row as any).last_check_at ? formatDateTime(String((row as any).last_check_at)) : t('common.na')}</td>
                    {isAdmin ? <td className="py-2 pr-4 text-right"><ActionButton variant="danger" size="sm" onClick={() => setConfirmDelete(row)}>{t('common.delete')}</ActionButton></td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <KeysetPagination page={pagination.page} pageCount={pagination.stack.length} canPrev={pagination.canPrev} canNext={hasMore} onPrev={pagination.goPrev} onNext={() => pagination.goNext(cursor)} />
        </Card>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t('dns.zone.servers.create.title')}>
        <div className="space-y-4">
          {createM.isError ? <Alert variant="danger" title={t('dns.zone.servers.create.failed')}>{formatErrorMessage(createM.error)}</Alert> : null}
          <div>
            <div className="mb-1 text-sm font-medium text-fg">{t('dns.zone.servers.field.server')}</div>
            <Select value={serverId} onChange={(e) => setServerId(e.target.value)} options={serverOptions} testId="dns.servers.create.server" />
          </div>
          <div>
            <div className="mb-1 text-sm font-medium text-fg">{t('dns.zone.servers.field.type')}</div>
            <Select value={zoneType} onChange={(e) => setZoneType(e.target.value)} options={[{ value: 'primary_type', label: t('dns.zone.servers.type.primary') }, { value: 'secondary_type', label: t('dns.zone.servers.type.secondary') }]} testId="dns.servers.create.type" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
            <ActionButton onClick={() => createM.mutate()} loading={createM.isPending} disabled={!serverId}>{t('common.create')}</ActionButton>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title={t('dns.zone.servers.delete.title')} description={confirmDelete ? t('dns.zone.servers.delete.description', { server: serverName(confirmDelete as any) }) : ''} confirmLabel={t('common.delete')} confirmVariant="danger" onConfirm={() => deleteM.mutate()} loading={deleteM.isPending} />
    </div>
  );
}
