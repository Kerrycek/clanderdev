import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useI18n } from '../../../../app/i18n';
import { useToasts } from '../../../../app/toasts';
import { FilterBar } from '../../../../components/layout/FilterBar';
import { Alert } from '../../../../components/ui/Alert';
import { ActionButton } from '../../../../components/ui/ActionButton';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { ErrorState } from '../../../../components/ui/ErrorState';
import { Input } from '../../../../components/ui/Input';
import { KeysetPagination } from '../../../../components/ui/KeysetPagination';
import { LoadingState } from '../../../../components/ui/LoadingState';
import { Modal } from '../../../../components/ui/Modal';
import { Select } from '../../../../components/ui/Select';
import { TableCard } from '../../../../components/ui/TableCard';
import { fetchNodes } from '../../../../lib/api/nodes';
import { fetchDnsServers, createDnsServer, updateDnsServer, deleteDnsServer, type DnsServer } from '../../../../lib/api/dns';
import { getMetaTotalCount } from '../../../../lib/api/haveapi';
import { useCountedKeysetPagination } from '../../../../lib/hooks/useCountedKeysetPagination';
import { useKeysetPagination } from '../../../../lib/hooks/useKeysetPagination';
import { formatErrorMessage } from '../../../../lib/errors';

function nodeLabel(server: DnsServer): string {
  const n: any = server.node ?? {};
  return String(n.domain_name ?? (typeof n.id === 'number' ? `#${n.id}` : '—'));
}

type EditorState = null | { mode: 'create' | 'edit'; server?: DnsServer };

