import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';

import { useI18n } from '../../../app/i18n';
import { useChrome } from '../../../components/layout/ChromeContext';
import { Alert } from '../../../components/ui/Alert';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { CopyButton } from '../../../components/ui/CopyButton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { HostIpLookupInput } from '../../../components/ui/HostIpLookupInput';
import { KeysetPagination } from '../../../components/ui/KeysetPagination';
import { LoadingState } from '../../../components/ui/LoadingState';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import { formatDateTime } from '../../../lib/format';
import { useKeysetPagination } from '../../../lib/hooks/useKeysetPagination';
import { cursorFromDescendingPage } from '../../../lib/lockIndex';
import { getMetaActionStateId } from '../../../lib/api/haveapi';
import {
  fetchDnsServerZones,
  fetchDnsTsigKeys,
  fetchDnsZoneTransfers,
  createDnsZoneTransfer,
  deleteDnsZoneTransfer,
  type DnsServerZone,
  type DnsZoneTransfer,
} from '../../../lib/api/dns';
import { formatErrorMessage } from '../../../lib/errors';

import { useDnsZoneContext } from './DnsZoneContext';
import { isSecondaryDnsZone } from './DnsZoneModel';
import { preflightDnsZoneNotBusy } from './dnsPreflight';

function peerLabel(transfer: DnsZoneTransfer): string {
  const host = transfer.host_ip_address;
  if (!host) return `#${transfer.id}`;
  const ip = 'ip_address' in host ? host.ip_address : undefined;
  const ipAddress = ip && typeof ip === 'object' && 'ip_addr' in ip ? ip.ip_addr : undefined;
  const address = 'addr' in host ? host.addr : undefined;
  return String(ipAddress ?? address ?? `#${host.id ?? transfer.id}`);
}

function peerTypeLabel(v: unknown): string {
  const s = String(v ?? '');
  if (s === 'primary_type') return 'primary';
  if (s === 'secondary_type') return 'secondary';
  return s;
}

function serverName(row: DnsServerZone): string {
  const server = row.dns_server;
  if (!server) return '—';
  const name = 'name' in server ? server.name : undefined;
  return String(name ?? `#${server.id}`);
}

function transferSnippet(transfer: DnsZoneTransfer): string {
  const host = peerLabel(transfer);
  const keyName = transfer.dns_tsig_key?.name ?? '';
  const lines = [
    `server ${host} {`,
    keyName ? `  keys { ${keyName}; };` : '  # no TSIG key configured',
    '};',
  ];
  return lines.join('\n');
}

