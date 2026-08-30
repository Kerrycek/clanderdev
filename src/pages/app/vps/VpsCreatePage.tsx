import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAppMode } from '../../../app/appMode';
import { useAuth } from '../../../app/auth';
import { useI18n } from '../../../app/i18n';
import { useChrome } from '../../../components/layout/ChromeContext';
import { ListShell } from '../../../components/layout/ListShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { SyncStaleBanner } from '../../../components/layout/SyncStaleBanner';
import { Button } from '../../../components/ui/Button';
import { ErrorState } from '../../../components/ui/ErrorState';
import { LoadingState } from '../../../components/ui/LoadingState';
import { fetchDefaultObjectClusterResources } from '../../../lib/api/clusterResources';
import { getMetaActionStateId, isAmbiguousMutationError, isMissingActionStateError } from '../../../lib/api/haveapi';
import { fetchLocations } from '../../../lib/api/infra';
import { fetchNodes } from '../../../lib/api/nodes';
import { fetchOsTemplates } from '../../../lib/api/osTemplates';
import { createVps, type CreateVpsPayload } from '../../../lib/api/vps';
import { objectRef } from '../../../lib/objectRef';
import type { LocalMutationGeneration } from '../../../lib/localLocks';
import {
  beginVpsCreateOutcomeGuard,
  clearVpsCreateOutcomeMarker,
  markVpsCreateOutcomeAccepted,
  markVpsCreateOutcomeUncertain,
  readLatestVpsCreateOutcomeMarker,
  vpsCreateOutcomeEntryPrefix,
  type VpsCreateOutcomeMarker,
} from '../../../lib/vpsCreateOutcomeGuard';
import { reconcileVpsCreateOutcome } from '../../../lib/vpsCreateOutcomeReconcile';
import {
  buildVpsCreatePayload,
  defaultForm,
  isVpsHypervisorNode,
  locationEnvironmentId,
  optionalResource,
  osFamilyLabel,
  RESOURCE_PRESETS,
  validateForm,
  type FormState,
  type HiddenAdminTarget,
  type ResourcePresetId,
} from './VpsCreateModel';
import { pendingVpsCreateNavigationState } from './VpsDetailVisibility';
import {
  CreateAccessHintCard,
  CreateAdvancedHintCard,
  CreateIdentityCard,
  CreateNetworkCard,
  CreatePageIntroCard,
  CreateResourcesCard,
  CreateReviewCard,
  CreateStepRail,
  CreateSystemCard,
  CreateTargetCard,
} from './VpsCreateWizardPrimitives';
export { buildVpsCreatePayload, defaultForm, validateForm, type FormState } from './VpsCreateModel';

