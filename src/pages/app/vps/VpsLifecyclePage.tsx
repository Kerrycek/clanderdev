import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { useAppMode } from '../../../app/appMode';
import { useI18n, type TranslationKey } from '../../../app/i18n';
import { useChrome } from '../../../components/layout/ChromeContext';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { LifecyclePanel } from '../../../components/lifetimes/LifecyclePanel';
import { getMetaActionStateId } from '../../../lib/api/haveapi';
import { fetchLocations } from '../../../lib/api/infra';
import { fetchIpAddressesForVps } from '../../../lib/api/ipAddresses';
import { fetchNodes } from '../../../lib/api/nodes';
import { fetchOsTemplates } from '../../../lib/api/osTemplates';
import {
  fetchVps,
  fetchVpsList,
  updateVps,
  vpsBoot,
  vpsClone,
  vpsDelete,
  vpsMigrate,
  vpsReinstall,
  vpsReplace,
  vpsRestart,
  vpsStart,
  vpsStop,
  vpsSwapWith,
  type Vps,
} from '../../../lib/api/vps';
import { formatDateTime } from '../../../lib/format';
import { gateVpsAction, gateVpsMutation } from '../../../lib/gates/vps';
import { parseLookupIdLike } from '../../../lib/lookupInput';
import { preflightVpsNotBusy } from './vpsPreflight';
import { useVps } from './VpsContext';
import { VpsCloneCard } from './VpsCloneCard';
import { VpsDeleteCard, type DeleteForm } from './VpsDeleteCard';
import { defaultDeleteForm } from './VpsDeleteModel';
import { buildVpsClonePayload, defaultCloneForm, isCloneTargetReady, type CloneForm } from './VpsCloneModel';
import {
  resourceId,
  stateLabel,
} from './VpsLifecycleModel';
import { VpsPowerActionCard, type PowerActionKind } from './VpsPowerActionCard';
import { VpsReinstallCard } from './VpsReinstallCard';
import { buildVpsReinstallPayload, defaultReinstallForm, type ReinstallForm } from './VpsReinstallModel';
import { VpsSwapCard } from './VpsSwapCard';
import { buildVpsSwapPayload, defaultSwapForm, rankSwapCandidate, type SwapForm } from './VpsSwapModel';
import { VpsAdminBootCard, VpsAdminTemplateCard } from './VpsAdminTemplateBootCards';
import { VpsAdminMigrateCard, VpsAdminReplaceCard } from './VpsAdminReplaceMigrateCards';
import {
  buildMigrateTargetContext,
  buildVpsBootPayload,
  buildVpsMigratePayload,
  buildVpsReplacePayload,
  buildVpsTemplatePayload,
  defaultBootForm,
  defaultMigrateForm,
  defaultReplaceForm,
  defaultTemplateForm,
  findMigrateTargetNode,
  type BootForm,
  type MigrateForm,
  type ReplaceForm,
  type TemplateForm,
} from './VpsAdminLifecycleModel';

type PowerForm = {
  startConfirm: boolean;
  stopForce: boolean;
  stopConfirm: boolean;
  restartForce: boolean;
  restartConfirm: boolean;
};

type LifecycleActionKind =
  | 'start'
  | 'stop'
  | 'restart'
  | 'lifetime'
  | 'template'
  | 'boot'
  | 'reinstall'
  | 'clone'
  | 'swap'
  | 'replace'
  | 'migrate'
  | 'delete';

const lifecycleActionKinds = new Set<LifecycleActionKind>([
  'start',
  'stop',
  'restart',
  'lifetime',
  'template',
  'boot',
  'reinstall',
  'clone',
  'swap',
  'replace',
  'migrate',
  'delete',
]);

function mutationErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message && error.message !== 'invalid-id' && error.message !== 'required-id' && error.message !== 'invalid-date') {
    return error.message;
  }
  return fallback;
}

