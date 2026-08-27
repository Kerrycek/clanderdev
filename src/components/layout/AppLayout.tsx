import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../app/auth';
import { useAppMode } from '../../app/appMode';
import { useUiSettings } from '../../app/uiSettings';
import { useI18n } from '../../app/i18n';
import { useToasts } from '../../app/toasts';
import { fetchActionStates, type ActionState } from '../../lib/api/actionStates';
import { fetchTransactionChain, fetchTransactionChains, type TransactionChain } from '../../lib/api/transactions';
import {
  isFailingActionState,
  isFailedChainState,
  isFinishedActionState,
  isFinishedChainState,
} from '../../lib/taskStatus';
import { Drawer } from '../ui/Drawer';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { LoadingState } from '../ui/LoadingState';
import { ChromeContextProvider, type TrackedActionState } from './ChromeContext';
import { normalizeObjectRef, objectRefKey, parseObjectRefKey, type ObjectRef } from '../../lib/objectRef';
import { computeOtherModeUrl } from '../../lib/modeSwitch';
import { objectRefsFromConcerns } from '../../lib/concernObjects';
import { invalidateQueriesForObject } from '../../lib/queryInvalidation';
import { extractRelatedTransactionChainIdFromActionState } from '../../lib/taskLinks';
import { useDocumentVisibility } from '../../lib/useDocumentVisibility';
import { useNetworkStatus } from '../../lib/useNetworkStatus';
import { tierAIntervalMs } from '../../lib/refreshTiers';
import { consumePendingToast, queueScopeAllObjectsWarning } from '../../lib/pendingToasts';
import {
  LOCAL_LOCK_STORAGE_KEY,
  localLockActionStateIds,
  parseLocalLocksFromStorage,
  pruneLocalLocks,
  releaseLocalLock as releaseLocalLockReducer,
  releaseLocalLocksByActionStateId as releaseLocalLocksByActionStateIdReducer,
  upsertLocalLock,
  type LocalLock,
} from '../../lib/localLocks';
import { useTaskCompletionToasts } from './useTaskCompletionToasts';
import { ImpersonationBanner } from './ImpersonationBanner';
import { ContextualHelpPanel } from './ContextualHelpPanel';
import { AppHeader } from './AppHeader';
import { AppSidebar, buildSidebarNavItems } from './AppSidebar';
import { SidebarTips } from './SidebarTips';
import { FrontendFreshnessGuard } from './FrontendFreshnessGuard';
function useOutsideClick(ref: React.RefObject<HTMLElement | null>, onOutside: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onDocClick = (e: MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      if (el.contains(e.target as Node)) return;
      onOutside();
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [enabled, onOutside, ref]);
}


const LazyActionStatesPanel = React.lazy(async () => {
  const mod = await import('./ActionStatesPanel');
  return { default: mod.ActionStatesPanel };
});

const LazyTransactionChainsPanel = React.lazy(async () => {
  const mod = await import('./TransactionChainsPanel');
  return { default: mod.TransactionChainsPanel };
});

const LazyCommandPalette = React.lazy(async () => {
  const mod = await import('./CommandPalette');
  return { default: mod.CommandPalette };
});

const LazyBlockingActionProgressModal = React.lazy(async () => {
  const mod = await import('./BlockingActionProgressModal');
  return { default: mod.BlockingActionProgressModal };
});

function DeferredChromeSection(props: { children: React.ReactNode; testId: string }) {
  return (
    <React.Suspense fallback={<LoadingState kind="inline" testId={props.testId} />}>
      {props.children}
    </React.Suspense>
  );
}

