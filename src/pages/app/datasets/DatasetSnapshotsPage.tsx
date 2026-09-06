import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../app/auth';
import { getRuntimeConfig } from '../../../app/config';
import { useI18n } from '../../../app/i18n';

import { useChrome } from '../../../components/layout/ChromeContext';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Input } from '../../../components/ui/Input';
import { KeysetPagination } from '../../../components/ui/KeysetPagination';
import { LoadingState } from '../../../components/ui/LoadingState';
import { Modal } from '../../../components/ui/Modal';

import { fetchTransactionChains } from '../../../lib/api/transactions';
import { getMetaActionStateId } from '../../../lib/api/haveapi';
import {
  createDatasetSnapshot,
  createSnapshotDownload,
  deleteDatasetSnapshot,
  fetchDatasetSnapshots,
  rollbackDatasetSnapshot,
  type Snapshot,
  type SnapshotDownload,
} from '../../../lib/api/datasets';

import { formatErrorMessage } from '../../../lib/errors';
import { formatDateTime } from '../../../lib/format';
import { useKeysetPagination } from '../../../lib/hooks/useKeysetPagination';
import { cursorFromDescendingPage } from '../../../lib/lockIndex';
import { hasActiveChains } from '../../../lib/taskStatus';

import { useDatasetContext } from './DatasetContext';
import {
  snapshotDownloadCanOpen,
  snapshotDownloadHref,
  snapshotDownloadStatus,
} from './DatasetDownloadModel';
import {
  DatasetDownloadOpenButton,
  DatasetDownloadStateBadge,
  datasetDownloadStatusHelp,
} from './DatasetDownloadStatusView';
import { datasetSnapshotActionGates } from './DatasetSnapshotActionGates';
import {
  DatasetSnapshotConfirmDialog,
  type DatasetSnapshotConfirmState,
} from './DatasetSnapshotConfirmDialog';

/** Empty prefix preserves the existing dataset-detail URL contract. */
export type DatasetSnapshotsPageProps = { queryParamPrefix?: string };

export function datasetSnapshotQueryParamKeys(prefix = '') {
  return {
    search: `${prefix}q`,
    action: `${prefix}action`,
  } as const;
}

