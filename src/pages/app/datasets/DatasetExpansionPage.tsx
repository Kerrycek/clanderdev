import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import { useAppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';
import { useToasts } from '../../../app/toasts';

import { useChrome } from '../../../components/layout/ChromeContext';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Input } from '../../../components/ui/Input';
import { KeysetPagination } from '../../../components/ui/KeysetPagination';
import { LoadingState } from '../../../components/ui/LoadingState';
import { Modal } from '../../../components/ui/Modal';
import { Checkbox } from '../../../components/ui/Checkbox';
import { TableCard } from '../../../components/ui/TableCard';

import { fetchTransactionChains } from '../../../lib/api/transactions';
import {
  addDatasetExpansionSpace,
  createDatasetExpansion,
  fetchDatasetExpansion,
  fetchDatasetExpansionHistory,
  registerExpandedDataset,
  updateDatasetExpansion,
  type DatasetExpansion,
} from '../../../lib/api/datasets';
import { getMetaActionStateId } from '../../../lib/api/haveapi';
import { formatDateTime, formatDurationSeconds, formatMiB } from '../../../lib/format';
import { useKeysetPagination } from '../../../lib/hooks/useKeysetPagination';
import { cursorFromDescendingPage } from '../../../lib/lockIndex';
import { hasActiveChains, objectStateBadge } from '../../../lib/taskStatus';

import { useDatasetContext } from './DatasetContext';
import {
  datasetExpansionEditForm,
  defaultDatasetExpansionForm,
  parseExpansionDays,
  parseExpansionGiB,
  type DatasetExpansionCreateMode,
  type DatasetExpansionEditFormState,
  type DatasetExpansionNewFormState,
} from './DatasetExpansionFormModel';

function expansionStateBadge(exp: DatasetExpansion, t: (k: string) => string) {
  const st = String(exp.state ?? '').trim().toLowerCase();
  if (st === 'active') return { variant: 'warn' as const, label: t('dataset.expansion.state.active') };
  if (st === 'resolved') return { variant: 'ok' as const, label: t('dataset.expansion.state.resolved') };
  if (st) return { variant: 'neutral' as const, label: st };
  return { variant: 'neutral' as const, label: t('state.unknown') };
}

