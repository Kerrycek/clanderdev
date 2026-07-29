import React, { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';

import { fetchActionState } from '../../../lib/api/actionStates';
import { fetchIpAddressesForVps, type IpAddress } from '../../../lib/api/ipAddresses';
import { fetchTransactionChains } from '../../../lib/api/transactions';
import { fetchVps, vpsPasswd, vpsRestart, vpsStart, vpsStop } from '../../../lib/api/vps';
import { getMetaActionStateId } from '../../../lib/api/haveapi';
import { useAppMode } from '../../../app/appMode';
import { useObjectScope } from '../../../app/objectScope';
import { useI18n } from '../../../app/i18n';
import { useChrome } from '../../../components/layout/ChromeContext';
import { DetailShell } from '../../../components/layout/DetailShell';
import { objectRef } from '../../../lib/objectRef';
import { Badge } from '../../../components/ui/Badge';
import { LockBadge } from '../../../components/ui/LockBadge';
import { ObjectHeader } from '../../../components/ui/ObjectHeader';
import { TabsNav } from '../../../components/ui/TabsNav';
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
import { Select } from '../../../components/ui/Select';
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

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length != 4) return false;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return false;

  const a = nums[0];
  const b = nums[1];
  if (a === undefined || b === undefined) return false;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;

  return false;
}

function isPrivateIp(addr: string): boolean {
  const a = addr.trim();
  if (!a) return true;

  // IPv6
  if (a.includes(':')) {
    const lower = a.toLowerCase();
    if (lower === '::1') return true;
    if (lower.startsWith('fe80:')) return true; // link-local
    if (lower.startsWith('fd') || lower.startsWith('fc')) return true; // ULA
    return false;
  }

  return isPrivateIpv4(a);
}

function pickPrimarySshIp(ips: IpAddress[] | undefined): string | null {
  const list = (ips ?? [])
    .map((ip) => String(ip.addr ?? '').trim())
    .filter((addr) => addr.length > 0);

  if (list.length === 0) return null;

  // Prefer public networks when the metadata is available
  for (const ip of ips ?? []) {
    const addr = String(ip.addr ?? '').trim();
    if (!addr) continue;
    const role = String(ip.network?.role ?? '');
    const purpose = String(ip.network?.purpose ?? '');
    if (role === 'public' || purpose === 'public') return addr;
  }

  // Otherwise pick the first non-private address
  const publicCandidate = list.find((addr) => !isPrivateIp(addr));
  if (publicCandidate) return publicCandidate;

  // Fallback: at least show *something* usable (private SSH via VPN, etc.)
  return list[0] ?? null;
}

