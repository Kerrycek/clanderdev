import { useEffect, useMemo, useRef } from 'react';
import { useQueries } from '@tanstack/react-query';

import { useToasts } from '../../app/toasts';
import { useI18n } from '../../app/i18n';
import { useDocumentVisibility } from '../../lib/useDocumentVisibility';
import { actionStatePollIntervalMs, tierAIntervalMs } from '../../lib/refreshTiers';
import { fetchActionState, type ActionState } from '../../lib/api/actionStates';
import { fetchTransactionChain, type TransactionChain } from '../../lib/api/transactions';
import {
  isFailingActionState,
  isFailedChainState,
  isFinishedActionState,
  isFinishedChainState,
} from '../../lib/taskStatus';
import { extractRelatedTransactionChainIdFromActionState } from '../../lib/taskLinks';
import { classifyActionState, operationLabel } from '../../lib/operationTaxonomy';
import type { TrackedActionState } from './ChromeContext';

function uniqPositiveInts(list: number[], max: number): number[] {
  const set = new Set<number>();
  for (const v of list) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) continue;
    set.add(Math.floor(n));
    if (set.size >= max) break;
  }
  return Array.from(set);
}

export function shouldReplayFinishedLockCallback(
  actionStateId: number,
  finished: boolean,
  lockActionStateIds: readonly number[],
  deliveredIds: ReadonlySet<number>,
  previouslyFinished?: boolean
): boolean {
  return finished
    && previouslyFinished !== false
    && lockActionStateIds.includes(actionStateId)
    && !deliveredIds.has(actionStateId);
}

function safeActionLabel(opts: {
  tracked: TrackedActionState;
  actionState?: ActionState | undefined;
  t: (k: any, vars?: any) => string;
}): string {
  const { tracked, actionState, t } = opts;

  if (tracked.actionLabelKey) {
    try {
      const v = t(tracked.actionLabelKey as any);
      if (v) return v;
    } catch {
      // ignore; fall back
    }
  }

  if (tracked.actionLabel) return tracked.actionLabel;
  if (actionState) return operationLabel(classifyActionState(actionState), t);

  const label = actionState && (actionState as any).label ? String((actionState as any).label) : '';
  if (label) return label;

  return t('toast.unknown_action');
}

function safeObjectLabel(opts: { tracked: TrackedActionState; actionState?: ActionState | undefined }): string | null {
  if (opts.tracked.objectLabel) return opts.tracked.objectLabel;

  // Best-effort heuristic: some backends include object labels in the action state label.
  // We do not attempt to parse it reliably here.
  return null;
}

/**
 * Global in-app toast notifications for task completion.
 *
 * - Notifies only for explicit tasks the UI is tracking (action states)
 * - Optionally watches related transaction chains for failure to reduce surprises
 * - Can also watch action_state_id values referenced by local transition locks,
 *   so we can release those locks even if the user dismisses the task from the UI.
 */
