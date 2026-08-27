import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { useI18n } from '../../../app/i18n';
import { useToasts } from '../../../app/toasts';
import { FilterBar } from '../../../components/layout/FilterBar';
import { PageHeader } from '../../../components/layout/PageHeader';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Input } from '../../../components/ui/Input';
import { KeysetPagination } from '../../../components/ui/KeysetPagination';
import { LoadingState } from '../../../components/ui/LoadingState';
import { Modal } from '../../../components/ui/Modal';
import { SecretField } from '../../../components/ui/SecretField';
import { Select } from '../../../components/ui/Select';
import {
  createDnsTsigKey,
  deleteDnsTsigKey,
  DNS_TSIG_ALGORITHMS,
  fetchDnsTsigKeys,
  type DnsTsigKeySummary,
} from '../../../lib/api/dns';
import { formatErrorMessage } from '../../../lib/errors';
import { formatDateTime } from '../../../lib/format';
import { useKeysetPagination } from '../../../lib/hooks/useKeysetPagination';
import { cursorFromDescendingPage } from '../../../lib/lockIndex';

interface CreatedKeySecret {
  name: string;
  secret: string;
}

function positiveId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function DnsTsigKeysPage() {
  const auth = useAuth();
  const { t } = useI18n();
  const { pushToast } = useToasts();
  const userId = positiveId(auth.user?.id) ?? undefined;
  const [searchParams, setSearchParams] = useSearchParams();
  const [algorithm, setAlgorithm] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [newAlgorithm, setNewAlgorithm] = useState('hmac-sha256');
  const [createdKey, setCreatedKey] = useState<CreatedKeySecret | null>(null);
  const pendingCreatedKey = useRef<CreatedKeySecret | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DnsTsigKeySummary | null>(null);

  const pagination = useKeysetPagination({
    id: 'dns.tsig_keys.mine',
    filterKey: JSON.stringify({ algorithm, userId: userId ?? null }),
    searchParams,
    setSearchParams,
    defaultLimit: 25,
    allowedLimits: [25, 50, 100],
  });

  const listQ = useQuery({
    queryKey: ['dns_tsig_keys', 'mine', userId, algorithm, pagination.page, pagination.limit, pagination.fromId],
    queryFn: async () => {
      if (!userId) throw new Error('TSIG key ownership cannot be verified without an authenticated user ID');
      const result = await fetchDnsTsigKeys({
        user: userId,
        algorithm: algorithm || undefined,
        limit: pagination.limit,
        fromId: pagination.fromId,
      });

      // HaveAPI also enforces this restriction. Keep the client fail-closed so
      // an accidental backend regression cannot expose another user's key row.
      if (result.data.some((row) => positiveId(row.user?.id) !== userId)) {
        throw new Error('TSIG key ownership verification failed');
      }
      return result;
    },
    enabled: auth.status === 'authenticated',
  });

  const rows = listQ.data?.data ?? [];
  const cursor = useMemo(() => cursorFromDescendingPage(rows), [rows]);
  const hasMore = rows.length >= pagination.limit;

  const createM = useMutation({
    mutationFn: async () => {
      return createDnsTsigKey(
        { name: name.trim(), algorithm: newAlgorithm },
        { onOneTimeSecret: (value) => { pendingCreatedKey.current = value; } }
      );
    },
    onSuccess: (result) => {
      const oneTimeValue = pendingCreatedKey.current ?? {
        name: String(result.data?.name ?? name.trim()),
        secret: '',
      };
      pendingCreatedKey.current = null;
      setCreateOpen(false);
      setName('');
      setNewAlgorithm('hmac-sha256');
      setCreatedKey(oneTimeValue);
      void listQ.refetch();
    },
    onError: () => {
      pendingCreatedKey.current = null;
    },
  });

  const deleteM = useMutation({
    mutationFn: async () => {
      if (!confirmDelete) throw new Error('missing key');
      return deleteDnsTsigKey(confirmDelete.id);
    },
    onSuccess: () => {
      pushToast({ variant: 'ok', title: t('common.deleted') });
      setConfirmDelete(null);
      void listQ.refetch();
    },
  });

  if (listQ.isLoading) return <LoadingState testId="dns.tsig.loading" label={t('dns.tsig.loading')} />;
  if (listQ.isError) {
    return (
      <ErrorState
        testId="dns.tsig.error"
        title={t('dns.tsig.load_failed')}
        error={listQ.error}
        onRetry={() => void listQ.refetch()}
        showBack={false}
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="dns.tsig.page">
      <PageHeader
        title={t('dns.tsig.page.title')}
        description={t('dns.tsig.page.description')}
        testId="dns.tsig.header"
      />

      <FilterBar
        left={
          <div className="w-full sm:w-56">
            <Select
              label={t('common.algorithm')}
              value={algorithm}
              onChange={(event) => setAlgorithm(event.target.value)}
              options={[
                { value: '', label: t('common.all') },
                ...DNS_TSIG_ALGORITHMS.map((value) => ({ value, label: value })),
              ]}
              testId="dns.tsig.filter.algorithm"
            />
          </div>
        }
        right={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void listQ.refetch()}>
              {t('common.refresh')}
            </Button>
            <Button onClick={() => setCreateOpen(true)} testId="dns.tsig.create.open">
              {t('dns.tsig.action.create')}
            </Button>
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState testId="dns.tsig.empty" title={t('dns.tsig.empty')} body={t('dns.tsig.empty_body')} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-list">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-faint">
                  <th className="py-2 pl-4 pr-3">{t('common.name')}</th>
                  <th className="py-2 pr-3">{t('common.algorithm')}</th>
                  <th className="py-2 pr-3">{t('common.created')}</th>
                  <th className="py-2 pr-4">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border" data-testid={`dns.tsig.row.${row.id}`}>
                    <td className="py-2 pl-4 pr-3 font-medium text-fg">{String(row.name ?? `#${row.id}`)}</td>
                    <td className="py-2 pr-3">
                      <Badge variant="neutral">{String(row.algorithm ?? t('common.na'))}</Badge>
                    </td>
                    <td className="py-2 pr-3">
                      {row.created_at ? formatDateTime(String(row.created_at)) : t('common.na')}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <ActionButton size="sm" variant="danger" onClick={() => setConfirmDelete(row)} testId={`dns.tsig.row.${row.id}.delete`}>
                        {t('common.delete')}
                      </ActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <KeysetPagination
            page={pagination.page}
            pageCount={pagination.stack.length}
            canPrev={pagination.canPrev}
            canNext={hasMore}
            onPrev={pagination.goPrev}
            onNext={() => pagination.goNext(cursor)}
          />
        </Card>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t('dns.tsig.create.title')} testId="dns.tsig.create.modal">
        <div className="space-y-4">
          {createM.isError ? (
            <Alert variant="danger" title={t('dns.tsig.create.failed')}>
              {formatErrorMessage(createM.error)}
            </Alert>
          ) : null}
          <Input
            label={t('common.name')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            testId="dns.tsig.create.name"
          />
          <Select
            label={t('common.algorithm')}
            value={newAlgorithm}
            onChange={(event) => setNewAlgorithm(event.target.value)}
            options={DNS_TSIG_ALGORITHMS.map((value) => ({ value, label: value }))}
            testId="dns.tsig.create.algorithm"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
            <ActionButton onClick={() => createM.mutate()} loading={createM.isPending} disabled={!name.trim()} testId="dns.tsig.create.submit">
              {t('common.create')}
            </ActionButton>
          </div>
        </div>
      </Modal>

      <Modal
        open={createdKey !== null}
        onClose={() => setCreatedKey(null)}
        title={t('dns.tsig.secret.title')}
        testId="dns.tsig.secret.modal"
        footer={
          <div className="flex justify-end">
            <Button onClick={() => setCreatedKey(null)} testId="dns.tsig.secret.close">
              {t('common.done')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Alert variant="warn" title={t('dns.tsig.secret.warning_title')}>
            {t('dns.tsig.secret.warning_body')}
          </Alert>
          <div>
            <div className="text-sm font-medium text-fg">{createdKey?.name}</div>
            {createdKey?.secret ? (
              <SecretField
                value={createdKey.secret}
                revealedByDefault
                label={t('common.secret')}
                testId="dns.tsig.secret.value"
              />
            ) : (
              <Alert variant="danger" title={t('dns.tsig.secret.missing_title')}>
                {t('dns.tsig.secret.missing_body')}
              </Alert>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={t('dns.tsig.delete.title')}
        description={confirmDelete ? t('dns.tsig.delete.description', { name: String(confirmDelete.name ?? `#${confirmDelete.id}`) }) : ''}
        confirmLabel={t('common.delete')}
        confirmVariant="danger"
        onConfirm={() => deleteM.mutate()}
        loading={deleteM.isPending}
      />
    </div>
  );
}
