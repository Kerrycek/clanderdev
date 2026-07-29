import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';
import { useToasts } from '../../../app/toasts';
import { useChrome } from '../../../components/layout/ChromeContext';
import { DetailShell } from '../../../components/layout/DetailShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { CopyButton } from '../../../components/ui/CopyButton';
import { ErrorState } from '../../../components/ui/ErrorState';
import { LoadingState } from '../../../components/ui/LoadingState';
import { formatDateTime } from '../../../lib/format';
import {
  createExportHost,
  deleteExport,
  deleteExportHost,
  fetchExport,
  fetchExportHosts,
  updateExport,
  updateExportHost,
  type ExportHost,
} from '../../../lib/api/exports';
import { getMetaActionStateId } from '../../../lib/api/haveapi';
import { objectRef } from '../../../lib/objectRef';
import { ExportDeleteDialogs } from './ExportDeleteDialogs';
import { ExportEditDrawer, ExportHostEditorDrawer, type ExportHostFormState } from './ExportDetailDrawers';
import { ExportHostsCard } from './ExportHostsCard';
import {
  buildExportDiff,
  buildExportHostDiff,
  buildUpdateExportPayload,
  editFormFromExport,
  exportAddress,
  parsePositiveInt,
  sanitizeMountName,
  snippetFstab,
  snippetMountCommand,
  snippetNix,
  snippetSystemd,
  sourceLabel,
  sourceShortName,
  type EditExportFormState,
} from './ExportModel';

function defaultEditForm(): EditExportFormState {
  return {
    all_vps: true,
    rw: true,
    sync: true,
    subtree_check: false,
    root_squash: false,
    threads: '8',
    enabled: true,
  };
}

function defaultHostForm(): ExportHostFormState {
  return {
    ip_address: null,
    rw: true,
    sync: true,
    subtree_check: false,
    root_squash: false,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? '');
}

function boolBadgeLabel(value: boolean, t: (key: string, vars?: Record<string, unknown>) => string) {
  return value ? t('common.enabled') : t('common.disabled');
}