export function DatasetSnapshotsPage({ queryParamPrefix = '' }: DatasetSnapshotsPageProps = {}) {
  const {
    dataset,
    refetch: refetchDataset,
    busyTransaction,
    chainsLoading,
    chainsError,
    chainsStale,
    refetchChains,
    datasetRef,
    busyLocalLock,
    detailPath,
  } = useDatasetContext();
  const chrome = useChrome();
  const { t } = useI18n();
  const { role, user } = useAuth();
  const queryKeys = useMemo(() => datasetSnapshotQueryParamKeys(queryParamPrefix), [queryParamPrefix]);

  const datasetLabelForToast = String((dataset as any).label ?? (dataset as any).name ?? `Dataset #${dataset.id}`);

  const [searchParams, setSearchParams] = useSearchParams();
  const qstr = searchParams.get(queryKeys.search) ?? '';

  function changeQuery(nextQuery: string) {
    const next = new URLSearchParams(searchParams);
    const trimmed = nextQuery.trim();
    if (trimmed) next.set(queryKeys.search, trimmed);
    else next.delete(queryKeys.search);
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }

  const pagination = useKeysetPagination({
    id: `dataset.snapshots.list${queryParamPrefix ? `.${queryParamPrefix}` : ''}`,
    filterKey: JSON.stringify({ datasetId: dataset.id, q: qstr.trim() }),
    searchParams,
    setSearchParams,
    paramPrefix: queryParamPrefix,
    defaultLimit: 50,
    allowedLimits: [25, 50, 100],
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [createLabel, setCreateLabel] = useState('');

  useEffect(() => {
    if (searchParams.get(queryKeys.action) !== 'create') return;
    setCreateOpen(true);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete(queryKeys.action);
      return next;
    }, { replace: true });
  }, [queryKeys.action, searchParams, setSearchParams]);

  const [createdDownload, setCreatedDownload] = useState<SnapshotDownload | null>(null);

  const [confirm, setConfirm] = useState<DatasetSnapshotConfirmState>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const snapsQ = useQuery({
    queryKey: ['datasets', dataset.id, 'snapshots', { limit: pagination.limit, fromId: pagination.fromId, q: qstr.trim() }],
    queryFn: async () =>
      fetchDatasetSnapshots(dataset.id, { limit: pagination.limit, fromId: pagination.fromId, q: qstr.trim() || undefined }),
  });

  async function preflightDatasetNotBusy() {
    const chainsRes = await fetchTransactionChains({ className: 'Dataset', rowId: dataset.id, limit: 10 });
    if (hasActiveChains(chainsRes.data)) {
      const err: any = new Error(t('toast.action_blocked.body'));
      err.code = 'BUSY';
      throw err;
    }
  }

  const createSnap = useMutation({
    mutationFn: async () => {
      await preflightDatasetNotBusy();
      return createDatasetSnapshot(dataset.id, { label: createLabel.trim() || undefined });
    },
    onMutate: () => {
      chrome.acquireLocalLock(datasetRef);
    },
    onSuccess: (r) => {
      const asId = getMetaActionStateId(r.meta);
      if (asId !== undefined)
        chrome.trackActionState(asId, {
          actionLabelKey: 'action.dataset.snapshot.create.label',
          objectLabel: datasetLabelForToast,
          object: datasetRef,
          progressTitleKey: 'modal.dataset.snapshot.create.title',
          blockUi: true,
        });

      setCreateOpen(false);
      setCreateLabel('');

      // Newly created snapshot is likely on page 1.
      pagination.goToPage(1);
      snapsQ.refetch();
      refetchDataset();
      refetchChains();
    },
    onSettled: () => {
      chrome.releaseLocalLock(datasetRef);
    },
    onError: (err: any) => {
      if (err?.code === 'BUSY') chrome.openTasks();
    },
  });

  const rollbackSnap = useMutation({
    mutationFn: async (snapshotId: number) => {
      await preflightDatasetNotBusy();
      return rollbackDatasetSnapshot(dataset.id, snapshotId);
    },
    onMutate: () => {
      chrome.acquireLocalLock(datasetRef);
    },
    onSuccess: (r) => {
      const asId = getMetaActionStateId(r.meta);
      if (asId !== undefined)
        chrome.trackActionState(asId, {
          actionLabelKey: 'action.dataset.snapshot.rollback.label',
          objectLabel: datasetLabelForToast,
          object: datasetRef,
          progressTitleKey: 'modal.dataset.snapshot.rollback.title',
        });

      snapsQ.refetch();
      refetchDataset();
      refetchChains();
    },
    onSettled: () => {
      chrome.releaseLocalLock(datasetRef);
    },
    onError: (err: any) => {
      if (err?.code === 'BUSY') chrome.openTasks();
    },
  });

  const deleteSnap = useMutation({
    mutationFn: async (snapshotId: number) => {
      await preflightDatasetNotBusy();
      return deleteDatasetSnapshot(dataset.id, snapshotId);
    },
    onMutate: () => {
      chrome.acquireLocalLock(datasetRef);
    },
    onSuccess: (r) => {
      const asId = getMetaActionStateId(r.meta);
      if (asId !== undefined)
        chrome.trackActionState(asId, {
          actionLabelKey: 'action.dataset.snapshot.delete.label',
          objectLabel: datasetLabelForToast,
          object: datasetRef,
          progressTitleKey: 'modal.dataset.snapshot.delete.title',
        });

      snapsQ.refetch();
      refetchDataset();
      refetchChains();
    },
    onSettled: () => {
      chrome.releaseLocalLock(datasetRef);
    },
    onError: (err: any) => {
      if (err?.code === 'BUSY') chrome.openTasks();
    },
  });

  const createDl = useMutation({
    mutationFn: async (snapshot: Snapshot) => {
      await preflightDatasetNotBusy();
      return createSnapshotDownload({
        snapshot: snapshot.id,
        format: 'archive',
        send_mail: true,
      });
    },
    onMutate: () => {
      chrome.acquireLocalLock(datasetRef);
      setCreatedDownload(null);
    },
    onSuccess: (r) => {
      const asId = getMetaActionStateId(r.meta);
      if (asId !== undefined)
        chrome.trackActionState(asId, {
          actionLabelKey: 'action.dataset.download.create.label',
          objectLabel: datasetLabelForToast,
          object: datasetRef,
          progressTitleKey: 'modal.dataset.download.create.title',
          blockUi: true,
        });

      setCreatedDownload(r.data ?? null);
      refetchChains();
    },
    onSettled: () => {
      chrome.releaseLocalLock(datasetRef);
    },
    onError: (err: any) => {
      if (err?.code === 'BUSY') chrome.openTasks();
    },
  });

  const pageData = snapsQ.data?.data ?? [];
  const totalCount =
    typeof snapsQ.data?.meta?.['total_count'] === 'number' ? Number(snapsQ.data.meta['total_count']) : pageData.length;
  const rows = pageData;

  const pageCursor = useMemo(() => cursorFromDescendingPage(pageData as any), [pageData]);
  const hasMore = pageData.length >= pagination.limit;
  const filtersActive = Boolean(qstr.trim());

  function requestSnapshotDownload(s: Snapshot) {
    createDl.mutate(s);
  }

  function openConfirm(next: NonNullable<DatasetSnapshotConfirmState>) {
    setConfirmError(null);
    setConfirm(next);
  }

  const busyLocal = [busyLocalLock, createSnap.isPending, rollbackSnap.isPending,
    deleteSnap.isPending, createDl.isPending, confirmBusy].some(Boolean);
  const { createGate, downloadGate, rollbackGate, deleteGate } = datasetSnapshotActionGates({
    dataset, role, userId: user?.id, busyLocal, busyTransaction,
    lockStateUnknown: chainsLoading || chainsError !== null || chainsStale,
  });

  const confirmGate = confirm?.kind === 'rollback' ? rollbackGate : confirm?.kind === 'delete' ? deleteGate : null;

  const cfg = useMemo(() => getRuntimeConfig(), []);
  const downloadHrefOptions = useMemo(
    () => ({
      webuiUrl: cfg.webuiUrl,
      origin: typeof window !== 'undefined' ? window.location.origin : undefined,
    }),
    [cfg.webuiUrl]
  );
  const createdDownloadHref = createdDownload ? snapshotDownloadHref(createdDownload, downloadHrefOptions) : undefined;
  const createdDownloadStatus = createdDownload
    ? snapshotDownloadStatus(createdDownload, { href: createdDownloadHref })
    : null;
  const createdDownloadCanOpen = createdDownloadStatus
    ? snapshotDownloadCanOpen(createdDownloadStatus, createdDownloadHref)
    : false;
  const createdDownloadTitle =
    createdDownloadStatus === 'ready'
      ? t('dataset.download.created.title.ready')
      : t('dataset.download.created.title.pending');
  const createdDownloadBody =
    createdDownloadStatus === 'ready'
      ? t('dataset.download.created.body.ready')
      : t('dataset.download.created.body.pending');
  const pendingDownloadSnapshotId = createDl.isPending ? Number((createDl.variables as Snapshot | undefined)?.id) : null;
  const downloadsPath = `${detailPath}/downloads`;

  return (
    <div className="space-y-6" data-testid="dataset.snapshots.list">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-fg">{t('dataset.snapshots.title')}</h2>
          <p className="mt-1 text-sm text-muted">{t('dataset.snapshots.subtitle')}</p>
          {filtersActive ? <p className="mt-1 text-xs text-faint">{t('list.meta.filters_active')}</p> : null}
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
          <div className="w-full sm:w-72">
            <Input
              value={qstr}
              onChange={(e) => changeQuery(e.target.value)}
              placeholder={t('dataset.snapshots.search.placeholder')}
              autoComplete="off"
              testId="dataset.snapshots.search.input"
            />
            <div className="mt-1 text-xs text-faint">
              {t('common.showing_n_of_m', { shown: rows.length, total: totalCount })}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              testId="dataset.snapshots.refresh"
              variant="secondary"
              onClick={() => snapsQ.refetch()}
              disabled={snapsQ.isFetching}
            >
              {t('common.refresh')}
            </Button>
            <ActionButton
              onClick={() => setCreateOpen(true)}
              disabled={!createGate.allowed}
              disabledReason={!createGate.allowed ? createGate.reason : undefined}
              testId="dataset.snapshots.create.open"
            >
              {t('dataset.snapshots.create.open')}
            </ActionButton>
          </div>
        </div>
      </div>

      {createDl.isError ? (
        <Alert title={t('dataset.download.create.error.title')} variant="danger">
          {formatErrorMessage(createDl.error)}
        </Alert>
      ) : null}

      {snapsQ.isLoading ? (
        <Card>
          <LoadingState testId="dataset.snapshots.loading" />
        </Card>
      ) : snapsQ.isError ? (
        <ErrorState
          testId="dataset.snapshots.error"
          title={t('dataset.snapshots.load_error.title')}
          error={snapsQ.error}
          onRetry={() => void snapsQ.refetch()}
          showBack={false}
          detailsExtra={{ page: 'dataset.snapshots', datasetId: dataset.id }}
        />
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="space-y-3 md:hidden">
            {rows.length === 0 ? (
              <Card>
                <div className="p-4 text-center text-sm text-muted">{t('dataset.snapshots.empty')}</div>
              </Card>
            ) : (
              rows.map((s) => (
                <Card key={s.id} testId={`dataset.snapshots.card.${s.id}`}>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-fg">{String(s.name ?? t('common.na'))}</div>
                        <div className="mt-0.5 text-xs text-faint">#{s.id}</div>
                        {s.label ? <div className="mt-1 text-sm text-muted">{String(s.label)}</div> : null}
                        <div className="mt-1 text-xs text-faint">
                          {t('dataset.snapshots.created_at', { dt: formatDateTime(s.created_at as any) })}
                        </div>
                      </div>
                      <Badge variant="neutral">#{s.id}</Badge>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <ActionButton
                        size="sm"
                        variant="secondary"
                        onClick={() => requestSnapshotDownload(s)}
                        loading={pendingDownloadSnapshotId === s.id}
                        disabled={createDl.isPending || !downloadGate.allowed}
                        disabledReason={!downloadGate.allowed ? downloadGate.reason : undefined}
                        testId={`dataset.snapshots.card.${s.id}.download`}
                      >
                        {t('common.download')}
                      </ActionButton>
                      <ActionButton
                        size="sm"
                        variant="secondary"
                        onClick={() => openConfirm({ kind: 'rollback', snapshot: s })}
                        disabled={!rollbackGate.allowed}
                        disabledReason={!rollbackGate.allowed ? rollbackGate.reason : undefined}
                        testId={`dataset.snapshots.card.${s.id}.rollback`}
                      >
                        {t('common.rollback')}
                      </ActionButton>
                      <ActionButton
                        size="sm"
                        variant="danger"
                        onClick={() => openConfirm({ kind: 'delete', snapshot: s })}
                        disabled={!deleteGate.allowed}
                        disabledReason={!deleteGate.allowed ? deleteGate.reason : undefined}
                        testId={`dataset.snapshots.card.${s.id}.delete`}
                      >
                        {t('common.delete')}
                      </ActionButton>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>

          {/* Desktop: table */}
          <Card className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-list">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-faint">
                    <th className="py-2 pl-4 pr-3">{t('common.name')}</th>
                    <th className="py-2 pr-3">{t('common.label')}</th>
                    <th className="py-2 pr-3">{t('common.created')}</th>
                    <th className="py-2 pr-4">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-sm text-muted">
                        {t('dataset.snapshots.empty')}
                      </td>
                    </tr>
                  ) : (
                    rows.map((s) => (
                      <tr key={s.id} className="border-t border-border" data-testid={`dataset.snapshots.row.${s.id}`}>
                        <td className="py-2 pl-4 pr-3">
                          <div className="font-medium text-fg">{String(s.name ?? t('common.na'))}</div>
                          <div className="mt-1 text-xs text-faint">#{s.id}</div>
                        </td>
                        <td className="py-2 pr-3">
                          {s.label ? String(s.label) : <span className="text-faint">{t('common.na')}</span>}
                        </td>
                        <td className="py-2 pr-3">{formatDateTime(s.created_at as any)}</td>
                        <td className="py-2 pr-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <ActionButton
                              size="sm"
                              variant="secondary"
                              onClick={() => requestSnapshotDownload(s)}
                              loading={pendingDownloadSnapshotId === s.id}
                              disabled={createDl.isPending || !downloadGate.allowed}
                              disabledReason={!downloadGate.allowed ? downloadGate.reason : undefined}
                              testId={`dataset.snapshots.row.${s.id}.download`}
                            >
                              {t('common.download')}
                            </ActionButton>
                            <ActionButton
                              size="sm"
                              variant="secondary"
                              onClick={() => openConfirm({ kind: 'rollback', snapshot: s })}
                              disabled={!rollbackGate.allowed}
                              disabledReason={!rollbackGate.allowed ? rollbackGate.reason : undefined}
                              testId={`dataset.snapshots.row.${s.id}.rollback`}
                            >
                              {t('common.rollback')}
                            </ActionButton>
                            <ActionButton
                              size="sm"
                              variant="danger"
                              onClick={() => openConfirm({ kind: 'delete', snapshot: s })}
                              disabled={!deleteGate.allowed}
                              disabledReason={!deleteGate.allowed ? deleteGate.reason : undefined}
                              testId={`dataset.snapshots.row.${s.id}.delete`}
                            >
                              {t('common.delete')}
                            </ActionButton>
                            <Badge variant="neutral">#{s.id}</Badge>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <KeysetPagination
              page={pagination.page}
              pageCount={pagination.stack.length}
              canPrev={pagination.canPrev}
              canNext={hasMore}
              onPrev={pagination.goPrev}
              onNext={() => pagination.goNext(pageCursor)}
              onGoToPage={pagination.goToPage}
              limit={pagination.limit}
              allowedLimits={pagination.allowedLimits}
              onLimitChange={pagination.setLimit}
              testId="dataset.snapshots.pagination.desktop"
            />
          </Card>

          {/* Mobile pagination */}
          <div className="md:hidden">
            <Card>
              <KeysetPagination
                page={pagination.page}
                pageCount={pagination.stack.length}
                canPrev={pagination.canPrev}
                canNext={hasMore}
                onPrev={pagination.goPrev}
                onNext={() => pagination.goNext(pageCursor)}
                onGoToPage={pagination.goToPage}
                limit={pagination.limit}
                allowedLimits={pagination.allowedLimits}
                onLimitChange={pagination.setLimit}
                testId="dataset.snapshots.pagination.mobile"
                className="border-t-0"
              />
            </Card>
          </div>
        </>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t('dataset.snapshots.create.modal_title')}>
        <div className="space-y-4" data-testid="dataset.snapshots.create.modal">
          <div className="text-sm text-muted">{t('dataset.snapshots.create.help')}</div>
          <div className="rounded-md border border-border bg-surface-2 p-3 text-xs text-muted">
            {t('dataset.snapshots.create.scope', { dataset: datasetLabelForToast })}
          </div>

          <div>
            <div className="mb-1 text-xs font-medium text-muted">{t('common.label')}</div>
            <Input
              value={createLabel}
              onChange={(e) => setCreateLabel(e.target.value)}
              placeholder={t('dataset.snapshots.create.label.placeholder')}
              testId="dataset.snapshots.create.label"
            />
          </div>

          {createSnap.isError ? (
            <Alert title={t('dataset.snapshots.create.error.title')} variant="danger">
              {formatErrorMessage(createSnap.error)}
            </Alert>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)} testId="dataset.snapshots.create.cancel">
              {t('common.cancel')}
            </Button>
            <ActionButton
              onClick={() => createSnap.mutate()}
              loading={createSnap.isPending}
              disabled={!createGate.allowed}
              disabledReason={!createGate.allowed ? createGate.reason : undefined}
              testId="dataset.snapshots.create.submit"
            >
              {createSnap.isPending ? t('common.creating') : t('common.create')}
            </ActionButton>
          </div>
        </div>
      </Modal>

      <Modal
        open={createdDownload !== null}
        onClose={() => setCreatedDownload(null)}
        title={createdDownloadTitle}
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {createdDownload && createdDownloadStatus ? (
              <DatasetDownloadOpenButton
                href={createdDownloadHref}
                canOpen={createdDownloadCanOpen}
                disabledTitle={datasetDownloadStatusHelp(createdDownloadStatus, createdDownload, t)}
                testId="dataset.snapshots.download.created.open"
              />
            ) : null}
            <Button to={downloadsPath} variant="secondary" testId="dataset.snapshots.download.created.downloads">
              {t('dataset.download.created.open_downloads')}
            </Button>
            <Button variant="secondary" onClick={() => setCreatedDownload(null)} testId="dataset.snapshots.download.created.close">
              {t('common.close')}
            </Button>
          </div>
        }
      >
        {createdDownload && createdDownloadStatus ? (
          <div className="space-y-4" data-testid="dataset.snapshots.download.created">
            <div className="text-sm text-muted">{createdDownloadBody}</div>
            <div className="rounded-md border border-border bg-surface-2 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <DatasetDownloadStateBadge status={createdDownloadStatus} t={t} />
                <span className="text-muted">
                  {t('dataset.downloads.item_title', { id: createdDownload.id })}
                </span>
              </div>
              <div className="mt-2 text-xs text-muted">
                {datasetDownloadStatusHelp(createdDownloadStatus, createdDownload, t)}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <DatasetSnapshotConfirmDialog
        key={confirm ? `${confirm.kind}:${confirm.snapshot.id}` : 'closed'}
        confirm={confirm}
        gate={confirmGate}
        busy={confirmBusy}
        error={confirmError}
        onCancel={() => {
          if (confirmBusy) return;
          setConfirm(null);
          setConfirmError(null);
          setConfirmBusy(false);
        }}
        onConfirm={async (nextConfirm) => {
          setConfirmBusy(true);
          setConfirmError(null);
          try {
            if (nextConfirm.kind === 'rollback') await rollbackSnap.mutateAsync(nextConfirm.snapshot.id);
            else await deleteSnap.mutateAsync(nextConfirm.snapshot.id);
            setConfirm(null);
          } catch (e) {
            setConfirmError(formatErrorMessage(e));
          } finally {
            setConfirmBusy(false);
          }
        }}
      />
    </div>
  );
}
