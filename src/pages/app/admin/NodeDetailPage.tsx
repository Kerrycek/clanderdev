import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  evacuateNode,
  fetchNode,
  fetchNodePools,
  fetchNodes,
  fetchNodeStatuses,
  setNodeMaintenance,
  type NodeEvacuateResult,
} from '../../../lib/api/nodes';
import { fetchActiveTransactionChains, fetchTransactions } from '../../../lib/api/transactions';
import { fetchPublicNodeStatus } from '../../../lib/api/public';
import { getMetaActionStateId } from '../../../lib/api/haveapi';
import { useAppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';
import { DetailShell } from '../../../components/layout/DetailShell';
import { useChrome } from '../../../components/layout/ChromeContext';
import { useNetworkStatus } from '../../../lib/useNetworkStatus';
import { objectRef } from '../../../lib/objectRef';
import { gateNodeAction } from '../../../lib/gates/node';
import { deriveChainLockState } from '../../../lib/lockState';
import { cursorFromDescendingPage } from '../../../lib/lockIndex';
import { useKeysetPagination } from '../../../lib/hooks/useKeysetPagination';
import { useTierBIntervalMs, useTierCIntervalMs, useTierSlowIntervalMs } from '../../../lib/refreshTiers';
import { preflightNodeNotBusy } from './adminPreflight';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { LockBadge } from '../../../components/ui/LockBadge';
import { Button } from '../../../components/ui/Button';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { ErrorState } from '../../../components/ui/ErrorState';
import { LinkButton } from '../../../components/ui/LinkButton';
import { LoadingState } from '../../../components/ui/LoadingState';
import { LockStateStaleAlert } from '../../../components/ui/LockStateStaleAlert';
import { ObjectHeader } from '../../../components/ui/ObjectHeader';
import { NodeDetailTabs, NodeMaintenanceSection, NodeOverviewSection } from './nodeDetail/NodeDetailSections';
import { NodeStorageCard } from './nodeDetail/NodeStorageCard';
import { NodeLifecycleHeaderActions } from './nodes/NodeLifecycleHeaderActions';
import { AdminObjectMutationRecovery } from './AdminObjectMutationRecovery';
import { parseNodeDetailSection, type NodeDetailSection } from './nodeDetail/NodeStorageModel';
import {
  buildNodeStatusKeys,
  buildStatusIndex,
  isMaintenanceLocked,
  locationLabel,
  metricsLimitForWindow,
  metricsWindowMs,
  nodeLocation,
  nodeLockReason,
  nodeTitle,
  parseMetricsWindow,
  safePercent,
  sortStatusesByTimeAsc,
  statusBadge,
} from './nodeDetail/nodeDetailSemantics';

export function NodeDetailPage() {
  const { mode, basePath } = useAppMode();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const chrome = useChrome();
  const online = useNetworkStatus();
  const params = useParams();
  const nodeId = Number(params['nodeId']);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const nodeRef = useMemo(() => {
    const id = Number(nodeId);
    if (!Number.isFinite(id) || id <= 0) return null;
    return objectRef('Node', id);
  }, [nodeId]);
  const busyLocalLock = nodeRef ? chrome.isLocallyLocked(nodeRef) : false;

  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection = parseNodeDetailSection(searchParams.get('section'));
  const setActiveSection = (section: NodeDetailSection) => {
    const next = new URLSearchParams(searchParams);
    if (section === 'overview') next.delete('section');
    else next.set('section', section);
    setSearchParams(next, { replace: true });
  };
  const metricsWindow = parseMetricsWindow(searchParams.get('metrics_window'));
  const metricsLimit = metricsLimitForWindow(metricsWindow);
  const setMetricsWindow = (w: '6h' | '24h' | '7d') => {
    const next = new URLSearchParams(searchParams);
    next.set('metrics_window', w);
    setSearchParams(next, { replace: true });
  };

  const [notice, setNotice] = useState<string | null>(null);
  const [maintReason, setMaintReason] = useState('');
  const [evDst, setEvDst] = useState('');
  const [evConcurrency, setEvConcurrency] = useState('1');
  const [evStopOnError, setEvStopOnError] = useState(true);
  const [evMaintenanceWindow, setEvMaintenanceWindow] = useState(true);
  const [evCleanupData, setEvCleanupData] = useState(true);
  const [evSendMail, setEvSendMail] = useState(true);
  const [evReason, setEvReason] = useState('');
  const [evResult, setEvResult] = useState<NodeEvacuateResult | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: 'lock' } | { kind: 'unlock' } | { kind: 'evacuate' }>(null);

  const tierBRefetchMs = useTierBIntervalMs();
  const tierCRefetchMs = useTierCIntervalMs();
  const tierSlowRefetchMs = useTierSlowIntervalMs();

  const statusPg = useKeysetPagination({
    id: 'admin.node.statuses',
    filterKey: `node=${nodeId}`,
    searchParams,
    setSearchParams,
    paramPrefix: 'status_',
    defaultLimit: 50,
  });

  const txPg = useKeysetPagination({
    id: 'admin.node.transactions',
    filterKey: `node=${nodeId}`,
    searchParams,
    setSearchParams,
    paramPrefix: 'tx_',
    defaultLimit: 50,
  });

  const nodeQ = useQuery({
    queryKey: ['nodes', 'show', { id: nodeId }],
    queryFn: async () => (await fetchNode(nodeId)).data,
    enabled: Number.isFinite(nodeId) && nodeId > 0,
    refetchInterval: tierBRefetchMs,
  });

  const publicStatusQ = useQuery({
    queryKey: ['nodes', 'public_status'],
    queryFn: async () => (await fetchPublicNodeStatus()).data,
    staleTime: 15000,
    refetchInterval: tierSlowRefetchMs,
  });

  const statusRow = useMemo(() => {
    if (!nodeQ.data || !publicStatusQ.data) return null;
    const idx = buildStatusIndex(publicStatusQ.data);
    for (const k of buildNodeStatusKeys(nodeQ.data)) {
      const st = idx.get(k);
      if (st) return st;
    }
    return null;
  }, [nodeQ.data, publicStatusQ.data]);

  const statusesQ = useQuery({
    queryKey: ['nodes', 'statuses', { nodeId, limit: statusPg.limit, fromId: statusPg.fromId ?? null }],
    queryFn: async () => (await fetchNodeStatuses(nodeId, { limit: statusPg.limit, fromId: statusPg.fromId })).data,
    enabled: Number.isFinite(nodeId) && nodeId > 0 && activeSection === 'overview',
    refetchInterval: tierCRefetchMs,
  });

  const metricsQ = useQuery({
    queryKey: ['nodes', 'metrics', { nodeId, window: metricsWindow, limit: metricsLimit }],
    queryFn: async () => {
      const now = Date.now();
      const from = new Date(now - metricsWindowMs(metricsWindow)).toISOString();
      const to = new Date(now).toISOString();
      try {
        return (await fetchNodeStatuses(nodeId, { limit: metricsLimit, from, to })).data;
      } catch {
        return (await fetchNodeStatuses(nodeId, { limit: metricsLimit })).data;
      }
    },
    enabled: Number.isFinite(nodeId) && nodeId > 0 && activeSection === 'overview',
    refetchInterval: tierSlowRefetchMs,
  });

  const txQ = useQuery({
    queryKey: ['transactions', 'list', { nodeId, limit: txPg.limit, fromId: txPg.fromId ?? null }],
    queryFn: async () => (await fetchTransactions({ nodeId, limit: txPg.limit, fromId: txPg.fromId })).data,
    enabled: Number.isFinite(nodeId) && nodeId > 0 && activeSection === 'overview',
    refetchInterval: tierBRefetchMs,
  });

  const chainsQ = useQuery({
    queryKey: ['transaction_chain', 'list', { className: 'Node', rowId: nodeId, state: 'active', limit: 10 }],
    queryFn: async () => fetchActiveTransactionChains({ className: 'Node', rowId: nodeId, limit: 10 }),
    enabled: Number.isFinite(nodeId) && nodeId > 0,
    refetchInterval: tierBRefetchMs,
  });

  const chainLock = deriveChainLockState({
    chains: chainsQ.data,
    updatedAt: chainsQ.dataUpdatedAt,
    unreliable: !online || chainsQ.isError,
  });
  const busyTransaction = chainLock.busy;
  const activeChainIds = chainLock.activeChainIds;
  const chainsStale = chainLock.stale;

  const nodesQ = useQuery({
    queryKey: ['nodes', 'index', { limit: 500 }],
    queryFn: async () => (await fetchNodes({ limit: 500 })).data,
    enabled: Number.isFinite(nodeId) && nodeId > 0 && activeSection === 'maintenance',
    staleTime: 60000,
  });

  const poolsQ = useQuery({
    queryKey: ['nodes', 'pools', { nodeId, limit: 500 }],
    queryFn: async () => (await fetchNodePools(nodeId, { limit: 500 })).data,
    enabled: Number.isFinite(nodeId) && nodeId > 0 && activeSection === 'storage',
    refetchInterval: tierSlowRefetchMs,
  });

  const node = nodeQ.data;
  const title = node ? nodeTitle(node, nodeId) : `Node #${nodeId}`;

  const refreshAfterNodeMutation = (mutationNodeId: number) => {
    const activeOnly = { refetchType: 'active' as const };
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ['nodes', 'show', { id: mutationNodeId }], exact: true, ...activeOnly }),
      queryClient.invalidateQueries({ queryKey: ['nodes', 'public_status'], exact: true, ...activeOnly }),
      queryClient.invalidateQueries({ queryKey: ['nodes', 'index', { limit: 500 }], exact: true, ...activeOnly }),
      queryClient.invalidateQueries({
        queryKey: ['transaction_chain', 'list', { className: 'Node', rowId: mutationNodeId, state: 'active', limit: 10 }],
        exact: true,
        ...activeOnly,
      }),
      queryClient.invalidateQueries({
        queryKey: ['transactions', 'list', { nodeId: mutationNodeId, limit: txPg.limit, fromId: txPg.fromId ?? null }],
        exact: true,
        ...activeOnly,
      }),
    ]);
  };

  const snapshotNodeTarget = () => nodeRef ? Object.freeze({ nodeId, lockRef: Object.freeze({ ...nodeRef }), knownBusy: busyLocalLock || busyTransaction, title }) : null;
  const acquireMutationContext = async (variables: { lockRef: NonNullable<typeof nodeRef> }) => ({ lockRef: variables.lockRef,
    mutationGeneration: await chrome.acquireLocalLock(variables.lockRef, { durable: true }) });
  const handleBusyError = (err: unknown) => { if (typeof err === 'object' && err && 'code' in err && (err as { code?: unknown }).code === 'BUSY') chrome.openTasks(); };

  const maintenanceM = useMutation({
    mutationFn: async (variables: NonNullable<ReturnType<typeof snapshotNodeTarget>> & { lock: boolean; reason?: string }) => {
      await preflightNodeNotBusy({ nodeId: variables.nodeId, t, knownBusy: variables.knownBusy });
      return setNodeMaintenance(variables.nodeId, { lock: variables.lock, reason: variables.reason });
    },
    onMutate: acquireMutationContext,
    onSuccess: (res, variables, context) => {
      const asId = getMetaActionStateId(res.meta);
      if (asId !== undefined) {
        chrome.trackActionState(asId, {
          object: context?.lockRef,
          mutationGeneration: context?.mutationGeneration,
          actionLabelKey: variables.lock ? 'action.node.maintenance_lock.label' : 'action.node.maintenance_unlock.label',
          objectLabel: variables.title,
        });
      }
      if (mountedRef.current) {
        setNotice(variables.lock ? t('admin.node.notice.maintenance_lock_requested') : t('admin.node.notice.maintenance_unlock_requested'));
        setConfirm(null);
      }
      refreshAfterNodeMutation(variables.nodeId);
    },
    onError: handleBusyError,
    onSettled: (_data, error, _variables, context) => context && chrome.settleLocalLock(context.lockRef, error, context.mutationGeneration),
  });

  const evacuateM = useMutation({
    mutationFn: async (variables: NonNullable<ReturnType<typeof snapshotNodeTarget>> & { payload: Parameters<typeof evacuateNode>[1] }) => {
      await preflightNodeNotBusy({ nodeId: variables.nodeId, t, knownBusy: variables.knownBusy });
      return evacuateNode(variables.nodeId, variables.payload);
    },
    onMutate: acquireMutationContext,
    onSuccess: (res, variables, context) => {
      const asId = getMetaActionStateId(res.meta);
      if (asId !== undefined) {
        chrome.trackActionState(asId, {
          object: context?.lockRef,
          mutationGeneration: context?.mutationGeneration,
          actionLabelKey: 'action.node.evacuate.label',
          objectLabel: variables.title,
        });
      }
      if (mountedRef.current) {
        setEvResult(res.data ?? null);
        setNotice(t('admin.node.notice.evacuation_started'));
        setConfirm(null);
      }
      refreshAfterNodeMutation(variables.nodeId);
    },
    onError: handleBusyError,
    onSettled: (_data, error, _variables, context) => context && chrome.settleLocalLock(context.lockRef, error, context.mutationGeneration),
  });

  const metricsRows = useMemo(() => sortStatusesByTimeAsc(metricsQ.data ?? []), [metricsQ.data]);
  const metricsLast = metricsRows.length > 0 ? metricsRows[metricsRows.length - 1] : undefined;
  const load1Points = useMemo(() => {
    const out: { x: string; y: number }[] = [];
    for (const sample of metricsRows) {
      if (typeof sample.created_at !== 'string' || !sample.created_at) continue;
      if (typeof sample.loadavg1 !== 'number' || !Number.isFinite(sample.loadavg1)) continue;
      out.push({ x: sample.created_at, y: sample.loadavg1 });
    }
    return out;
  }, [metricsRows]);
  const cpuIdlePoints = useMemo(() => {
    const out: { x: string; y: number }[] = [];
    for (const sample of metricsRows) {
      if (typeof sample.created_at !== 'string' || !sample.created_at) continue;
      if (typeof sample.cpu_idle !== 'number' || !Number.isFinite(sample.cpu_idle)) continue;
      out.push({ x: sample.created_at, y: sample.cpu_idle });
    }
    return out;
  }, [metricsRows]);
  const memUsedPercentPoints = useMemo(() => {
    const fallbackTotal = typeof node?.total_memory === 'number' ? node.total_memory : undefined;
    const out: { x: string; y: number }[] = [];
    for (const sample of metricsRows) {
      if (typeof sample.created_at !== 'string' || !sample.created_at) continue;
      const pct = safePercent(sample.used_memory, sample.total_memory ?? fallbackTotal);
      if (pct == null || !Number.isFinite(pct)) continue;
      out.push({ x: sample.created_at, y: pct });
    }
    return out;
  }, [metricsRows, node?.total_memory]);

  const lock = isMaintenanceLocked(node?.maintenance_lock);
  const lockReason = nodeLockReason(node);
  const loc = nodeLocation(node);

  const busyLocalAny = busyLocalLock || maintenanceM.isPending || evacuateM.isPending;
  const maintenanceLockGate = gateNodeAction('maintenance.lock', { busyLocal: busyLocalAny, busyTransaction });
  const maintenanceUnlockGate = gateNodeAction('maintenance.unlock', { busyLocal: busyLocalAny, busyTransaction });
  const evacuateGate = gateNodeAction('evacuate', { busyLocal: busyLocalAny, busyTransaction });

  const destOptions = useMemo(
    () =>
      (nodesQ.data ?? [])
        .filter((n) => typeof n.id === 'number' && n.id !== nodeId)
        .map((n) => ({
          id: n.id,
          label: String(n.domain_name ?? n.name ?? n.fqdn ?? `#${n.id}`),
          location: locationLabel(n.location),
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [nodeId, nodesQ.data]
  );

  const canEvacuate = Number.isFinite(Number(evDst)) && Number(evDst) > 0;

  const statusRows = statusesQ.data ?? [];
  const statusCursor = useMemo(() => cursorFromDescendingPage(statusRows), [statusRows]);
  const statusCanNext = statusPg.hasForward || (statusRows.length >= statusPg.limit && statusCursor !== null);

  const txRows = txQ.data ?? [];
  const txCursor = useMemo(() => cursorFromDescendingPage(txRows), [txRows]);
  const txCanNext = txPg.hasForward || (txRows.length >= txPg.limit && txCursor !== null);

  const headerStatus = statusBadge(t, node ? node.status : statusRow?.status);

  return (
    <DetailShell testId="admin.node.page" variant="wide">
      <ObjectHeader
        testId="admin.node.header"
        title={title}
        titleAfter={<Badge variant={headerStatus.variant}>{headerStatus.label}</Badge>}
        kicker={
          <>
            <Link className="underline" to={`${basePath}/nodes`}>
              {t('nav.nodes')}
            </Link>
            <span className="text-faint"> · </span>
            <span>#{Number.isFinite(nodeId) ? nodeId : '—'}</span>
          </>
        }
        badges={
          lock || busyTransaction || busyLocalAny ? (
            <>
              {lock ? <LockBadge kind="maintenance" t={t} maintenanceReason={lockReason} /> : null}
              {busyTransaction ? <LockBadge kind="transaction" t={t} chainIds={activeChainIds} showDetails testId="admin.node.transactions.lock.badge" /> : null}
              {busyLocalAny ? <LockBadge kind="local" t={t} /> : null}
            </>
          ) : null
        }
        meta={loc ? t('admin.node.meta.location', { location: loc }) : ' '}
        actions={
          <>
            {node ? <NodeLifecycleHeaderActions node={node} busyTransaction={busyTransaction} onUpdated={() => { setNotice(t('admin.node.editor.notice.updated')); refreshAfterNodeMutation(nodeId); }} /> : null}
            {typeof nodeId === 'number' && Number.isFinite(nodeId) && nodeId > 0 ? (
              <LinkButton to={`${basePath}/vps?node=${nodeId}`} variant="secondary" title={t('admin.node.action.show_vps.title')}>
                {t('nav.vps')}
              </LinkButton>
            ) : null}
            <Button
              testId="admin.node.refresh"
              variant="secondary"
              disabled={!Number.isFinite(nodeId) || nodeId <= 0}
              onClick={() => {
                void nodeQ.refetch();
                void chainsQ.refetch();
                void publicStatusQ.refetch();
                if (activeSection === 'overview') {
                  void statusesQ.refetch();
                  void metricsQ.refetch();
                  void txQ.refetch();
                } else if (activeSection === 'storage') {
                  void poolsQ.refetch();
                } else {
                  void nodesQ.refetch();
                }
              }}
            >
              {t('common.refresh')}
            </Button>
          </>
        }
      />
      <AdminObjectMutationRecovery object={nodeRef} refetchObject={nodeQ.refetch} refetchChains={chainsQ.refetch} online={online} testIdPrefix="admin.node.mutation.recovery" />

      {chainsStale ? (
        <LockStateStaleAlert
          chainIds={activeChainIds}
          error={chainsQ.error}
          onRetry={() => {
            void chainsQ.refetch();
          }}
        />
      ) : null}

      {mode !== 'admin' ? (
        <Alert title={t('admin.node.workspace_warning.title')} variant="warn">
          {t('admin.node.workspace_warning.body')}
        </Alert>
      ) : null}

      {notice ? (
        <Alert title={t('common.info')} variant="neutral">
          {notice}
        </Alert>
      ) : null}

      {Number.isFinite(nodeId) && nodeId > 0 ? <NodeDetailTabs active={activeSection} onChange={setActiveSection} t={t} /> : null}

      {!Number.isFinite(nodeId) || nodeId <= 0 ? (
        <ErrorState
          testId="admin.node.invalid_id"
          kindOverride="not_found"
          title={t('admin.node.invalid_id.title')}
          body={t('admin.node.invalid_id.body')}
          backTo={`${basePath}/nodes`}
          showStatusLink={false}
          showDetails={false}
          detailsExtra={{ page: 'admin.node.detail', nodeId: null, scope: mode }}
        />
      ) : nodeQ.isLoading ? (
        <LoadingState testId="admin.node.loading" />
      ) : nodeQ.isError ? (
        <ErrorState
          testId="admin.node.error"
          title={t('admin.node.load_error.title')}
          error={nodeQ.error}
          onRetry={() => void nodeQ.refetch()}
          backTo={`${basePath}/nodes`}
          detailsExtra={{ page: 'admin.node.detail', nodeId, scope: mode }}
        />
      ) : !node ? (
        <ErrorState
          testId="admin.node.not_found"
          kindOverride="not_found"
          title={t('admin.node.not_found.title')}
          body={t('admin.node.not_found.body')}
          backTo={`${basePath}/nodes`}
          showStatusLink={false}
          showDetails={false}
          detailsExtra={{ page: 'admin.node.detail', nodeId, scope: mode }}
        />
      ) : (
        <>
          {activeSection === 'overview' ? (
            <NodeOverviewSection
              overview={{ node, loc, statusRow: statusRow ?? undefined, t }}
              metrics={{
                t, metricsWindow, setMetricsWindow, metricsRows, metricsLast, node,
                metricsLoading: metricsQ.isLoading, metricsError: metricsQ.error,
                load1Points, cpuIdlePoints, memUsedPercentPoints,
              }}
              statuses={{
                t, nodeId, statusRows, loading: statusesQ.isLoading, error: statusesQ.error,
                fetching: statusesQ.isFetching, onRefresh: () => void statusesQ.refetch(),
                page: statusPg.page, pageCount: statusPg.stack.length, canPrev: statusPg.canPrev,
                canNext: statusCanNext, onPrev: statusPg.goPrev,
                onNext: () => statusPg.goNext(statusCursor), onGoToPage: statusPg.goToPage,
                limit: statusPg.limit, allowedLimits: statusPg.allowedLimits, onLimitChange: statusPg.setLimit,
              }}
              transactions={{
                t, basePath, nodeId, txRows, loading: txQ.isLoading, error: txQ.error,
                fetching: txQ.isFetching, onRefresh: () => void txQ.refetch(),
                page: txPg.page, pageCount: txPg.stack.length, canPrev: txPg.canPrev,
                canNext: txCanNext, onPrev: txPg.goPrev,
                onNext: () => txPg.goNext(txCursor), onGoToPage: txPg.goToPage,
                limit: txPg.limit, allowedLimits: txPg.allowedLimits, onLimitChange: txPg.setLimit,
              }}
            />
          ) : null}

          {activeSection === 'storage' ? (
            <div
              id="admin-node-panel-storage"
              role="tabpanel"
              aria-labelledby="admin-node-tab-storage"
              data-testid="admin.node.panel.storage"
            >
              <NodeStorageCard
                t={t}
                node={node}
                pools={poolsQ.data ?? []}
                loading={poolsQ.isLoading}
                fetching={poolsQ.isFetching}
                error={poolsQ.error}
                onRefresh={() => void poolsQ.refetch()}
              />
            </div>
          ) : null}

          {activeSection === 'maintenance' ? (
            <NodeMaintenanceSection
              maintenance={{
                t, lock, lockReason, maintReason, onMaintReasonChange: setMaintReason,
                maintenanceError: maintenanceM.error, maintenanceLockGate, maintenanceUnlockGate,
                onRequestLock: () => setConfirm({ kind: 'lock' }), onRequestUnlock: () => setConfirm({ kind: 'unlock' }),
              }}
              evacuation={{
                t, basePath, nodesLoading: nodesQ.isLoading, nodesError: nodesQ.isError,
                destOptions, evDst, onEvDstChange: setEvDst, evConcurrency,
                onEvConcurrencyChange: setEvConcurrency, evReason, onEvReasonChange: setEvReason,
                evStopOnError, onEvStopOnErrorChange: setEvStopOnError,
                evMaintenanceWindow, onEvMaintenanceWindowChange: setEvMaintenanceWindow,
                evCleanupData, onEvCleanupDataChange: setEvCleanupData,
                evSendMail, onEvSendMailChange: setEvSendMail, evResult,
                evacuateError: evacuateM.error, canEvacuate, evacuateGate,
                onRequestEvacuate: () => setConfirm({ kind: 'evacuate' }),
              }}
            />
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={confirm?.kind === 'lock'}
        title={t('admin.node.maintenance.confirm_lock.title')}
        description={t('admin.node.maintenance.confirm_lock.description')}
        danger
        confirmLabel={t('common.lock')}
        confirmDisabled={!maintenanceLockGate.allowed}
        confirmLoading={maintenanceM.isPending}
        onConfirm={() => {
          const target = snapshotNodeTarget();
          if (target) maintenanceM.mutate(Object.freeze({ ...target, lock: true, reason: maintReason.trim() || undefined }));
        }}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm?.kind === 'unlock'}
        title={t('admin.node.maintenance.confirm_unlock.title')}
        description={t('admin.node.maintenance.confirm_unlock.description')}
        confirmLabel={t('common.unlock')}
        confirmDisabled={!maintenanceUnlockGate.allowed}
        confirmLoading={maintenanceM.isPending}
        onConfirm={() => {
          const target = snapshotNodeTarget();
          if (target) maintenanceM.mutate(Object.freeze({ ...target, lock: false }));
        }}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm?.kind === 'evacuate'}
        title={t('admin.node.evacuation.confirm.title')}
        description={t('admin.node.evacuation.confirm.description')}
        danger
        confirmLabel={t('common.start')}
        confirmDisabled={!canEvacuate || !evacuateGate.allowed}
        confirmLoading={evacuateM.isPending}
        onConfirm={() => {
          const target = snapshotNodeTarget();
          if (!target) return;
          const concurrency = Number(evConcurrency);
          evacuateM.mutate(Object.freeze({ ...target, payload: Object.freeze({
            dst_node: Number(evDst),
            concurrency: Number.isFinite(concurrency) ? concurrency : undefined,
            stop_on_error: evStopOnError, maintenance_window: evMaintenanceWindow,
            cleanup_data: evCleanupData, send_mail: evSendMail,
            reason: evReason.trim() || undefined,
          }) }));
        }}
        onCancel={() => setConfirm(null)}
      >
        <div className="text-sm text-muted">
          {t('admin.node.evacuation.confirm.destination')} <span className="font-medium">{evDst ? `#${evDst}` : '—'}</span>
        </div>
      </ConfirmDialog>
    </DetailShell>
  );
}