export function DatasetExpansionPage() {
  const { dataset, refetch, datasetRef, busyTransaction, busyLocalLock, refetchChains } = useDatasetContext();
  const { mode } = useAppMode();
  const { t } = useI18n();
  const { pushToast } = useToasts();
  const chrome = useChrome();
  const qc = useQueryClient();

  const [searchParams, setSearchParams] = useSearchParams();
  const expansionId = typeof (dataset as any).dataset_expansion?.id === 'number' ? Number((dataset as any).dataset_expansion.id) : null;
  const [newOpen, setNewOpen] = useState<DatasetExpansionCreateMode | null>(null);
  const [newForm, setNewForm] = useState<DatasetExpansionNewFormState>(defaultDatasetExpansionForm('create'));
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<DatasetExpansionEditFormState | null>(null);
  const [addSpaceOpen, setAddSpaceOpen] = useState(false);
  const [addSpaceGiB, setAddSpaceGiB] = useState('10');

  const pagination = useKeysetPagination({
    id: `dataset.${dataset.id}.expansion.history`,
    filterKey: JSON.stringify({ expansionId }),
    searchParams,
    setSearchParams,
    defaultLimit: 25,
    allowedLimits: [25, 50, 100],
  });

  const expansionQ = useQuery({
    queryKey: ['dataset_expansions', expansionId],
    enabled: expansionId !== null,
    queryFn: async () => (await fetchDatasetExpansion(expansionId as number)).data,
    staleTime: 10_000,
  });

  const historyQ = useQuery({
    queryKey: ['dataset_expansions', expansionId, 'history', { limit: pagination.limit, fromId: pagination.fromId }],
    enabled: expansionId !== null,
    queryFn: async () =>
      (await fetchDatasetExpansionHistory(expansionId as number, { limit: pagination.limit, fromId: pagination.fromId, includes: 'admin' })).data,
    staleTime: 10_000,
  });

  const historyRows = historyQ.data ?? [];
  const historyCursor = useMemo(() => cursorFromDescendingPage(historyRows as any), [historyRows]);
  const historyHasMore = historyRows.length >= pagination.limit;

  async function preflightDatasetNotBusy() {
    const chainsRes = await fetchTransactionChains({ className: 'Dataset', rowId: dataset.id, limit: 10 });
    if (hasActiveChains(chainsRes.data)) {
      const err: any = new Error(t('toast.action_blocked.body'));
      err.code = 'BUSY';
      throw err;
    }
  }

  const createM = useMutation({
    mutationFn: async (form: DatasetExpansionNewFormState) => {
      await preflightDatasetNotBusy();
      const added = parseExpansionGiB(form.addedSpaceGiB);
      const maxSeconds = parseExpansionDays(form.maxOverDays);
      if (added === null) throw new Error(t('dataset.expansion.validation.added_space'));
      if (maxSeconds === null) throw new Error(t('dataset.expansion.validation.max_days'));
      if (form.mode === 'register') {
        const original = parseExpansionGiB(form.originalRefquotaGiB);
        if (original === null) throw new Error(t('dataset.expansion.validation.original_refquota'));
        return registerExpandedDataset({
          dataset: dataset.id,
          original_refquota: original,
          enable_notifications: form.enableNotifications,
          enable_shrink: form.enableShrink,
          stop_vps: form.stopVps,
          max_over_refquota_seconds: maxSeconds,
        });
      }
      return createDatasetExpansion({
        dataset: dataset.id,
        added_space: added,
        enable_notifications: form.enableNotifications,
        enable_shrink: form.enableShrink,
        stop_vps: form.stopVps,
        max_over_refquota_seconds: maxSeconds,
      });
    },
    onMutate: () => chrome.acquireLocalLock(datasetRef),
    onSuccess: async (res, form) => {
      const asId = getMetaActionStateId((res as any).meta);
      if (asId !== undefined) {
        chrome.trackActionState(asId, {
          actionLabelKey:
            form.mode === 'register' ? 'action.dataset.expansion.register.label' : 'action.dataset.expansion.create.label',
          objectLabel: String((dataset as any).full_name ?? (dataset as any).name ?? `Dataset #${dataset.id}`),
          object: datasetRef,
        });
      }
      await qc.invalidateQueries({ queryKey: ['datasets', 'show', dataset.id] });
      await qc.invalidateQueries({ queryKey: ['dataset_expansions'] });
      setNewOpen(null);
      setNewForm(defaultDatasetExpansionForm('create'));
      refetch();
      refetchChains();
      pushToast({ variant: 'ok', title: t('dataset.expansion.create.success') });
    },
    onError: (err: any) => {
      if (err?.code === 'BUSY') chrome.openTasks();
      pushToast({ variant: 'danger', title: t('dataset.expansion.create.error'), body: String(err?.message ?? err ?? '') });
    },
    onSettled: () => chrome.releaseLocalLock(datasetRef),
  });

  const updateM = useMutation({
    mutationFn: async (form: DatasetExpansionEditFormState) => {
      await preflightDatasetNotBusy();
      if (expansionId === null) throw new Error(t('dataset.expansion.internal_missing_id'));
      const maxSeconds = parseExpansionDays(form.maxOverDays);
      if (maxSeconds === null) throw new Error(t('dataset.expansion.validation.max_days'));
      return updateDatasetExpansion(expansionId, {
        enable_notifications: form.enableNotifications,
        enable_shrink: form.enableShrink,
        stop_vps: form.stopVps,
        max_over_refquota_seconds: maxSeconds,
      });
    },
    onMutate: () => chrome.acquireLocalLock(datasetRef),
    onSuccess: async () => {
      await expansionQ.refetch();
      setEditOpen(false);
      pushToast({ variant: 'ok', title: t('dataset.expansion.update.success') });
      refetchChains();
    },
    onError: (err: any) => {
      if (err?.code === 'BUSY') chrome.openTasks();
      pushToast({ variant: 'danger', title: t('dataset.expansion.update.error'), body: String(err?.message ?? err ?? '') });
    },
    onSettled: () => chrome.releaseLocalLock(datasetRef),
  });

  const addSpaceM = useMutation({
    mutationFn: async () => {
      await preflightDatasetNotBusy();
      if (expansionId === null) throw new Error(t('dataset.expansion.internal_missing_id'));
      const added = parseExpansionGiB(addSpaceGiB);
      if (added === null) throw new Error(t('dataset.expansion.validation.added_space'));
      return addDatasetExpansionSpace(expansionId, { added_space: added });
    },
    onMutate: () => chrome.acquireLocalLock(datasetRef),
    onSuccess: async (res) => {
      const asId = getMetaActionStateId((res as any).meta);
      if (asId !== undefined) {
        chrome.trackActionState(asId, {
          actionLabelKey: 'action.dataset.expansion.add_space.label',
          objectLabel: String((dataset as any).full_name ?? (dataset as any).name ?? `Dataset #${dataset.id}`),
          object: datasetRef,
        });
      }
      setAddSpaceOpen(false);
      setAddSpaceGiB('20');
      await historyQ.refetch();
      await expansionQ.refetch();
      refetch();
      refetchChains();
      pushToast({ variant: 'ok', title: t('dataset.expansion.add_space.success') });
    },
    onError: (err: any) => {
      if (err?.code === 'BUSY') chrome.openTasks();
      pushToast({ variant: 'danger', title: t('dataset.expansion.add_space.error'), body: String(err?.message ?? err ?? '') });
    },
    onSettled: () => chrome.releaseLocalLock(datasetRef),
  });

  const busy = busyTransaction || busyLocalLock;
  const currentExpansion = expansionQ.data ?? null;
  const stateBadge = currentExpansion ? expansionStateBadge(currentExpansion, t) : null;
  const objectBadge = objectStateBadge((dataset as any).object_state, t);

  if (expansionId !== null && expansionQ.isLoading) return <LoadingState testId="dataset.expansion.loading" />;
  if (expansionId !== null && expansionQ.isError) {
    return (
      <ErrorState
        testId="dataset.expansion.error"
        title={t('dataset.expansion.load_error.title')}
        error={expansionQ.error}
        onRetry={() => void expansionQ.refetch()}
        detailsExtra={{ page: 'dataset.expansion', datasetId: dataset.id, expansionId }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {busy ? (
        <Alert
          variant="warn"
          title={t('dataset.expansion.busy.title')}
          description={t('dataset.expansion.busy.body')}
          testId="dataset.expansion.busy"
        />
      ) : null}

      {currentExpansion ? (
        <>
          <Card testId="dataset.expansion.summary">
            <CardHeader
              title={t('dataset.expansion.title')}
              subtitle={t('dataset.expansion.subtitle')}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    testId="dataset.expansion.add_space.open"
                    onClick={() => setAddSpaceOpen(true)}
                    disabled={busy || String(currentExpansion.state ?? '') !== 'active'}
                  >
                    {t('dataset.expansion.add_space.open')}
                  </Button>
                  {mode === 'admin' ? (
                    <Button
                      testId="dataset.expansion.edit.open"
                      variant="secondary"
                      onClick={() => {
                        setEditForm(datasetExpansionEditForm(currentExpansion));
                        setEditOpen(true);
                      }}
                      disabled={busy}
                    >
                      {t('common.edit')}
                    </Button>
                  ) : null}
                </div>
              }
            />
            <CardBody>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <div className="text-xs text-faint">{t('common.state')}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {stateBadge ? <Badge variant={stateBadge.variant}>{stateBadge.label}</Badge> : null}
                    <Badge variant={objectBadge.variant}>{objectBadge.label}</Badge>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-faint">{t('dataset.expansion.field.added_space')}</div>
                  <div className="font-medium text-fg">{formatMiB(currentExpansion.added_space)}</div>
                </div>
                <div>
                  <div className="text-xs text-faint">{t('dataset.expansion.field.original_refquota')}</div>
                  <div className="font-medium text-fg">{formatMiB(currentExpansion.original_refquota)}</div>
                </div>
                <div>
                  <div className="text-xs text-faint">{t('dataset.expansion.field.current_refquota')}</div>
                  <div className="font-medium text-fg">{formatMiB((dataset as any).refquota)}</div>
                </div>
                <div>
                  <div className="text-xs text-faint">{t('dataset.expansion.field.created')}</div>
                  <div className="font-medium text-fg">{formatDateTime(currentExpansion.created_at)}</div>
                </div>
                <div>
                  <div className="text-xs text-faint">{t('dataset.expansion.field.notify')}</div>
                  <div className="font-medium text-fg">{t(currentExpansion.enable_notifications ? 'common.enabled' : 'common.disabled')}</div>
                </div>
                <div>
                  <div className="text-xs text-faint">{t('dataset.expansion.field.auto_shrink')}</div>
                  <div className="font-medium text-fg">{t(currentExpansion.enable_shrink ? 'common.enabled' : 'common.disabled')}</div>
                </div>
                <div>
                  <div className="text-xs text-faint">{t('dataset.expansion.field.stop_vps')}</div>
                  <div className="font-medium text-fg">{t(currentExpansion.stop_vps ? 'common.enabled' : 'common.disabled')}</div>
                </div>
                <div>
                  <div className="text-xs text-faint">{t('dataset.expansion.field.max_over')}</div>
                  <div className="font-medium text-fg">
                    {typeof currentExpansion.max_over_refquota_seconds === 'number'
                      ? formatDurationSeconds(currentExpansion.max_over_refquota_seconds)
                      : t('common.na')}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-faint">{t('dataset.expansion.field.over_quota')}</div>
                  <div className="font-medium text-fg">{formatDurationSeconds(currentExpansion.over_refquota_seconds)}</div>
                </div>
              </div>
            </CardBody>
          </Card>

          {String(currentExpansion.state ?? '') !== 'active' ? (
            <Alert
              variant="info"
              title={t('dataset.expansion.resolved.title')}
              description={t('dataset.expansion.resolved.body')}
              testId="dataset.expansion.resolved"
            />
          ) : null}

          {historyQ.isLoading ? (
            <LoadingState testId="dataset.expansion.history.loading" />
          ) : historyQ.isError ? (
            <ErrorState
              testId="dataset.expansion.history.error"
              title={t('dataset.expansion.history.load_error.title')}
              error={historyQ.error}
              onRetry={() => void historyQ.refetch()}
              detailsExtra={{ page: 'dataset.expansion.history', datasetId: dataset.id, expansionId }}
            />
          ) : historyRows.length === 0 ? (
            <EmptyState
              testId="dataset.expansion.history.empty"
              title={t('dataset.expansion.history.empty.title')}
              body={t('dataset.expansion.history.empty.body')}
            />
          ) : (
            <TableCard
              testId="dataset.expansion.history.table"
              minWidth="lg"
              footer={
                historyRows.length > 0 ? (
                  <KeysetPagination
                    page={pagination.page}
                    pageCount={pagination.stack.length}
                    canPrev={pagination.canPrev}
                    canNext={pagination.hasForward || (historyHasMore && historyCursor !== null)}
                    onPrev={pagination.goPrev}
                    onNext={() => pagination.goNext(historyCursor)}
                    onGoToPage={pagination.goToPage}
                    limit={pagination.limit}
                    allowedLimits={pagination.allowedLimits}
                    onLimitChange={pagination.setLimit}
                    testId="dataset.expansion.history.pagination"
                  />
                ) : null
              }
            >
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-faint">{t('common.created')}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-faint">{t('dataset.expansion.field.added_space')}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-faint">{t('dataset.expansion.field.original_refquota')}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-faint">{t('dataset.expansion.history.new_refquota')}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-faint">{t('common.user')}</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((row) => (
                  <tr key={row.id} data-testid={`dataset.expansion.history.row.${row.id}`}>
                    <td className="px-3 py-2 text-sm text-muted">{formatDateTime(row.created_at)}</td>
                    <td className="px-3 py-2 font-medium text-fg">{formatMiB(row.added_space)}</td>
                    <td className="px-3 py-2 text-sm text-muted">{formatMiB(row.original_refquota)}</td>
                    <td className="px-3 py-2 text-sm text-muted">{formatMiB(row.new_refquota)}</td>
                    <td className="px-3 py-2 text-sm text-muted">{typeof (row as any).admin?.login === 'string' ? String((row as any).admin.login) : (typeof (row as any).admin?.id === 'number' ? `#${(row as any).admin.id}` : t('common.na'))}</td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
          )}
        </>
      ) : (
        <Card testId="dataset.expansion.create.form">
          <CardHeader
            title={t('dataset.expansion.create.title')}
            subtitle={t('dataset.expansion.create.inline_subtitle')}
            actions={
              mode === 'admin' ? (
                <Button
                  testId="dataset.expansion.register.open"
                  variant="secondary"
                  onClick={() => {
                    setNewForm(defaultDatasetExpansionForm('register'));
                    setNewOpen('register');
                  }}
                  disabled={busy}
                >
                  {t('dataset.expansion.register.open')}
                </Button>
              ) : null
            }
          />
          <CardBody>
            <div className="grid gap-4 lg:grid-cols-2">
              <Input
                testId="dataset.expansion.form.added_space"
                label={t('dataset.expansion.form.added_space')}
                type="number"
                min="1"
                value={newForm.addedSpaceGiB}
                onChange={(e) => setNewForm((f) => ({ ...f, mode: 'create', addedSpaceGiB: e.target.value }))}
                ariaLabel={t('dataset.expansion.form.added_space')}
              />
              <Input
                testId="dataset.expansion.form.max_over"
                label={t('dataset.expansion.form.max_over')}
                type="number"
                min="1"
                value={newForm.maxOverDays}
                onChange={(e) => setNewForm((f) => ({ ...f, mode: 'create', maxOverDays: e.target.value }))}
                ariaLabel={t('dataset.expansion.form.max_over')}
              />
            </div>
            <div className="mt-1 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <Checkbox checked={newForm.enableNotifications} onChange={(checked) => setNewForm((f) => ({ ...f, mode: 'create', enableNotifications: checked }))} label={t('dataset.expansion.form.enable_notifications')} />
              <Checkbox checked={newForm.enableShrink} onChange={(checked) => setNewForm((f) => ({ ...f, mode: 'create', enableShrink: checked }))} label={t('dataset.expansion.form.enable_shrink')} />
              <Checkbox checked={newForm.stopVps} onChange={(checked) => setNewForm((f) => ({ ...f, mode: 'create', stopVps: checked }))} label={t('dataset.expansion.form.stop_vps')} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <Button testId="dataset.expansion.create.submit" onClick={() => void createM.mutate({ ...newForm, mode: 'create' })} loading={createM.isPending} disabled={busy}>
                {t('dataset.expansion.create.submit')}
              </Button>
              <span className="text-xs text-muted">{t('dataset.expansion.form.max_over_hint')}</span>
            </div>
          </CardBody>
        </Card>
      )}

      <Modal
        open={newOpen === 'register'}
        onClose={() => {
          if (!createM.isPending) setNewOpen(null);
        }}
        title={t('dataset.expansion.register.title')}
        size="md"
        testId="dataset.expansion.create.modal"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setNewOpen(null)} disabled={createM.isPending}>
              {t('common.cancel')}
            </Button>
            <Button testId="dataset.expansion.register.submit" onClick={() => void createM.mutate(newForm)} loading={createM.isPending} disabled={busy}>
              {t('dataset.expansion.register.submit')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <div className="mb-1 text-sm font-medium text-fg">{t('dataset.expansion.form.original_refquota')}</div>
            <Input
              testId="dataset.expansion.form.original_refquota"
              type="number"
              min="1"
              value={newForm.originalRefquotaGiB}
              onChange={(e) => setNewForm((f) => ({ ...f, originalRefquotaGiB: e.target.value }))}
              ariaLabel={t('dataset.expansion.form.original_refquota')}
            />
            <div className="mt-1 text-xs text-faint">{t('dataset.expansion.form.original_refquota_hint', { current: formatMiB((dataset as any).refquota) })}</div>
          </div>

          <div>
            <div className="mb-1 text-sm font-medium text-fg">{t('dataset.expansion.form.max_over')}</div>
            <Input
              testId="dataset.expansion.form.max_over"
              type="number"
              min="1"
              value={newForm.maxOverDays}
              onChange={(e) => setNewForm((f) => ({ ...f, maxOverDays: e.target.value }))}
              ariaLabel={t('dataset.expansion.form.max_over')}
            />
            <div className="mt-1 text-xs text-faint">{t('dataset.expansion.form.max_over_hint')}</div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Checkbox checked={newForm.enableNotifications} onChange={(checked) => setNewForm((f) => ({ ...f, enableNotifications: checked }))} label={t('dataset.expansion.form.enable_notifications')} />
            <Checkbox checked={newForm.enableShrink} onChange={(checked) => setNewForm((f) => ({ ...f, enableShrink: checked }))} label={t('dataset.expansion.form.enable_shrink')} />
            <Checkbox checked={newForm.stopVps} onChange={(checked) => setNewForm((f) => ({ ...f, stopVps: checked }))} label={t('dataset.expansion.form.stop_vps')} />
          </div>
        </div>
      </Modal>

      <Modal
        open={editOpen && editForm !== null}
        onClose={() => {
          if (!updateM.isPending) setEditOpen(false);
        }}
        title={t('dataset.expansion.edit.title')}
        size="md"
        testId="dataset.expansion.edit.modal"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditOpen(false)} disabled={updateM.isPending}>
              {t('common.cancel')}
            </Button>
            <Button testId="dataset.expansion.edit.submit" onClick={() => editForm && void updateM.mutate(editForm)} loading={updateM.isPending} disabled={busy || editForm === null}>
              {t('common.save')}
            </Button>
          </div>
        }
      >
        {editForm ? (
          <div className="space-y-4">
            <div>
              <div className="mb-1 text-sm font-medium text-fg">{t('dataset.expansion.form.max_over')}</div>
              <Input
                testId="dataset.expansion.edit.max_over"
                type="number"
                min="1"
                value={editForm.maxOverDays}
                onChange={(e) => setEditForm((f) => (f ? { ...f, maxOverDays: e.target.value } : f))}
                ariaLabel={t('dataset.expansion.form.max_over')}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Checkbox checked={editForm.enableNotifications} onChange={(checked) => setEditForm((f) => (f ? { ...f, enableNotifications: checked } : f))} label={t('dataset.expansion.form.enable_notifications')} />
              <Checkbox checked={editForm.enableShrink} onChange={(checked) => setEditForm((f) => (f ? { ...f, enableShrink: checked } : f))} label={t('dataset.expansion.form.enable_shrink')} />
              <Checkbox checked={editForm.stopVps} onChange={(checked) => setEditForm((f) => (f ? { ...f, stopVps: checked } : f))} label={t('dataset.expansion.form.stop_vps')} />
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={addSpaceOpen}
        onClose={() => {
          if (!addSpaceM.isPending) setAddSpaceOpen(false);
        }}
        title={t('dataset.expansion.add_space.title')}
        size="sm"
        testId="dataset.expansion.add_space.modal"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddSpaceOpen(false)} disabled={addSpaceM.isPending}>
              {t('common.cancel')}
            </Button>
            <Button testId="dataset.expansion.add_space.submit" onClick={() => void addSpaceM.mutate()} loading={addSpaceM.isPending} disabled={busy}>
              {t('dataset.expansion.add_space.submit')}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-sm font-medium text-fg">{t('dataset.expansion.form.added_space')}</div>
            <Input
              testId="dataset.expansion.add_space.input"
              type="number"
              value={addSpaceGiB}
              onChange={(e) => setAddSpaceGiB(e.target.value)}
              ariaLabel={t('dataset.expansion.form.added_space')}
            />
            <div className="mt-1 text-xs text-faint">{t('dataset.expansion.form.added_space_hint')}</div>
          </div>
          <Alert variant="warn" title={t('dataset.expansion.add_space.warning_title')} description={t('dataset.expansion.add_space.warning_body')} />
        </div>
      </Modal>
    </div>
  );
}