export function DnsZoneTransfersPage() {
  const { t } = useI18n();
  const chrome = useChrome();
  const { zone, zoneRef, busyLocalLock, busyTransaction, concernClasses, refetchChains } = useDnsZoneContext();
  const secondaryZone = isSecondaryDnsZone(zone);

  const [searchParams, setSearchParams] = useSearchParams();
  const pagination = useKeysetPagination({
    id: `dns.transfers.${zone.id}`,
    filterKey: JSON.stringify({ zoneId: zone.id }),
    searchParams,
    setSearchParams,
    defaultLimit: 50,
    allowedLimits: [25, 50, 100],
  });

  const listQ = useQuery({
    queryKey: ['dns_zone_transfers', zone.id, pagination.page, pagination.limit, pagination.fromId],
    queryFn: async () =>
      fetchDnsZoneTransfers({ dns_zone: zone.id, limit: pagination.limit, fromId: pagination.fromId }),
  });

  const tsigQ = useQuery({
    queryKey: ['dns_tsig_keys', 'lookup', zone.id],
    queryFn: async () => (await fetchDnsTsigKeys({ limit: 200 })).data,
    staleTime: 30_000,
  });

  const serverZonesQ = useQuery({
    queryKey: ['dns_server_zones', 'transfer_status', zone.id],
    queryFn: async () => (await fetchDnsServerZones({ dns_zone: zone.id, limit: 100 })).data,
    enabled: secondaryZone,
  });

  const transfers = listQ.data?.data ?? [];
  const cursor = useMemo(() => cursorFromDescendingPage(transfers), [transfers]);
  const hasMore = transfers.length >= pagination.limit;

  const [createOpen, setCreateOpen] = useState(false);
  const [hostIpId, setHostIpId] = useState<number | null>(null);
  const [peerType, setPeerType] = useState('primary_type');
  const [tsigKeyId, setTsigKeyId] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<DnsZoneTransfer | null>(null);

  const createM = useMutation({
    mutationFn: async () => {
      if (!hostIpId) throw new Error('missing host ip');
      await preflightDnsZoneNotBusy({ zoneId: zone.id, t, concernClasses, knownBusy: busyLocalLock || busyTransaction });
      return createDnsZoneTransfer({
        dns_zone: zone.id,
        host_ip_address: hostIpId,
        peer_type: peerType,
        dns_tsig_key: tsigKeyId ? Number(tsigKeyId) : undefined,
      });
    },
    onMutate: () => chrome.acquireLocalLock(zoneRef),
    onSuccess: (res) => {
      const actionStateId = getMetaActionStateId(res.meta);
      if (actionStateId !== undefined) {
        chrome.trackActionState(actionStateId, {
          actionLabelKey: 'action.dns.zone_transfer.create.label',
          objectLabel: String(zone.name ?? `Zone #${zone.id}`),
          object: zoneRef,
        });
      }
      setCreateOpen(false);
      setHostIpId(null);
      setPeerType('primary_type');
      setTsigKeyId('');
      void listQ.refetch();
      refetchChains();
    },
    onError: (err: unknown) => {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'BUSY') {
        chrome.openTasks();
      }
    },
    onSettled: () => chrome.releaseLocalLock(zoneRef),
  });

  const deleteM = useMutation({
    mutationFn: async () => {
      if (!confirmDelete) throw new Error('missing transfer');
      await preflightDnsZoneNotBusy({ zoneId: zone.id, t, concernClasses, knownBusy: busyLocalLock || busyTransaction });
      return deleteDnsZoneTransfer(confirmDelete.id);
    },
    onMutate: () => chrome.acquireLocalLock(zoneRef),
    onSuccess: (res) => {
      const actionStateId = getMetaActionStateId(res.meta);
      if (actionStateId !== undefined) {
        chrome.trackActionState(actionStateId, {
          actionLabelKey: 'action.dns.zone_transfer.delete.label',
          objectLabel: String(zone.name ?? `Zone #${zone.id}`),
          object: zoneRef,
        });
      }
      setConfirmDelete(null);
      void listQ.refetch();
      refetchChains();
    },
    onError: (err: unknown) => {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'BUSY') {
        chrome.openTasks();
      }
    },
    onSettled: () => chrome.releaseLocalLock(zoneRef),
  });

  const tsigOptions = [
    { value: '', label: t('common.none') },
    ...((tsigQ.data ?? []).map((key) => ({
      value: String(key.id),
      label: `${String(key.name ?? `#${key.id}`)}${key.user?.login ? ` · ${String(key.user.login)}` : ''}`,
    }))),
  ];

  if (listQ.isLoading) return <LoadingState testId="dns.transfers.loading" label={t('dns.zone.transfers.loading')} />;
  if (listQ.isError) return <ErrorState testId="dns.transfers.error" title={t('dns.zone.transfers.load_failed')} error={listQ.error} onRetry={() => void listQ.refetch()} showBack={false} />;

  return (
    <div className="space-y-6" data-testid="dns.transfers.page">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-fg">
            {secondaryZone ? t('dns.zone.transfers.secondary.title') : t('dns.zone.transfers.title')}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {secondaryZone ? t('dns.zone.transfers.secondary.description') : t('dns.zone.transfers.description')}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} testId="dns.transfers.create.open">{t('common.create')}</Button>
      </div>

      {transfers.length === 0 ? (
        <EmptyState testId="dns.transfers.empty" title={t('dns.zone.transfers.empty')} body={t('dns.zone.transfers.empty_body')} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-list">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-faint">
                  <th className="py-2 pl-4 pr-3">{t('dns.zone.transfers.table.peer')}</th>
                  <th className="py-2 pr-3">{t('dns.zone.transfers.table.type')}</th>
                  <th className="py-2 pr-3">{t('dns.zone.transfers.table.tsig')}</th>
                  <th className="py-2 pr-3">{t('common.created')}</th>
                  <th className="py-2 pr-3">{t('dns.zone.transfers.table.config')}</th>
                  <th className="py-2 pr-4">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((transfer) => {
                  const snippet = transferSnippet(transfer);
                  return (
                    <tr key={transfer.id} className="border-t border-border" data-testid={`dns.transfers.row.${transfer.id}`}>
                      <td className="py-2 pl-4 pr-3 font-medium text-fg">{peerLabel(transfer)}</td>
                      <td className="py-2 pr-3"><Badge variant="neutral">{peerTypeLabel(transfer.peer_type)}</Badge></td>
                      <td className="py-2 pr-3">{transfer.dns_tsig_key?.name ? <Badge variant="ok">{transfer.dns_tsig_key.name}</Badge> : <Badge variant="neutral">{t('common.none')}</Badge>}</td>
                      <td className="py-2 pr-3">{transfer.created_at ? formatDateTime(String(transfer.created_at)) : t('common.na')}</td>
                      <td className="py-2 pr-3">
                        <details>
                          <summary className="cursor-pointer text-sm text-muted">{t('dns.zone.transfers.table.show_config')}</summary>
                          <pre className="mt-2 max-w-content-lg overflow-x-auto whitespace-pre-wrap text-xs text-muted">{snippet}</pre>
                          <div className="mt-2"><CopyButton text={snippet} /></div>
                        </details>
                      </td>
                      <td className="py-2 pr-4 text-right">
                        <ActionButton variant="danger" size="sm" onClick={() => setConfirmDelete(transfer)} testId={`dns.transfers.row.${transfer.id}.delete`}>{t('common.delete')}</ActionButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <KeysetPagination page={pagination.page} pageCount={pagination.stack.length} canPrev={pagination.canPrev} canNext={hasMore} onPrev={pagination.goPrev} onNext={() => pagination.goNext(cursor)} />
        </Card>
      )}

      {secondaryZone ? (
        <Card testId="dns.transfers.status">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-base font-semibold text-fg">{t('dns.zone.transfers.status.title')}</h3>
            <p className="mt-1 text-sm text-muted">{t('dns.zone.transfers.status.description')}</p>
          </div>
          {serverZonesQ.isLoading ? (
            <LoadingState testId="dns.transfers.status.loading" />
          ) : serverZonesQ.isError ? (
            <ErrorState
              testId="dns.transfers.status.error"
              title={t('dns.zone.servers.load_failed')}
              error={serverZonesQ.error}
              onRetry={() => void serverZonesQ.refetch()}
              showBack={false}
            />
          ) : (serverZonesQ.data ?? []).length === 0 ? (
            <div className="px-4 py-5 text-sm text-muted">{t('dns.zone.transfers.status.empty')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-list">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-faint">
                    <th className="py-2 pl-4 pr-3">{t('dns.zone.servers.table.server')}</th>
                    <th className="py-2 pr-3">{t('dns.zone.servers.table.serial')}</th>
                    <th className="py-2 pr-3">{t('dns.zone.servers.table.loaded')}</th>
                    <th className="py-2 pr-3">{t('dns.zone.servers.table.refresh')}</th>
                    <th className="py-2 pr-3">{t('dns.zone.servers.table.expires')}</th>
                    <th className="py-2 pr-4">{t('dns.zone.servers.table.last_check')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(serverZonesQ.data ?? []).map((row) => (
                    <tr key={row.id} className="border-t border-border" data-testid={`dns.transfers.status.row.${row.id}`}>
                      <td className="py-2 pl-4 pr-3 font-medium text-fg">{serverName(row)}</td>
                      <td className="py-2 pr-3">{typeof row.serial === 'number' ? row.serial : t('common.na')}</td>
                      <td className="py-2 pr-3">{row.loaded_at ? formatDateTime(row.loaded_at) : t('common.na')}</td>
                      <td className="py-2 pr-3">{row.refresh_at ? formatDateTime(row.refresh_at) : t('common.na')}</td>
                      <td className="py-2 pr-3">{row.expires_at ? formatDateTime(row.expires_at) : t('common.na')}</td>
                      <td className="py-2 pr-4">{row.last_check_at ? formatDateTime(row.last_check_at) : t('common.na')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t('dns.zone.transfers.create.title')}>
        <div className="space-y-4">
          {createM.isError ? <Alert variant="danger" title={t('dns.zone.transfers.create.failed')}>{formatErrorMessage(createM.error)}</Alert> : null}
          <div>
            <div className="mb-1 text-sm font-medium text-fg">{t('dns.zone.transfers.field.host_ip')}</div>
            <HostIpLookupInput value={hostIpId} onChange={setHostIpId} placeholder={t('dns.zone.transfers.field.host_ip_placeholder')} testId="dns.transfers.create.host_ip" />
          </div>
          <div><div className="mb-1 text-sm font-medium text-fg">{t('dns.zone.transfers.field.peer_type')}</div><Select value={peerType} onChange={(e) => setPeerType(e.target.value)} options={[{ value: 'primary_type', label: t('dns.zone.transfers.peer_type.primary') }, { value: 'secondary_type', label: t('dns.zone.transfers.peer_type.secondary') }]} testId="dns.transfers.create.peer_type" /></div>
          <div><div className="mb-1 text-sm font-medium text-fg">{t('dns.zone.transfers.field.tsig_key')}</div><Select value={tsigKeyId} onChange={(e) => setTsigKeyId(e.target.value)} options={tsigOptions} testId="dns.transfers.create.tsig" /></div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
            <ActionButton onClick={() => createM.mutate()} loading={createM.isPending} disabled={!hostIpId}>{t('common.create')}</ActionButton>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title={t('dns.zone.transfers.delete.title')} description={confirmDelete ? t('dns.zone.transfers.delete.description', { peer: peerLabel(confirmDelete) }) : ''} confirmLabel={t('common.delete')} confirmVariant="danger" onConfirm={() => deleteM.mutate()} loading={deleteM.isPending} />
    </div>
  );
}