export function AppLayout(props: { children: React.ReactNode }) {
  const auth = useAuth();
  const { mode, basePath } = useAppMode();
  const ui = useUiSettings();
  const i18n = useI18n();
  const toasts = useToasts();
  const navigate = useNavigate();
  const location = useLocation();

  const qc = useQueryClient();
  const docVisible = useDocumentVisibility();
  const online = useNetworkStatus();
  const tierARefetchMs = tierAIntervalMs(docVisible);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [blockingActionStateId, setBlockingActionStateId] = useState<number | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const syncRef = useRef<HTMLDivElement>(null);

  const shortcutHint =
    typeof navigator !== 'undefined' && /mac/i.test(String((navigator as any).platform ?? '')) ? '⌘K · /' : 'Ctrl K · /';

  // Global command palette shortcut: Ctrl+K / Cmd+K, and "/".
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();

      const isCmdK = k === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey;
      const isSlash = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey;

      if (!isCmdK && !isSlash) return;

      // Avoid hijacking when the user is typing into a text field.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (target as any)?.isContentEditable) {
        return;
      }

      e.preventDefault();
      setPaletteOpen(true);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Cross-scope toasts: consume on mount (switching /app <-> /admin unmounts providers).
  useEffect(() => {
    const storage = typeof window !== 'undefined' ? window.sessionStorage : undefined;
    const pending = consumePendingToast(storage);
    if (!pending) return;

    if (pending === 'scope_all_objects' && mode === 'admin') {
      toasts.pushToast({
        variant: 'warn',
        title: i18n.t('settings.scope.toast_all.title'),
        body: i18n.t('settings.scope.toast_all.body'),
        action: {
          label: i18n.t('user_menu.switch_to_my_view'),
          testId: 'toast.scope.all.back',
          onClick: () => {
            navigate(
              computeOtherModeUrl({
                mode,
                pathname: location.pathname,
                search: location.search,
                hash: location.hash,
              })
            );
          },
        },
      });
    }
  }, [i18n, location.hash, location.pathname, location.search, mode, navigate, toasts]);

  // Track action_state_id values returned by blocking API actions (so we can show progress in the Tasks drawer).
  const trackedStorageKey = 'webui-next.tracked_action_states';

  // Persisted pins for debugging sessions across reloads.
  const pinnedActionStorageKey = 'webui-next.pinned_action_states';
  const pinnedChainStorageKey = 'webui-next.pinned_transaction_chains';

  const [tasksFilter, setTasksFilter] = useState('');

  const [pinnedActionStates, setPinnedActionStates] = useState<number[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(pinnedActionStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((x: any) => Number(x))
        .filter((x: any) => Number.isFinite(x) && x > 0)
        .slice(0, 50);
    } catch {
      return [];
    }
  });

  const [pinnedTransactionChains, setPinnedTransactionChains] = useState<number[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(pinnedChainStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((x: any) => Number(x))
        .filter((x: any) => Number.isFinite(x) && x > 0)
        .slice(0, 50);
    } catch {
      return [];
    }
  });

  const [trackedActionStates, setTrackedActionStates] = useState<TrackedActionState[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.sessionStorage.getItem(trackedStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((x: any) => ({
          id: Number(x?.id),
          addedAt: Number(x?.addedAt),
          actionLabelKey: typeof x?.actionLabelKey === 'string' ? x.actionLabelKey : undefined,
          actionLabel: typeof x?.actionLabel === 'string' ? x.actionLabel : undefined,
          objectLabel: typeof x?.objectLabel === 'string' ? x.objectLabel : undefined,
          object: normalizeObjectRef(x?.object) ?? undefined,
          blockUi: typeof x?.blockUi === 'boolean' ? x.blockUi : undefined,
          progressTitleKey: typeof x?.progressTitleKey === 'string' ? x.progressTitleKey : undefined,
        }))
        .filter((x: any) => Number.isFinite(x.id) && x.id > 0 && Number.isFinite(x.addedAt) && x.addedAt > 0)
        .slice(0, 50);
    } catch {
      return [];
    }
  });

  const [highlightActionStateId, setHighlightActionStateId] = useState<number | null>(null);

  // Local transition locks (sessionStorage, per-tab).
  const [localLocks, setLocalLocks] = useState<LocalLock[]>(() => {
    if (typeof window === 'undefined') return [];
    return parseLocalLocksFromStorage(window.sessionStorage.getItem(LOCAL_LOCK_STORAGE_KEY), Date.now());
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(LOCAL_LOCK_STORAGE_KEY, JSON.stringify(localLocks));
    } catch {
      // ignore
    }
  }, [localLocks]);

  // Periodic prune for stale locks (also covers reload/resume).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const id = window.setInterval(() => {
      setLocalLocks((prev) => pruneLocalLocks(prev, Date.now()));
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  const acquireLocalLock = useCallback((ref: ObjectRef, opts?: { actionStateId?: number; ttlMs?: number }) => {
    const now = Date.now();
    setLocalLocks((prev) => upsertLocalLock(pruneLocalLocks(prev, now), ref, now, opts));
  }, []);

  const releaseLocalLock = useCallback((ref: ObjectRef) => {
    setLocalLocks((prev) => releaseLocalLockReducer(prev, ref));
  }, []);

  const releaseLocalLocksByActionStateId = useCallback((actionStateId: number) => {
    setLocalLocks((prev) => releaseLocalLocksByActionStateIdReducer(prev, actionStateId));
  }, []);

  const isLocallyLocked = useCallback(
    (ref: ObjectRef) => {
      const key = objectRefKey(ref);
      const now = Date.now();
      return localLocks.some((l) => l.key === key && l.expiresAt > now);
    },
    [localLocks]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(trackedStorageKey, JSON.stringify(trackedActionStates));
    } catch {
      // ignore
    }
  }, [trackedActionStates]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(pinnedActionStorageKey, JSON.stringify(pinnedActionStates));
    } catch {
      // ignore
    }
  }, [pinnedActionStates]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(pinnedChainStorageKey, JSON.stringify(pinnedTransactionChains));
    } catch {
      // ignore
    }
  }, [pinnedTransactionChains]);

  useEffect(() => {
    if (highlightActionStateId === null) return;
    const t = window.setTimeout(() => setHighlightActionStateId(null), 30000);
    return () => window.clearTimeout(t);
  }, [highlightActionStateId]);


  useOutsideClick(userMenuRef, () => setUserMenuOpen(false), userMenuOpen);
  useOutsideClick(syncRef, () => setSyncOpen(false), syncOpen);

  const navItems = useMemo(
    () =>
      buildSidebarNavItems({ basePath, appMode: mode, role: auth.role, t: i18n.t }),
    [auth.role, basePath, i18n, mode]
  );

  const chainsQ = useQuery({
    queryKey: ['transaction_chains', 'list', { limit: 10 }],
    queryFn: async () => (await fetchTransactionChains({ limit: 10 })).data,
    enabled: auth.status === 'authenticated',
    retry: false,
    refetchInterval: auth.status === 'authenticated' ? tierARefetchMs : false,
  });

  const actionStatesQ = useQuery({
    queryKey: ['action_states', 'list', { limit: 20 }],
    queryFn: async () => (await fetchActionStates({ limit: 20, order: 'newest' })).data,
    enabled: auth.status === 'authenticated',
    retry: false,
    refetchInterval: auth.status === 'authenticated' ? tierARefetchMs : false,
  });

  const syncStatus: 'ok' | 'offline' | 'error' = useMemo(() => {
    if (!online) return 'offline';
    if (chainsQ.isError || actionStatesQ.isError) return 'error';
    return 'ok';
  }, [actionStatesQ.isError, chainsQ.isError, online]);

  const syncError = useMemo(() => {
    return actionStatesQ.error ?? chainsQ.error ?? null;
  }, [actionStatesQ.error, chainsQ.error]);

  const syncTitle = syncStatus === 'offline' ? i18n.t('sync.offline.title') : i18n.t('sync.error.title');
  const syncBody = syncStatus === 'offline' ? i18n.t('sync.offline.body') : i18n.t('sync.error.body');
  const showSyncIndicator = syncStatus !== 'ok';

  const retrySync = useCallback(() => {
    void actionStatesQ.refetch();
    void chainsQ.refetch();
  }, [actionStatesQ, chainsQ]);

  useEffect(() => {
    // If sync recovers, close the panel so it doesn't "reappear" later.
    if (!showSyncIndicator) setSyncOpen(false);
  }, [showSyncIndicator]);

  const actionActiveCount = useMemo(() => {
    const states = actionStatesQ.data ?? [];
    return states.filter((s) => !isFinishedActionState(s as any)).length;
  }, [actionStatesQ.data]);

  const actionFailedCount = useMemo(() => {
    const states = actionStatesQ.data ?? [];
    return states.filter((s) => isFailingActionState(s as any)).length;
  }, [actionStatesQ.data]);

  const activeCount = useMemo(() => {
    const chains = chainsQ.data ?? [];
    return chains.filter((c) => !isFinishedChainState((c as any).state)).length;
  }, [chainsQ.data]);

  const failedCount = useMemo(() => {
    const chains = chainsQ.data ?? [];
    return chains.filter((c) => isFailedChainState((c as any).state)).length;
  }, [chainsQ.data]);

  const tasksActiveCount = activeCount + actionActiveCount;
  const tasksFailedCount = failedCount + actionFailedCount;

  const blockingTracked = useMemo(() => {
    if (blockingActionStateId === null) return null;
    return trackedActionStates.find((x) => x.id === blockingActionStateId) ?? null;
  }, [blockingActionStateId, trackedActionStates]);

  const openTasks = useCallback(() => setTasksOpen(true), []);
  const closeTasks = useCallback(() => setTasksOpen(false), []);
  const toggleTasks = useCallback(() => setTasksOpen((v) => !v), []);

  const trackActionState = useCallback(
    (
      actionStateId: number,
      meta?: {
        actionLabelKey?: string;
        actionLabel?: string;
        objectLabel?: string;

        /** When provided, binds a local transition lock to this action state. */
        object?: ObjectRef;

        blockUi?: boolean;
        progressTitleKey?: TrackedActionState['progressTitleKey'];
      }
    ) => {
      const id = Number(actionStateId);
      if (!Number.isFinite(id) || id <= 0) return;

      // Bind/refresh the local lock when the API confirms an action_state_id.
      if (meta?.object) {
        acquireLocalLock(meta.object, { actionStateId: id });
      }

      setHighlightActionStateId(id);
      setBlockingActionStateId(id);

      const safeMeta: Omit<TrackedActionState, 'id' | 'addedAt'> = {
        actionLabelKey: meta?.actionLabelKey,
        actionLabel: meta?.actionLabel,
        objectLabel: meta?.objectLabel,
        object: meta?.object,
        blockUi: meta?.blockUi,
        progressTitleKey: meta?.progressTitleKey,
      };

      setTrackedActionStates((prev) => {
        const now = Date.now();
        const filtered = prev.filter((x) => x.id !== id);
        return [{ id, addedAt: now, ...safeMeta }, ...filtered].slice(0, 50);
      });
    },
    [acquireLocalLock]
  );

  const dismissActionState = useCallback((actionStateId: number) => {
    const id = Number(actionStateId);
    if (!Number.isFinite(id) || id <= 0) return;
    setTrackedActionStates((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const togglePinnedActionState = useCallback((actionStateId: number) => {
    const id = Number(actionStateId);
    if (!Number.isFinite(id) || id <= 0) return;
    setPinnedActionStates((prev) => {
      const has = prev.includes(id);
      const next = has ? prev.filter((x) => x !== id) : [id, ...prev];
      return next.slice(0, 50);
    });
  }, []);

  const togglePinnedTransactionChain = useCallback((chainId: number) => {
    const id = Number(chainId);
    if (!Number.isFinite(id) || id <= 0) return;
    setPinnedTransactionChains((prev) => {
      const has = prev.includes(id);
      const next = has ? prev.filter((x) => x !== id) : [id, ...prev];
      return next.slice(0, 50);
    });
  }, []);

  const chrome = useMemo(
    () => ({
      syncStatus,
      syncError,
      retrySync,

      openTasks,
      closeTasks,
      toggleTasks,

      pinnedActionStates,
      pinnedTransactionChains,
      togglePinnedActionState,
      togglePinnedTransactionChain,

      trackActionState,
      dismissActionState,
      trackedActionStates,
      highlightActionStateId,

      localLocks,
      acquireLocalLock,
      releaseLocalLock,
      releaseLocalLocksByActionStateId,
      isLocallyLocked,
    }),
    [
      retrySync,
      syncError,
      syncStatus,
      closeTasks,
      dismissActionState,
      highlightActionStateId,
      openTasks,
      pinnedActionStates,
      pinnedTransactionChains,
      togglePinnedActionState,
      togglePinnedTransactionChain,
      toggleTasks,
      trackActionState,
      trackedActionStates,
      localLocks,
      acquireLocalLock,
      releaseLocalLock,
      releaseLocalLocksByActionStateId,
      isLocallyLocked,
    ]
  );

  const loginLogoutHref = auth.logoutUrl ?? '/?page=logout';

  const lockActionStateIds = useMemo(() => localLockActionStateIds(localLocks), [localLocks]);

  const onActionFinished = useCallback(
    (
      actionStateId: number,
      info: { failed: boolean; actionState?: ActionState; transactionChainId?: number | null }
    ) => {
      const id = Number(actionStateId);
      if (!Number.isFinite(id) || id <= 0) return;

      // Deduplicate invalidation targets across all sources (tracked metadata,
      // local lock bindings, and transaction chain concerns).
      const seen = new Set<string>();
      const invalidateRef = (ref: ObjectRef) => {
        const k = objectRefKey(ref);
        if (seen.has(k)) return;
        seen.add(k);
        invalidateQueriesForObject(qc, ref);
      };

      const tracked = trackedActionStates.find((x) => x.id === id);
      if (tracked?.object) invalidateRef(tracked.object);

      for (const l of localLocks) {
        if (Number(l.actionStateId) !== id) continue;
        const ref = parseObjectRefKey(l.key);
        if (ref) invalidateRef(ref);
      }

      // Refresh task surfaces and "busy" indices.
      void qc.invalidateQueries({ queryKey: ['action_states', 'list'] });
      void qc.invalidateQueries({ queryKey: ['transaction_chains', 'list'] });
      void qc.invalidateQueries({ queryKey: ['transaction_chain', 'active'] });

      releaseLocalLocksByActionStateId(id);

      // Best-effort: if we can link the action state to a transaction chain,
      // invalidate all objects listed in the chain concerns.
      const relatedChainId =
        info.transactionChainId ??
        (info.actionState ? extractRelatedTransactionChainIdFromActionState(info.actionState) : null);

      if (relatedChainId && relatedChainId > 0) {
        const chainId = relatedChainId;

        void (async () => {
          try {
            const chainKey = ['transaction_chains', 'show', { id: chainId }] as const;
            let chain = qc.getQueryData(chainKey) as any as TransactionChain | undefined;
            if (!chain) {
              chain = await qc.fetchQuery({
                queryKey: chainKey,
                queryFn: async () => (await fetchTransactionChain(chainId)).data,
                staleTime: 10_000,
              });
            }

            if (!chain) return;
            for (const r of objectRefsFromConcerns((chain as any).concerns, { maxDepth: 3, max: 12 })) {
              invalidateRef(r);
            }
          } catch {
            // Ignore: invalidation is best-effort.
          }
        })();
      }
    },
    [localLocks, qc, releaseLocalLocksByActionStateId, trackedActionStates]
  );

  // In-app completion toasts for tracked tasks.
  useTaskCompletionToasts({
    trackedActionStates,
    pinnedTransactionChains,
    lockActionStateIds,
    onOpenTasks: openTasks,
    onActionFinished,
  });

  const goToOtherMode = () => {
    const storage = typeof window !== 'undefined' ? window.sessionStorage : undefined;
    if (mode === 'user') {
      // Queue a one-time warning toast for when we land in the All objects view.
      queueScopeAllObjectsWarning(storage);
    }

    navigate(
      computeOtherModeUrl({
        mode,
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      })
    );
  };

  const canSwitchMode = auth.canUseAdminUi;

  return (
    <ChromeContextProvider value={chrome}>
      <FrontendFreshnessGuard />
      <div className="flex min-h-screen bg-bg">
        {/*
          Keep the desktop sidebar and the main shell in the same flex row.
          If this wrapper stops being flex, the h-screen sidebar becomes a
          full-height block above the main column and pushes page content down
          by roughly one viewport, which is exactly the "everything is already
          scrolled" failure the screenshots show.
        */}
        <AppSidebar
          mobileNavOpen={mobileNavOpen}
          onCloseMobileNav={() => setMobileNavOpen(false)}
          navItems={navItems}
          sidebarCollapsed={ui.settings.sidebarCollapsed}
          onToggleSidebar={() => ui.setSidebarCollapsed(!ui.settings.sidebarCollapsed)}
          t={i18n.t}
          sidebarTips={<SidebarTips collapsed={ui.settings.sidebarCollapsed} />}
        />

        <Drawer
          open={tasksOpen}
          side="right"
          title={i18n.t('tasks.title')}
          onClose={() => setTasksOpen(false)}
          width="lg"
          modal={false}
          testId="tasks.drawer"
          closeTestId="tasks.close-button"
        >
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <Input
                testId="tasks.filter-input"
                value={tasksFilter}
                onChange={(e) => setTasksFilter(e.target.value)}
                placeholder={i18n.t('tasks.filter.placeholder')}
                className="flex-1"
              />
              {tasksFilter ? (
                <Button size="sm" variant="secondary" onClick={() => setTasksFilter('')}>
                  {i18n.t('common.clear_search')}
                </Button>
              ) : null}
            </div>

            <DeferredChromeSection testId="tasks.drawer.loading.action_states">
              <LazyActionStatesPanel
                limit={10}
                filterText={tasksFilter}
                pinnedIds={pinnedActionStates}
                onTogglePin={togglePinnedActionState}
              />
            </DeferredChromeSection>
            <div className="border-t pt-4">
              <DeferredChromeSection testId="tasks.drawer.loading.transaction_chains">
                <LazyTransactionChainsPanel
                  limit={10}
                  filterText={tasksFilter}
                  pinnedIds={pinnedTransactionChains}
                  onTogglePin={togglePinnedTransactionChain}
                />
              </DeferredChromeSection>
            </div>
          </div>
        </Drawer>

        {paletteOpen ? (
          <DeferredChromeSection testId="shell.command_palette.loading">
            <LazyCommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
          </DeferredChromeSection>
        ) : null}

        {blockingActionStateId !== null ? (
          <DeferredChromeSection testId="shell.blocking_progress.loading">
            <LazyBlockingActionProgressModal
              actionStateId={blockingActionStateId}
              tracked={blockingTracked}
              onClose={() => setBlockingActionStateId(null)}
              onOpenTasks={openTasks}
            />
          </DeferredChromeSection>
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="mx-auto flex min-h-screen max-w-screen-2xl flex-col">
            <ImpersonationBanner />
            <AppHeader
              t={i18n.t}
              mode={mode}
              canSwitchMode={canSwitchMode}
              shortcutHint={shortcutHint}
              onOpenMobileNav={() => setMobileNavOpen(true)}
              showSyncIndicator={showSyncIndicator}
              syncRef={syncRef}
              syncOpen={syncOpen}
              setSyncOpen={setSyncOpen}
              syncStatus={syncStatus === 'offline' ? 'offline' : 'error'}
              syncTitle={syncTitle}
              syncBody={syncBody}
              syncError={syncError}
              onRetrySync={retrySync}
              tasksFailedCount={tasksFailedCount}
              tasksActiveCount={tasksActiveCount}
              onOpenTasks={openTasks}
              userMenuRef={userMenuRef}
              userMenuOpen={userMenuOpen}
              setUserMenuOpen={setUserMenuOpen}
              authLogin={auth.user?.login}
              authRole={auth.role ? String(auth.role) : undefined}
              sessionExpiresAt={auth.sessionExpiresAt}
              theme={ui.settings.theme}
              language={ui.settings.language}
              onSetTheme={ui.setTheme}
              onSetLanguage={ui.setLanguage}
              onGoToOtherMode={goToOtherMode}
              onGoToProfile={() => navigate(`${basePath}/profile`)}
              onGoToPublicStatus={() => navigate('/')}
              loginLogoutHref={loginLogoutHref}
            />

            <main className="flex-1 p-4" data-testid="shell.main" data-document-title-region>
              <div className="space-y-4">
                <ContextualHelpPanel pathname={location.pathname} scope={mode} />
                {props.children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </ChromeContextProvider>
  );
}
