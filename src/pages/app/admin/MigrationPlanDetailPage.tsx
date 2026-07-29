import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';

import { createMigrationPlanVpsMigration, cancelMigrationPlan, deleteMigrationPlan, fetchMigrationPlan, fetchMigrationPlanVpsMigrations, startMigrationPlan, type MigrationPlan, type VpsMigration } from '../../../lib/api/migrations';
import { fetchActiveTransactionChains } from '../../../lib/api/transactions';
import { fetchNodes } from '../../../lib/api/nodes';
import { getMetaActionStateId } from '../../../lib/api/haveapi';
import { useAppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';
import { useChrome } from '../../../components/layout/ChromeContext';
import { DetailShell } from '../../../components/layout/DetailShell';
import { formatDateTime } from '../../../lib/format';
import { formatErrorMessage } from '../../../lib/errors';
import { useNetworkStatus } from '../../../lib/useNetworkStatus';
import { objectRef } from '../../../lib/objectRef';
import { useKeysetPagination } from '../../../lib/hooks/useKeysetPagination';
import { cursorFromDescendingPage } from '../../../lib/lockIndex';
import { useTierBIntervalMs } from '../../../lib/refreshTiers';

import { preflightMigrationPlanNotBusy } from './adminPreflight';

import { gateMigrationPlanAction } from '../../../lib/gates/migrationPlan';
import { deriveChainLockState } from '../../../lib/lockState';

import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { LockBadge } from '../../../components/ui/LockBadge';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Checkbox } from '../../../components/ui/Checkbox';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Input } from '../../../components/ui/Input';
import { KeysetPagination } from '../../../components/ui/KeysetPagination';
import { LockStateStaleAlert } from '../../../components/ui/LockStateStaleAlert';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ObjectHeader } from '../../../components/ui/ObjectHeader';
import { Select } from '../../../components/ui/Select';
import { Spinner } from '../../../components/ui/Spinner';
import { ChipLink, MiniLink } from '../../../components/ui/ChipLink';


function planBadge(
  t: (key: any) => string,
  state: unknown
): { variant: React.ComponentProps<typeof Badge>['variant']; label: string } {
  const st = String(state ?? 'unknown');
  if (st === 'done') return { variant: 'ok', label: t('migration_plan.state.done') };
  if (st === 'running') return { variant: 'black', label: t('migration_plan.state.running') };
  if (st === 'staged') return { variant: 'neutral', label: t('migration_plan.state.staged') };
  if (st === 'cancelled') return { variant: 'neutral', label: t('migration_plan.state.cancelled') };
  if (st === 'cancelling') return { variant: 'warn', label: t('migration_plan.state.cancelling') };
  if (st === 'failing') return { variant: 'warn', label: t('migration_plan.state.failing') };
  if (st === 'error') return { variant: 'danger', label: t('migration_plan.state.error') };
  return { variant: 'neutral', label: t('migration_plan.state.unknown') };
}

function refLabel(ref: any): string {
  if (!ref) return '—';
  if (typeof ref === 'string') return ref;
  if (typeof ref === 'number') return String(ref);
  if (typeof ref === 'object') {
    if (typeof ref.label === 'string' && ref.label) return ref.label;
    if (typeof ref.name === 'string' && ref.name) return ref.name;
    if (typeof ref.domain_name === 'string' && ref.domain_name) return ref.domain_name;
    if (typeof ref.login === 'string' && ref.login) return ref.login;
    if (typeof ref.id === 'number') return `#${ref.id}`;
  }
  return String(ref);
}

function refId(ref: any): number | undefined {
  const raw = ref?.id;
  const id = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(id) && id > 0 ? id : undefined;
}

function locationLabel(loc: any): string | undefined {
  if (!loc) return undefined;
  if (typeof loc === 'string') return loc;
  if (typeof loc === 'number') return String(loc);
  if (typeof loc === 'object') {
    if (typeof loc.label === 'string' && loc.label) return loc.label;
    if (typeof loc.name === 'string' && loc.name) return loc.name;
    if (typeof loc.id === 'number') return `#${loc.id}`;
  }
  return undefined;
}

function nodeOptionLabel(node: any): { id: number; label: string; location?: string } | null {
  const id = typeof node?.id === 'number' ? node.id : Number(node?.id);
  if (!Number.isFinite(id) || id <= 0) return null;

  const label = String(node?.domain_name ?? node?.name ?? node?.fqdn ?? `#${id}`);
  const location = locationLabel(node?.location);
  return { id, label, location };
}

function vpsId(m: VpsMigration): number | undefined {
  const raw = (m.vps as any)?.id;
  const id = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(id) && id > 0 ? id : undefined;
}

function chainId(m: VpsMigration): number | undefined {
  const raw = (m.transaction_chain as any)?.id;
  const id = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(id) && id > 0 ? id : undefined;
}