export function VpsLayout() {
  const { basePath, mode } = useAppMode();
  const scope = useObjectScope();
  const chrome = useChrome();
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

  const vpsQ = useQuery({
    queryKey: ['vps', 'show', { id: vpsId }],
    queryFn: async () => (await fetchVps(vpsId, { includes: 'node__location__environment,user,dns_resolver,user_namespace_map,os_template,dataset' })).data,
    enabled: Number.isFinite(vpsId) && vpsId > 0,
  });

  const ipsQ = useQuery({
    queryKey: ['ip_address', 'list', { vpsId }],
    queryFn: async () => (await fetchIpAddressesForVps(vpsId, { limit: 100 })).data,
    enabled: Number.isFinite(vpsId) && vpsId > 0,
  });

  const chainsQ = useQuery({
    queryKey: ['transaction_chain', 'list', { className: 'Vps', rowId: vpsId, limit: 10 }],
    queryFn: async () => (await fetchTransactionChains({ className: 'Vps', rowId: vpsId, limit: 10 })).data,
    enabled: Number.isFinite(vpsId) && vpsId > 0,
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

  const startM = useMutation({
    mutationFn: async () => {
      await preflightVpsNotBusy({ vpsId, t, knownBusy: busyTransaction || busyLocalLock });
      return vpsStart(vpsId);
    },
    onMutate: () => {
      if (vpsRef) chrome.acquireLocalLock(vpsRef);
    },
    onError: (err: any) => {
      if (err?.code === 'BUSY') {
        chrome.openTasks();
      }
    },
    onSettled: () => {
      if (vpsRef) chrome.releaseLocalLock(vpsRef);
    },
    onSuccess: (res) => {
      const asId = getMetaActionStateId(res.meta);
      if (asId !== undefined) {
        const objectLabel = vpsQ.data?.hostname ? String(vpsQ.data.hostname) : t('common.vps_ref', { id: vpsId });
        chrome.trackActionState(asId, {
          actionLabelKey: 'action.vps.start.label',
          objectLabel,
          object: vpsRef ?? undefined,
          blockUi: true,
          progressTitleKey: 'modal.vps.start.title',
        });
        setLastAction({ actionLabelKey: 'action.vps.start.label', objectLabel, id: asId });
      }
      void vpsQ.refetch();
      void chainsQ.refetch();
    },
  });

  const stopM = useMutation({
    mutationFn: async (force: boolean) => {
      await preflightVpsNotBusy({ vpsId, t, knownBusy: busyTransaction || busyLocalLock });
      return vpsStop(vpsId, { force });
    },
    onMutate: () => {
      if (vpsRef) chrome.acquireLocalLock(vpsRef);
    },
    onError: (err: any) => {
      if (err?.code === 'BUSY') {
        chrome.openTasks();
      }
    },
    onSettled: () => {
      if (vpsRef) chrome.releaseLocalLock(vpsRef);
    },
    onSuccess: (res) => {
      const asId = getMetaActionStateId(res.meta);
      if (asId !== undefined) {
        const objectLabel = vpsQ.data?.hostname ? String(vpsQ.data.hostname) : t('common.vps_ref', { id: vpsId });
        chrome.trackActionState(asId, {
          actionLabelKey: 'action.vps.stop.label',
          objectLabel,
          object: vpsRef ?? undefined,
          blockUi: true,
          progressTitleKey: 'modal.vps.stop.title',
        });
        setLastAction({ actionLabelKey: 'action.vps.stop.label', objectLabel, id: asId });
      }
      void vpsQ.refetch();
      void chainsQ.refetch();
    },
  });

  const restartM = useMutation({
    mutationFn: async (force: boolean) => {
      await preflightVpsNotBusy({ vpsId, t, knownBusy: busyTransaction || busyLocalLock });
      return vpsRestart(vpsId, { force });
    },
    onMutate: () => {
      if (vpsRef) chrome.acquireLocalLock(vpsRef);
    },
    onError: (err: any) => {
      if (err?.code === 'BUSY') {
        chrome.openTasks();
      }
    },
    onSettled: () => {
      if (vpsRef) chrome.releaseLocalLock(vpsRef);
    },
    onSuccess: (res) => {
      const asId = getMetaActionStateId(res.meta);
      if (asId !== undefined) {
        const objectLabel = vpsQ.data?.hostname ? String(vpsQ.data.hostname) : t('common.vps_ref', { id: vpsId });
        chrome.trackActionState(asId, {
          actionLabelKey: 'action.vps.restart.label',
          objectLabel,
          object: vpsRef ?? undefined,
          blockUi: true,
          progressTitleKey: 'modal.vps.restart.title',
        });
        setLastAction({ actionLabelKey: 'action.vps.restart.label', objectLabel, id: asId });
      }
      void vpsQ.refetch();
      void chainsQ.refetch();
    },
  });

  const passwdM = useMutation({
    mutationFn: async (type: 'secure' | 'simple') => {
      await preflightVpsNotBusy({ vpsId, t, knownBusy: busyTransaction || busyLocalLock });
      return vpsPasswd(vpsId, type);
    },
    onMutate: () => {
      if (vpsRef) chrome.acquireLocalLock(vpsRef);
    },
    onError: (err: any) => {
      if (err?.code === 'BUSY') {
        chrome.openTasks();
      }
    },
    onSettled: () => {
      if (vpsRef) chrome.releaseLocalLock(vpsRef);
    },
  });

  const [passwdFlow, setPasswdFlow] = useState<{ password: string; asId: number } | null>(null);
  const [passwdWaitOpen, setPasswdWaitOpen] = useState(false);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [passwdAsyncError, setPasswdAsyncError] = useState<{ asId: number } | null>(null);

  const passwdStateQ = useQuery({
    queryKey: ['action_state', 'show', { id: passwdFlow?.asId ?? -1 }],
    queryFn: async () => (await fetchActionState(passwdFlow!.asId)).data,
    enabled: passwdFlow !== null,
    refetchInterval: (data) => {
      if (!data) return fastPollMs;
      return (data as any)?.finished ? false : fastPollMs;
    },
  });

  useEffect(() => {
    if (!passwdFlow) return;
    if (!passwdStateQ.data) return;
    if (!passwdStateQ.data.finished) return;

    if (passwdStateQ.data.status === false) {
      setPasswdAsyncError({ asId: passwdFlow.asId });
    } else {
      setRevealedPassword(passwdFlow.password);
    }

    setPasswdFlow(null);
    setPasswdWaitOpen(false);
    void vpsQ.refetch();
    void chainsQ.refetch();
  }, [passwdFlow, passwdStateQ.data]);

  const nav = useMemo(
    () => [
      { label: t('vps.tabs.overview'), to: `${basePath}/vps/${vpsId}`, end: true },
      { label: t('vps.tabs.config'), to: `${basePath}/vps/${vpsId}/config`, end: true },
      { label: t('vps.tabs.access'), to: `${basePath}/vps/${vpsId}/access`, end: true },
      { label: t('vps.tabs.network'), to: `${basePath}/vps/${vpsId}/network`, end: true },
      { label: t('vps.tabs.storage'), to: `${basePath}/vps/${vpsId}/storage`, end: true },
      { label: t('vps.tabs.features'), to: `${basePath}/vps/${vpsId}/features`, end: true },
      { label: t('vps.tabs.maintenance'), to: `${basePath}/vps/${vpsId}/maintenance`, end: true },
      { label: t('vps.tabs.console'), to: `${basePath}/vps/${vpsId}/console`, end: true },
    ],
    [basePath, t, vpsId]
  );

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

  const sshIp = pickPrimarySshIp(ipsQ.data);
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
  const busyLocal = busyLocalLock || startM.isPending || stopM.isPending || restartM.isPending || passwdM.isPending;

  const startGate = gateVpsAction('start', { vps, busyLocal, busyTransaction });
  const stopGate = gateVpsAction('stop', { vps, busyLocal, busyTransaction });
  const restartGate = gateVpsAction('restart', { vps, busyLocal, busyTransaction });
  const passwdGate = gateVpsAction('passwd', { vps, busyLocal, busyTransaction });

  const rt = runtimeStateBadge(vps.is_running, t);
  const lc = objectStateBadge(vps.object_state, t);

  const showAsyncError = passwdAsyncError !== null;
  const primaryHeaderAction = vps.is_running !== true ? 'start' : 'console';

  const handleHeaderMoreAction = (value: string) => {
    if (!value) return;

    switch (value) {
      case 'action:start':
        if (startGate.allowed) startM.mutate();
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

  return (
    <VpsContextProvider
      value={{
        vps,
        refetch: () => void vpsQ.refetch(),
        refetchChains: () => void chainsQ.refetch(),
        vpsRef: vpsRef ?? objectRef('Vps', vpsId),
        busyTransaction,
        chainsStale,
        busyLocalLock,
        activeChainIds,
        ipAddresses: ipsQ.data ?? [], ipAddressesLoading: ipsQ.isLoading, ipAddressesError: ipsQ.isError,
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
              {primaryHeaderAction === 'start' ? (
                <ActionButton
                  variant="primary"
                  testId="vps.action.start"
                  disabled={!startGate.allowed}
                  disabledReason={!startGate.allowed ? startGate.reason : undefined}
                  onClick={() => startM.mutate()}
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

              <Select
                value=""
                ariaLabel={t('vps.actions.menu.label')}
                testId="vps.actions.menu"
                className="w-48"
                onChange={(e) => handleHeaderMoreAction(e.target.value)}
              >
                <option value="">{t('vps.actions.more.placeholder')}</option>
                <optgroup label={t('vps.actions.more.group.daily')}>
                  {primaryHeaderAction !== 'start' ? (
                    <option value="action:start" disabled={!startGate.allowed}>
                      {t('action.vps.start.label')}
                    </option>
                  ) : null}
                  <option value="action:restart" disabled={!restartGate.allowed}>
                    {t('action.vps.restart.label')}
                  </option>
                  <option value="action:stop" disabled={!stopGate.allowed}>
                    {t('action.vps.stop.label')}
                  </option>
                  <option value="action:root_password" disabled={!passwdGate.allowed}>
                    {t('vps.power.root_password.button')}
                  </option>
                  {busyTransaction || busyLocal ? <option value="tasks">{t('common.open_tasks')}</option> : null}
                </optgroup>
                <optgroup label={t('vps.actions.more.group.sections')}>
                  <option value={`${basePath}/vps/${vps.id}/access`}>{t('vps.tabs.access')}</option>
                  <option value={`${basePath}/vps/${vps.id}/config`}>{t('vps.tabs.config')}</option>
                  <option value={`${basePath}/vps/${vps.id}/network`}>{t('vps.tabs.network')}</option>
                  <option value={`${basePath}/vps/${vps.id}/storage`}>{t('vps.tabs.storage')}</option>
                  <option value={`${basePath}/vps/${vps.id}/features`}>{t('vps.tabs.features')}</option>
                  <option value={`${basePath}/vps/${vps.id}/maintenance`}>{t('vps.tabs.maintenance')}</option>
                  <option value={`${basePath}/transactions/items?vps=${vps.id}`}>{t('vps.overview.admin_actions.transaction_log')}</option>
                </optgroup>
                <optgroup label={t('vps.actions.more.group.lifecycle')}>
                  <option value={`${basePath}/vps/${vps.id}/lifecycle/reinstall`}>{t('action.vps.reinstall.label')}</option>
                  <option value={`${basePath}/vps/${vps.id}/lifecycle/clone`}>{t('action.vps.clone.label')}</option>
                  <option value={`${basePath}/vps/${vps.id}/lifecycle/swap`}>{t('action.vps.swap.label')}</option>
                  <option value={`${basePath}/vps/${vps.id}/lifecycle/delete`}>{t('action.vps.delete.label')}</option>
                </optgroup>
                {mode === 'admin' ? (
                  <optgroup label={t('vps.actions.more.group.admin')}>
                    <option value={`${basePath}/vps/${vps.id}/lifecycle/lifetime`}>{t('action.vps.lifecycle.label')}</option>
                    <option value={`${basePath}/vps/${vps.id}/lifecycle/template`}>{t('action.vps.template.label')}</option>
                    <option value={`${basePath}/vps/${vps.id}/lifecycle/boot`}>{t('action.vps.boot.label')}</option>
                    <option value={`${basePath}/vps/${vps.id}/lifecycle/replace`}>{t('action.vps.replace.label')}</option>
                    <option value={`${basePath}/vps/${vps.id}/lifecycle/migrate`}>{t('action.vps.migrate.label')}</option>
                  </optgroup>
                ) : null}
              </Select>
            </>
          }
          tabs={<TabsNav items={nav} />}
        />

        {chainsStale ? (
          <LockStateStaleAlert
            chainIds={activeChainIds}
            error={chainsQ.error}
            onRetry={() => void chainsQ.refetch()}
          />
        ) : null}

        {(startM.isError || stopM.isError || restartM.isError || passwdM.isError || showAsyncError) ? (
          <Card>
            <div className="p-4">
              <div className="text-sm font-medium">{t('common.action_failed')}</div>
              <div className="mt-1 text-sm text-muted">
                {showAsyncError
                  ? t('vps.power.error.task_failed', { id: passwdAsyncError!.asId })
                  : String(
                      (startM.error as any)?.message ??
                        (stopM.error as any)?.message ??
                        (restartM.error as any)?.message ??
                        (passwdM.error as any)?.message ??
                        t('common.unknown_error')
                    )}
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
            stopM.mutate(force);
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
            restartM.mutate(force);
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
            passwdM.mutate(type, {
              onSuccess: (res) => {
                const asId = getMetaActionStateId(res.meta);
                const pwd = String((res.data as any)?.password ?? '');

                if (asId !== undefined && pwd) {
                  const objectLabel = vpsQ.data?.hostname ? String(vpsQ.data.hostname) : t('common.vps_ref', { id: vpsId });
                  chrome.trackActionState(asId, { actionLabelKey: 'action.vps.root_password.label', objectLabel, object: vpsRef ?? undefined });
                  setLastAction({ actionLabelKey: 'action.vps.root_password.label', objectLabel, id: asId });
                  setRevealedPassword(pwd);
                  setPasswdFlow({ password: pwd, asId });
                  setPasswdWaitOpen(true);
                } else if (pwd) {
                  // Fall back to legacy behaviour: show immediately
                  setRevealedPassword(pwd);
                }
              },
            });
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
          open={passwdWaitOpen}
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
          open={revealedPassword !== null}
          title={t('modal.root_password_reveal.title')}
          description={t('modal.root_password_reveal.body')}
          confirmLabel={t('common.close')}
          onCancel={() => setRevealedPassword(null)}
          onConfirm={() => setRevealedPassword(null)}
        >
          <div className="mt-3 rounded-md border border-border bg-surface-2 p-3 font-mono text-sm break-all">
            {revealedPassword ?? t('common.na')}
          </div>
          {revealedPassword ? (
            <div className="mt-3 flex items-center gap-2">
              <CopyButton text={revealedPassword} label={t('common.copy')} />
            </div>
          ) : null}
        </ConfirmDialog>
      </DetailShell>
    </VpsContextProvider>
  );
}
