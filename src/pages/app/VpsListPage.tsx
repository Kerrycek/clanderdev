import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';

import { fetchActiveTransactionChains, fetchTransactionChains, type TransactionChain } from '../../lib/api/transactions';
import { fetchVpsList, vpsDelete, vpsRestart, vpsStart, vpsStop } from '../../lib/api/vps';
import { getMetaActionStateId } from '../../lib/api/haveapi';
import { useAppMode } from '../../app/appMode';
import { useObjectScope } from '../../app/objectScope';
import { useI18n } from '../../app/i18n';
import { useToasts } from '../../app/toasts';
import { useChrome } from '../../components/layout/ChromeContext';
import { ListShell } from '../../components/layout/ListShell';
import { SyncStaleBanner } from '../../components/layout/SyncStaleBanner';
import { PageHeader } from '../../components/layout/PageHeader';
import { objectRef, type ObjectRef } from '../../lib/objectRef';
import type { LocalMutationGeneration } from '../../lib/localLocks';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { LoadingState } from '../../components/ui/LoadingState';
import { Button } from '../../components/ui/Button';
import { buildTransactionLockIndex, cursorFromDescendingPage } from '../../lib/lockIndex';
import { hasActiveChains } from '../../lib/taskStatus';
import { useKeysetPagination } from '../../lib/hooks/useKeysetPagination';
import { useTierAIntervalMs } from '../../lib/refreshTiers';
import { useNetworkStatus } from '../../lib/useNetworkStatus';
import { isDataStale } from '../../lib/lockState';
import { VpsListFilters } from './vps/VpsListFilters';
import { VpsListMobile } from './vps/VpsListMobile';
import { VpsListTable } from './vps/VpsListTable';
import { VpsListActionConfirmDialog, type VpsListActionConfirm } from './vps/VpsListActionConfirmDialog';
import { buildVpsListRecord, extractVpsIpCandidates, recordMatchesStateFilter, type VpsListRecord } from './vps/vpsListSemantics';
import { useVpsListSmartFilters } from './vps/useVpsListSmartFilters';

type VpsPowerKind = 'start' | 'stop' | 'restart';
type VpsListMutationKind = VpsPowerKind | 'delete';
type DurableVpsLockContext = { lockRef: ObjectRef; mutationGeneration: LocalMutationGeneration };
type VpsDeleteMutationVariables = {
  vpsId: number;
  objectLabel?: string;
  apiOptions?: { lazy?: boolean };
};

interface BusyError extends Error {
  code: 'BUSY';
}

function createBusyError(): BusyError {
  const err = new Error('busy') as BusyError;
  err.code = 'BUSY';
  return err;
}