export function ExportDetailPage() {
  const { exportId } = useParams();
  const id = useMemo(() => parsePositiveInt(exportId), [exportId]);
  const { basePath, mode } = useAppMode();
  const { t } = useI18n();
  const { pushToast } = useToasts();
  const chrome = useChrome();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const exportQ = useQuery({
    queryKey: ['exports', 'show', id],
    enabled: id !== null,
    queryFn: async () => {
      if (id === null) throw new Error('invalid export id');
      return (await fetchExport(id, { includes: 'dataset,snapshot,host_ip_address,user' })).data;
    },
    staleTime: 10_000,
  });

  const hostsQ = useQuery({
    queryKey: ['exports', 'hosts', id],
    enabled: id !== null,
    queryFn: async () => {
      if (id === null) throw new Error('invalid export id');
      return (await fetchExportHosts(id, { limit: 200, includes: 'ip_address' })).data;
    },
    staleTime: 10_000,
  });

  const ex = exportQ.data ?? null;
  const hosts = hostsQ.data ?? [];
  const datasetId = parsePositiveInt(ex?.dataset?.id);
  const userId = parsePositiveInt(ex?.user?.id);
  const datasetRef = datasetId ? objectRef('Dataset', datasetId) : null;
  const snapshotId = parsePositiveInt(ex?.snapshot?.id);
  const address = exportAddress(ex);
  const path = String(ex?.path ?? '');
  const mountPoint = useMemo(() => `/mnt/${sanitizeMountName(sourceShortName(ex), id ?? 0)}`, [ex, id]);
  const sourceIsSnapshot = snapshotId !== null;
  const allVps = Boolean(ex?.all_vps);
  const rw = Boolean(ex?.rw);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [hostEditorOpen, setHostEditorOpen] = useState(false);
  const [editingHost, setEditingHost] = useState<ExportHost | null>(null);
  const [deleteHost, setDeleteHost] = useState<ExportHost | null>(null);
  const [editForm, setEditForm] = useState<EditExportFormState>(() => defaultEditForm());
  const [hostForm, setHostForm] = useState<ExportHostFormState>(() => defaultHostForm());

  useEffect(() => {
    if (ex) setEditForm(editFormFromExport(ex));
  }, [ex]);

  const openCreateHost = () => {
    setEditingHost(null);
    setHostForm({
      ip_address: null,
      rw,
      sync: Boolean(ex?.sync),
      subtree_check: Boolean(ex?.subtree_check),
      root_squash: Boolean(ex?.root_squash),
    });
    setHostEditorOpen(true);
  };

  const openEditHost = (host: ExportHost) => {
    setEditingHost(host);
    setHostForm({
      ip_address: parsePositiveInt(host.ip_address?.id),
      rw: Boolean(host.rw),
      sync: Boolean(host.sync),
      subtree_check: Boolean(host.subtree_check),
      root_squash: Boolean(host.root_squash),
    });
    setHostEditorOpen(true);
  };

  const closeHostEditor = () => {
    setHostEditorOpen(false);
    setEditingHost(null);
  };

  const openDeleteExport = () => {
    setDeleteOpen(true);
  };

  const closeDeleteExport = () => {
    setDeleteOpen(false);
  };

  const openDeleteHost = (host: ExportHost) => {
    setDeleteHost(host);
  };

  const closeDeleteHost = () => {
    setDeleteHost(null);
  };

  async function invalidateAll() {
    await qc.invalidateQueries({ queryKey: ['exports'] });
    if (datasetId) await qc.invalidateQueries({ queryKey: ['datasets'] });
  }

  function onMutateLock() {
    if (datasetRef) chrome.acquireLocalLock(datasetRef);
  }

  function onSettledLock() {
    if (datasetRef) chrome.releaseLocalLock(datasetRef);
  }

  function trackFromMeta(meta: unknown, actionLabel: string) {
    const actionStateId = getMetaActionStateId(meta);
    if (actionStateId && datasetRef) {
      chrome.trackActionState(actionStateId, {
        actionLabel,
        object: datasetRef,
        objectLabel: sourceLabel(ex),
      });
    }
  }

  const updateExportM = useMutation({
    mutationFn: async () => {
      if (id === null) throw new Error('invalid export id');
      return await updateExport(id, buildUpdateExportPayload(editForm, mode === 'admin'));
    },
    onMutate: onMutateLock,
    onSuccess: async (res) => {
      trackFromMeta(res.meta, t('exports.action.update'));
      await invalidateAll();
      setEditOpen(false);
      pushToast({ variant: 'ok', title: t('exports.update.success') });
    },
    onError: (err: unknown) => pushToast({ variant: 'danger', title: t('exports.update.error'), body: errorMessage(err) }),
    onSettled: onSettledLock,
  });

  const deleteExportM = useMutation({
    mutationFn: async () => {
      if (id === null) throw new Error('invalid export id');
      return await deleteExport(id);
    },
    onMutate: onMutateLock,
    onSuccess: async (res) => {
      trackFromMeta(res.meta, t('exports.action.delete'));
      await invalidateAll();
      pushToast({ variant: 'ok', title: t('exports.delete.success') });
      navigate(`${basePath}/exports`);
    },
    onError: (err: unknown) => pushToast({ variant: 'danger', title: t('exports.delete.error'), body: errorMessage(err) }),
    onSettled: onSettledLock,
  });

  const saveHostM = useMutation({
    mutationFn: async () => {
      if (id === null) throw new Error('invalid export id');
      if (editingHost) {
        const hostId = parsePositiveInt(editingHost.id);
        if (!hostId) throw new Error('invalid host id');
        return await updateExportHost(id, hostId, {
          rw: hostForm.rw,
          sync: hostForm.sync,
          subtree_check: hostForm.subtree_check,
          root_squash: hostForm.root_squash,
        });
      }
      if (!hostForm.ip_address) throw new Error('ip missing');
      return await createExportHost(id, {
        ip_address: hostForm.ip_address,
        rw: hostForm.rw,
        sync: hostForm.sync,
        subtree_check: hostForm.subtree_check,
        root_squash: hostForm.root_squash,
      });
    },
    onMutate: onMutateLock,
    onSuccess: async (res) => {
      trackFromMeta(res.meta, editingHost ? t('exports.host.update.success') : t('exports.host.create.success'));
      await invalidateAll();
      closeHostEditor();
      pushToast({ variant: 'ok', title: editingHost ? t('exports.host.update.success') : t('exports.host.create.success') });
    },
    onError: (err: unknown) => {
      pushToast({ variant: 'danger', title: editingHost ? t('exports.host.update.error') : t('exports.host.create.error'), body: errorMessage(err) });
    },
    onSettled: onSettledLock,
  });

  const deleteHostM = useMutation({
    mutationFn: async () => {
      if (id === null) throw new Error('invalid export id');
      const hostId = parsePositiveInt(deleteHost?.id);
      if (!hostId) throw new Error('invalid host id');
      return await deleteExportHost(id, hostId);
    },
    onMutate: onMutateLock,
    onSuccess: async (res) => {
      trackFromMeta(res.meta, t('exports.host.delete.success'));
      await invalidateAll();
      closeDeleteHost();
      pushToast({ variant: 'ok', title: t('exports.host.delete.success') });
    },
    onError: (err: unknown) => pushToast({ variant: 'danger', title: t('exports.host.delete.error'), body: errorMessage(err) }),
    onSettled: onSettledLock,
  });

  if (id === null) {
    return (
      <DetailShell testId="exports.detail.invalid">
        <ErrorState
          testId="exports.detail.invalid_state"
          title={t('exports.detail.invalid.title')}
          body={t('exports.detail.invalid.body')}
          onRetry={() => navigate(`${basePath}/exports`)}
          detailsExtra={{ page: 'exports.detail', exportId }}
        />
      </DetailShell>
    );
  }

  if (exportQ.isLoading) return <LoadingState testId="exports.detail.loading" />;
  if (exportQ.isError || !ex) {
    return (
      <DetailShell testId="exports.detail.error">
        <ErrorState
          testId="exports.detail.error_state"
          title={t('exports.detail.load_error')}
          error={exportQ.error ?? new Error('not found')}
          onRetry={() => void exportQ.refetch()}
          detailsExtra={{ page: 'exports.detail', exportId: id }}
        />
      </DetailShell>
    );
  }

  const badgeVariant = ex.enabled === false ? 'warn' : 'ok';
  const mountCommand = snippetMountCommand(address, path, mountPoint);
  const fstabLine = snippetFstab(address, path, mountPoint, rw);
  const systemdUnit = snippetSystemd(address, path, mountPoint, rw);
  const nixSnippet = snippetNix(address, path, mountPoint, rw);
  const editDiff = buildExportDiff(ex, editForm, mode === 'admin');
  const adminThreadsInvalid = mode === 'admin' && editForm.threads.trim() !== '' && parsePositiveInt(editForm.threads) === null;
  const hostDiff = editingHost ? buildExportHostDiff(editingHost, hostForm) : [];

  return (
    <DetailShell
      testId="exports.detail.page"
      header={
        <PageHeader
          testId="exports.detail.header"
          title={t('exports.detail.title', { id: String(id) })}
          description={sourceLabel(ex)}
          meta={
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant={badgeVariant} testId="exports.detail.badge.enabled">{boolBadgeLabel(Boolean(ex.enabled), t)}</Badge>
              <Badge variant={sourceIsSnapshot ? 'info' : 'neutral'}>{sourceIsSnapshot ? t('common.snapshot') : t('common.dataset')}</Badge>
              <span>#{id}</span>
            </span>
          }
          actions={
            <>
              <Button variant="secondary" onClick={() => setEditOpen(true)} testId="exports.detail.edit.open">{t('common.edit')}</Button>
              <Button variant="danger" onClick={openDeleteExport} testId="exports.detail.delete.open">{t('common.delete')}</Button>
            </>
          }
        />
      }
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card testId="exports.detail.summary">
            <CardHeader title={t('exports.detail.summary.title')} subtitle={t('exports.detail.summary.subtitle')} />
            <CardBody>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold text-muted">{t('exports.field.source')}</div>
                  <div className="mt-1 text-sm text-fg">{sourceLabel(ex)}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted">{t('exports.field.address')}</div>
                  <div className="mt-1 font-mono text-xs text-fg">{address}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted">{t('exports.field.path')}</div>
                  <div className="mt-1 font-mono text-xs text-fg">{path || '—'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted">{t('common.user')}</div>
                  <div className="mt-1 text-sm text-fg">
                    {mode === 'admin' && userId ? <Link className="text-accent hover:underline" to={`${basePath}/users/${userId}`}>#{userId}</Link> : userId ? `#${userId}` : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted">{t('exports.field.mode')}</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Badge variant={rw ? 'ok' : 'neutral'}>{rw ? t('exports.mode.rw') : t('exports.mode.ro')}</Badge>
                    <Badge variant={Boolean(ex.sync) ? 'ok' : 'warn'}>{t('exports.field.sync')}</Badge>
                    <Badge variant={Boolean(ex.subtree_check) ? 'info' : 'neutral'}>{t('exports.field.subtree_check')}</Badge>
                    <Badge variant={Boolean(ex.root_squash) ? 'info' : 'neutral'}>{t('exports.field.root_squash')}</Badge>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted">{t('exports.field.scope')}</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Badge variant={allVps ? 'info' : 'neutral'}>{allVps ? t('exports.field.all_vps') : t('exports.field.selected_hosts')}</Badge>
                    {mode === 'admin' ? <Badge variant="neutral">{t('exports.field.threads_label', { count: String(ex.threads ?? 0) })}</Badge> : null}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-faint">
                <span>{t('common.updated')}: {ex.updated_at ? formatDateTime(ex.updated_at) : '—'}</span>
                <span>{t('common.created')}: {ex.created_at ? formatDateTime(ex.created_at) : '—'}</span>
                {datasetId ? <Link className="text-accent hover:underline" to={`${basePath}/datasets/${datasetId}`}>{t('exports.detail.open_dataset')}</Link> : null}
              </div>
            </CardBody>
          </Card>

          <Card testId="exports.detail.instructions">
            <CardHeader
              title={t('exports.detail.instructions.title')}
              subtitle={sourceIsSnapshot ? t('exports.detail.instructions.snapshot_subtitle') : t('exports.detail.instructions.dataset_subtitle')}
              actions={<CopyButton text={mountCommand} label={t('exports.instructions.copy_command')} testId="exports.detail.instructions.command.copy" />}
            />
            <CardBody className="space-y-4">
              {sourceIsSnapshot ? (
                <Alert title={t('exports.detail.instructions.temporary.title')} variant="info">
                  {t('exports.detail.instructions.temporary.body')}
                </Alert>
              ) : null}

              <div>
                <div className="mb-2 text-xs font-semibold text-muted">{t('exports.instructions.command')}</div>
                <pre data-testid="exports.detail.instructions.command" className="overflow-x-auto rounded-md border border-border bg-code p-3 text-xs text-fg">{mountCommand}</pre>
              </div>

              {!sourceIsSnapshot ? (
                <div className="grid gap-4 xl:grid-cols-3">
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-muted">
                      <span>{t('exports.instructions.fstab')}</span>
                      <CopyButton text={fstabLine} label={t('common.copy')} testId="exports.detail.instructions.fstab.copy" />
                    </div>
                    <pre className="overflow-x-auto rounded-md border border-border bg-code p-3 text-xs text-fg">{fstabLine}</pre>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-muted">
                      <span>{t('exports.instructions.systemd')}</span>
                      <CopyButton text={systemdUnit} label={t('common.copy')} testId="exports.detail.instructions.systemd.copy" />
                    </div>
                    <pre className="max-h-scroll-lg overflow-auto rounded-md border border-border bg-code p-3 text-xs text-fg">{systemdUnit}</pre>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-muted">
                      <span>{t('exports.instructions.nixos')}</span>
                      <CopyButton text={nixSnippet} label={t('common.copy')} testId="exports.detail.instructions.nixos.copy" />
                    </div>
                    <pre className="max-h-scroll-lg overflow-auto rounded-md border border-border bg-code p-3 text-xs text-fg">{nixSnippet}</pre>
                  </div>
                </div>
              ) : null}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <ExportHostsCard
            allVps={allVps}
            hosts={hosts}
            loading={hostsQ.isLoading}
            error={hostsQ.isError ? hostsQ.error : null}
            onRetry={() => void hostsQ.refetch()}
            onCreateHost={openCreateHost}
            onEditHost={openEditHost}
            onDeleteHost={openDeleteHost}
          />
        </div>
      </div>

      <ExportEditDrawer
        open={editOpen}
        onClose={() => setEditOpen(false)}
        isAdmin={mode === 'admin'}
        form={editForm}
        setForm={setEditForm}
        diff={editDiff}
        invalidThreads={adminThreadsInvalid}
        pending={updateExportM.isPending}
        onSubmit={() => void updateExportM.mutateAsync()}
      />

      <ExportHostEditorDrawer
        open={hostEditorOpen}
        onClose={closeHostEditor}
        editingHost={editingHost}
        form={hostForm}
        setForm={setHostForm}
        userId={userId ?? undefined}
        allVps={allVps}
        diff={hostDiff}
        pending={saveHostM.isPending}
        onSubmit={() => void saveHostM.mutateAsync()}
      />

      <ExportDeleteDialogs
        exportOpen={deleteOpen}
        exportItem={ex}
        exportPending={deleteExportM.isPending}
        onCancelExport={closeDeleteExport}
        onConfirmExport={() => void deleteExportM.mutateAsync()}
        host={deleteHost}
        hostPending={deleteHostM.isPending}
        onCancelHost={closeDeleteHost}
        onConfirmHost={() => void deleteHostM.mutateAsync()}
      />
    </DetailShell>
  );
}