export function DnsServersPage() {
  const { t } = useI18n();
  const { pushToast } = useToasts();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get('q') ?? '');
  const [hidden, setHidden] = useState(() => searchParams.get('hidden') ?? '');
  const [userZones, setUserZones] = useState(() => searchParams.get('user_zones') ?? '');
  const [editor, setEditor] = useState<EditorState>(null);
  const [confirmDelete, setConfirmDelete] = useState<DnsServer | null>(null);
  const [name, setName] = useState('');
  const [ipv4, setIpv4] = useState('');
  const [ipv6, setIpv6] = useState('');
  const [nodeId, setNodeId] = useState('');
  const [isHidden, setIsHidden] = useState(false);
  const [enableUserZones, setEnableUserZones] = useState(true);
  const [userZoneType, setUserZoneType] = useState('primary_type');
  const filtersActive = Boolean(q.trim() || hidden || userZones);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (q.trim()) next.set('q', q.trim()); else next.delete('q');
    if (hidden) next.set('hidden', hidden); else next.delete('hidden');
    if (userZones) next.set('user_zones', userZones); else next.delete('user_zones');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [q, hidden, userZones, searchParams, setSearchParams]);

  const pagination = useKeysetPagination({ id: 'admin.cluster.dns_servers', filterKey: JSON.stringify({ q, hidden, userZones }), searchParams, setSearchParams, defaultLimit: 50, allowedLimits: [25,50,100] });

  const nodesQ = useQuery({ queryKey: ['nodes', 'dns_server_nodes'], queryFn: async () => (await fetchNodes({ limit: 200 })).data as any[], staleTime: 60_000 });
  const nodesData = nodesQ.data ?? [];

  const listQ = useQuery({
    queryKey: ['dns_servers', pagination.page, pagination.limit, pagination.fromId, q, hidden, userZones],
    queryFn: async () => fetchDnsServers({
      limit: pagination.limit,
      fromId: pagination.fromId,
      count: !filtersActive,
    }),
  });

  const rawRows = listQ.data?.data ?? [];
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hiddenFilter = hidden === 'true' ? true : hidden === 'false' ? false : undefined;
    const userZonesFilter = userZones === 'true' ? true : userZones === 'false' ? false : undefined;
    return rawRows.filter((row) => {
      const searchable = [row.id, row.name, row.ipv4_addr, row.ipv6_addr, nodeLabel(row)]
        .map((value) => String(value ?? '').toLowerCase())
        .join(' ');
      if (needle && !searchable.includes(needle)) return false;
      if (hiddenFilter !== undefined && Boolean(row.hidden) !== hiddenFilter) return false;
      if (userZonesFilter !== undefined && Boolean(row.enable_user_dns_zones) !== userZonesFilter) return false;
      return true;
    });
  }, [hidden, q, rawRows, userZones]);
  const totalCount = filtersActive ? undefined : getMetaTotalCount(listQ.data?.meta);
  const loadPage = useCallback(async (fromId: number | undefined) => (await fetchDnsServers({
    limit: pagination.limit,
    fromId,
    count: !filtersActive,
  })).data, [filtersActive, pagination.limit]);
  const {
    pageCursor: cursor,
    pageCount,
    totalPagesKnown,
    canNext,
    goToPage,
    maxDirectPage,
    isJumping,
  } = useCountedKeysetPagination({
    pagination, totalCount, rows: rawRows, loadPage, direction: 'asc',
  });

  useEffect(() => {
    if (!editor) return;
    const s: any = editor.server ?? {};
    setName(String(s.name ?? ''));
    setIpv4(String(s.ipv4_addr ?? ''));
    setIpv6(String(s.ipv6_addr ?? ''));
    setNodeId(typeof s.node?.id === 'number' ? String(s.node.id) : '');
    setIsHidden(s.hidden === true);
    setEnableUserZones(s.enable_user_dns_zones !== false);
    setUserZoneType(typeof s.user_dns_zone_type === 'string' ? s.user_dns_zone_type : 'primary_type');
  }, [editor]);

  const saveM = useMutation({
    mutationFn: async () => {
      const payload = { name: name.trim(), ipv4_addr: ipv4.trim() || undefined, ipv6_addr: ipv6.trim() || undefined, node: Number(nodeId), hidden: isHidden, enable_user_dns_zones: enableUserZones, user_dns_zone_type: userZoneType };
      return editor?.mode === 'edit' && editor.server ? updateDnsServer(editor.server.id, payload) : createDnsServer(payload);
    },
    onSuccess: () => {
      pushToast({ variant: 'ok', title: t('common.save') });
      setEditor(null);
      void listQ.refetch();
      void qc.invalidateQueries({ queryKey: ['dns_servers'] });
    },
  });

  const deleteM = useMutation({
    mutationFn: async () => {
      if (!confirmDelete) throw new Error('missing server');
      return deleteDnsServer(confirmDelete.id);
    },
    onSuccess: () => {
      pushToast({ variant: 'ok', title: t('common.deleted') });
      setConfirmDelete(null);
      void listQ.refetch();
    },
  });

  if (listQ.isLoading) return <LoadingState testId="admin.cluster.dns_servers.loading" label={t('admin.cluster.dns_servers.loading')} />;
  if (listQ.isError) return <ErrorState testId="admin.cluster.dns_servers.error" title={t('admin.cluster.dns_servers.load_failed')} error={listQ.error} onRetry={() => void listQ.refetch()} showBack={false} />;

  return (
    <div className="space-y-6" data-testid="admin.cluster.dns_servers.page">
      <FilterBar
        left={<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.cluster.dns_servers.search.placeholder')} testId="admin.cluster.dns_servers.search.input" />}
        right={<div className="flex flex-wrap items-end gap-2"><div><div className="mb-1 text-xs font-medium text-muted">{t('common.hidden')}</div><Select value={hidden} onChange={(e) => setHidden(e.target.value)} options={[{ value: '', label: t('common.all') }, { value: 'true', label: t('common.yes') }, { value: 'false', label: t('common.no') }]} testId="admin.cluster.dns_servers.filter.hidden" /></div><div><div className="mb-1 text-xs font-medium text-muted">{t('admin.cluster.dns_servers.field.user_zones')}</div><Select value={userZones} onChange={(e) => setUserZones(e.target.value)} options={[{ value: '', label: t('common.all') }, { value: 'true', label: t('common.yes') }, { value: 'false', label: t('common.no') }]} testId="admin.cluster.dns_servers.filter.user_zones" /></div><Button variant="secondary" onClick={() => listQ.refetch()}>{t('common.refresh')}</Button><Button onClick={() => setEditor({ mode: 'create' })}>{t('common.create')}</Button></div>}
      />
      {filtersActive ? <div className="text-xs text-faint">{t('list.meta.filters_progressive')}</div> : null}
      {rows.length === 0 ? <div className="space-y-2"><EmptyState testId="admin.cluster.dns_servers.empty" title={t('admin.cluster.dns_servers.empty')} body={t('admin.cluster.dns_servers.empty_body')} />{(rawRows.length > 0 || pagination.canPrev || canNext) ? <KeysetPagination testId="admin.cluster.dns_servers.pagination" page={pagination.page} pageCount={pageCount} totalPagesKnown={totalPagesKnown} maxDirectPage={maxDirectPage} jumpPending={isJumping} canPrev={pagination.canPrev} canNext={canNext} onPrev={pagination.goPrev} onNext={() => pagination.goNext(cursor)} onGoToPage={goToPage} limit={pagination.limit} allowedLimits={pagination.allowedLimits} onLimitChange={pagination.setLimit} /> : null}</div> : (
        <TableCard
          testId="admin.cluster.dns_servers.table"
          minWidth="lg"
          footer={
            <KeysetPagination
              testId="admin.cluster.dns_servers.pagination"
              page={pagination.page}
              pageCount={pageCount}
              totalPagesKnown={totalPagesKnown}
              maxDirectPage={maxDirectPage}
              jumpPending={isJumping}
              canPrev={pagination.canPrev}
              canNext={canNext}
              onPrev={pagination.goPrev}
              onNext={() => pagination.goNext(cursor)}
              onGoToPage={goToPage}
              limit={pagination.limit}
              allowedLimits={pagination.allowedLimits}
              onLimitChange={pagination.setLimit}
            />
          }
        >
              <thead><tr className="text-left text-xs uppercase tracking-wide text-faint"><th className="py-2 pl-4 pr-3">{t('common.name')}</th><th className="py-2 pr-3">{t('common.node')}</th><th className="py-2 pr-3">{t('common.ipv4')}</th><th className="py-2 pr-3">{t('common.ipv6')}</th><th className="py-2 pr-3">{t('common.flags')}</th><th className="py-2 pr-4">{t('common.actions')}</th></tr></thead>
              <tbody>{rows.map((row) => <tr key={row.id} className="border-t border-border" data-testid={`admin.cluster.dns_servers.row.${row.id}`}><td className="py-2 pl-4 pr-3 font-medium text-fg">{String(row.name ?? `#${row.id}`)}</td><td className="py-2 pr-3">{nodeLabel(row)}</td><td className="py-2 pr-3">{row.ipv4_addr || t('common.na')}</td><td className="py-2 pr-3">{row.ipv6_addr || t('common.na')}</td><td className="py-2 pr-3"><div className="flex flex-wrap gap-2">{row.hidden ? <Badge variant="warn">{t('common.hidden')}</Badge> : null}{row.enable_user_dns_zones ? <Badge variant="ok">{t('admin.cluster.dns_servers.badge.user_zones')}</Badge> : <Badge variant="neutral">{t('admin.cluster.dns_servers.badge.no_user_zones')}</Badge>}</div></td><td className="py-2 pr-4 text-right"><div className="inline-flex items-center justify-end gap-1" role="group" aria-label={t('common.actions')}><ActionButton size="sm" variant="ghost" className="h-8 w-8 min-w-8 px-0" title={t('common.edit')} ariaLabel={t('common.edit')} testId={`admin.cluster.dns_servers.row.${row.id}.edit`} onClick={() => setEditor({ mode: 'edit', server: row })}><Pencil className="h-4 w-4" aria-hidden /></ActionButton><ActionButton size="sm" variant="danger" className="h-8 w-8 min-w-8 px-0" title={t('common.delete')} ariaLabel={t('common.delete')} testId={`admin.cluster.dns_servers.row.${row.id}.delete`} onClick={() => setConfirmDelete(row)}><Trash2 className="h-4 w-4" aria-hidden /></ActionButton></div></td></tr>)}</tbody>
        </TableCard>
      )}

      <Modal open={editor !== null} onClose={() => setEditor(null)} title={editor?.mode === 'edit' ? t('admin.cluster.dns_servers.edit.title') : t('admin.cluster.dns_servers.create.title')}>
        <div className="space-y-4">
          {saveM.isError ? <Alert variant="danger" title={t('common.save_failed')}>{formatErrorMessage(saveM.error)}</Alert> : null}
          <div><div className="mb-1 text-sm font-medium text-fg">{t('common.name')}</div><Input value={name} onChange={(e) => setName(e.target.value)} testId="admin.cluster.dns_servers.editor.name" /></div>
          <div><div className="mb-1 text-sm font-medium text-fg">{t('common.node')}</div><Select value={nodeId} onChange={(e) => setNodeId(e.target.value)} options={[{ value: '', label: t('common.select') }, ...nodesData.map((l: any) => ({ value: String(l.id), label: String(l.domain_name ?? l.name ?? `#${l.id}`) }))]} testId="admin.cluster.dns_servers.editor.node" /></div>
          <div className="grid gap-4 md:grid-cols-2"><div><div className="mb-1 text-sm font-medium text-fg">{t('common.ipv4')}</div><Input value={ipv4} onChange={(e) => setIpv4(e.target.value)} testId="admin.cluster.dns_servers.editor.ipv4" /></div><div><div className="mb-1 text-sm font-medium text-fg">{t('common.ipv6')}</div><Input value={ipv6} onChange={(e) => setIpv6(e.target.value)} testId="admin.cluster.dns_servers.editor.ipv6" /></div></div>
          <div className="grid gap-4 md:grid-cols-2"><div><div className="mb-1 text-sm font-medium text-fg">{t('common.hidden')}</div><Select value={isHidden ? 'true' : 'false'} onChange={(e) => setIsHidden(e.target.value === 'true')} options={[{ value: 'false', label: t('common.no') }, { value: 'true', label: t('common.yes') }]} /></div><div><div className="mb-1 text-sm font-medium text-fg">{t('admin.cluster.dns_servers.field.user_zones')}</div><Select value={enableUserZones ? 'true' : 'false'} onChange={(e) => setEnableUserZones(e.target.value === 'true')} options={[{ value: 'true', label: t('common.yes') }, { value: 'false', label: t('common.no') }]} /></div></div>
          <div><div className="mb-1 text-sm font-medium text-fg">{t('admin.cluster.dns_servers.field.user_zone_type')}</div><Select value={userZoneType} onChange={(e) => setUserZoneType(e.target.value)} options={[{ value: 'primary_type', label: t('admin.cluster.dns_servers.type.primary') }, { value: 'secondary_type', label: t('admin.cluster.dns_servers.type.secondary') }]} /></div>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setEditor(null)}>{t('common.cancel')}</Button><ActionButton onClick={() => saveM.mutate()} loading={saveM.isPending} disabled={!name.trim() || !nodeId}>{t('common.save')}</ActionButton></div>
        </div>
      </Modal>

      <ConfirmDialog open={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title={t('admin.cluster.dns_servers.delete.title')} description={confirmDelete ? t('admin.cluster.dns_servers.delete.description', { name: String(confirmDelete.name ?? `#${confirmDelete.id}`) }) : ''} confirmLabel={t('common.delete')} confirmVariant="danger" onConfirm={() => deleteM.mutate()} loading={deleteM.isPending} />
    </div>
  );
}