export function MigrationPlanDetailPage() {
  const { basePath } = useAppMode();
  const { t } = useI18n();
  const chrome = useChrome();
  const online = useNetworkStatus();
  const navigate = useNavigate();
  const params = useParams();
  const planId = Number(params['planId']);

  const tierBRefetchMs = useTierBIntervalMs();

  const planRef = useMemo(() => {
    const id = Number(planId);
    if (!Number.isFinite(id) || id <= 0) return null;
    return objectRef('MigrationPlan', id);
  }, [planId]);
  const busyLocalLock = planRef ? chrome.isLocallyLocked(planRef) : false;

  const [searchParams, setSearchParams] = useSearchParams();

  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: 'start' } | { kind: 'cancel' } | { kind: 'delete' }>(null);

  const planQ = useQuery({
    queryKey: ['migration_plans', 'show', { id: planId }],
    queryFn: async () => (await fetchMigrationPlan(planId)).data,
    enabled: Number.isFinite(planId) && planId > 0,
    refetchInterval: tierBRefetchMs,
  });

  const chainsQ = useQuery({
    queryKey: ['transaction_chain', 'list', { className: 'MigrationPlan', rowId: planId, state: 'active', limit: 10 }],
    queryFn: async () => fetchActiveTransactionChains({ className: 'MigrationPlan', rowId: planId, limit: 10 }),
    enabled: Number.isFinite(planId) && planId > 0,
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

  const pagination = useKeysetPagination({
    id: 'admin.migration_plan.migrations',
    filterKey: JSON.stringify({ planId, scope: basePath }),
    searchParams,
    setSearchParams,
    defaultLimit: 50,
    allowedLimits: [25, 50, 100, 200],
  });

  const migQ = useQuery({
    queryKey: ['migration_plans', 'vps_migrations', { planId, limit: pagination.limit, fromId: pagination.fromId }],
    queryFn: async () =>
      (await fetchMigrationPlanVpsMigrations(planId, { limit: pagination.limit, fromId: pagination.fromId })).data,
    enabled: Number.isFinite(planId) && planId > 0,
    refetchInterval: tierBRefetchMs,
  });

  const pageMigrations = migQ.data ?? [];
  const pageCursor = useMemo(() => cursorFromDescendingPage(pageMigrations as any), [pageMigrations]);
  const hasMore = pageMigrations.length >= pagination.limit;
  const canNext = pagination.hasForward || (hasMore && pageCursor !== null);
  const showPagination = migQ.isSuccess && (pagination.page > 1 || pageMigrations.length > 0 || canNext);

  const nodesQ = useQuery({
    queryKey: ['nodes', 'index', { limit: 500 }],
    queryFn: async () => (await fetchNodes({ limit: 500 })).data,
    staleTime: 60000,
  });

  const destOptions = useMemo(() => {
    const list = nodesQ.data ?? [];
    return list
      .map((n) => nodeOptionLabel(n))
      .filter(Boolean) as { id: number; label: string; location?: string }[];
  }, [nodesQ.data]);

  const [schedVpsId, setSchedVpsId] = useState('');
  const [schedDstNode, setSchedDstNode] = useState('');
  const [schedMaintenanceWindow, setSchedMaintenanceWindow] = useState(true);
  const [schedCleanupData, setSchedCleanupData] = useState(true);

  const [batchVpsText, setBatchVpsText] = useState('');
  const [batchStopOnError, setBatchStopOnError] = useState(false);
  const [batchLastResult, setBatchLastResult] = useState<
    null | { ok: number[]; failed: { id: number; error: string }[] }
  >(null);

  const scheduleM = useMutation({
    mutationFn: async (vars: {
      vps: number;
      dstNode: number;
      maintenanceWindow: boolean;
      cleanupData: boolean;
    }) => {
      await preflightMigrationPlanNotBusy({ planId, t, knownBusy: busyLocalLock || busyTransaction });
      return createMigrationPlanVpsMigration(planId, {
        vps: vars.vps,
        dst_node: vars.dstNode,
        maintenance_window: vars.maintenanceWindow,
        cleanup_data: vars.cleanupData,
      });
    },
    onMutate: async () => {
      if (planRef) chrome.acquireLocalLock(planRef);
    },
    onSuccess: (res, vars) => {
      const asId = getMetaActionStateId(res.meta);
      if (asId !== undefined) {
        chrome.trackActionState(asId, {
          object: objectRef('Vps', vars.vps),
          actionLabelKey: 'action.migration_plan.schedule.label',
          objectLabel: t('common.vps_ref', { id: vars.vps }),
        });
      }

      setNotice(t('admin.migration_plan.notice.vps_migration_scheduled'));
      setSchedVpsId('');

      // Newly scheduled migrations appear first → return to page 1.
      const next = new URLSearchParams(searchParams);
      next.delete('from_id');
      next.set('page', '1');
      setSearchParams(next, { replace: true });

      void migQ.refetch();
    },
    onError: (err: any) => {
      if (err?.code === 'BUSY') {
        chrome.openTasks();
      }
    },
    onSettled: () => {
      if (planRef) chrome.releaseLocalLock(planRef);
    },
  });

  const batchScheduleM = useMutation({
    mutationFn: async () => {
      await preflightMigrationPlanNotBusy({ planId, t, knownBusy: busyLocalLock || busyTransaction });

      const dst = Number(schedDstNode);

      const ids = batchVpsText
        .split(/[^0-9]+/g)
        .map((s) => Number(s))
        .filter((n) => Number.isFinite(n) && n > 0);

      const unique: number[] = [];
      const seen = new Set<number>();
      for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        unique.push(id);
      }

      const ok: number[] = [];
      const failed: { id: number; error: string }[] = [];

      for (const vps of unique) {
        try {
          const res = await createMigrationPlanVpsMigration(planId, {
            vps,
            dst_node: dst,
            maintenance_window: schedMaintenanceWindow,
            cleanup_data: schedCleanupData,
          });
          const asId = getMetaActionStateId(res.meta);
          if (asId !== undefined) {
            chrome.trackActionState(asId, {
              object: objectRef('Vps', vps),
              actionLabelKey: 'action.migration_plan.schedule.label',
              objectLabel: t('common.vps_ref', { id: vps }),
            });
          }
          ok.push(vps);
        } catch (e: any) {
          if (e?.code === 'BUSY') {
            chrome.openTasks();
          }
          const msg = formatErrorMessage(e);
          failed.push({ id: vps, error: msg });
          if (batchStopOnError || e?.code === 'BUSY') break;
        }
      }

      return { ok, failed };
    },
    onMutate: async () => {
      if (planRef) chrome.acquireLocalLock(planRef);
    },
    onSuccess: (r) => {
      setBatchLastResult(r);
      const total = r.ok.length + r.failed.length;
      setNotice(t('admin.migration_plan.notice.batch_finished', { ok: r.ok.length, total }));

      // Newly scheduled migrations appear first → return to page 1.
      const next = new URLSearchParams(searchParams);
      next.delete('from_id');
      next.set('page', '1');
      setSearchParams(next, { replace: true });

      void migQ.refetch();
    },
    onError: (err: any) => {
      if (err?.code === 'BUSY') {
        chrome.openTasks();
      }
    },
    onSettled: () => {
      if (planRef) chrome.releaseLocalLock(planRef);
    },
  });
  const startM = useMutation({
    mutationFn: async () => {
      await preflightMigrationPlanNotBusy({ planId, t, knownBusy: busyLocalLock || busyTransaction });
      return startMigrationPlan(planId);
    },
    onMutate: async () => {
      if (planRef) chrome.acquireLocalLock(planRef);
    },
    onSuccess: (res) => {
      const asId = getMetaActionStateId(res.meta);
      if (asId !== undefined) {
        chrome.trackActionState(asId, {
          object: planRef ?? undefined,
          actionLabelKey: 'action.migration_plan.start.label',
          objectLabel: `#${planId}`,
        });
      }
      setNotice(t('admin.migration_plan.notice.started'));
      setConfirm(null);
      void planQ.refetch();
      void chainsQ.refetch();
      void migQ.refetch();
    },
    onError: (err: any) => {
      if (err?.code === 'BUSY') {
        chrome.openTasks();
      }
    },
    onSettled: () => {
      if (planRef) chrome.releaseLocalLock(planRef);
    },
  });

  const cancelM = useMutation({
    mutationFn: async () => {
      await preflightMigrationPlanNotBusy({ planId, t, knownBusy: busyLocalLock || busyTransaction });
      return cancelMigrationPlan(planId);
    },
    onMutate: async () => {
      if (planRef) chrome.acquireLocalLock(planRef);
    },
    onSuccess: (res) => {
      const asId = getMetaActionStateId(res.meta);
      if (asId !== undefined) {
        chrome.trackActionState(asId, {
          object: planRef ?? undefined,
          actionLabelKey: 'action.migration_plan.cancel.label',
          objectLabel: `#${planId}`,
        });
      }
      setNotice(t('admin.migration_plan.notice.cancelled'));
      setConfirm(null);
      void planQ.refetch();
      void chainsQ.refetch();
      void migQ.refetch();
    },
    onError: (err: any) => {
      if (err?.code === 'BUSY') {
        chrome.openTasks();
      }
    },
    onSettled: () => {
      if (planRef) chrome.releaseLocalLock(planRef);
    },
  });

  const deleteM = useMutation({
    mutationFn: async () => {
      await preflightMigrationPlanNotBusy({ planId, t, knownBusy: busyLocalLock || busyTransaction });
      return deleteMigrationPlan(planId);
    },
    onMutate: async () => {
      if (planRef) chrome.acquireLocalLock(planRef);
    },
    onSuccess: () => {
      setNotice(t('admin.migration_plan.notice.deleted'));
      setConfirm(null);
      navigate(`${basePath}/migration-plans`);
    },
    onError: (err: any) => {
      if (err?.code === 'BUSY') {
        chrome.openTasks();
      }
    },
    onSettled: () => {
      if (planRef) chrome.releaseLocalLock(planRef);
    },
  });


  const plan = planQ.data as MigrationPlan | undefined;
  const planForGates = (plan ?? ({ id: planId } as any)) as MigrationPlan;

  const busyLocalAny =
    busyLocalLock ||
    startM.isPending ||
    cancelM.isPending ||
    deleteM.isPending ||
    scheduleM.isPending ||
    batchScheduleM.isPending;

  const startGate = gateMigrationPlanAction('start', { plan: planForGates, busyLocal: busyLocalAny, busyTransaction });
  const cancelGate = gateMigrationPlanAction('cancel', { plan: planForGates, busyLocal: busyLocalAny, busyTransaction });
  const deleteGate = gateMigrationPlanAction('delete', { plan: planForGates, busyLocal: busyLocalAny, busyTransaction });
  const scheduleGate = gateMigrationPlanAction('schedule', { plan: planForGates, busyLocal: busyLocalAny, busyTransaction });

  const planState = String(plan?.state ?? 'unknown');

  const scheduleInputOk =
    Number.isFinite(Number(schedVpsId)) &&
    Number(schedVpsId) > 0 &&
    Number.isFinite(Number(schedDstNode)) &&
    Number(schedDstNode) > 0;


  const batchIds = useMemo(() => {
    const ids = batchVpsText
      .split(/[^0-9]+/g)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n > 0);
    const uniq: number[] = [];
    const seen = new Set<number>();
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      uniq.push(id);
    }
    return uniq;
  }, [batchVpsText]);

  const batchInputOk = batchIds.length > 0 && Number(schedDstNode) > 0;

  const migrationCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of pageMigrations) {
      const st = String(m.state ?? 'unknown');
      counts.set(st, (counts.get(st) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [pageMigrations]);

  return (
    <DetailShell testId="admin.migration_plan.page" variant="wide">
      <ObjectHeader
        testId="admin.migration_plan.header"
        title={t('admin.migration_plan.title', { id: Number.isFinite(planId) ? planId : '—' })}
        titleAfter={
          plan
            ? (() => {
                const b = planBadge(t, plan.state);
                return <Badge variant={b.variant}>{b.label}</Badge>;
              })()
            : null
        }
        kicker={
          <>
            <Link className="underline" to={`${basePath}/migration-plans`}>
              {t('nav.migration_plans')}
            </Link>
            <span className="text-faint"> · </span>
            <span>#{Number.isFinite(planId) ? planId : '—'}</span>
          </>
        }
        badges={
          busyTransaction || busyLocalAny ? (
            <>
              {busyTransaction ? (
                <LockBadge kind="transaction" t={t} chainIds={activeChainIds} showDetails />
              ) : null}
              {busyLocalAny ? <LockBadge kind="local" t={t} /> : null}
            </>
          ) : null
        }
        meta={t('admin.migration_plan.subtitle')}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                void planQ.refetch();
                void chainsQ.refetch();
                void migQ.refetch();
              }}
              testId="admin.migration_plan.refresh"
            >
              {t('common.refresh')}
            </Button>

            <ActionButton
              variant="ok"
              onClick={() => setConfirm({ kind: 'start' })}
              testId="admin.migration_plan.start"
              disabled={!startGate.allowed}
              disabledReason={!startGate.allowed ? startGate.reason : undefined}
            >
              {t('common.start')}
            </ActionButton>
            <ActionButton
              variant="warn"
              onClick={() => setConfirm({ kind: 'cancel' })}
              testId="admin.migration_plan.cancel"
              disabled={!cancelGate.allowed}
              disabledReason={!cancelGate.allowed ? cancelGate.reason : undefined}
            >
              {t('common.cancel')}
            </ActionButton>
            <ActionButton
              variant="danger"
              onClick={() => setConfirm({ kind: 'delete' })}
              testId="admin.migration_plan.delete"
              disabled={!deleteGate.allowed}
              disabledReason={!deleteGate.allowed ? deleteGate.reason : undefined}
            >
              {t('common.delete')}
            </ActionButton>
          </>
        }
      />

      {chainsStale ? (
        <LockStateStaleAlert
          chainIds={activeChainIds}
          error={chainsQ.error}
          onRetry={() => {
            void chainsQ.refetch();
          }}
        />
      ) : null}

      {notice ? (
        <Alert title={t('common.info')} variant="neutral">
          {notice}
        </Alert>
      ) : null}

      {!Number.isFinite(planId) || planId <= 0 ? (
        <ErrorState
          testId="admin.migration_plan.invalid_id"
          kindOverride="not_found"
          title={t('admin.migration_plan.invalid_id.title')}
          body={t('admin.migration_plan.invalid_id.body')}
          backTo={`${basePath}/migration-plans`}
          showStatusLink={false}
          showDetails={false}
          detailsExtra={{ page: 'admin.migration_plan.detail', planId: null }}
        />
      ) : planQ.isLoading ? (
        <LoadingState testId="admin.migration_plan.loading" />
      ) : planQ.isError ? (
        <ErrorState
          testId="admin.migration_plan.error"
          title={t('admin.migration_plan.load_error.title')}
          error={planQ.error}
          onRetry={() => void planQ.refetch()}
          backTo={`${basePath}/migration-plans`}
          detailsExtra={{ page: 'admin.migration_plan.detail', planId }}
        />
      ) : !plan ? (
        <ErrorState
          testId="admin.migration_plan.not_found"
          kindOverride="not_found"
          title={t('admin.migration_plan.not_found.title')}
          body={t('admin.migration_plan.not_found.body')}
          backTo={`${basePath}/migration-plans`}
          showStatusLink={false}
          showDetails={false}
          detailsExtra={{ page: 'admin.migration_plan.detail', planId }}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <div className="p-4">
                <div className="text-sm font-semibold">{t('admin.migration_plan.section.plan')}</div>
                <dl className="mt-3 grid grid-cols-1 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-faint">{t('common.id')}</dt>
                    <dd>#{plan.id}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-faint">{t('common.state')}</dt>
                    <dd>
                      {(() => {
                        const b = planBadge(t, plan.state);
                        return <Badge variant={b.variant}>{b.label}</Badge>;
                      })()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-faint">{t('common.user')}</dt>
                    <dd>{refLabel(plan.user)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-faint">{t('common.created')}</dt>
                    <dd>{formatDateTime(plan.created_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-faint">{t('common.finished')}</dt>
                    <dd>{formatDateTime(plan.finished_at)}</dd>
                  </div>
                </dl>
              </div>
            </Card>

            <Card>
              <div className="p-4">
                <div className="text-sm font-semibold">{t('admin.migration_plan.section.settings')}</div>
                <dl className="mt-3 grid grid-cols-1 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-faint">{t('admin.migration_plan.field.concurrency')}</dt>
                    <dd>{typeof plan.concurrency === 'number' ? plan.concurrency : '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-faint">{t('common.stop_on_error')}</dt>
                    <dd>{typeof plan.stop_on_error === 'boolean' ? String(plan.stop_on_error) : '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-faint">{t('common.send_mail')}</dt>
                    <dd>{typeof plan.send_mail === 'boolean' ? String(plan.send_mail) : '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-faint">{t('common.reason')}</dt>
                    <dd className="break-words">{plan.reason ? String(plan.reason) : '—'}</dd>
                  </div>
                </dl>
              </div>
            </Card>

            <Card>
              <div className="p-4">
                <div className="text-sm font-semibold">{t('admin.migration_plan.section.scheduled_migrations')}</div>
                <div className="mt-2 text-sm text-muted">
                  {t('admin.migration_plan.scheduled_migrations.on_this_page', { count: pageMigrations.length })}
                </div>
                {migrationCounts.length > 0 ? (
                  <div className="mt-3 space-y-1 text-xs text-muted">
                    {migrationCounts.slice(0, 8).map(([st, count]) => (
                      <div key={st} className="flex items-center justify-between">
                        <span>{st}</span>
                        <span className="font-medium">{count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-muted">{t('admin.migration_plan.scheduled_migrations.empty')}</div>
                )}
              </div>
            </Card>
          </div>

          <Card>
            <div className="p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">{t('admin.migration_plan.migrations.title')}</h2>
                  <p className="mt-1 text-sm text-muted">{t('admin.migration_plan.migrations.description')}</p>
                </div>
              </div>

              {planState === 'staged' ? (
                <div className="mt-4">
                  <div className="text-sm font-semibold">{t('admin.migration_plan.migrations.schedule.title')}</div>
                  <div className="mt-1 text-sm text-muted">
                    {t('admin.migration_plan.migrations.schedule.allowed_prefix')} {' '}
                    <span className="font-medium">{planBadge(t, 'staged').label}</span>.
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
                    <div>
                      <div className="text-xs text-muted">{t('admin.migration_plan.migrations.schedule.field.vps_id')}</div>
                      <Input value={schedVpsId} onChange={(e) => setSchedVpsId(e.target.value)} type="number" placeholder={t('admin.migration_plan.migrations.schedule.vps_id_placeholder')} />
                    </div>

                    <div>
                      <div className="text-xs text-muted">{t('admin.migration_plan.migrations.schedule.field.destination_node')}</div>
                      <Select
                        value={schedDstNode}
                        onChange={(e) => setSchedDstNode(e.target.value)}
                        disabled={nodesQ.isLoading || nodesQ.isError}
                      >
                        <option value="">{t('common.select')}</option>
                        {destOptions.map((o) => (
                          <option key={o.id} value={String(o.id)}>
                            {o.label}{o.location ? ` (${o.location})` : ''}
                          </option>
                        ))}
                      </Select>
                      {nodesQ.isError ? <div className="mt-1 text-xs text-danger">{t('admin.migration_plan.migrations.schedule.nodes_load_error')}</div> : null}
                    </div>

                    <div className="flex flex-col gap-2 lg:pt-5">
                      <Checkbox
                        checked={schedMaintenanceWindow}
                        onChange={setSchedMaintenanceWindow}
                        label={t('common.use_maintenance_windows')}
                        disabled={scheduleM.isPending || batchScheduleM.isPending}
                        className="!p-0 hover:!bg-transparent"
                      />
                      <Checkbox
                        checked={schedCleanupData}
                        onChange={setSchedCleanupData}
                        label={t('common.cleanup_data')}
                        disabled={scheduleM.isPending || batchScheduleM.isPending}
                        className="!p-0 hover:!bg-transparent"
                      />
                    </div>
                  </div>

                  <details className="mt-4 rounded-md border border-border bg-surface-2 p-3">
                    <summary className="cursor-pointer text-sm font-medium select-none">
                      {t('admin.migration_plan.migrations.schedule.batch.title')}
                    </summary>

                    <div className="mt-3 space-y-3">
                      <div className="text-sm text-muted">
                        {t('admin.migration_plan.migrations.schedule.batch.help')}
                      </div>

                      <textarea
                        className="w-full min-h-textarea rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-accent/70 focus:ring-2 focus:ring-focus/35 focus:ring-offset-2 focus:ring-offset-bg disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-disabled"
                        placeholder={t('admin.migration_plan.migrations.schedule.batch.textarea_placeholder')}
                        value={batchVpsText}
                        onChange={(e) => setBatchVpsText(e.target.value)}
                        disabled={batchScheduleM.isPending || scheduleM.isPending}
                      />

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs text-muted">
                          {t('admin.migration_plan.migrations.schedule.batch.parsed_ids')}{' '}
                          <span className="font-medium">{batchIds.length}</span>
                          {batchIds.length > 0 ? (
                            <>
                              {' '}
                              <span className="text-faint">·</span>{' '}
                              <span className="text-faint">{t('admin.migration_plan.migrations.schedule.batch.preview')}</span>{' '}
                              {batchIds.slice(0, 6).join(', ')}
                              {batchIds.length > 6 ? '…' : ''}
                            </>
                          ) : null}
                        </div>

                        <Checkbox
                          checked={batchStopOnError}
                          onChange={setBatchStopOnError}
                          label={t('admin.migration_plan.migrations.schedule.batch.stop_on_first_error')}
                          disabled={batchScheduleM.isPending || scheduleM.isPending}
                          className="!p-0 hover:!bg-transparent"
                        />
                      </div>

                      {batchScheduleM.isError ? (
                        <Alert title={t('admin.migration_plan.migrations.schedule.batch.error_title')} variant="danger">
                          {formatErrorMessage(batchScheduleM.error)}
                        </Alert>
                      ) : null}

                      {batchLastResult ? (
                        <Alert
                          title={t('admin.migration_plan.migrations.schedule.batch.result_title')}
                          variant={batchLastResult.failed.length > 0 ? 'warn' : 'neutral'}
                        >
                          <div className="space-y-2">
                            <div>
                              {t('admin.migration_plan.migrations.schedule.batch.result.scheduled')} <span className="font-medium">{batchLastResult.ok.length}</span>
                              {batchLastResult.ok.length > 0 ? (
                                <span className="text-muted"> · {batchLastResult.ok.slice(0, 12).join(', ')}{batchLastResult.ok.length > 12 ? '…' : ''}</span>
                              ) : null}
                            </div>
                            {batchLastResult.failed.length > 0 ? (
                              <div>
                                {t('admin.migration_plan.migrations.schedule.batch.result.failed')} <span className="font-medium">{batchLastResult.failed.length}</span>
                                <ul className="mt-2 space-y-1 text-xs">
                                  {batchLastResult.failed.slice(0, 8).map((f) => (
                                    <li key={f.id}>
                                      <span className="font-medium">{f.id}</span>: {f.error}
                                    </li>
                                  ))}
                                </ul>
                                {batchLastResult.failed.length > 8 ? (
                                  <div className="mt-1 text-xs text-muted">({t('admin.migration_plan.migrations.schedule.batch.result.showing_first_n', { n: 8 })})</div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </Alert>
                      ) : null}

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setBatchVpsText('');
                            setBatchStopOnError(false);
                            setBatchLastResult(null);
                          }}
                          disabled={batchScheduleM.isPending || scheduleM.isPending}
                        >
                          {t('admin.migration_plan.migrations.schedule.batch.clear')}
                        </Button>
                        <ActionButton
                          variant="warn"
                          onClick={() => batchScheduleM.mutate()}
                          loading={batchScheduleM.isPending}
                          disabled={!batchInputOk || !scheduleGate.allowed}
                          disabledReason={!batchInputOk ? undefined : !scheduleGate.allowed ? scheduleGate.reason : undefined}
                        >
                          {t('admin.migration_plan.migrations.schedule.batch.schedule')}
                        </ActionButton>
                      </div>
                    </div>
                  </details>

                  {scheduleM.isError ? (
                    <Alert title={t('admin.migration_plan.migrations.schedule.error_title')} variant="danger" className="mt-3">
                      {formatErrorMessage(scheduleM.error)}
                    </Alert>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSchedVpsId('');
                        setSchedDstNode('');
                        setSchedMaintenanceWindow(true);
                        setSchedCleanupData(true);
                        setBatchVpsText('');
                        setBatchStopOnError(false);
                        setBatchLastResult(null);
                      }}
                      disabled={scheduleM.isPending || batchScheduleM.isPending}
                    >
                      {t('common.reset')}
                    </Button>
                    <ActionButton
                      variant="ok"
                      onClick={() =>
                        scheduleM.mutate({
                          vps: Number(schedVpsId),
                          dstNode: Number(schedDstNode),
                          maintenanceWindow: schedMaintenanceWindow,
                          cleanupData: schedCleanupData,
                        })
                      }
                      loading={scheduleM.isPending}
                      disabled={!scheduleInputOk || !scheduleGate.allowed}
                      disabledReason={!scheduleInputOk ? undefined : !scheduleGate.allowed ? scheduleGate.reason : undefined}
                    >
                      {t('common.schedule')}
                    </ActionButton>
                  </div>
                </div>
              ) : null}

              {migQ.isLoading ? (
                <div className="mt-4 flex items-center gap-2 text-sm text-muted">
                  <Spinner /> {t('common.loading')}
                </div>
              ) : migQ.isError ? (
                <div className="mt-4 text-sm text-danger">{formatErrorMessage(migQ.error)}</div>
              ) : pageMigrations.length === 0 ? (
                <div className="mt-4 text-sm text-muted">{t('admin.migration_plan.migrations.empty')}</div>
              ) : (
                <>
                  {/* Mobile: cards */}
                  <div className="mt-4 space-y-3 md:hidden" data-testid="admin.migration_plan.migrations.list.mobile">
                    {pageMigrations.map((m: VpsMigration) => {
                      const b = planBadge(t, m.state);
                      const vId = vpsId(m);
                      const chId = chainId(m);
                      const srcId = refId(m.src_node);
                      const dstId = refId(m.dst_node);
                      const srcLabel = refLabel(m.src_node);
                      const dstLabel = refLabel(m.dst_node);
                      return (
                        <div
                          key={m.id}
                          className="rounded-md border border-border bg-surface-2 p-3"
                          data-testid={`admin.migration_plan.migrations.card.${m.id}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-fg">{t('admin.migration_plan.migrations.card.title', { id: m.id })}</div>
                              <div className="mt-0.5 text-xs text-faint">{t('common.created')}: {formatDateTime(m.created_at)}</div>
                            </div>
                            <Badge variant={b.variant}>{b.label}</Badge>
                          </div>

                          <div className="mt-3 space-y-2 text-xs text-muted">
                            <div>
                              <span className="text-faint">{t('common.vps')}:</span>{' '}
                              {vId ? (
                                <span className="inline-flex items-center gap-1">
                                  <ChipLink
                                    to={`${basePath}/transactions/items?vps=${encodeURIComponent(String(vId))}`}
                                    title={t('admin.migration_plan.migrations.filter_by_vps_title', { id: vId })}
                                  >
                                    #{vId}
                                  </ChipLink>
                                  <MiniLink to={`${basePath}/vps/${vId}`} title={t('common.open_vps')}>
                                    {t('common.open')}
                                  </MiniLink>
                                </span>
                              ) : (
                                <span className="text-faint">—</span>
                              )}
                            </div>

                            <div>
                              <span className="text-faint">{t('admin.migration_plan.migrations.field.source_node')}:</span>{' '}
                              {srcId ? (
                                <span className="inline-flex items-center gap-1">
                                  <ChipLink
                                    to={`${basePath}/transactions/items?node=${encodeURIComponent(String(srcId))}`}
                                    title={t('admin.migration_plan.migrations.filter_by_node_title', { label: srcLabel })}
                                  >
                                    {srcLabel}
                                  </ChipLink>
                                  <MiniLink to={`${basePath}/nodes/${srcId}`} title={t('common.open_node')}>
                                    {t('common.open')}
                                  </MiniLink>
                                </span>
                              ) : (
                                <span className="text-muted">{srcLabel}</span>
                              )}
                            </div>

                            <div>
                              <span className="text-faint">{t('admin.migration_plan.migrations.field.dest_node')}:</span>{' '}
                              {dstId ? (
                                <span className="inline-flex items-center gap-1">
                                  <ChipLink
                                    to={`${basePath}/transactions/items?node=${encodeURIComponent(String(dstId))}`}
                                    title={t('admin.migration_plan.migrations.filter_by_node_title', { label: dstLabel })}
                                  >
                                    {dstLabel}
                                  </ChipLink>
                                  <MiniLink to={`${basePath}/nodes/${dstId}`} title={t('common.open_node')}>
                                    {t('common.open')}
                                  </MiniLink>
                                </span>
                              ) : (
                                <span className="text-muted">{dstLabel}</span>
                              )}
                            </div>

                            <div>
                              <span className="text-faint">{t('admin.migration_plan.migrations.field.chain')}:</span>{' '}
                              {chId ? (
                                <span className="inline-flex items-center gap-1">
                                  <ChipLink
                                    to={`${basePath}/transactions/items?transaction_chain=${encodeURIComponent(String(chId))}`}
                                    title={t('admin.migration_plan.migrations.filter_by_chain_title', { id: chId })}
                                  >
                                    #{chId}
                                  </ChipLink>
                                  <MiniLink to={`${basePath}/transactions/${chId}`} title={t('common.open_chain_detail')}>
                                    {t('common.open')}
                                  </MiniLink>
                                </span>
                              ) : (
                                <span className="text-faint">—</span>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-faint">{t('common.started')}:</span> {formatDateTime(m.started_at)}
                              </div>
                              <div>
                                <span className="text-faint">{t('common.finished')}:</span> {formatDateTime(m.finished_at)}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop: table */}
                  <div className="mt-4 hidden md:block overflow-x-auto">
                    <table className="min-w-full text-sm table-list" data-testid="admin.migration_plan.migrations.table">
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-muted">
                          <th className="px-3 py-2">{t('common.id')}</th>
                          <th className="px-3 py-2">{t('common.state')}</th>
                          <th className="px-3 py-2">{t('common.vps')}</th>
                          <th className="px-3 py-2">{t('admin.migration_plan.migrations.field.source_node')}</th>
                          <th className="px-3 py-2">{t('admin.migration_plan.migrations.field.dest_node')}</th>
                          <th className="px-3 py-2">{t('admin.migration_plan.migrations.field.chain')}</th>
                          <th className="px-3 py-2">{t('common.created')}</th>
                          <th className="px-3 py-2">{t('common.started')}</th>
                          <th className="px-3 py-2">{t('common.finished')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageMigrations.map((m: VpsMigration) => {
                          const b = planBadge(t, m.state);
                          const vId = vpsId(m);
                          const chId = chainId(m);
                          const srcId = refId(m.src_node);
                          const dstId = refId(m.dst_node);
                          const srcLabel = refLabel(m.src_node);
                          const dstLabel = refLabel(m.dst_node);
                          return (
                            <tr
                              key={m.id}
                              className="border-b border-border/60 last:border-b-0"
                              data-testid={`admin.migration_plan.migrations.row.${m.id}`}
                            >
                              <td className="px-3 py-2 text-xs text-muted">#{m.id}</td>
                              <td className="px-3 py-2">
                                <Badge variant={b.variant}>{b.label}</Badge>
                              </td>
                              <td className="px-3 py-2 text-xs">
                                {vId ? (
                                  <span className="inline-flex items-center gap-1">
                                    <ChipLink
                                      to={`${basePath}/transactions/items?vps=${encodeURIComponent(String(vId))}`}
                                      title={t('admin.migration_plan.migrations.filter_by_vps_title', { id: vId })}
                                    >
                                      #{vId}
                                    </ChipLink>
                                    <MiniLink to={`${basePath}/vps/${vId}`} title={t('common.open_vps')}>
                                      {t('common.open')}
                                    </MiniLink>
                                  </span>
                                ) : (
                                  <span className="text-faint">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-xs">
                                {srcId ? (
                                  <span className="inline-flex items-center gap-1">
                                    <ChipLink
                                      to={`${basePath}/transactions/items?node=${encodeURIComponent(String(srcId))}`}
                                      title={t('admin.migration_plan.migrations.filter_by_node_title', { label: srcLabel })}
                                    >
                                      {srcLabel}
                                    </ChipLink>
                                    <MiniLink to={`${basePath}/nodes/${srcId}`} title={t('common.open_node')}>
                                      {t('common.open')}
                                    </MiniLink>
                                  </span>
                                ) : (
                                  <span className="text-muted">{srcLabel}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-xs">
                                {dstId ? (
                                  <span className="inline-flex items-center gap-1">
                                    <ChipLink
                                      to={`${basePath}/transactions/items?node=${encodeURIComponent(String(dstId))}`}
                                      title={t('admin.migration_plan.migrations.filter_by_node_title', { label: dstLabel })}
                                    >
                                      {dstLabel}
                                    </ChipLink>
                                    <MiniLink to={`${basePath}/nodes/${dstId}`} title={t('common.open_node')}>
                                      {t('common.open')}
                                    </MiniLink>
                                  </span>
                                ) : (
                                  <span className="text-muted">{dstLabel}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-xs">
                                {chId ? (
                                  <span className="inline-flex items-center gap-1">
                                    <ChipLink
                                      to={`${basePath}/transactions/items?transaction_chain=${encodeURIComponent(String(chId))}`}
                                      title={t('admin.migration_plan.migrations.filter_by_chain_title', { id: chId })}
                                    >
                                      #{chId}
                                    </ChipLink>
                                    <MiniLink to={`${basePath}/transactions/${chId}`} title={t('common.open_chain_detail')}>
                                      {t('common.open')}
                                    </MiniLink>
                                  </span>
                                ) : (
                                  <span className="text-faint">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-xs text-muted">{formatDateTime(m.created_at)}</td>
                              <td className="px-3 py-2 text-xs text-muted">{formatDateTime(m.started_at)}</td>
                              <td className="px-3 py-2 text-xs text-muted">{formatDateTime(m.finished_at)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {showPagination ? (
              <KeysetPagination
                page={pagination.page}
                pageCount={pagination.stack.length}
                canPrev={pagination.canPrev}
                canNext={canNext}
                onPrev={pagination.goPrev}
                onNext={() => pagination.goNext(pageCursor)}
                onGoToPage={pagination.goToPage}
                limit={pagination.limit}
                allowedLimits={pagination.allowedLimits}
                onLimitChange={pagination.setLimit}
                testId="admin.migration_plan.migrations.pagination"
              />
            ) : null}
          </Card>
        </>
      )}

      <ConfirmDialog
        open={confirm?.kind === 'start'}
        title={t('admin.migration_plan.confirm.start.title')}
        description={t('admin.migration_plan.confirm.start.description')}
        danger
        confirmLabel={t('common.start')}
        confirmDisabled={!startGate.allowed}
        confirmLoading={startM.isPending}
        onConfirm={() => startM.mutate()}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm?.kind === 'cancel'}
        title={t('admin.migration_plan.confirm.cancel.title')}
        description={t('admin.migration_plan.confirm.cancel.description')}
        confirmLabel={t('common.cancel')}
        confirmDisabled={!cancelGate.allowed}
        confirmLoading={cancelM.isPending}
        onConfirm={() => cancelM.mutate()}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm?.kind === 'delete'}
        title={t('admin.migration_plan.confirm.delete.title')}
        description={t('admin.migration_plan.confirm.delete.description')}
        danger
        confirmLabel={t('common.delete')}
        confirmDisabled={!deleteGate.allowed}
        confirmLoading={deleteM.isPending}
        onConfirm={() => deleteM.mutate()}
        onCancel={() => setConfirm(null)}
      />

      {startM.isError ? (
        <Alert title={t('admin.migration_plan.errors.start')} variant="danger">
          {formatErrorMessage(startM.error)}
        </Alert>
      ) : null}
      {cancelM.isError ? (
        <Alert title={t('admin.migration_plan.errors.cancel')} variant="danger">
          {formatErrorMessage(cancelM.error)}
        </Alert>
      ) : null}
      {deleteM.isError ? (
        <Alert title={t('admin.migration_plan.errors.delete')} variant="danger">
          {formatErrorMessage(deleteM.error)}
        </Alert>
      ) : null}
    </DetailShell>
  );
}
