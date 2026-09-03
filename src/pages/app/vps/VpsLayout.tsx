import React, { useEffect, useMemo, useState } from 'react';
import { Camera, RotateCw } from 'lucide-react';
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchActionState } from '../../../lib/api/actionStates';
import { fetchIpAddressesForVps } from '../../../lib/api/ipAddresses';
import { fetchTransactionChains } from '../../../lib/api/transactions';
import { fetchVps, vpsPasswd, vpsRestart, vpsStart, vpsStop } from '../../../lib/api/vps';
import { getMetaActionStateId, isMissingActionStateError } from '../../../lib/api/haveapi';
import { useAppMode } from '../../../app/appMode';
import { useAuth } from '../../../app/auth';
import { useObjectScope } from '../../../app/objectScope';
import { useI18n } from '../../../app/i18n';
import { useChrome } from '../../../components/layout/ChromeContext';
import { DetailShell } from '../../../components/layout/DetailShell';
import { MutationUncertaintyPanel, type MutationReconcileResult } from '../../../components/layout/MutationUncertaintyPanel';
import { objectRef } from '../../../lib/objectRef';
import { Badge } from '../../../components/ui/Badge';
import { LockBadge } from '../../../components/ui/LockBadge';
import { ObjectHeader } from '../../../components/ui/ObjectHeader';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Button } from '../../../components/ui/Button';
import { LinkButton } from '../../../components/ui/LinkButton';
import { Card } from '../../../components/ui/Card';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Checkbox } from '../../../components/ui/Checkbox';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { Modal } from '../../../components/ui/Modal';
import { LoadingState } from '../../../components/ui/LoadingState';
import { CopyButton } from '../../../components/ui/CopyButton';
import { LockStateStaleAlert } from '../../../components/ui/LockStateStaleAlert';
import { gateVpsAction } from '../../../lib/gates/vps';
import {
  actionStateProgressLabel,
  actionStateProgressPercent,
  objectStateBadge,
  runtimeStateBadge,
} from '../../../lib/taskStatus';
import { VpsContextProvider } from './VpsContext';
import { preflightVpsNotBusy } from './vpsPreflight';
import { ScopeMismatchCard } from '../../../components/layout/ScopeMismatchCard';
import { useFastPollIntervalMs, useTierAIntervalMs } from '../../../lib/refreshTiers';
import { useNetworkStatus } from '../../../lib/useNetworkStatus';
import { deriveChainLockState } from '../../../lib/lockState';
import { primarySshIpAddress } from './VpsOverviewModel';
import { freezeVpsMutationSnapshot, type VpsMutationSnapshot } from './VpsMutationSnapshot';
import {
  resolvePendingVpsCreateActionStateId,
  shouldDeferVpsDetailQuery,
} from './VpsDetailVisibility';
import { VpsActionsMenu, VpsTabsNav } from './VpsNavigation';
export function VpsLayout() {
  const { basePath, mode } = useAppMode();
  const auth = useAuth();
  const canMutateVps = mode !== 'admin' || auth.role === 'admin';
  const scope = useObjectScope();
  const chrome = useChrome();
  const qc = useQueryClient();
  const { t } = useI18n();
  const online = useNetworkStatus();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const vpsId = Number(params['vpsId']);
  const vpsRef = useMemo(() => {
    if (!Number.isFinite(vpsId) || vpsId <= 0) return null;
    return objectRef('Vps', vpsId);
  }, [vpsId]);

  const tierARefetchMs = useTierAIntervalMs();
  const fastPollMs = useFastPollIntervalMs();

  const pendingCreateActionStateId = useMemo(
    () => resolvePendingVpsCreateActionStateId(location.state, chrome.trackedActionStates, vpsId),
    [chrome.trackedActionStates, location.state, vpsId],
  );
  const pendingCreateStateQ = useQuery({
    queryKey: ['action_state', 'show', { id: pendingCreateActionStateId ?? -1 }],
    queryFn: async () => (await fetchActionState(pendingCreateActionStateId!)).data,
    enabled: pendingCreateActionStateId !== undefined,
    retry: false,
    refetchInterval: (query) => (
      (query.state.data as { finished?: boolean } | undefined)?.finished ? false : fastPollMs
    ),
  });
  const deferVpsDetailQuery = shouldDeferVpsDetailQuery(
    pendingCreateActionStateId,
    pendingCreateStateQ.data,
    pendingCreateStateQ.isError,
  );

  const vpsQ = useQuery({
    queryKey: ['vps', 'show', { id: vpsId }],
    queryFn: async () => (await fetchVps(vpsId, { includes: 'node__location__environment,user,dns_resolver,user_namespace_map,os_template,dataset' })).data,
    enabled: Number.isFinite(vpsId) && vpsId > 0 && !deferVpsDetailQuery,
  });

  const ipsQ = useQuery({
    queryKey: ['ip_address', 'list', { vpsId, limit: 250 }],
    queryFn: async () => (await fetchIpAddressesForVps(vpsId, { limit: 250 })).data,
    enabled: Number.isFinite(vpsId) && vpsId > 0 && !deferVpsDetailQuery,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const chainsQ = useQuery({
    queryKey: ['transaction_chain', 'list', { className: 'Vps', rowId: vpsId, limit: 10 }],
    queryFn: async () => (await fetchTransactionChains({ className: 'Vps', rowId: vpsId, limit: 10 })).data,
    enabled: Number.isFinite(vpsId) && vpsId > 0 && !deferVpsDetailQuery,
    refetchInterval: tierARefetchMs,
  });

  const [confirm, setConfirm] = useState<
    | null
    | { kind: 'stop' | 'restart'; force: boolean }
    | { kind: 'passwd'; type: 'secure' | 'simple' }
  >(null);
  const [lastAction, setLastAction] = useState<
    | null
    | {
        id: number;
        actionLabelKey?: string;
        actionLabel?: string;
        objectLabel?: string;
      }
  >(null);
  const acquireMutationContext = async (variables: { vpsId: number }) => {
    const lockRef = objectRef('Vps', variables.vpsId); return { lockRef, mutationGeneration: await chrome.acquireLocalLock(lockRef, { durable: true }) };
  };

  const startM = useMutation({
    mutationFn: async (variables: VpsMutationSnapshot) => {
      if (!variables.canMutate) throw new Error(t('gate.blocked.permission.body'));
      await preflightVpsNotBusy({ vpsId: variables.vpsId, t, knownBusy: variables.knownBusy });
      return vpsStart(variables.vpsId);
    },
    onMutate: acquireMutationContext,
    onError: (err: any) => {
      if (err?.code === 'BUSY') {
        chrome.openTasks();
      }
    },
    onSettled: (_data, error, _variables, context) => context && chrome.settleLocalLock(context.lockRef, error, context.mutationGeneration),
    onSuccess: (res, variables, context) => {
      const asId = getMetaActionStateId(res.meta);
      if (asId !== undefined) {
        const objectLabel = variables.objectLabel;
        chrome.trackActionState(asId, {
          actionLabelKey: 'action.vps.start.label',
          objectLabel,
          object: context?.lockRef,
          mutationGeneration: context?.mutationGeneration,
          blockUi: true,
          progressTitleKey: 'modal.vps.start.title',
        });
        setLastAction({ actionLabelKey: 'action.vps.start.label', objectLabel, id: asId });
      }
      void Promise.all([qc.invalidateQueries({ queryKey: ['vps', 'show', { id: variables.vpsId }] }), qc.invalidateQueries({ queryKey: ['transaction_chain', 'list', { className: 'Vps', rowId: variables.vpsId }] })]);
    },
  });

  const stopM = useMutation({
    mutationFn: async (variables: VpsMutationSnapshot & { force: boolean }) => {
      if (!variables.canMutate) throw new Error(t('gate.blocked.permission.body'));
      await preflightVpsNotBusy({ vpsId: variables.vpsId, t, knownBusy: variables.knownBusy });
      return vpsStop(variables.vpsId, { force: variables.force });
    },
    onMutate: acquireMutationContext,
    onError: (err: any) => {
      if (err?.code === 'BUSY') {
        chrome.openTasks();
      }
    },
    onSettled: (_data, error, _variables, context) => context && chrome.settleLocalLock(context.lockRef, error, context.mutationGeneration),
    onSuccess: (res, variables, context) => {
      const asId = getMetaActionStateId(res.meta);
      if (asId !== undefined) {
        const objectLabel = variables.objectLabel;
        chrome.trackActionState(asId, {
          actionLabelKey: 'action.vps.stop.label',
          objectLabel,
          object: context?.lockRef,
          mutationGeneration: context?.mutationGeneration,
          blockUi: true,
          progressTitleKey: 'modal.vps.stop.title',
        });
        setLastAction({ actionLabelKey: 'action.vps.stop.label', objectLabel, id: asId });
      }
      void Promise.all([qc.invalidateQueries({ queryKey: ['vps', 'show', { id: variables.vpsId }] }), qc.invalidateQueries({ queryKey: ['transaction_chain', 'list', { className: 'Vps', rowId: variables.vpsId }] })]);
    },
  });
  const restartM = useMutation({
    mutationFn: async (variables: VpsMutationSnapshot & { force: boolean }) => {
      if (!variables.canMutate) throw new Error(t('gate.blocked.permission.body'));
      await preflightVpsNotBusy({ vpsId: variables.vpsId, t, knownBusy: variables.knownBusy });
      return vpsRestart(variables.vpsId, { force: variables.force });
    },
    onMutate: acquireMutationContext,
    onError: (err: any) => {
      if (err?.code === 'BUSY') {
        chrome.openTasks();
      }
    },
    onSettled: (_data, error, _variables, context) => context && chrome.settleLocalLock(context.lockRef, error, context.mutationGeneration),
    onSuccess: (res, variables, context) => {
      const asId = getMetaActionStateId(res.meta);
      if (asId !== undefined) {
        const objectLabel = variables.objectLabel;
        chrome.trackActionState(asId, {
          actionLabelKey: 'action.vps.restart.label',
          objectLabel,
          object: context?.lockRef,
          mutationGeneration: context?.mutationGeneration,
          blockUi: true,
          progressTitleKey: 'modal.vps.restart.title',
        });
        setLastAction({ actionLabelKey: 'action.vps.restart.label', objectLabel, id: asId });
      }
      void Promise.all([qc.invalidateQueries({ queryKey: ['vps', 'show', { id: variables.vpsId }] }), qc.invalidateQueries({ queryKey: ['transaction_chain', 'list', { className: 'Vps', rowId: variables.vpsId }] })]);
    },
  });

  const [passwdFlow, setPasswdFlow] = useState<{ vpsId: number; password: string; asId: number } | null>(null);
  const [passwdWaitOpen, setPasswdWaitOpen] = useState(false);
  const [revealedPassword, setRevealedPassword] = useState<{ vpsId: number; password: string } | null>(null);
  const [passwdAsyncError, setPasswdAsyncError] = useState<{ vpsId: number; asId: number } | null>(null);
  const passwdM = useMutation({
    mutationFn: async (variables: VpsMutationSnapshot & { type: 'secure' | 'simple' }) => {
      if (!variables.canMutate) throw new Error(t('gate.blocked.permission.body'));
      await preflightVpsNotBusy({ vpsId: variables.vpsId, t, knownBusy: variables.knownBusy });
      return vpsPasswd(variables.vpsId, variables.type);
    },
    onMutate: acquireMutationContext,
    onSuccess: (res, variables, context) => {
      const asId = getMetaActionStateId(res.meta);
      if (asId === undefined) return;
      const objectLabel = variables.objectLabel;
      chrome.trackActionState(asId, {
        actionLabelKey: 'action.vps.root_password.label',
        objectLabel,
        object: context?.lockRef,
        mutationGeneration: context?.mutationGeneration,
      });
      setLastAction({ actionLabelKey: 'action.vps.root_password.label', objectLabel, id: asId });
      const password = String((res.data as any)?.password ?? '');
      if (variables.vpsId === vpsId && password) {
        setPasswdFlow({ vpsId: variables.vpsId, password, asId });
        setPasswdWaitOpen(true);
      }
    },
    onError: (err: any) => {
      if (err?.code === 'BUSY') {
        chrome.openTasks();
      }
    },
    onSettled: (_data, error, _variables, context) => context && chrome.settleLocalLock(context.lockRef, error, context.mutationGeneration),
  });

  const currentPasswdFlow = passwdFlow?.vpsId === vpsId ? passwdFlow : null;
  const currentRevealedPassword = revealedPassword?.vpsId === vpsId ? revealedPassword.password : null;
  const currentPasswdAsyncError = passwdAsyncError?.vpsId === vpsId ? passwdAsyncError : null;
  const passwdStateQ = useQuery({
    queryKey: ['action_state', 'show', { id: currentPasswdFlow?.asId ?? -1 }],
    queryFn: async () => (await fetchActionState(currentPasswdFlow!.asId)).data,
    enabled: currentPasswdFlow !== null,
    refetchInterval: (data) => {
      if (!data) return fastPollMs;
      return (data as any)?.finished ? false : fastPollMs;
    },
  });

  useEffect(() => {
    if (!currentPasswdFlow) return;
    if (!passwdStateQ.data) return;
    if (!passwdStateQ.data.finished) return;

    if (passwdStateQ.data.status === false) {
      setPasswdAsyncError({ vpsId: currentPasswdFlow.vpsId, asId: currentPasswdFlow.asId });
    } else {
      setRevealedPassword({ vpsId: currentPasswdFlow.vpsId, password: currentPasswdFlow.password });
    }

    setPasswdFlow(null);
    setPasswdWaitOpen(false);
    void vpsQ.refetch();
    void chainsQ.refetch();
  }, [currentPasswdFlow, passwdStateQ.data]);

  if (deferVpsDetailQuery) return <LoadingState testId="vps.detail.creating" />;
  if (vpsQ.isLoading) return <LoadingState testId="vps.detail.loading" />;

  if (vpsQ.isError) {
    return (
      <ErrorState
        testId="vps.detail.error"
        title={t('vps.layout.load_error.title')}
        error={vpsQ.error}
        onRetry={() => void vpsQ.refetch()}
        backTo={`${basePath}/vps`}
        detailsExtra={{ page: 'vps.detail', vpsId, scope: scope.scope }}
      />
    );
  }

  const vps = vpsQ.data;
  if (!vps) {
    return (
      <ErrorState
        testId="vps.detail.not_found"
        kindOverride="not_found"
        title={t('vps.layout.not_found.title')}
        body={t('vps.layout.not_found.body')}
        onRetry={() => void vpsQ.refetch()}
        backTo={`${basePath}/vps`}
        showStatusLink={false}
        showDetails={false}
        detailsExtra={{ page: 'vps.detail', vpsId, scope: scope.scope }}
      />
    );
  }

  // Admin/support "My view": prevent managing someone else's objects while still allowing
  // a quick jump to the admin view when needed.
  const ownerId =
    typeof (vps as any).user === 'object' && (vps as any).user !== null && typeof (vps as any).user.id === 'number'
      ? Number((vps as any).user.id)
      : undefined;

  if (
    scope.mineUserId !== undefined &&
    ownerId !== undefined &&
    Number.isFinite(scope.mineUserId) &&
    ownerId !== scope.mineUserId
  ) {
    const adminHref = location.pathname.replace(/^\/app\b/, '/admin') + location.search + location.hash;
    return (
      <ScopeMismatchCard
        objectKind={t('object_kind.vps')}
        objectLabel={String((vps as any).hostname ?? '')}
        ownerUserId={ownerId}
        adminHref={adminHref}
        backHref={`${basePath}/vps`}
        testId="vps.scope-mismatch"
      />
    );
  }

  const locationLabel = (vps as any).node?.location?.label ?? t('common.na');
  const nodeLabel = (vps as any).node?.domain_name ?? (vps as any).node?.name ?? t('common.na');

  const sshIp = primarySshIpAddress(ipsQ.data);
  const sshCommand = sshIp ? `ssh root@${sshIp}` : null;

  const chainLock = deriveChainLockState({
    chains: chainsQ.data,
    updatedAt: chainsQ.dataUpdatedAt,
    unreliable: !online || chainsQ.isError,
  });

  const busyTransaction = chainLock.busy;
  const activeChainIds = chainLock.activeChainIds;
  const chainsStale = chainLock.stale;

  const busyLocalLock = vpsRef ? chrome.isLocallyLocked(vpsRef) : false;
  const uncertainLocalLock = vpsRef
    ? chrome.localLocks.find((lock) => lock.kind === vpsRef.kind && lock.id === vpsRef.id && lock.uncertain === true)
    : undefined;
  const currentPasswdMutationPending = passwdM.isPending && passwdM.variables?.vpsId === vpsId;
  const currentPasswdMutationError = passwdM.isError && passwdM.variables?.vpsId === vpsId ? passwdM.error : null;
  const busyLocal = busyLocalLock || startM.isPending || stopM.isPending || restartM.isPending || currentPasswdMutationPending;

  const startGate = gateVpsAction('start', { vps, busyLocal, busyTransaction });
  const stopGate = gateVpsAction('stop', { vps, busyLocal, busyTransaction });
  const restartGate = gateVpsAction('restart', { vps, busyLocal, busyTransaction });
  const passwdGate = gateVpsAction('passwd', { vps, busyLocal, busyTransaction });
  const snapshotPowerVariables = (): VpsMutationSnapshot => freezeVpsMutationSnapshot({
    vpsId, canMutate: canMutateVps, knownBusy: busyTransaction || busyLocalLock, objectLabel: vps.hostname ? String(vps.hostname) : t('common.vps_ref', { id: vpsId }),
  });

  const rt = runtimeStateBadge(vps.is_running, t);
  const lc = objectStateBadge(vps.object_state, t);

  const showAsyncError = currentPasswdAsyncError !== null;
  const primaryHeaderAction = vps.is_running !== true ? 'start' : 'console';

  const handleHeaderMoreAction = (value: string) => {
    if (!value) return;

    switch (value) {
      case 'action:start':
        if (startGate.allowed) startM.mutate(snapshotPowerVariables());
        return;
      case 'action:restart':
        if (restartGate.allowed) setConfirm({ kind: 'restart', force: false });
        return;
      case 'action:stop':
        if (stopGate.allowed) setConfirm({ kind: 'stop', force: false });
        return;
      case 'action:root_password':
        if (passwdGate.allowed) setConfirm({ kind: 'passwd', type: 'secure' });
        return;
      case 'tasks':
        chrome.openTasks();
        return;
      default:
        navigate(value);
    }
  };

  const reconcileUncertainOutcome = async (): Promise<MutationReconcileResult> => {
    const [freshVps, freshChains] = await Promise.all([vpsQ.refetch(), chainsQ.refetch()]);
    if (freshVps.isError || freshChains.isError || !freshVps.data || !freshChains.data) {
      return 'error';
    }
    const reconciledLock = deriveChainLockState({
      chains: freshChains.data,
      updatedAt: Date.now(),
      unreliable: !online,
    });
    return reconciledLock.busy ? 'busy' : 'clear';
  };

  return (
    <VpsContextProvider
      value={{
        vps,
        canMutateVps,
        refetch: () => void vpsQ.refetch(),
        refetchChains: () => void chainsQ.refetch(),
        vpsRef: vpsRef ?? objectRef('Vps', vpsId),
        busyTransaction,
        chainsStale,
        busyLocalLock,
        activeChainIds,
        transactionChains: chainsQ.data ?? [],
        transactionChainsLoading: chainsQ.isLoading,
        transactionChainsError: chainsQ.isError,
        ipAddresses: ipsQ.data ?? [],
        ipAddressesLoading: ipsQ.isLoading,
        ipAddressesError: ipsQ.isError,
        sshCommand,
      }}
    >
      <DetailShell>
        <ObjectHeader
          testId="vps.header"
          kicker={
            <>
              <Link className="text-accent hover:underline" to={`${basePath}/vps`}>
                {t('nav.vps')}
              </Link>
              <span className="text-faint"> · </span>
              <span>#{vps.id}</span>
            </>
          }
          title={vps.hostname}
          badges={
            <>
              <Badge variant={rt.variant}>{rt.label}</Badge>
              <Badge variant={lc.variant}>{lc.label}</Badge>
              {busyTransaction ? (
                <LockBadge
                  kind="transaction"
                  t={t}
                  chainIds={activeChainIds}
                  showDetails
                />
              ) : busyLocalLock ? (
                <LockBadge kind="local" t={t} />
              ) : null}
            </>
          }
          meta={
            <>
              {t('common.node')} <span className="font-medium text-fg">{nodeLabel}</span>
              <span className="text-faint"> · </span>
              {t('common.location')} <span className="font-medium text-fg">{locationLabel}</span>
            </>
          }
          extra={
            <div className="space-y-2">
              <div className="text-sm text-muted" data-testid="vps.header.ssh">
                {t('vps.header.ssh.label')}: {sshCommand ? (
                  <span className="inline-flex items-center gap-2">
                    <code className="rounded bg-surface-2 px-2 py-1 font-mono text-xs text-fg">{sshCommand}</code>
                    <CopyButton text={sshCommand} label={t('common.copy')} />
                  </span>
                ) : (
                  <span className="text-faint">{t('vps.header.ssh.no_address')}</span>
                )}
              </div>

              {lastAction ? (
                <div className="text-xs text-muted">
                  {t('tasks.tracking_action', {
                    action: lastAction.actionLabelKey
                      ? t(lastAction.actionLabelKey as any)
                      : lastAction.actionLabel ?? t('toast.unknown_action'),
                  })}
                  {lastAction.objectLabel ? <span className="text-faint">{` · ${lastAction.objectLabel}`}</span> : null}
                  {' · '}
                  <button type="button" className="underline" onClick={() => chrome.openTasks()}>
                    {t('common.open_tasks')}
                  </button>
                  <span className="text-faint">{` · #${lastAction.id}`}</span>
                </div>
              ) : null}
            </div>
          }
          actions={
            <>
              {canMutateVps && primaryHeaderAction === 'start' ? (
                <ActionButton
                  variant="primary"
                  testId="vps.action.start"
                  disabled={!startGate.allowed}
                  disabledReason={!startGate.allowed ? startGate.reason : undefined}
                  onClick={() => startM.mutate(snapshotPowerVariables())}
                  title={t('action.vps.start.label')}
                >
                  {t('action.vps.start.label')}
                </ActionButton>
              ) : (
                <LinkButton
                  to={`${basePath}/vps/${vps.id}/console`}
                  variant="primary"
                  testId="vps.action.primary_console"
                >
                  {t('vps.tabs.console')}
                </LinkButton>
              )}

              {canMutateVps && typeof vps.dataset?.id === 'number' ? (
                <LinkButton
                  to={`${basePath}/datasets/${vps.dataset.id}/snapshots?action=create`}
                  variant="secondary"
                  testId="vps.action.snapshot"
                  title={t('vps.control.snapshot.title')}
                >
                  <Camera className="h-4 w-4" aria-hidden="true" />
                  {t('vps.control.snapshot')}
                </LinkButton>
              ) : null}

              {canMutateVps && vps.is_running === true ? (
                <ActionButton
                  variant="secondary"
                  testId="vps.action.restart.header"
                  disabled={!restartGate.allowed}
                  disabledReason={!restartGate.allowed ? restartGate.reason : undefined}
                  onClick={() => setConfirm({ kind: 'restart', force: false })}
                  title={t('action.vps.restart.label')}
                >
                  <RotateCw className="h-4 w-4" aria-hidden="true" />
                  {t('action.vps.restart.label')}
                </ActionButton>
              ) : null}

              <VpsActionsMenu
                basePath={basePath}
                vpsId={vps.id}
                canMutateVps={canMutateVps}
                primaryHeaderAction={primaryHeaderAction}
                startAllowed={startGate.allowed}
                restartAllowed={restartGate.allowed}
                stopAllowed={stopGate.allowed}
                passwordAllowed={passwdGate.allowed}
                showTasks={busyTransaction || busyLocal}
                showAdminActions={mode === 'admin' && auth.role === 'admin'}
                onSelect={handleHeaderMoreAction}
              />
            </>
          }
          tabs={<VpsTabsNav basePath={basePath} vpsId={vps.id} />}
        />

        {chainsStale ? (
          <LockStateStaleAlert
            chainIds={activeChainIds}
            error={chainsQ.error}
            onRetry={() => void chainsQ.refetch()}
          />
        ) : null}

        {vpsRef ? (
          <MutationUncertaintyPanel
            object={vpsRef}
            lock={uncertainLocalLock}
            reconcile={reconcileUncertainOutcome}
          />
        ) : null}

        {(startM.isError || stopM.isError || restartM.isError || currentPasswdMutationError || showAsyncError) ? (
          <Card>
            <div className="p-4">
              <div className="text-sm font-medium">{t('common.action_failed')}</div>
              <div className="mt-1 text-sm text-muted">
                {showAsyncError
                  ? t('vps.power.error.task_failed', { id: currentPasswdAsyncError!.asId })
                  : (() => {
                      const error = startM.error ?? stopM.error ?? restartM.error ?? currentPasswdMutationError;
                      return isMissingActionStateError(error)
                        ? t('vps.mutation.error.missing_action_state')
                        : error instanceof Error
                          ? error.message
                          : t('common.unknown_error');
                    })()}
              </div>
            </div>
          </Card>
        ) : null}

        <Outlet />

        <ConfirmDialog
          open={confirm?.kind === 'stop'}
          testId="vps.action.stop_confirm"
          title={t('vps.power.stop.confirm_title')}
          description={t('vps.power.stop.confirm_desc_basic')}
          danger
          confirmLabel={t('action.vps.stop.label')}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const force = confirm && confirm.kind === 'stop' ? confirm.force : false;
            stopM.mutate(freezeVpsMutationSnapshot({ ...snapshotPowerVariables(), force }));
            setConfirm(null);
          }}
        >
          <Checkbox
              checked={confirm?.kind === 'stop' ? confirm.force : false}
              onChange={(checked) =>
                setConfirm((prev) => (prev && prev.kind === 'stop' ? { ...prev, force: checked } : prev))
              }
              label={t('vps.power.stop.force.label')}
              description={t('vps.power.stop.force.help')}
              testId="vps.action.stop_confirm.force"
            />
        </ConfirmDialog>

        <ConfirmDialog
          open={confirm?.kind === 'restart'}
          testId="vps.action.restart_confirm"
          title={t('vps.power.restart.confirm_title')}
          description={t('vps.power.restart.confirm_desc_basic')}
          confirmLabel={t('action.vps.restart.label')}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const force = confirm && confirm.kind === 'restart' ? confirm.force : false;
            restartM.mutate(freezeVpsMutationSnapshot({ ...snapshotPowerVariables(), force }));
            setConfirm(null);
          }}
        >
          <Checkbox
              checked={confirm?.kind === 'restart' ? confirm.force : false}
              onChange={(checked) =>
                setConfirm((prev) => (prev && prev.kind === 'restart' ? { ...prev, force: checked } : prev))
              }
              label={t('vps.power.restart.force.label')}
              description={t('vps.power.restart.force.help')}
              testId="vps.action.restart_confirm.force"
            />
        </ConfirmDialog>

        <ConfirmDialog
          open={confirm?.kind === 'passwd'}
          testId="vps.action.root_password_confirm"
          title={t('action.vps.root_password.label')}
          description={t('vps.power.root_password.confirm_desc_basic')}
          confirmLabel={t('common.generate')}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const type = confirm && confirm.kind === 'passwd' ? confirm.type : 'secure';
            passwdM.mutate(freezeVpsMutationSnapshot({ ...snapshotPowerVariables(), type }));
            setConfirm(null);
          }}
        >
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="passwdType"
              checked={confirm?.kind === 'passwd' ? confirm.type === 'secure' : true}
              onChange={() => setConfirm({ kind: 'passwd', type: 'secure' })}
            />
            <span>{t('vps.power.root_password.type.secure')}</span>
          </label>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="passwdType"
              checked={confirm?.kind === 'passwd' ? confirm.type === 'simple' : false}
              onChange={() => setConfirm({ kind: 'passwd', type: 'simple' })}
            />
            <span>{t('vps.power.root_password.type.simple')}</span>
          </label>
        </ConfirmDialog>

        <Modal
          open={passwdWaitOpen && currentPasswdFlow !== null}
          onClose={() => setPasswdWaitOpen(false)}
          title={t('modal.vps.root_password.title')}
          size="sm"
          footer={
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => chrome.openTasks()}>
                {t('common.open_tasks')}
              </Button>
              <Button variant="secondary" onClick={() => setPasswdWaitOpen(false)}>
                {t('common.close')}
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            <div className="text-sm text-muted">{t('modal.vps.root_password.body')}</div>
            {passwdStateQ.data ? (
              <>
                {(() => {
                  const pct = actionStateProgressPercent(passwdStateQ.data);
                  const label = actionStateProgressLabel(passwdStateQ.data);
                  return (
                    <>
                      {pct !== null ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-muted">
                            <span>{label ?? t('common.progress')}</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="h-2 w-full rounded bg-surface-2">
                            <div className="h-2 rounded bg-accent" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      ) : null}
                    </>
                  );
                })()}
              </>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                <span>{t('common.starting')}</span>
              </div>
            )}
          </div>
        </Modal>

        <ConfirmDialog
          open={currentRevealedPassword !== null}
          title={t('modal.root_password_reveal.title')}
          description={t('modal.root_password_reveal.body')}
          confirmLabel={t('common.close')}
          onCancel={() => setRevealedPassword(null)}
          onConfirm={() => setRevealedPassword(null)}
        >
          <div className="mt-3 rounded-md border border-border bg-surface-2 p-3 font-mono text-sm break-all">
            {currentRevealedPassword ?? t('common.na')}
          </div>
          {currentRevealedPassword ? (
            <div className="mt-3 flex items-center gap-2">
              <CopyButton text={currentRevealedPassword} label={t('common.copy')} />
            </div>
          ) : null}
        </ConfirmDialog>
      </DetailShell>
    </VpsContextProvider>
  );
}