export function useTaskCompletionToasts(opts: {
  trackedActionStates: TrackedActionState[];
  pinnedTransactionChains: number[];
  /** Optional extra action_state_id values to watch (e.g. local lock bindings). */
  lockActionStateIds?: number[];
  onOpenTasks: () => void;
  /** Called when a watched action state is observed as finished. */
  onActionFinished?: (
    actionStateId: number,
    info: { failed: boolean; actionState?: ActionState; transactionChainId?: number | null }
  ) => void;
}) {
  const { trackedActionStates, pinnedTransactionChains, onOpenTasks, lockActionStateIds, onActionFinished } = opts;
  const { t } = useI18n();
  const toasts = useToasts();

  const docVisible = useDocumentVisibility();
  const actionPollMs = actionStatePollIntervalMs(docVisible);
  const chainPollMs = tierAIntervalMs(docVisible);

  const trackedIds = useMemo(
    () => uniqPositiveInts(trackedActionStates.map((x) => x.id), 40).sort((a, b) => b - a),
    [trackedActionStates]
  );

  const lockIds = useMemo(
    () => uniqPositiveInts(lockActionStateIds ?? [], 40).sort((a, b) => b - a),
    [lockActionStateIds]
  );

  const watchedActionIds = useMemo(
    () => uniqPositiveInts([...trackedIds, ...lockIds], 60).sort((a, b) => b - a),
    [trackedIds, lockIds]
  );

  const actionQs = useQueries({
    queries: watchedActionIds.map((id) => ({
      queryKey: ['action_state', 'show', { id }],
      queryFn: async () => (await fetchActionState(id)).data,
      enabled: Number.isFinite(id) && id > 0,
      // While active, keep polling. We keep this simple for now.
      refetchInterval: actionPollMs,
    })),
  });

  const actionStateById = useMemo(() => {
    const map = new Map<number, ActionState>();
    for (let i = 0; i < watchedActionIds.length; i++) {
      const id = watchedActionIds[i];
      if (id === undefined) continue;
      const s = actionQs[i]?.data as any as ActionState | undefined;
      if (!s) continue;
      map.set(id, s);
    }
    return map;
  }, [actionQs, watchedActionIds]);

  const trackedById = useMemo(() => {
    const map = new Map<number, TrackedActionState>();
    for (const x of trackedActionStates) {
      const id = Number(x.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      // Keep the most recent metadata.
      if (!map.has(id) || Number(map.get(id)!.addedAt) < Number(x.addedAt)) map.set(id, x);
    }
    return map;
  }, [trackedActionStates]);

  // Related chains are best-effort; we mostly want to notify on failures.
  const derivedChainIds = useMemo(() => {
    const ids: number[] = [];
    for (const id of trackedIds) {
      const s = actionStateById.get(id);
      if (!s) continue;
      const chainId = extractRelatedTransactionChainIdFromActionState(s);
      if (chainId && chainId > 0) ids.push(chainId);
    }
    return uniqPositiveInts(ids, 20);
  }, [actionStateById, trackedIds]);

  const pinnedChainIds = useMemo(() => uniqPositiveInts(pinnedTransactionChains, 30), [pinnedTransactionChains]);
  const watchedChainIds = useMemo(
    () => uniqPositiveInts([...pinnedChainIds, ...derivedChainIds], 40),
    [pinnedChainIds, derivedChainIds]
  );
  const watchedChainIdsSorted = useMemo(() => [...watchedChainIds].sort((a, b) => b - a), [watchedChainIds]);

  const chainQs = useQueries({
    queries: watchedChainIdsSorted.map((id) => ({
      queryKey: ['transaction_chains', 'show', { id }],
      queryFn: async () => (await fetchTransactionChain(id)).data,
      enabled: Number.isFinite(id) && id > 0,
      refetchInterval: chainPollMs,
    })),
  });

  const prevActionRef = useRef(new Map<number, { finished: boolean; failing: boolean }>());
  const finishedLockCallbacksRef = useRef(new Set<number>());
  const prevChainRef = useRef(new Map<number, { finished: boolean; failed: boolean }>());
  const notifiedRef = useRef(new Set<string>());

  useEffect(() => {
    // Action state toasts + lock release callbacks.
    for (let i = 0; i < watchedActionIds.length; i++) {
      const id = watchedActionIds[i];
      if (id === undefined) continue;
      const q = actionQs[i];
      const s = q?.data as any as ActionState | undefined;
      if (!s) continue;

      const finished = isFinishedActionState(s);
      const failing = isFailingActionState(s);

      const prev = prevActionRef.current.get(id);
      const replayFinishedLock = shouldReplayFinishedLockCallback(
        id, finished, lockIds, finishedLockCallbacksRef.current, prev?.finished
      );
      if (replayFinishedLock && onActionFinished) {
        finishedLockCallbacksRef.current.add(id);
        onActionFinished(id, {
          failed: failing,
          actionState: s,
          transactionChainId: extractRelatedTransactionChainIdFromActionState(s),
        });
      }
      if (!prev) {
        prevActionRef.current.set(id, { finished, failing });

        // If the action is already finished when we start observing it (e.g. after reload),
        // still fire the callback so local locks can be released.
        if (finished && onActionFinished && !replayFinishedLock) {
          if (lockIds.includes(id)) finishedLockCallbacksRef.current.add(id);
          onActionFinished(id, {
            failed: failing,
            actionState: s,
            transactionChainId: extractRelatedTransactionChainIdFromActionState(s),
          });
        }

        continue;
      }

      // Notify only on transition to finished.
      if (!prev.finished && finished) {
        if (onActionFinished) {
          if (lockIds.includes(id)) finishedLockCallbacksRef.current.add(id);
          onActionFinished(id, {
            failed: failing,
            actionState: s,
            transactionChainId: extractRelatedTransactionChainIdFromActionState(s),
          });
        }

        const isTracked = trackedById.has(id);
        if (isTracked) {
          const tracked = trackedById.get(id) ?? { id, addedAt: Date.now() };
          const actionLabel = safeActionLabel({ tracked, actionState: s, t });
          const objectLabel = safeObjectLabel({ tracked, actionState: s });

          const isFailed = failing;
          const title = isFailed
            ? t('toast.task_failed.title', { action: actionLabel })
            : t('toast.task_done.title', { action: actionLabel });

          const bodyParts: string[] = [];
          if (!isFailed && objectLabel) bodyParts.push(t('toast.task_done.body', { object: objectLabel }));
          if (isFailed) bodyParts.push(t('toast.task_failed.body'));

          bodyParts.push(`#${id}`);

          const body = bodyParts.filter(Boolean).join(bodyParts.length > 1 ? ' · ' : '');

          // De-dup within a session in case the polling crosses re-mount boundaries.
          const dedupKey = `action:${id}:${isFailed ? 'failed' : 'done'}`;
          if (!notifiedRef.current.has(dedupKey)) {
            notifiedRef.current.add(dedupKey);
            toasts.pushToast({
              variant: isFailed ? 'danger' : 'ok',
              title,
              body,
              action: {
                label: t('common.open_tasks'),
                onClick: onOpenTasks,
                testId: `toast.action.open_tasks.${id}`,
              },
            });
          }
        }
      }

      prevActionRef.current.set(id, { finished, failing });
    }
  }, [actionQs, lockIds, onOpenTasks, t, toasts, trackedById, watchedActionIds, onActionFinished]);

  useEffect(() => {
    // Transaction chain toasts
    for (let i = 0; i < watchedChainIdsSorted.length; i++) {
      const id = watchedChainIdsSorted[i];
      if (id === undefined) continue;
      const q = chainQs[i];
      const c = q?.data as any as TransactionChain | undefined;
      if (!c) continue;

      const finished = isFinishedChainState(c.state);
      const failed = isFailedChainState(c.state);

      const prev = prevChainRef.current.get(id);
      if (!prev) {
        prevChainRef.current.set(id, { finished, failed });
        continue;
      }

      if (!prev.finished && finished) {
        // Only toast completion for explicitly pinned chains; derived chains only notify on failure.
        const isPinned = pinnedChainIds.includes(id);
        const shouldNotify = failed || isPinned;
        if (shouldNotify) {
          const label = c.label ? String(c.label) : t('tasks.meta.chain', { id });
          const title = failed
            ? t('toast.task_failed.title', { action: label })
            : t('toast.task_done.title', { action: label });

          const body = `#${id}`;

          const dedupKey = `chain:${id}:${failed ? 'failed' : 'done'}`;
          if (!notifiedRef.current.has(dedupKey)) {
            notifiedRef.current.add(dedupKey);
            toasts.pushToast({
              variant: failed ? 'danger' : 'ok',
              title,
              body,
              action: {
                label: t('common.open_tasks'),
                onClick: onOpenTasks,
                testId: `toast.chain.open_tasks.${id}`,
              },
            });
          }
        }
      }

      prevChainRef.current.set(id, { finished, failed });
    }
  }, [chainQs, watchedChainIdsSorted, pinnedChainIds, onOpenTasks, t, toasts]);
}
