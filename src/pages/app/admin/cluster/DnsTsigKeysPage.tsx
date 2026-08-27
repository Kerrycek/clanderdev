import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';

import { useI18n } from '../../../../app/i18n';
import { useToasts } from '../../../../app/toasts';
import { FilterBar } from '../../../../components/layout/FilterBar';
import { PageHeader } from '../../../../components/layout/PageHeader';
import { Alert } from '../../../../components/ui/Alert';
import { ActionButton } from '../../../../components/ui/ActionButton';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { ErrorState } from '../../../../components/ui/ErrorState';
import { Input } from '../../../../components/ui/Input';
import { KeysetPagination } from '../../../../components/ui/KeysetPagination';
import { LoadingState } from '../../../../components/ui/LoadingState';
import { Modal } from '../../../../components/ui/Modal';
import { SecretField } from '../../../../components/ui/SecretField';
import { Select } from '../../../../components/ui/Select';
import { UserLookupInput } from '../../../../components/ui/UserLookupInput';
import { DNS_TSIG_ALGORITHMS, fetchDnsTsigKeys, createDnsTsigKey, deleteDnsTsigKey, type DnsTsigKeySummary } from '../../../../lib/api/dns';
import { useKeysetPagination } from '../../../../lib/hooks/useKeysetPagination';
import { cursorFromDescendingPage } from '../../../../lib/lockIndex';
import { formatDateTime } from '../../../../lib/format';
import { formatErrorMessage } from '../../../../lib/errors';

