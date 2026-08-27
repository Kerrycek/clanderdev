import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppMode } from '../../../app/appMode';
import { useAuth } from '../../../app/auth';
import { useI18n } from '../../../app/i18n';
import { useObjectScope } from '../../../app/objectScope';
import { useChrome } from '../../../components/layout/ChromeContext';
import { Alert } from '../../../components/ui/Alert';
import { fetchDataset } from '../../../lib/api/datasets';
import { getMetaActionStateId } from '../../../lib/api/haveapi';
import { datasetCapabilities } from '../../../lib/gates/dataset';
import { createVpsMount, deleteVpsMount, fetchVpsMounts, findDatasetByName, updateVpsMount, type Dataset, type VpsMount } from '../../../lib/api/vpsMounts';
import { gateVpsMutation } from '../../../lib/gates/vps';
import { preflightVpsNotBusy } from './vpsPreflight';
import { useVps } from './VpsContext';
import {
  buildCreateMountPayload,
  buildUpdateMountPayload,
  datasetId,
  defaultMountDraft,
  errorMessage,
  isMountDraftDirty,
  mountDraftFromMount,
  rootDatasetSummary,
  storageOverviewSummary,
  validateMountDraft,
  type MountDraft,
  type MountValidationIssue,
} from './VpsStorageModel';
import { VpsStorageMountCreateModal, VpsStorageMountDeleteDialog, VpsStorageMountEditModal, type StartFailOption } from './VpsStorageMountDialogs';
import { VpsStorageMountsCard } from './VpsStorageMountsCard';
import { VpsStorageOverviewCard } from './VpsStorageOverviewCard';
import { VpsStorageRootDatasetCard } from './VpsStorageRootDatasetCard';

function validationIssueKey(issue: MountValidationIssue): string {
  switch (issue) {
    case 'dataset_required':
      return 'vps.storage.create.validation.dataset_required';
    case 'mountpoint_required':
      return 'vps.storage.create.validation.mountpoint_required';
    case 'mountpoint_absolute':
      return 'vps.storage.validation.mountpoint_absolute';
    case 'mountpoint_root':
      return 'vps.storage.validation.mountpoint_root';
  }
}

function firstValidationError(issues: MountValidationIssue[], t: (key: string) => string): string | null {
  const first = issues[0];
  return first ? t(validationIssueKey(first)) : null;
}