function isBusyError(error: unknown): error is BusyError {
  return error instanceof Error && (error as { code?: unknown }).code === 'BUSY';
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function searchLooksLikeIp(needle: string): boolean {
  const normalized = needle.trim();
  if (!normalized || (!normalized.includes('.') && !normalized.includes(':'))) return false;
  return /^[0-9a-f:.]+$/i.test(normalized);
}

function recordMatchesIpNeedle(row: VpsListRecord, needle: string): boolean {
  const normalized = needle.trim().toLowerCase();
  if (!searchLooksLikeIp(normalized)) return true;
  return extractVpsIpCandidates(row.vps).some((ip) => ip.toLowerCase().includes(normalized));
}

function mergeTransactionChains(groups: TransactionChain[][]): TransactionChain[] {
  const byId = new Map<number, TransactionChain>();

  for (const group of groups) {
    for (const chain of group) {
      if (!Number.isFinite(chain.id) || chain.id <= 0) continue;
      byId.set(chain.id, chain);
    }
  }

  return [...byId.values()].sort((a, b) => b.id - a.id);
}

export function VpsListPage() {
  const { basePath, mode } = useAppMode();
  const uiMode = mode === 'admin' ? 'admin' : 'app';
  const scope = useObjectScope();
  const { t } = useI18n();
  const chrome = useChrome();
  const qc = useQueryClient();
  const online = useNetworkStatus();
  const toasts = useToasts();
  const tierARefetchMs = useTierAIntervalMs();

  const listFilters = useVpsListSmartFilters({ basePath, mode: uiMode, scope, t, toasts });
  const searchNeedle = listFilters.search.trim();
  const serverHostnameNeedle = searchLooksLikeIp(searchNeedle) ? undefined : searchNeedle || undefined;

  const pagination = useKeysetPagination({
    id: 'vps.list',
    filterKey: listFilters.filterKey,
    searchParams: listFilters.searchParams,
    setSearchParams: listFilters.setSearchParams,
    defaultLimit: 50,
    allowedLimits: [25, 50, 100],
  });

  const q = useQuery({
    queryKey: [
      'vps',
      'list',
      {
        limit: pagination.limit,
        fromId: pagination.fromId,
        hostnameAny: serverHostnameNeedle,
        node: listFilters.nodeIdNum,
        user: mode === 'admin' ? listFilters.userIdNum : scope.mineUserId,
        userNamespaceMap: listFilters.userNamespaceMapIdNum,
        location: listFilters.locationIdNum,
      },
    ],
    queryFn: async () =>
      (
        await fetchVpsList({
          limit: pagination.limit,
          fromId: pagination.fromId,
          hostnameAny: serverHostnameNeedle,
          node: listFilters.nodeIdNum,
          user: mode === 'admin' ? listFilters.userIdNum : scope.mineUserId,
          userNamespaceMap: listFilters.userNamespaceMapIdNum,
          location: listFilters.locationIdNum,
          includes: 'node__location,user',
        })
      ).data,
  });

  const [actionError, setActionError] = useState<null | { title: string; body?: string }>(null);
  const [confirm, setConfirm] = useState<VpsListActionConfirm | null>(null);
  const [inFlight, setInFlight] = useState<Record<number, VpsListMutationKind>>({});

  const activeChainsQ = useQuery({
    queryKey: ['transaction_chain', 'active', { limit: 200 }],
    queryFn: async () => fetchActiveTransactionChains({ limit: 200 }),
    refetchInterval: tierARefetchMs,
  });

  const failedChainsQ = useQuery({
    queryKey: ['transaction_chain', 'recent-failed', { limit: 200 }],
    queryFn: async () => {
      const [failed, fatal] = await Promise.all([
        fetchTransactionChains({ state: 'failed', limit: 200 }),
        fetchTransactionChains({ state: 'fatal', limit: 200 }),
      ]);
      return mergeTransactionChains([failed.data, fatal.data]);
    },
    refetchInterval: tierARefetchMs,
  });

  const lockIndexStale = isDataStale({
    updatedAt: activeChainsQ.dataUpdatedAt,
    unreliable: !online || activeChainsQ.isError,
  });

  const lockIndex = useMemo(() => {
    if (lockIndexStale) return buildTransactionLockIndex(undefined, { onlyActive: true });
    return buildTransactionLockIndex(activeChainsQ.data, { onlyActive: true });
  }, [activeChainsQ.data, lockIndexStale]);

  const failureIndex = useMemo(
    () => buildTransactionLockIndex(failedChainsQ.data, { onlyActive: false }),
    [failedChainsQ.data]
  );

  async function assertVpsNotBusy(vpsId: number) {
    const chainsRes = await fetchTransactionChains({ className: 'Vps', rowId: vpsId, limit: 10 });
    if (hasActiveChains(chainsRes.data)) throw createBusyError();
  }

  function handleMutationSuccess(
    res: { meta?: Record<string, unknown> },
    vars: { vpsId: number; kind: VpsListMutationKind; objectLabel?: string },
    context?: DurableVpsLockContext
  ) {
    const asId = getMetaActionStateId(res.meta);
    if (asId !== undefined) {
      const actionLabelKey =
        vars.kind === 'start'
          ? 'action.vps.start.label'
          : vars.kind === 'stop'
            ? 'action.vps.stop.label'
            : vars.kind === 'restart'
              ? 'action.vps.restart.label'
              : 'action.vps.delete.label';
      const objectLabel = vars.objectLabel ? String(vars.objectLabel) : t('common.vps_ref', { id: vars.vpsId });
      chrome.trackActionState(asId, {
        actionLabelKey,
        objectLabel,
        object: context?.lockRef,
        mutationGeneration: context?.mutationGeneration,
      });
    }

    void qc.invalidateQueries({ queryKey: ['vps', 'list'] });
    void qc.invalidateQueries({ queryKey: ['transaction_chain', 'active'] });
    void qc.invalidateQueries({ queryKey: ['transaction_chain', 'recent-failed'] });
  }

  function handleMutationError(error: unknown) {
    if (isBusyError(error)) {
      chrome.openTasks();
      setActionError({ title: t('toast.action_blocked.title'), body: t('toast.action_blocked.body') });
      return;
    }

    setActionError({ title: t('common.action_failed'), body: describeError(error) });
  }

  function settleMutationLock(
    vars: { vpsId: number } | undefined,
    error: unknown,
    context?: DurableVpsLockContext
  ) {
    if (!vars) return;
    if (context) chrome.settleLocalLock(context.lockRef, error, context.mutationGeneration);
    setInFlight((prev) => {
      const next = { ...prev };
      delete next[vars.vpsId];
      return next;
    });
  }

  // audit:ignore missing-local-lock-release
  const powerM = useMutation({
    mutationFn: async (vars: { vpsId: number; kind: VpsPowerKind; force?: boolean; objectLabel?: string }) => {
      await assertVpsNotBusy(vars.vpsId);

      if (vars.kind === 'start') return vpsStart(vars.vpsId);
      if (vars.kind === 'stop') return vpsStop(vars.vpsId, { force: Boolean(vars.force) });
      return vpsRestart(vars.vpsId, { force: Boolean(vars.force) });
    },
    onMutate: ({ vpsId, kind }) => {
      setActionError(null);
      setInFlight((prev) => ({ ...prev, [vpsId]: kind }));
      const lockRef = objectRef('Vps', vpsId);
      return chrome.acquireLocalLock(lockRef, { durable: true })
        .then((mutationGeneration) => ({ lockRef, mutationGeneration }));
    },
    onSuccess: (res, vars, context) => handleMutationSuccess(res, vars, context),
    onError: handleMutationError,
    onSettled: (_res, error, vars, context) => settleMutationLock(vars, error, context),
  });

  // audit:ignore missing-local-lock-release
  const deleteM = useMutation({
    mutationFn: async (vars: VpsDeleteMutationVariables) => {
      await assertVpsNotBusy(vars.vpsId);
      return vpsDelete(vars.vpsId, vars.apiOptions);
    },
    onMutate: ({ vpsId }) => {
      setActionError(null);
      setInFlight((prev) => ({ ...prev, [vpsId]: 'delete' }));
      const lockRef = objectRef('Vps', vpsId);
      return chrome.acquireLocalLock(lockRef, { durable: true })
        .then((mutationGeneration) => ({ lockRef, mutationGeneration }));
    },
    onSuccess: (res, vars, context) => handleMutationSuccess(res, { ...vars, kind: 'delete' }, context),
    onError: handleMutationError,
    onSettled: (_res, error, vars, context) => settleMutationLock(vars, error, context),
  });

  const rows = useMemo(() => q.data ?? [], [q.data]);
  const pageCursor = useMemo(() => cursorFromDescendingPage(q.data), [q.data]);
  const hasMore = rows.length >= pagination.limit;
  const canPaginate = pagination.canPrev || pagination.hasForward || hasMore;

  const displayRows = useMemo(
    () =>
      rows.map((vps) =>
        buildVpsListRecord({
          vps,
          lockIndex,
          failureIndex,
          isLocallyLocked: (id) => chrome.isLocallyLocked(objectRef('Vps', id)),
          inFlightKind: inFlight[vps.id],
          t,
        })
      ),
    [rows, lockIndex, failureIndex, chrome, inFlight, t]
  );

  const visibleRows = useMemo(
    () => displayRows.filter((row) => recordMatchesStateFilter(row, listFilters.stateFilter) && recordMatchesIpNeedle(row, searchNeedle)),
    [displayRows, listFilters.stateFilter, searchNeedle]
  );

  const emptyNone = rows.length === 0 && !listFilters.filtersActive;
  const emptyTitle = emptyNone
    ? scope.scope === 'mine'
      ? t('empty.vps.none.title')
      : t('empty.list.none.title')
    : t('empty.list.no_matches.title');
  const emptyBody = emptyNone
    ? scope.scope === 'mine'
      ? t('empty.vps.none.body_basic')
      : t('empty.list.none.body')
    : t('empty.list.no_matches.body');
  const showOwnerContext = scope.scope !== 'mine';

  const onStart = (row: (typeof displayRows)[number]) =>
    powerM.mutate({
      vpsId: row.vps.id,
      kind: 'start',
      objectLabel: String(row.vps.hostname ?? t('common.vps_ref', { id: row.vps.id })),
    });

  return (
    <ListShell
      variant="wide"
      testId="vps.list"
      banner={<SyncStaleBanner />}
      header={
        <PageHeader
          testId="vps.list.header"
          title={t('nav.vps')}
          description={t('vps.list.description')}
          actions={
            <Button to={`${basePath}/vps/new`} testId="vps.list.create">
              <Plus className="h-4 w-4" />
              {t('vps.create.open')}
            </Button>
          }
        />
      }
      filters={<VpsListFilters {...listFilters.filterProps} />}
    >
      {actionError ? (
        <Alert
          variant="warn"
          title={
            <div className="flex items-center justify-between gap-2">
              <span>{actionError.title}</span>
              <button type="button" className="text-xs underline" onClick={() => setActionError(null)}>
                {t('common.close')}
              </button>
            </div>
          }
        >
          {actionError.body}
        </Alert>
      ) : null}

      {q.isLoading ? (
        <LoadingState testId="vps.list.loading" />
      ) : q.isError ? (
        <ErrorState
          testId="vps.list.error"
          title={t('vps.list.load_error.title')}
          error={q.error}
          onRetry={() => void q.refetch()}
          showBack={false}
          detailsExtra={{ page: 'vps.list', scope: scope.scope }}
        />
      ) : visibleRows.length === 0 ? (
        <EmptyState
          testId="vps.list.empty"
          title={emptyTitle}
          body={emptyBody}
          actionLabel={listFilters.filtersActive ? t('common.clear_filters') : undefined}
          onAction={listFilters.filtersActive ? listFilters.clearFilters : undefined}
        />
      ) : (
        <>
          <VpsListMobile
            rows={visibleRows}
            basePath={basePath}
            t={t}
            pagination={pagination}
            canPaginate={canPaginate}
            hasMore={hasMore}
            pageCursor={pageCursor}
            showOwnerContext={showOwnerContext}
            onStart={onStart}
            onRequestStop={(row) => setConfirm({ vpsId: row.vps.id, kind: 'stop', force: false })}
            onRequestRestart={(row) => setConfirm({ vpsId: row.vps.id, kind: 'restart', force: false })}
            onRequestDelete={(row) => setConfirm({ vpsId: row.vps.id, kind: 'delete', force: false, lazy: true })}
          />

          <VpsListTable
            rows={visibleRows}
            basePath={basePath}
            t={t}
            pagination={pagination}
            canPaginate={canPaginate}
            hasMore={hasMore}
            pageCursor={pageCursor}
            showOwnerContext={showOwnerContext}
            onStart={onStart}
            onRequestStop={(row) => setConfirm({ vpsId: row.vps.id, kind: 'stop', force: false })}
            onRequestRestart={(row) => setConfirm({ vpsId: row.vps.id, kind: 'restart', force: false })}
            onRequestDelete={(row) => setConfirm({ vpsId: row.vps.id, kind: 'delete', force: false, lazy: true })}
          />
        </>
      )}

      {confirm ? (
        <VpsListActionConfirmDialog
          confirm={confirm}
          vps={rows.find((v) => Number(v.id) === Number(confirm.vpsId))}
          isAdminMode={mode === 'admin'}
          deleteLoading={deleteM.isPending}
          onChange={setConfirm}
          onCancel={() => setConfirm(null)}
          onConfirmPower={(vars) => {
            setConfirm(null);
            powerM.mutate(vars);
          }}
          onConfirmDelete={(vars) => {
            setConfirm(null);
            deleteM.mutate({
              vpsId: vars.vpsId,
              objectLabel: vars.objectLabel,
              apiOptions: mode === 'admin' ? { lazy: vars.lazy } : undefined,
            });
          }}
        />
      ) : null}
    </ListShell>
  );
}