export function VpsCreatePage() {
  const { basePath, mode } = useAppMode();
  const isAdminMode = mode === 'admin';
  const effectiveBasePath = isAdminMode ? '/admin' : basePath;
  const auth = useAuth();
  const activeUserIdRef = useRef<number | null | undefined>(auth.user?.id); activeUserIdRef.current = auth.user?.id;
  useEffect(() => { activeUserIdRef.current = auth.user?.id; return () => { activeUserIdRef.current = null; }; }, [auth.user?.id]);
  const scopeIsActive = (userId?: number) => activeUserIdRef.current === userId;
  const isAdminAccount = auth.role === 'admin';
  const needsAdminPayload = isAdminMode || isAdminAccount;
  const { t } = useI18n();
  const navigate = useNavigate();
  const chrome = useChrome();
  const qc = useQueryClient();
  const createOutcomeEntryPrefix = vpsCreateOutcomeEntryPrefix(auth.user?.id);
  const [form, setForm] = useState<FormState>(() => defaultForm());
  const [submitted, setSubmitted] = useState(false);
  const outcomeUserIdRef = useRef(auth.user?.id);
  const [createOutcomeMarker, setCreateOutcomeMarker] = useState<VpsCreateOutcomeMarker | null>(
    () => readLatestVpsCreateOutcomeMarker(auth.user?.id)
  );
  const scopedCreateOutcomeMarker = outcomeUserIdRef.current === auth.user?.id ? createOutcomeMarker : null;
  const [reviewedOutcomeId, setReviewedOutcomeId] = useState<string | null>(null);
  const [outcomeReviewPending, setOutcomeReviewPending] = useState(false);
  const [outcomeReviewError, setOutcomeReviewError] = useState<string | null>(null);
  const [outcomeCandidateVpsId, setOutcomeCandidateVpsId] = useState<number | null>(null);
  useEffect(() => {
    outcomeUserIdRef.current = auth.user?.id;
    setCreateOutcomeMarker(readLatestVpsCreateOutcomeMarker(auth.user?.id));
    setReviewedOutcomeId(null);
    setOutcomeReviewPending(false);
    setOutcomeReviewError(null);
    setOutcomeCandidateVpsId(null);
  }, [auth.user?.id]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage || !event.key?.startsWith(createOutcomeEntryPrefix)) return;
      const marker = readLatestVpsCreateOutcomeMarker(auth.user?.id);
      setCreateOutcomeMarker(marker);
      setReviewedOutcomeId((current) => current === marker?.id ? current : null);
      setOutcomeCandidateVpsId(null);
      setOutcomeReviewError(null);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [auth.user?.id, createOutcomeEntryPrefix]);

  const locationQ = useQuery({
    queryKey: ['locations', { limit: 500, hasHypervisor: true, includes: 'environment' }],
    queryFn: async () =>
      (
        await fetchLocations({
          limit: 500,
          hasHypervisor: true,
          includes: 'environment',
        })
      ).data,
  });
  const locations = locationQ.data ?? [];
  const selectedLocationId = optionalResource(form.locationId);
  const selectedLocation = useMemo(
    () => locations.find((loc) => Number(loc.id) === selectedLocationId),
    [locations, selectedLocationId]
  );
  const selectedEnvironmentId = locationEnvironmentId(selectedLocation);

  const nodesQ = useQuery({
    queryKey: ['nodes', { limit: 500, location: selectedLocationId ?? null, type: 'node', hypervisorType: 'vpsadminos' }],
    queryFn: async () =>
      (
        await fetchNodes({
          limit: 500,
          location: selectedLocationId,
          type: 'node',
          hypervisorType: 'vpsadminos',
        })
      ).data,
    enabled: needsAdminPayload && selectedLocationId !== undefined,
  });
  const templatesQ = useQuery({
    queryKey: ['os_templates', { limit: 500, enabled: true, hypervisorType: 'vpsadminos' }],
    queryFn: async () => (await fetchOsTemplates({ limit: 500, enabled: true, hypervisorType: 'vpsadminos' })).data,
  });
  const defaultResourcesQ = useQuery({
    queryKey: ['default_object_cluster_resources', { environment: selectedEnvironmentId ?? null, className: 'Vps' }],
    queryFn: async () =>
      (await fetchDefaultObjectClusterResources({ limit: 50, environmentId: selectedEnvironmentId, className: 'Vps' })).data,
    enabled: selectedEnvironmentId !== undefined,
  });

  const nodes = useMemo(
    () => (needsAdminPayload ? (nodesQ.data ?? []).filter(isVpsHypervisorNode) : []),
    [needsAdminPayload, nodesQ.data]
  );
  const hiddenAdminTarget = useMemo<HiddenAdminTarget | undefined>(
    () => (!isAdminMode && isAdminAccount ? { userId: auth.user?.id, nodeId: nodes[0]?.id } : undefined),
    [auth.user?.id, isAdminAccount, isAdminMode, nodes]
  );
  const templates = templatesQ.data ?? [];
  const selectedTemplateId = optionalResource(form.osTemplateId);
  const selectedTemplate = useMemo(
    () => templates.find((tpl) => Number(tpl.id) === selectedTemplateId),
    [selectedTemplateId, templates]
  );
  const selectedNodeId = optionalResource(form.nodeId);
  const selectedNode = useMemo(
    () => nodes.find((node) => Number(node.id) === selectedNodeId),
    [nodes, selectedNodeId]
  );
  const templatesByFamily = useMemo(() => {
    const groups = new Map<string, typeof templates>();
    for (const tpl of templates) {
      const family = osFamilyLabel(tpl.os_family, t('vps.create.option.other_templates'));
      const list = groups.get(family) ?? [];
      list.push(tpl);
      groups.set(family, list);
    }

    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [t, templates]);

  useEffect(() => {
    const defaults = defaultResourcesQ.data;
    if (!defaults) return;

    const next: Partial<FormState> = {};
    for (const item of defaults) {
      const name = item.cluster_resource?.name;
      const value = typeof item.value === 'number' ? String(item.value) : undefined;
      if (value === undefined) continue;
      if (name === 'cpu') next.cpu = value;
      else if (name === 'memory') next.memory = value;
      else if (name === 'swap') next.swap = value;
      else if (name === 'diskspace') next.diskspace = value;
      else if (name === 'ipv4') next.ipv4 = value;
      else if (name === 'ipv4_private') next.ipv4Private = value;
      else if (name === 'ipv6') next.ipv6 = value;
    }

    if (Object.keys(next).length === 0) return;
    setForm((prev) => ({ ...prev, ...next }));
  }, [defaultResourcesQ.data]);

  const validationKeys = useMemo(
    () => validateForm(form, isAdminMode, hiddenAdminTarget),
    [form, hiddenAdminTarget, isAdminMode]
  );
  const canSubmit = validationKeys.length === 0;
  type CreateMutationVariables = { payload: CreateVpsPayload; identity: { hostname: string; ownerId?: number; locationId?: number };
    userId?: number; effectiveBasePath: string; objectLabel: string; persistenceErrorMessage: string; outcomeUncertainMessage: string };
  type AcceptedCreateBinding = Readonly<{ userId?: number; actionStateId: number; object: ReturnType<typeof objectRef>; mutationGeneration: LocalMutationGeneration; objectLabel: string }>;
  type CreateMutationContext = { active: { userId?: number; marker: VpsCreateOutcomeMarker }; responseReceived: boolean; acceptedBinding?: AcceptedCreateBinding };
  // audit:ignore missing-local-lock missing-local-lock-release -- create uses its own durable receipt before a VPS id exists.
  const createM = useMutation({
    mutationFn: (variables: CreateMutationVariables) => createVps(variables.payload),
    onMutate: async (variables): Promise<CreateMutationContext> => {
      try {
        const marker = await beginVpsCreateOutcomeGuard({
          userId: variables.userId,
          identity: variables.identity,
          persistenceErrorMessage: variables.persistenceErrorMessage,
          outcomeUncertainMessage: variables.outcomeUncertainMessage,
        });
        if (scopeIsActive(variables.userId)) {
          setCreateOutcomeMarker(marker);
          setReviewedOutcomeId(null);
        }
        return { active: { userId: variables.userId, marker }, responseReceived: false };
      } catch (error) {
        if (scopeIsActive(variables.userId)) setCreateOutcomeMarker(readLatestVpsCreateOutcomeMarker(variables.userId));
        throw error;
      }
    },
    onSuccess: async (res, variables, context) => {
      // A received create response makes every later failure ambiguous.
      if (context) context.responseReceived = true;
      const vpsId = Number(res.data?.id);
      const actionStateId = getMetaActionStateId(res.meta);
      const active = context?.active;
      if (!active || actionStateId === undefined) throw new Error(variables.persistenceErrorMessage);
      const receipt = await markVpsCreateOutcomeAccepted({
        userId: active.userId,
        marker: active.marker,
        candidateVpsId: vpsId,
        actionStateId,
        persistenceErrorMessage: variables.persistenceErrorMessage,
      });
      context.active = { ...active, marker: receipt };
      if (!scopeIsActive(variables.userId)) return;
      setCreateOutcomeMarker(receipt);
      const vpsRef = Number.isInteger(vpsId) && vpsId > 0 ? objectRef('Vps', vpsId) : undefined;
      if (vpsRef) context.acceptedBinding = Object.freeze({ userId: variables.userId, actionStateId, object: vpsRef,
        mutationGeneration: await chrome.acquireLocalLock(vpsRef, { durable: true }), objectLabel: variables.objectLabel });
      const binding = context.acceptedBinding;
      if (!scopeIsActive(variables.userId) && binding) return void chrome.acquireLocalLock(binding.object, { actionStateId, generation: binding.mutationGeneration });
      if (!scopeIsActive(variables.userId)) return;
      void qc.invalidateQueries({ queryKey: ['vps', 'list'] });
      void qc.invalidateQueries({ queryKey: ['transaction_chain', 'active'] });
      chrome.trackActionState(actionStateId, { actionLabelKey: 'action.vps.create.label', objectLabel: variables.objectLabel,
        object: context.acceptedBinding?.object, mutationGeneration: context.acceptedBinding?.mutationGeneration });
      chrome.openTasks();
      navigate(
        Number.isFinite(vpsId) ? `${variables.effectiveBasePath}/vps/${vpsId}` : `${variables.effectiveBasePath}/vps`,
        Number.isFinite(vpsId)
          ? { state: pendingVpsCreateNavigationState(vpsId, actionStateId) }
          : undefined,
      );
    },
    onError: async (error, variables, context) => {
      const active = context?.active;
      if (context?.responseReceived) {
        if (active && scopeIsActive(active.userId)) {
          setCreateOutcomeMarker(readLatestVpsCreateOutcomeMarker(active.userId) ?? active.marker);
        }
        return;
      }
      if (active?.marker.phase === 'accepted') {
        if (scopeIsActive(active.userId)) setCreateOutcomeMarker(active.marker);
        return;
      }
      if (isAmbiguousMutationError(error)) {
        if (active) {
          try {
            const marker = await markVpsCreateOutcomeUncertain({
              userId: active.userId,
              marker: active.marker,
              candidateVpsId: isMissingActionStateError(error)
                ? Number((error.result as { data?: { id?: unknown } } | undefined)?.data?.id)
                : undefined,
              persistenceErrorMessage: variables.persistenceErrorMessage,
            });
            if (context) context.active = { ...active, marker };
            if (scopeIsActive(active.userId)) setCreateOutcomeMarker(marker);
          } catch {
            // The durable pending marker remains fail-closed and deliberately
            // cannot be acknowledged when the phase transition was not saved.
            if (scopeIsActive(active.userId)) {
              setCreateOutcomeMarker(readLatestVpsCreateOutcomeMarker(active.userId));
            }
          }
        }
        return;
      }
      if (active) {
        await clearVpsCreateOutcomeMarker({
          userId: active.userId,
          marker: active.marker,
          persistenceErrorMessage: variables.persistenceErrorMessage,
        });
        if (scopeIsActive(variables.userId)) setCreateOutcomeMarker(readLatestVpsCreateOutcomeMarker(variables.userId));
      }
    },
    onSettled: (_data, _error, _variables, context) => {
      const binding = context?.acceptedBinding;
      if (!binding) return;
      if (!scopeIsActive(binding.userId)) return void chrome.acquireLocalLock(binding.object, { actionStateId: binding.actionStateId, generation: binding.mutationGeneration });
      chrome.trackActionState(binding.actionStateId, { actionLabelKey: 'action.vps.create.label',
        objectLabel: binding.objectLabel, object: binding.object, mutationGeneration: binding.mutationGeneration });
    },
  });
  const loading = locationQ.isLoading || (needsAdminPayload && nodesQ.isLoading) || templatesQ.isLoading;
  const loadError = locationQ.error || (needsAdminPayload ? nodesQ.error : null) || templatesQ.error;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function applyResourcePreset(presetId: string) {
    const preset = RESOURCE_PRESETS.find((item) => item.id === (presetId as ResourcePresetId));
    if (!preset) return;
    setForm((prev) => ({
      ...prev,
      cpu: preset.cpu,
      memory: preset.memory,
      diskspace: preset.diskspace,
      swap: preset.swap,
    }));
  }

  function submit() {
    if (scopedCreateOutcomeMarker) return;
    setSubmitted(true);
    if (!canSubmit) return;
    const formSnapshot = Object.freeze({ ...form });
    const payload = Object.freeze(buildVpsCreatePayload(formSnapshot, { isAdminMode, needsAdminPayload, hiddenAdminTarget }));
    const hostname = formSnapshot.hostname.trim();
    createM.mutate(Object.freeze({
      payload,
      identity: Object.freeze({
        hostname,
        ownerId: isAdminMode ? optionalResource(formSnapshot.userId) : hiddenAdminTarget?.userId ?? auth.user?.id,
        locationId: optionalResource(formSnapshot.locationId),
      }),
      userId: auth.user?.id,
      effectiveBasePath,
      objectLabel: hostname,
      persistenceErrorMessage: t('vps.mutation.error.guard_storage'),
      outcomeUncertainMessage: t('vps.mutation.error.outcome_uncertain'),
    }));
  }

  async function reviewUncertainCreateOutcome() {
    const reviewUserId = auth.user?.id;
    const marker = scopedCreateOutcomeMarker;
    if (!marker || marker.phase === 'pending' || !marker.identity?.hostname || outcomeReviewPending) return;
    setReviewedOutcomeId(null);
    setOutcomeCandidateVpsId(null);
    setOutcomeReviewError(null);
    setOutcomeReviewPending(true);
    chrome.openTasks();
    try {
      const result = await reconcileVpsCreateOutcome(marker);
      if (!scopeIsActive(reviewUserId)) return;
      if (result.status !== 'matched') {
        const key = result.status === 'multiple'
          ? 'vps.create.error.reconcile_multiple'
          : result.status === 'none'
            ? 'vps.create.error.reconcile_none'
            : 'vps.create.error.reconcile_mismatch';
        throw new Error(t(key));
      }
      setOutcomeCandidateVpsId(result.vps.id);
      setReviewedOutcomeId(marker.id);
    } catch (error) {
      if (scopeIsActive(reviewUserId)) setOutcomeReviewError(error instanceof Error ? error.message : t('vps.create.error.reconcile_failed'));
    } finally {
      if (scopeIsActive(reviewUserId)) setOutcomeReviewPending(false);
    }
  }

  return (
    <ListShell
      variant="wide"
      testId="vps.create"
      banner={<SyncStaleBanner />}
      header={
        <PageHeader
          testId="vps.create.header"
          title={t('vps.create.title')}
          description={t('vps.create.description')}
          actions={
            <Button variant="secondary" to={`${effectiveBasePath}/vps`} testId="vps.create.back">
              <ArrowLeft className="h-4 w-4" />
              {t('common.back')}
            </Button>
          }
        />
      }
    >
      {loading ? (
        <LoadingState testId="vps.create.loading" />
      ) : loadError ? (
        <ErrorState
          testId="vps.create.load_error"
          title={t('vps.create.load_error.title')}
          error={loadError}
          onRetry={() => {
            void locationQ.refetch();
            void nodesQ.refetch();
            void templatesQ.refetch();
            void defaultResourcesQ.refetch();
          }}
          showBack={false}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-4">
            <CreatePageIntroCard />
            <CreateTargetCard
              form={form}
              isAdminMode={isAdminMode}
              isAdminAccount={isAdminAccount}
              locations={locations}
              nodes={nodes}
              selectedLocation={selectedLocation}
              selectedLocationId={selectedLocationId}
              hiddenAdminTarget={hiddenAdminTarget}
              onUpdate={update}
              onLocationChange={(value) => setForm((prev) => ({ ...prev, locationId: value, nodeId: '' }))}
            />
            <CreateSystemCard form={form} templatesByFamily={templatesByFamily} selectedTemplate={selectedTemplate} onUpdate={update} />
            <CreateIdentityCard form={form} isAdminMode={isAdminMode} onUpdate={update} />
            <CreateResourcesCard form={form} onApplyPreset={applyResourcePreset} onUpdate={update} />
            <CreateNetworkCard form={form} onUpdate={update} />
            <CreateAccessHintCard />
            <CreateAdvancedHintCard />
          </div>

          <div className="space-y-4">
            <CreateStepRail
              form={form}
              isAdminMode={isAdminMode}
              hiddenAdminTarget={hiddenAdminTarget}
              selectedTemplate={selectedTemplate}
              validationKeys={validationKeys}
            />
            <CreateReviewCard
              form={form}
              isAdminMode={isAdminMode}
              selectedLocation={selectedLocation}
              selectedTemplate={selectedTemplate}
              selectedNode={selectedNode}
              validationKeys={validationKeys}
              submitted={submitted}
              createError={createM.error}
              outcomePending={scopedCreateOutcomeMarker?.phase === 'pending' && !createM.isPending}
              outcomePhase={scopedCreateOutcomeMarker?.phase === 'pending' || createM.isPending
                ? undefined
                : scopedCreateOutcomeMarker?.phase}
              outcomeActionStateId={scopedCreateOutcomeMarker?.actionStateId}
              outcomeReviewed={Boolean(scopedCreateOutcomeMarker && reviewedOutcomeId === scopedCreateOutcomeMarker.id)}
              outcomeReviewPending={outcomeReviewPending}
              outcomeReviewError={outcomeReviewError}
              outcomeCandidateVpsId={outcomeCandidateVpsId}
              isPending={createM.isPending}
              submitDisabled={Boolean(scopedCreateOutcomeMarker)}
              onReviewUncertain={() => void reviewUncertainCreateOutcome()}
              onAcknowledgeUncertain={async () => {
                if (!scopedCreateOutcomeMarker || reviewedOutcomeId !== scopedCreateOutcomeMarker.id || !outcomeCandidateVpsId) return;
                const acknowledgeUserId = auth.user?.id;
                const cleared = await clearVpsCreateOutcomeMarker({
                  userId: acknowledgeUserId,
                  marker: scopedCreateOutcomeMarker,
                  persistenceErrorMessage: t('vps.mutation.error.guard_storage'),
                });
                if (!scopeIsActive(acknowledgeUserId)) return;
                if (!cleared) {
                  setOutcomeReviewError(t('vps.create.error.reconcile_failed'));
                  return;
                }
                setCreateOutcomeMarker(readLatestVpsCreateOutcomeMarker(acknowledgeUserId));
                setReviewedOutcomeId(null);
                navigate(`${effectiveBasePath}/vps/${outcomeCandidateVpsId}`);
              }}
              onSubmit={submit}
            />
          </div>
        </div>
      )}
    </ListShell>
  );
}

export default VpsCreatePage;