export function VpsStoragePage() {
  const { basePath, mode } = useAppMode();
  const auth = useAuth();
  const scope = useObjectScope();
  const chrome = useChrome();
  const qc = useQueryClient();
  const { t } = useI18n();
  const { vps, canMutateVps, refetchChains, vpsRef, busyTransaction, busyLocalLock } = useVps();

  const canAdmin = mode === 'admin' && auth.role === 'admin';
  const vpsId = vps.id;
  const objectLabel = vps.hostname || `#${vpsId}`;

  const mountsQ = useQuery({
    queryKey: ['vps', vpsId, 'mounts'],
    queryFn: async () => (await fetchVpsMounts(vpsId)).data,
    refetchOnWindowFocus: false,
  });

  const invalidateMounts = () => qc.invalidateQueries({ queryKey: ['vps', vpsId, 'mounts'] });
  const preflight = async () => {
    if (!canMutateVps) throw new Error(t('gate.blocked.permission.body'));
    return preflightVpsNotBusy({ vpsId, t, knownBusy: busyTransaction || busyLocalLock });
  };

  const createMountM = useMutation({
    mutationFn: async (params: Record<string, unknown>) => {
      await preflight();
      return createVpsMount(vpsId, params);
    },
    onMutate: () => chrome.acquireLocalLock(vpsRef),
    onSuccess: (response) => {
      invalidateMounts();
      const asId = getMetaActionStateId(response.meta);
      if (asId !== undefined) {
        chrome.trackActionState(asId, {
          actionLabelKey: 'action.vps.mount.create.label',
          objectLabel,
          object: vpsRef,
          progressTitleKey: 'modal.vps.mount.create.title',
        });
      }
      refetchChains();
    },
    onError: (error) => {
      if (errorMessage(error).includes('BUSY')) chrome.openTasks();
    },
    onSettled: () => chrome.releaseLocalLock(vpsRef),
  });

  const updateMountM = useMutation({
    mutationFn: async (payload: { mountId: number; params: Record<string, unknown> }) => {
      await preflight();
      return updateVpsMount(vpsId, payload.mountId, payload.params);
    },
    onMutate: () => chrome.acquireLocalLock(vpsRef),
    onSuccess: (response) => {
      invalidateMounts();
      const asId = getMetaActionStateId(response.meta);
      if (asId !== undefined) {
        chrome.trackActionState(asId, {
          actionLabelKey: 'action.vps.mount.update.label',
          objectLabel,
          object: vpsRef,
          progressTitleKey: 'modal.vps.mount.update.title',
        });
      }
      refetchChains();
    },
    onError: (error) => {
      if (errorMessage(error).includes('BUSY')) chrome.openTasks();
    },
    onSettled: () => chrome.releaseLocalLock(vpsRef),
  });

  const deleteMountM = useMutation({
    mutationFn: async (mountId: number) => {
      await preflight();
      return deleteVpsMount(vpsId, mountId);
    },
    onMutate: () => chrome.acquireLocalLock(vpsRef),
    onSuccess: (response) => {
      invalidateMounts();
      const asId = getMetaActionStateId(response.meta);
      if (asId !== undefined) {
        chrome.trackActionState(asId, {
          actionLabelKey: 'action.vps.mount.delete.label',
          objectLabel,
          object: vpsRef,
          progressTitleKey: 'modal.vps.mount.delete.title',
        });
      }
      refetchChains();
    },
    onError: (error) => {
      if (errorMessage(error).includes('BUSY')) chrome.openTasks();
    },
    onSettled: () => chrome.releaseLocalLock(vpsRef),
  });

  const busyLocal = busyLocalLock || createMountM.isPending || updateMountM.isPending || deleteMountM.isPending;
  const gate = gateVpsMutation({ vps, busyLocal, busyTransaction });

  const [draft, setDraft] = useState<MountDraft>(() => defaultMountDraft());
  const patchDraft = (patch: Partial<MountDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const startFailOptions = useMemo<StartFailOption[]>(
    () => [
      { value: 'ignore', label: t('vps.storage.on_start_fail.ignore.label'), desc: t('vps.storage.on_start_fail.ignore.desc') },
      { value: 'umount', label: t('vps.storage.on_start_fail.umount.label'), desc: t('vps.storage.on_start_fail.umount.desc') },
      { value: 'fail', label: t('vps.storage.on_start_fail.fail.label'), desc: t('vps.storage.on_start_fail.fail.desc') },
    ],
    [t]
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [datasetName, setDatasetName] = useState('');
  const [foundDataset, setFoundDataset] = useState<Dataset | null>(null);
  const [findError, setFindError] = useState<string | null>(null);

  const resetCreate = () => {
    setDraft(defaultMountDraft());
    setDatasetName('');
    setFoundDataset(null);
    setFindError(null);
    setCreateError(null);
  };

  const findDatasetM = useMutation({
    mutationFn: async (name: string) => {
      if (!canMutateVps) throw new Error(t('gate.blocked.permission.body'));
      const q = name.trim();
      if (!q) throw new Error(t('vps.storage.dataset_find.validation.empty'));
      return findDatasetByName(q);
    },
    onSuccess: (response) => {
      setFindError(null);
      setFoundDataset(response.data);
      patchDraft({ dataset: response.data });
    },
    onError: (error) => {
      setFoundDataset(null);
      patchDraft({ dataset: null });
      setFindError(errorMessage(error));
    },
  });

  const createValidation = validateMountDraft(draft, { requireDataset: true });
  const canCreate = createValidation.ok;

  const submitCreate = async () => {
    const validationError = firstValidationError(createValidation.issues, t);
    setCreateError(validationError);
    if (validationError) return;

    try {
      await createMountM.mutateAsync(buildCreateMountPayload(draft, canAdmin));
      setCreateOpen(false);
      resetCreate();
    } catch (error) {
      setCreateError(errorMessage(error));
    }
  };

  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editMount, setEditMount] = useState<VpsMount | null>(null);

  const openEdit = (mount: VpsMount) => {
    setEditError(null);
    setEditMount(mount);
    setDraft(mountDraftFromMount(mount));
    setEditOpen(true);
  };

  const editValidation = validateMountDraft(draft, { requireDataset: false });
  const editDirty = editMount ? isMountDraftDirty(draft, editMount, canAdmin) : false;
  const canEdit = editDirty && editValidation.ok;

  const submitEdit = async () => {
    if (!editMount) return;
    const validationError = firstValidationError(editValidation.issues, t);
    setEditError(validationError);
    if (validationError) return;

    try {
      await updateMountM.mutateAsync({ mountId: editMount.id, params: buildUpdateMountPayload(draft, canAdmin) });
      setEditOpen(false);
      setEditMount(null);
    } catch (error) {
      setEditError(errorMessage(error));
    }
  };

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VpsMount | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const openDelete = (mount: VpsMount) => {
    setDeleteError(null);
    setDeleteTarget(mount);
    setDeleteOpen(true);
  };

  const submitDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await deleteMountM.mutateAsync(deleteTarget.id);
      setDeleteOpen(false);
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(errorMessage(error));
    }
  };

  const mounts = mountsQ.data ?? [];
  const rootDatasetId = datasetId(vps.dataset);
  const rootDatasetQ = useQuery({
    queryKey: ['datasets', 'show', rootDatasetId, 'vps-storage-root'],
    enabled: rootDatasetId !== null,
    queryFn: async () => (
      await fetchDataset(rootDatasetId as number, { includes: 'vps,environment,user,parent' })
    ).data,
    refetchOnWindowFocus: false,
  });
  const root = rootDatasetSummary(rootDatasetQ.data ?? null, vps.dataset ?? null);
  const rootCapabilities = rootDatasetQ.data
    ? datasetCapabilities(rootDatasetQ.data, {
        role: auth.role,
        scope: scope.scope,
        userId: auth.user?.id,
      })
    : null;
  const overview = storageOverviewSummary(mounts);

  return (
    <div data-testid="vps.storage.page" className="space-y-4">
      {!canMutateVps ? (
        <Alert title={t('gate.blocked.permission.title')} variant="warn">
          <div data-testid="vps.storage.read_only">{t('gate.blocked.permission.body')}</div>
        </Alert>
      ) : null}

      <VpsStorageOverviewCard
        canMutate={canMutateVps}
        gate={gate}
        root={root}
        summary={overview}
        onAddMount={() => {
          resetCreate();
          setCreateOpen(true);
        }}
        onOpenTasks={chrome.openTasks}
      />

      <VpsStorageRootDatasetCard
        basePath={basePath}
        canAdmin={canAdmin}
        canCreateSubdataset={canMutateVps && rootCapabilities?.canCreateSubdataset === true}
        root={root}
        loading={rootDatasetQ.isLoading}
        error={rootDatasetQ.isError ? errorMessage(rootDatasetQ.error) : null}
      />

      <VpsStorageMountsCard
        basePath={basePath}
        canAdmin={canAdmin}
        canMutate={canMutateVps}
        mounts={mounts}
        loading={mountsQ.isLoading}
        error={mountsQ.isError ? errorMessage(mountsQ.error) : null}
        onRefresh={() => void mountsQ.refetch()}
        onEdit={openEdit}
        onDelete={openDelete}
      />

      {canMutateVps ? <VpsStorageMountCreateModal
        open={createOpen}
        draft={draft}
        canAdmin={canAdmin}
        gate={gate}
        datasetName={datasetName}
        foundDataset={foundDataset}
        findError={findError}
        createError={createError}
        findLoading={findDatasetM.isPending}
        createLoading={createMountM.isPending}
        canSubmit={canCreate}
        startFailOptions={startFailOptions}
        onClose={() => setCreateOpen(false)}
        onFindDataset={() => void findDatasetM.mutate(datasetName)}
        onDatasetNameChange={setDatasetName}
        onDraftPatch={patchDraft}
        onSubmit={() => void submitCreate()}
      /> : null}

      {canMutateVps ? <VpsStorageMountEditModal
        open={editOpen}
        draft={draft}
        mount={editMount}
        canAdmin={canAdmin}
        gate={gate}
        editError={editError}
        editLoading={updateMountM.isPending}
        canSubmit={canEdit}
        startFailOptions={startFailOptions}
        onClose={() => setEditOpen(false)}
        onDraftPatch={patchDraft}
        onSubmit={() => void submitEdit()}
      /> : null}

      {canMutateVps ? <VpsStorageMountDeleteDialog
        open={deleteOpen}
        target={deleteTarget}
        gate={gate}
        error={deleteError}
        loading={deleteMountM.isPending}
        onCancel={() => {
          setDeleteOpen(false);
        }}
        onConfirm={() => void submitDelete()}
      /> : null}
    </div>
  );
}