export function DnsTsigKeysPage() {
  const { t } = useI18n();
  const { pushToast } = useToasts();
  const [searchParams, setSearchParams] = useSearchParams();
  const [algorithm, setAlgorithm] = useState(() => searchParams.get('algorithm') ?? '');
  const [userId, setUserId] = useState<number | null>(() => { const raw = searchParams.get('user'); if (!raw) return null; const n = Number(raw); return Number.isFinite(n) && n > 0 ? Math.floor(n) : null; });
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [newUserId, setNewUserId] = useState<number | null>(null);
  const [newAlgorithm, setNewAlgorithm] = useState('hmac-sha256');
  const [createdKey, setCreatedKey] = useState<{ name: string; secret: string } | null>(null);
  const pendingCreatedKey = React.useRef<{ name: string; secret: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DnsTsigKeySummary | null>(null);

  const pagination = useKeysetPagination({ id: 'admin.cluster.dns_tsig_keys', filterKey: JSON.stringify({ algorithm, userId }), searchParams, setSearchParams, defaultLimit: 50, allowedLimits: [25,50,100] });
  React.useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('q');
    if (algorithm) next.set('algorithm', algorithm); else next.delete('algorithm');
    if (userId) next.set('user', String(userId)); else next.delete('user');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [algorithm, userId, searchParams, setSearchParams]);

  const listQ = useQuery({
    queryKey: ['dns_tsig_keys', pagination.page, pagination.limit, pagination.fromId, algorithm, userId],
    queryFn: async () => fetchDnsTsigKeys({ limit: pagination.limit, fromId: pagination.fromId, algorithm: algorithm || undefined, user: userId ?? undefined }),
  });
  const rows = listQ.data?.data ?? [];
  const cursor = useMemo(() => cursorFromDescendingPage(rows as any), [rows]);
  const hasMore = rows.length >= pagination.limit;

  const createM = useMutation({
    mutationFn: async () => {
      if (!newUserId) throw new Error('TSIG key owner is required');
      return createDnsTsigKey(
        { user: newUserId, name: name.trim(), algorithm: newAlgorithm || undefined },
        { onOneTimeSecret: (value) => { pendingCreatedKey.current = value; } }
      );
    },
    onSuccess: (result) => {
      pushToast({ variant: 'ok', title: t('common.created') });
      setCreateOpen(false);
      setCreatedKey(pendingCreatedKey.current ?? {
        name: String(result.data?.name ?? name.trim()),
        secret: '',
      });
      pendingCreatedKey.current = null;
      setName('');
      setNewUserId(null);
      setNewAlgorithm('hmac-sha256');
      void listQ.refetch();
    },
    onError: () => {
      pendingCreatedKey.current = null;
    },
  });
  const deleteM = useMutation({ mutationFn: async () => { if (!confirmDelete) throw new Error('missing key'); return deleteDnsTsigKey(confirmDelete.id); }, onSuccess: () => { pushToast({ variant: 'ok', title: t('common.deleted') }); setConfirmDelete(null); void listQ.refetch(); } });

  if (listQ.isLoading) return <LoadingState testId="admin.cluster.dns_tsig.loading" label={t('admin.cluster.dns_tsig.loading')} />;
  if (listQ.isError) return <ErrorState testId="admin.cluster.dns_tsig.error" title={t('admin.cluster.dns_tsig.load_failed')} error={listQ.error} onRetry={() => void listQ.refetch()} showBack={false} />;

  const filtersActive = Boolean(algorithm || userId);

  return (
    <div className="space-y-6" data-testid="admin.cluster.dns_tsig.page">
      <PageHeader
        title={t('dns.zones.action.tsig_keys')}
        description={t('admin.cluster.dns_tsig.page.description')}
        testId="admin.cluster.dns_tsig.header"
      />

      <FilterBar
        left={<div className="flex flex-wrap items-end gap-2"><div><label htmlFor="admin-dns-tsig-filter-algorithm" className="mb-1 block text-xs font-semibold text-muted">{t('common.algorithm')}</label><Select selectId="admin-dns-tsig-filter-algorithm" value={algorithm} onChange={(e) => setAlgorithm(e.target.value)} options={[{ value: '', label: t('common.all') }, ...DNS_TSIG_ALGORITHMS.map((value) => ({ value, label: value }))]} testId="admin.cluster.dns_tsig.filter.algorithm" /></div><UserLookupInput className="w-56" label={t('common.user')} ariaLabel={t('common.user')} value={userId} onChange={(value) => setUserId(value ? Number(value) : null)} testId="admin.cluster.dns_tsig.filter.user" /></div>}
        right={<div className="flex flex-wrap items-end gap-2"><Button variant="secondary" onClick={() => listQ.refetch()}>{t('common.refresh')}</Button><Button onClick={() => setCreateOpen(true)} testId="admin.cluster.dns_tsig.create.open">{t('common.create')}</Button></div>}
      />
      {filtersActive ? <div className="text-xs text-faint">{t('list.meta.filters_active')}</div> : null}
      {rows.length === 0 ? <EmptyState testId="admin.cluster.dns_tsig.empty" title={t('admin.cluster.dns_tsig.empty')} body={t('admin.cluster.dns_tsig.empty_body')} /> : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-list">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-faint"><th className="py-2 pl-4 pr-3">{t('common.name')}</th><th className="py-2 pr-3">{t('common.user')}</th><th className="py-2 pr-3">{t('common.algorithm')}</th><th className="py-2 pr-3">{t('common.created')}</th><th className="py-2 pr-4">{t('common.actions')}</th></tr></thead>
              <tbody>{rows.map((row) => <tr key={row.id} className="border-t border-border" data-testid={`admin.cluster.dns_tsig.row.${row.id}`}><td className="py-2 pl-4 pr-3 font-medium text-fg">{String(row.name ?? `#${row.id}`)}</td><td className="py-2 pr-3">{typeof row.user?.login === 'string' ? String(row.user.login) : t('common.na')}</td><td className="py-2 pr-3"><Badge variant="neutral">{String(row.algorithm ?? t('common.na'))}</Badge></td><td className="py-2 pr-3">{row.created_at ? formatDateTime(String(row.created_at)) : t('common.na')}</td><td className="py-2 pr-4 text-right"><ActionButton size="sm" variant="danger" onClick={() => setConfirmDelete(row)}>{t('common.delete')}</ActionButton></td></tr>)}</tbody>
            </table>
          </div>
          <KeysetPagination page={pagination.page} pageCount={pagination.stack.length} canPrev={pagination.canPrev} canNext={hasMore} onPrev={pagination.goPrev} onNext={() => pagination.goNext(cursor)} />
        </Card>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t('admin.cluster.dns_tsig.create.title')} testId="admin.cluster.dns_tsig.create.modal">
        <div className="space-y-4">
          {createM.isError ? <Alert variant="danger" title={t('admin.cluster.dns_tsig.create.failed')}>{formatErrorMessage(createM.error)}</Alert> : null}
          <div><label htmlFor="admin-dns-tsig-create-name" className="mb-1 block text-xs font-semibold text-muted">{t('common.name')}</label><Input inputId="admin-dns-tsig-create-name" value={name} onChange={(e) => setName(e.target.value)} testId="admin.cluster.dns_tsig.create.name" /></div>
          <UserLookupInput label={t('common.user')} ariaLabel={t('common.user')} value={newUserId} onChange={(value) => setNewUserId(value ? Number(value) : null)} testId="admin.cluster.dns_tsig.create.user" />
          <div><label htmlFor="admin-dns-tsig-create-algorithm" className="mb-1 block text-xs font-semibold text-muted">{t('common.algorithm')}</label><Select selectId="admin-dns-tsig-create-algorithm" value={newAlgorithm} onChange={(e) => setNewAlgorithm(e.target.value)} options={DNS_TSIG_ALGORITHMS.map((value) => ({ value, label: value }))} testId="admin.cluster.dns_tsig.create.algorithm" /></div>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button><ActionButton onClick={() => createM.mutate()} loading={createM.isPending} disabled={!name.trim() || !newUserId} testId="admin.cluster.dns_tsig.create.submit">{t('common.create')}</ActionButton></div>
        </div>
      </Modal>

      <Modal
        open={createdKey !== null}
        onClose={() => setCreatedKey(null)}
        title={t('dns.tsig.secret.title')}
        testId="admin.cluster.dns_tsig.secret.modal"
        footer={<div className="flex justify-end"><Button onClick={() => setCreatedKey(null)}>{t('common.done')}</Button></div>}
      >
        <div className="space-y-4">
          <Alert variant="warn" title={t('dns.tsig.secret.warning_title')}>
            {t('dns.tsig.secret.warning_body')}
          </Alert>
          <div className="text-sm font-medium text-fg">{createdKey?.name}</div>
          {createdKey?.secret ? (
            <SecretField
              value={createdKey.secret}
              revealedByDefault
              label={t('common.secret')}
              testId="admin.cluster.dns_tsig.secret.value"
            />
          ) : (
            <Alert variant="danger" title={t('dns.tsig.secret.missing_title')}>
              {t('dns.tsig.secret.missing_body')}
            </Alert>
          )}
        </div>
      </Modal>

      <ConfirmDialog open={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title={t('admin.cluster.dns_tsig.delete.title')} description={confirmDelete ? t('admin.cluster.dns_tsig.delete.description', { name: String(confirmDelete.name ?? `#${confirmDelete.id}`) }) : ''} confirmLabel={t('common.delete')} confirmVariant="danger" onConfirm={() => deleteM.mutate()} loading={deleteM.isPending} />
    </div>
  );
}