export function VpsLifecyclePage() {
  const { t } = useI18n();
  const auth = useAuth();
  const { mode, basePath } = useAppMode();
  const chrome = useChrome();
  const navigate = useNavigate();
  const routeParams = useParams();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const {
    vps,
    refetch,
    refetchChains,
    vpsRef,
    busyTransaction,
    busyLocalLock,
    ipAddresses,
    ipAddressesLoading,
    ipAddressesError,
  } = useVps();

  const vpsId = Number(vps.id);
  const objectLabel = String((vps as any).hostname ?? '') || `#${vpsId}`;
  const ownerId = resourceId((vps as any).user);
  const nodeId = resourceId((vps as any).node);
  const locationId = resourceId((vps as any).node?.location ?? (vps as any).location);
  const osTemplateId = resourceId((vps as any).os_template);
  const isAdminView = mode === 'admin';
  const canAdministerVps = isAdminView && auth.role === 'admin';
  const canUseSelfService = !isAdminView;
  const canMutateVps = canUseSelfService || canAdministerVps;
  const routeActionRaw = routeParams['lifecycleAction'];
  const requestedActionRaw = routeActionRaw ?? searchParams.get('action');
  const requestedAction = lifecycleActionKinds.has(requestedActionRaw as LifecycleActionKind) ? (requestedActionRaw as LifecycleActionKind) : null;
  const invalidAction = Boolean(routeActionRaw && !requestedAction);
  const templatesNeeded = canMutateVps && (requestedAction === 'reinstall'
    || (canAdministerVps && (requestedAction === 'template' || requestedAction === 'boot')));

  const templatesQ = useQuery({
    queryKey: ['os_templates', 'vps-lifecycle', { limit: 500, enabled: true, hypervisorType: 'vpsadminos' }],
    queryFn: async () => (await fetchOsTemplates({ limit: 500, enabled: true, hypervisorType: 'vpsadminos' })).data,
    enabled: templatesNeeded,
    staleTime: 60_000,
  });

  const locationsQ = useQuery({
    queryKey: ['locations', 'vps-lifecycle', { limit: 500, hasHypervisor: true, hypervisorType: 'vpsadminos', includes: 'environment' }],
    queryFn: async () => (await fetchLocations({ limit: 500, hasHypervisor: true, hypervisorType: 'vpsadminos', includes: 'environment' })).data,
    enabled: canUseSelfService && requestedAction === 'clone',
    staleTime: 60_000,
  });

  const nodesQ = useQuery({
    queryKey: ['nodes', 'vps-lifecycle-migrate', { limit: 500, includes: 'location__environment' }],
    queryFn: async () => (await fetchNodes({ limit: 500, includes: 'location__environment' })).data,
    enabled: canAdministerVps && requestedAction === 'migrate',
    staleTime: 60_000,
  });

  const [clone, setClone] = useState<CloneForm>(() => defaultCloneForm(vps as Vps, { ownerId, nodeId, locationId }));
  const [swap, setSwap] = useState<SwapForm>(() => defaultSwapForm());
  const [replace, setReplace] = useState<ReplaceForm>(() => defaultReplaceForm(nodeId));
  const [replaceNodeLabel, setReplaceNodeLabel] = useState('');
  const [migrateNodeLabel, setMigrateNodeLabel] = useState('');
  const [templateForm, setTemplateForm] = useState<TemplateForm>(() =>
    defaultTemplateForm(osTemplateId, Boolean((vps as any).enable_os_template_auto_update))
  );
  const [boot, setBoot] = useState<BootForm>(() => defaultBootForm(osTemplateId));

  const [reinstall, setReinstall] = useState<ReinstallForm>(() => defaultReinstallForm(osTemplateId));

  const [migrate, setMigrate] = useState<MigrateForm>(() => defaultMigrateForm());

  const [deleteForm, setDeleteForm] = useState<DeleteForm>(() => defaultDeleteForm());

  const [powerForm, setPowerForm] = useState<PowerForm>({
    startConfirm: false,
    stopForce: false,
    stopConfirm: false,
    restartForce: false,
    restartConfirm: false,
  });

  const targetVpsQ = useQuery({
    queryKey: ['vps', 'show', 'swap-target', { id: swap.targetVps ?? -1 }],
    queryFn: async () => (await fetchVps(swap.targetVps!, { includes: 'node__location,user' })).data,
    enabled: canMutateVps && requestedAction === 'swap' && Boolean(swap.targetVps),
    staleTime: 30_000,
  });

  const swapCandidatesQ = useQuery({
    queryKey: ['vps', 'swap-candidates', { ownerId: ownerId ?? null, source: vpsId }],
    queryFn: async () => {
      const res = await fetchVpsList({
        limit: 50,
        user: ownerId ?? undefined,
      });
      return res.data
        .filter((candidate) => Number(candidate.id) !== vpsId)
        .sort((a, b) => {
          const byScore =
            rankSwapCandidate(b, vps as Vps, nodeId ?? null, locationId ?? null) -
            rankSwapCandidate(a, vps as Vps, nodeId ?? null, locationId ?? null);
          if (byScore !== 0) return byScore;
          return Number(a.id) - Number(b.id);
        })
        .slice(0, 6);
    },
    enabled: canMutateVps && requestedAction === 'swap' && Boolean(ownerId),
    staleTime: 30_000,
  });

  const targetIpsQ = useQuery({
    queryKey: ['ip_address', 'list', 'vps-lifecycle-target', { vpsId: swap.targetVps ?? -1 }],
    queryFn: async () => (await fetchIpAddressesForVps(swap.targetVps!, { limit: 100 })).data,
    enabled: canMutateVps && requestedAction === 'swap' && Boolean(swap.targetVps),
    staleTime: 30_000,
  });

  const cloneTargetReady = isCloneTargetReady(clone, canAdministerVps);
  const migrateTargetNode = findMigrateTargetNode(migrate.node, nodesQ.data ?? []);
  const migrateTargetContext = buildMigrateTargetContext(vps as Vps, migrateTargetNode);
  const cloneLocationId = parseLookupIdLike(clone.location.trim());
  const cloneLocation = cloneLocationId !== null
    ? locationsQ.data?.find((location) => Number(location.id) === cloneLocationId)
    : undefined;

  const preflight = async () => {
    if (!canMutateVps) throw new Error(t('gate.blocked.permission.body'));
    await preflightVpsNotBusy({ vpsId, t, knownBusy: busyLocalLock || busyTransaction });
  };

  const track = (meta: unknown, labelKey: string, opts?: { blockUi?: boolean; progressTitleKey?: TranslationKey }) => {
    const asId = getMetaActionStateId(meta);
    if (asId !== undefined) {
      chrome.trackActionState(asId, { actionLabelKey: labelKey, objectLabel, object: vpsRef, ...opts });
    }
    refetchChains();
    refetch();
  };

  const startM = useMutation({
    mutationFn: async () => {
      await preflight();
      return vpsStart(vpsId);
    },
    onMutate: () => chrome.acquireLocalLock(vpsRef),
    onSuccess: (res) => {
      track(res.meta, 'action.vps.start.label', { blockUi: true, progressTitleKey: 'modal.vps.start.title' });
      setPowerForm((p) => ({ ...p, startConfirm: false }));
    },
    onError: (e: any) => {
      if (e?.code === 'BUSY') chrome.openTasks();
    },
    onSettled: () => chrome.releaseLocalLock(vpsRef),
  });

  const stopM = useMutation({
    mutationFn: async () => {
      await preflight();
      return vpsStop(vpsId, { force: powerForm.stopForce });
    },
    onMutate: () => chrome.acquireLocalLock(vpsRef),
    onSuccess: (res) => {
      track(res.meta, 'action.vps.stop.label', { blockUi: true, progressTitleKey: 'modal.vps.stop.title' });
      setPowerForm((p) => ({ ...p, stopConfirm: false }));
    },
    onError: (e: any) => {
      if (e?.code === 'BUSY') chrome.openTasks();
    },
    onSettled: () => chrome.releaseLocalLock(vpsRef),
  });

  const restartM = useMutation({
    mutationFn: async () => {
      await preflight();
      return vpsRestart(vpsId, { force: powerForm.restartForce });
    },
    onMutate: () => chrome.acquireLocalLock(vpsRef),
    onSuccess: (res) => {
      track(res.meta, 'action.vps.restart.label', { blockUi: true, progressTitleKey: 'modal.vps.restart.title' });
      setPowerForm((p) => ({ ...p, restartConfirm: false }));
    },
    onError: (e: any) => {
      if (e?.code === 'BUSY') chrome.openTasks();
    },
    onSettled: () => chrome.releaseLocalLock(vpsRef),
  });

  const cloneM = useMutation({
    mutationFn: async () => {
      await preflight();
      return vpsClone(vpsId, buildVpsClonePayload(clone, { isAdminMode: canAdministerVps, location: cloneLocation }));
    },
    onMutate: () => chrome.acquireLocalLock(vpsRef),
    onSuccess: (res) => {
      track(res.meta, 'action.vps.clone.label');
      const newId = Number((res.data as any)?.id);
      if (Number.isInteger(newId) && newId > 0) navigate(`${basePath}/vps/${newId}`);
    },
    onError: (e: any) => {
      if (e?.code === 'BUSY') chrome.openTasks();
    },
    onSettled: () => chrome.releaseLocalLock(vpsRef),
  });

  const swapM = useMutation({
    mutationFn: async () => {
      await preflight();
      return vpsSwapWith(vpsId, buildVpsSwapPayload(swap, canAdministerVps));
    },
    onMutate: () => chrome.acquireLocalLock(vpsRef),
    onSuccess: (res) => {
      track(res.meta, 'action.vps.swap.label');
      void qc.invalidateQueries({ queryKey: ['vps', vpsId] });
      setSwap((p) => ({ ...p, confirm: false }));
      chrome.openTasks();
    },
    onError: (e: any) => {
      if (e?.code === 'BUSY') chrome.openTasks();
    },
    onSettled: () => chrome.releaseLocalLock(vpsRef),
  });

  const replaceM = useMutation({
    mutationFn: async () => {
      await preflight();
      return vpsReplace(vpsId, buildVpsReplacePayload(replace));
    },
    onMutate: () => chrome.acquireLocalLock(vpsRef),
    onSuccess: (res) => {
      track(res.meta, 'action.vps.replace.label');
      const newId = Number((res.data as any)?.id);
      if (Number.isInteger(newId) && newId > 0 && newId !== vpsId) navigate(`${basePath}/vps/${newId}`);
    },
    onError: (e: any) => {
      if (e?.code === 'BUSY') chrome.openTasks();
    },
    onSettled: () => chrome.releaseLocalLock(vpsRef),
  });

  const templateM = useMutation({
    mutationFn: async () => {
      await preflight();
      return updateVps(vpsId, buildVpsTemplatePayload(templateForm));
    },
    onMutate: () => chrome.acquireLocalLock(vpsRef),
    onSuccess: (res) => {
      track(res.meta, 'action.vps.template.label');
      void qc.invalidateQueries({ queryKey: ['vps', vpsId] });
    },
    onError: (e: any) => {
      if (e?.code === 'BUSY') chrome.openTasks();
    },
    onSettled: () => chrome.releaseLocalLock(vpsRef),
  });

  const bootM = useMutation({
    mutationFn: async () => {
      await preflight();
      return vpsBoot(vpsId, buildVpsBootPayload(boot));
    },
    onMutate: () => chrome.acquireLocalLock(vpsRef),
    onSuccess: (res) => {
      track(res.meta, 'action.vps.boot.label');
    },
    onError: (e: any) => {
      if (e?.code === 'BUSY') chrome.openTasks();
    },
    onSettled: () => chrome.releaseLocalLock(vpsRef),
  });

  const reinstallM = useMutation({
    mutationFn: async () => {
      await preflight();
      return vpsReinstall(vpsId, buildVpsReinstallPayload(reinstall));
    },
    onMutate: () => chrome.acquireLocalLock(vpsRef),
    onSuccess: (res) => {
      track(res.meta, 'action.vps.reinstall.label');
    },
    onError: (e: any) => {
      if (e?.code === 'BUSY') chrome.openTasks();
    },
    onSettled: () => chrome.releaseLocalLock(vpsRef),
  });

  const migrateM = useMutation({
    mutationFn: async () => {
      await preflight();
      return vpsMigrate(vpsId, buildVpsMigratePayload(migrate, migrateTargetContext));
    },
    onMutate: () => chrome.acquireLocalLock(vpsRef),
    onSuccess: (res) => {
      track(res.meta, 'action.vps.migrate.label');
      setMigrate((p) => ({ ...p, confirm: false }));
    },
    onError: (e: any) => {
      if (e?.code === 'BUSY') chrome.openTasks();
    },
    onSettled: () => chrome.releaseLocalLock(vpsRef),
  });

  const deleteM = useMutation({
    mutationFn: async () => {
      await preflight();
      return vpsDelete(vpsId, canAdministerVps ? { lazy: deleteForm.lazy } : undefined);
    },
    onMutate: () => chrome.acquireLocalLock(vpsRef),
    onSuccess: (res) => {
      track(res.meta, 'action.vps.delete.label');
      navigate(`${basePath}/vps`);
    },
    onError: (e: any) => {
      if (e?.code === 'BUSY') chrome.openTasks();
    },
    onSettled: () => chrome.releaseLocalLock(vpsRef),
  });

  const busyLocal =
    busyLocalLock ||
    startM.isPending ||
    stopM.isPending ||
    restartM.isPending ||
    cloneM.isPending ||
    swapM.isPending ||
    replaceM.isPending ||
    templateM.isPending ||
    bootM.isPending ||
    reinstallM.isPending ||
    migrateM.isPending ||
    deleteM.isPending;
  const gate = gateVpsMutation({ vps, busyLocal, busyTransaction });
  const startGate = gateVpsAction('start', { vps, busyLocal, busyTransaction });
  const stopGate = gateVpsAction('stop', { vps, busyLocal, busyTransaction });
  const restartGate = gateVpsAction('restart', { vps, busyLocal, busyTransaction });

  const sourceIps = ipAddresses;
  const targetIps = targetIpsQ.data ?? [];

  const runningStateLabel = (vps as any).is_running === true
    ? t('vps.lifecycle.power.state.running')
    : (vps as any).is_running === false
      ? t('vps.lifecycle.power.state.stopped')
      : t('vps.lifecycle.power.state.unknown');

  const powerGate = (kind: PowerActionKind) => (kind === 'start' ? startGate : kind === 'stop' ? stopGate : restartGate);
  const powerMutation = (kind: PowerActionKind) => (kind === 'start' ? startM : kind === 'stop' ? stopM : restartM);
  const powerConfirm = (kind: PowerActionKind) => (
    kind === 'start' ? powerForm.startConfirm : kind === 'stop' ? powerForm.stopConfirm : powerForm.restartConfirm
  );
  const powerForce = (kind: PowerActionKind) => (kind === 'stop' ? powerForm.stopForce : kind === 'restart' ? powerForm.restartForce : undefined);
  const taskQueueLabel = busyTransaction || busyLocalLock
    ? t('vps.lifecycle.power.task_queue.busy')
    : t('vps.lifecycle.power.task_queue.ready');

  const setPowerConfirm = (kind: PowerActionKind, checked: boolean) => {
    setPowerForm((p) => {
      if (kind === 'start') return { ...p, startConfirm: checked };
      if (kind === 'stop') return { ...p, stopConfirm: checked };
      return { ...p, restartConfirm: checked };
    });
  };

  const setPowerForce = (kind: PowerActionKind, checked: boolean) => {
    setPowerForm((p) => {
      if (kind === 'stop') return { ...p, stopForce: checked };
      if (kind === 'restart') return { ...p, restartForce: checked };
      return p;
    });
  };

  const submitPower = (kind: PowerActionKind) => {
    if (kind === 'start') startM.mutate();
    else if (kind === 'stop') stopM.mutate();
    else restartM.mutate();
  };

  const renderPowerCard = (kind: PowerActionKind) => {
    const mutation = powerMutation(kind);
    return (
      <VpsPowerActionCard
        kind={kind}
        gate={powerGate(kind)}
        currentStateLabel={runningStateLabel}
        objectStateLabel={stateLabel(vps)}
        taskQueueLabel={taskQueueLabel}
        confirm={powerConfirm(kind)}
        onConfirmChange={(checked) => setPowerConfirm(kind, checked)}
        force={powerForce(kind)}
        onForceChange={(checked) => setPowerForce(kind, checked)}
        pending={mutation.isPending}
        errorMessage={mutation.isError ? mutationErrorMessage(mutation.error, t(`vps.lifecycle.power.${kind}.fallback_error`)) : undefined}
        onSubmit={() => submitPower(kind)}
        onOpenTasks={() => chrome.openTasks()}
      />
    );
  };

  const reinstallCard = (
    <VpsReinstallCard
      vps={vps as Vps}
      form={reinstall}
      onChange={setReinstall}
      templates={templatesQ.data ?? []}
      templatesLoading={templatesQ.isLoading}
      sourceIps={sourceIps}
      sourceIpsLoading={ipAddressesLoading}
      gate={gate}
      pending={reinstallM.isPending}
      succeeded={reinstallM.isSuccess}
      errorMessage={reinstallM.isError ? mutationErrorMessage(reinstallM.error, t('vps.lifecycle.validation.reinstall')) : undefined}
      onSubmit={() => reinstallM.mutate()}
    />
  );

  const cloneCard = (
    <VpsCloneCard
      isAdminMode={canAdministerVps}
      sourceVps={vps as Vps}
      form={clone}
      onChange={setClone}
      locations={locationsQ.data ?? []}
      selectedLocation={cloneLocation}
      locationsLoading={locationsQ.isLoading}
      targetReady={cloneTargetReady}
      gate={gate}
      pending={cloneM.isPending}
      errorMessage={cloneM.isError ? mutationErrorMessage(cloneM.error, t('vps.lifecycle.validation.clone')) : undefined}
      onOpenTasks={() => chrome.openTasks()}
      onSubmit={() => cloneM.mutate()}
    />
  );

  const swapCard = (
    <VpsSwapCard
      isAdminMode={canAdministerVps}
      vps={vps as Vps}
      vpsId={vpsId}
      ownerId={ownerId}
      nodeId={nodeId}
      locationId={locationId}
      form={swap}
      onChange={setSwap}
      candidates={swapCandidatesQ.data ?? []}
      candidatesLoading={swapCandidatesQ.isLoading}
      selectedTarget={targetVpsQ.data}
      targetLoading={targetVpsQ.isLoading}
      targetError={targetVpsQ.isError}
      sourceIps={sourceIps}
      sourceIpsLoading={ipAddressesLoading}
      sourceIpsError={ipAddressesError}
      targetIps={targetIps}
      targetIpsLoading={targetIpsQ.isLoading}
      targetIpsError={targetIpsQ.isError}
      gate={gate}
      pending={swapM.isPending}
      errorMessage={swapM.isError ? mutationErrorMessage(swapM.error, t('vps.lifecycle.validation.swap')) : undefined}
      onOpenTasks={() => chrome.openTasks()}
      onSubmit={() => swapM.mutate()}
    />
  );

  const deleteCard = (
    <VpsDeleteCard
      vps={vps}
      isAdminMode={canAdministerVps}
      form={deleteForm}
      onChange={setDeleteForm}
      gate={gate}
      pending={deleteM.isPending}
      errorMessage={deleteM.isError ? mutationErrorMessage(deleteM.error, t('vps.lifecycle.validation.delete')) : undefined}
      onOpenTasks={() => chrome.openTasks()}
      onSubmit={() => deleteM.mutate()}
    />
  );

  const templateCard = (
    <VpsAdminTemplateCard
      vps={vps as Vps}
      form={templateForm}
      onChange={setTemplateForm}
      templates={templatesQ.data ?? []}
      templatesLoading={templatesQ.isLoading}
      gate={gate}
      pending={templateM.isPending}
      succeeded={templateM.isSuccess}
      errorMessage={templateM.isError ? mutationErrorMessage(templateM.error, t('vps.lifecycle.validation.template')) : undefined}
      onOpenTasks={() => chrome.openTasks()}
      onSubmit={() => templateM.mutate()}
    />
  );

  const bootCard = (
    <VpsAdminBootCard
      vps={vps as Vps}
      form={boot}
      onChange={setBoot}
      templates={templatesQ.data ?? []}
      templatesLoading={templatesQ.isLoading}
      gate={gate}
      pending={bootM.isPending}
      succeeded={bootM.isSuccess}
      errorMessage={bootM.isError ? mutationErrorMessage(bootM.error, t('vps.lifecycle.validation.boot')) : undefined}
      onOpenTasks={() => chrome.openTasks()}
      onSubmit={() => bootM.mutate()}
    />
  );

  const replaceCard = (
    <VpsAdminReplaceCard
      vps={vps as Vps}
      form={replace}
      onChange={setReplace}
      selectedNodeLabel={replaceNodeLabel}
      onSelectedNodeLabelChange={setReplaceNodeLabel}
      gate={gate}
      pending={replaceM.isPending}
      errorMessage={replaceM.isError ? mutationErrorMessage(replaceM.error, t('vps.lifecycle.validation.replace')) : undefined}
      onOpenTasks={() => chrome.openTasks()}
      onSubmit={() => replaceM.mutate()}
    />
  );

  const migrateCard = (
    <VpsAdminMigrateCard
      vps={vps as Vps}
      form={migrate}
      onChange={setMigrate}
      nodes={nodesQ.data ?? []}
      nodesLoading={nodesQ.isLoading}
      nodesError={nodesQ.isError}
      selectedNodeLabel={migrateNodeLabel}
      onSelectedNodeLabelChange={setMigrateNodeLabel}
      targetContext={migrateTargetContext}
      gate={gate}
      pending={migrateM.isPending}
      succeeded={migrateM.isSuccess}
      errorMessage={migrateM.isError ? mutationErrorMessage(migrateM.error, t('vps.lifecycle.validation.migrate')) : undefined}
      onOpenTasks={() => chrome.openTasks()}
      onSubmit={() => migrateM.mutate()}
    />
  );

  const lifecycleBasePath = `${basePath}/vps/${vpsId}/lifecycle`;
  const goToAction = (kind: LifecycleActionKind) => navigate(`${lifecycleBasePath}/${kind}`);
  const allActionChoices: Array<{
    kind: LifecycleActionKind;
    title: string;
    description: string;
    danger?: boolean;
    adminOnly?: boolean;
  }> = [
    { kind: 'start', title: t('action.vps.start.label'), description: t('vps.lifecycle.power.start.subtitle') },
    { kind: 'stop', title: t('action.vps.stop.label'), description: t('vps.lifecycle.power.stop.subtitle'), danger: true },
    { kind: 'restart', title: t('action.vps.restart.label'), description: t('vps.lifecycle.power.restart.subtitle') },
    { kind: 'reinstall', title: t('vps.lifecycle.reinstall.title'), description: t('vps.lifecycle.reinstall.subtitle'), danger: true },
    { kind: 'clone', title: t('vps.lifecycle.clone.title'), description: canAdministerVps ? t('vps.lifecycle.clone.subtitle') : t('vps.lifecycle.clone.subtitle_user') },
    { kind: 'swap', title: t('vps.lifecycle.swap.title'), description: canAdministerVps ? t('vps.lifecycle.swap.subtitle') : t('vps.lifecycle.swap.subtitle_user'), danger: true },
    { kind: 'delete', title: t('vps.lifecycle.delete.title'), description: t('vps.lifecycle.delete.subtitle'), danger: true },
    { kind: 'lifetime', title: t('vps.lifecycle.lifetime.title'), description: canAdministerVps ? t('vps.lifecycle.lifetime.subtitle_admin') : t('vps.lifecycle.lifetime.subtitle_user'), adminOnly: true },
    { kind: 'template', title: t('vps.lifecycle.template.title'), description: t('vps.lifecycle.template.subtitle'), adminOnly: true },
    { kind: 'boot', title: t('vps.lifecycle.boot.title'), description: t('vps.lifecycle.boot.subtitle'), danger: true, adminOnly: true },
    { kind: 'replace', title: t('vps.lifecycle.replace.title'), description: t('vps.lifecycle.replace.subtitle'), danger: true, adminOnly: true },
    { kind: 'migrate', title: t('vps.lifecycle.migrate.title'), description: t('vps.lifecycle.migrate.subtitle'), adminOnly: true },
  ];
  const actionChoices = allActionChoices.filter((choice) => canAdministerVps || !choice.adminOnly);
  const dailyActionChoices = allActionChoices.filter((choice) => !choice.adminOnly);
  const adminActionChoices = canAdministerVps ? allActionChoices.filter((choice) => choice.adminOnly) : [];
  const activeChoice = requestedAction ? actionChoices.find((choice) => choice.kind === requestedAction) : undefined;
  const renderActionButton = (choice: (typeof allActionChoices)[number]) => (
    <button
      key={choice.kind}
      type="button"
      className={[
        'rounded-lg border bg-surface p-4 text-left shadow-card transition hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-focus',
        choice.danger ? 'border-danger-border' : 'border-border',
      ].join(' ')}
      onClick={() => goToAction(choice.kind)}
      data-testid={`vps.lifecycle.action_link.${choice.kind}`}
    >
      <span className={choice.danger ? 'block text-sm font-semibold text-danger' : 'block text-sm font-semibold text-fg'}>
        {choice.title}
      </span>
      <span className="mt-1 block text-xs text-muted">{choice.description}</span>
    </button>
  );

  if (!canMutateVps || invalidAction || (requestedAction && !actionChoices.some((choice) => choice.kind === requestedAction))) {
    const noPermission = !canMutateVps;
    return (
      <div className="space-y-4" data-testid="vps.lifecycle.page">
        <Card testId="vps.lifecycle.summary">
          <CardHeader title={t('vps.lifecycle.title')} subtitle={t(noPermission ? 'gate.blocked.permission.title' : 'vps.lifecycle.invalid_action')} />
          <CardBody>
            {noPermission ? <Alert variant="neutral">{t('gate.blocked.permission.body')}</Alert> : (
              <Button variant="primary" onClick={() => navigate(lifecycleBasePath)}>{t('vps.lifecycle.back_to_actions')}</Button>
            )}
          </CardBody>
        </Card>
      </div>
    );
  }

  if (!requestedAction) {
    return (
      <div className="space-y-4" data-testid="vps.lifecycle.page">
        <Card testId="vps.lifecycle.summary">
          <CardHeader title={t('vps.lifecycle.title')} subtitle={canAdministerVps ? t('vps.lifecycle.subtitle_admin') : t('vps.lifecycle.subtitle_user')} />
          <CardBody className="space-y-4">
            <Alert variant="neutral">
              {canAdministerVps ? t('vps.lifecycle.action_index.summary_admin') : t('vps.lifecycle.action_index.summary_user')}
            </Alert>
            <div className="space-y-4" data-testid="vps.lifecycle.action_index">
              <section className="space-y-2" data-testid="vps.lifecycle.daily_actions">
                <div>
                  <h2 className="text-sm font-semibold text-fg">{t('vps.lifecycle.action_index.daily_title')}</h2>
                  <p className="text-xs text-muted">{t('vps.lifecycle.action_index.daily_subtitle')}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {dailyActionChoices.map(renderActionButton)}
                </div>
              </section>

              {adminActionChoices.length ? (
                <section className="space-y-2 rounded-lg border border-border bg-surface p-3" data-testid="vps.lifecycle.admin_actions">
                  <div>
                    <h2 className="text-sm font-semibold text-fg">{t('vps.lifecycle.action_index.admin_title')}</h2>
                    <p className="text-xs text-muted">{t('vps.lifecycle.action_index.admin_subtitle')}</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {adminActionChoices.map(renderActionButton)}
                  </div>
                </section>
              ) : null}
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (!canAdministerVps) {
    return (
      <div className="space-y-4" data-testid="vps.lifecycle.page">
        <Card testId="vps.lifecycle.summary">
          <CardHeader
            title={activeChoice?.title ?? t('vps.lifecycle.title')}
            subtitle={activeChoice?.description ?? t('vps.lifecycle.subtitle_user')}
            actions={
              <Button variant="secondary" onClick={() => navigate(lifecycleBasePath)}>
                {t('vps.lifecycle.back_to_actions')}
              </Button>
            }
          />
          <CardBody>
            <Alert variant="neutral">{t('vps.lifecycle.user_lifecycle.summary')}</Alert>
          </CardBody>
        </Card>

        {requestedAction === 'start' ? renderPowerCard('start') : null}
        {requestedAction === 'stop' ? renderPowerCard('stop') : null}
        {requestedAction === 'restart' ? renderPowerCard('restart') : null}

        {requestedAction === 'lifetime' ? (
          <LifecyclePanel
            kind="vps"
            id={vps.id}
            objectLabel={objectLabel}
            objectState={(vps as any).object_state as any}
            expirationDate={(vps as any).expiration_date as any}
            remindAfterDate={(vps as any).remind_after_date as any}
            onUpdated={refetch}
            testId="vps.lifecycle.lifetime"
          />
        ) : null}

        {requestedAction === 'reinstall' ? reinstallCard : null}

        {requestedAction === 'clone' ? cloneCard : null}

        {requestedAction === 'swap' ? swapCard : null}

        {requestedAction === 'delete' ? deleteCard : null}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="vps.lifecycle.page">
      <Card testId="vps.lifecycle.summary">
        <CardHeader
          title={activeChoice?.title ?? t('vps.lifecycle.title')}
          subtitle={activeChoice?.description ?? t('vps.lifecycle.subtitle_admin')}
          actions={
            <Button variant="secondary" onClick={() => navigate(lifecycleBasePath)}>
              {t('vps.lifecycle.back_to_actions')}
            </Button>
          }
        />
        <CardBody>
          <div className="mt-3 text-xs text-faint">
            {t('vps.lifecycle.current_target', {
              vps: `#${vpsId}`,
              node: nodeId ? `#${nodeId}` : '—',
              owner: ownerId ? `#${ownerId}` : '—',
              expiration: formatDateTime((vps as any).expiration_date),
            })}
          </div>
        </CardBody>
      </Card>

      {requestedAction === 'start' ? renderPowerCard('start') : null}
      {requestedAction === 'stop' ? renderPowerCard('stop') : null}
      {requestedAction === 'restart' ? renderPowerCard('restart') : null}

      {requestedAction === 'lifetime' ? (
        <LifecyclePanel
          kind="vps"
          id={vps.id}
          objectLabel={objectLabel}
          objectState={(vps as any).object_state as any}
          expirationDate={(vps as any).expiration_date as any}
          remindAfterDate={(vps as any).remind_after_date as any}
          onUpdated={refetch}
          testId="vps.lifecycle.lifetime"
        />
      ) : null}

      {requestedAction === 'template' ? templateCard : null}

      {requestedAction === 'boot' ? bootCard : null}

      {requestedAction === 'reinstall' ? reinstallCard : null}

      {requestedAction === 'clone' ? cloneCard : null}

      {requestedAction === 'swap' ? swapCard : null}

      {requestedAction === 'replace' ? replaceCard : null}

      {requestedAction === 'migrate' ? migrateCard : null}

      {requestedAction === 'delete' ? deleteCard : null}
    </div>
  );
}
