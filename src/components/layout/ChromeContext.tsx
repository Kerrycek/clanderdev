import React, { createContext, useContext } from 'react';

import type { TranslationKey } from '../../app/i18n';
import type { ObjectRef } from '../../lib/objectRef';
import type {
  AcquireLocalMutationLock,
  LocalLock,
  LocalMutationGeneration,
} from '../../lib/localLocks';

export interface TrackedActionState {
  id: number;
  /** When this action state was first tracked by this browser session */
  addedAt: number;

  /** Optional i18n key for stable action naming in notifications (e.g. `action.vps.start.label`). */
  actionLabelKey?: string;
  /** Optional fallback label when actionLabelKey is not available. */
  actionLabel?: string;
  /** Optional label of the affected object (e.g. hostname). */
  objectLabel?: string;

  /** Optional object reference for live refresh (best-effort). */
  object?: ObjectRef;

  /**
   * When true, the UI may open a (dismissible) blocking progress modal for this action.
   * This is intended for actions where users often want to wait for completion (e.g. start/stop/restart).
   */
  blockUi?: boolean;

  /** Optional i18n title key to use for the blocking progress modal. */
  progressTitleKey?: TranslationKey;
}

export interface ChromeContextValue {
  // ----------------------
  // Background sync health
  // ----------------------

  /**
   * Global background refresh status (Tier A queries).
   *
   * - ok: background polling is healthy
   * - offline: browser reports offline
   * - error: background queries failed (data may be stale)
   */
  syncStatus: 'ok' | 'offline' | 'error';
  /** Best-effort last error from Tier A polling (if any). */
  syncError: unknown | null;
  /** Manually refetch Tier A background queries. */
  retrySync: () => void;

  openTasks: () => void;
  closeTasks: () => void;
  toggleTasks: () => void;

  /** Persisted pins across reloads (localStorage in AppLayout) */
  pinnedActionStates: number[];
  pinnedTransactionChains: number[];

  togglePinnedActionState: (actionStateId: number) => void;
  togglePinnedTransactionChain: (chainId: number) => void;

  /**
   * Track an action_state_id returned by the API.
   *
   * Optional metadata helps produce high-quality notifications without relying on backend labels.
   */
  trackActionState: (
    actionStateId: number,
    meta?: {
      actionLabelKey?: string;
      actionLabel?: string;
      objectLabel?: string;

      /** When provided, binds a local transition lock to this action state. */
      object?: ObjectRef;

      /** Exact durable request generation to bind to this action state. */
      mutationGeneration?: LocalMutationGeneration;

      /** Show a dismissible progress popover for this action. */
      blockUi?: boolean;

      /** Optional i18n title key for the blocking progress modal. */
      progressTitleKey?: TranslationKey;
    }
  ) => void;
  /** Remove a previously tracked action state from the Tasks UI. */
  dismissActionState: (actionStateId: number) => void;

  /** Action states started (or explicitly tracked) in this browser session */
  trackedActionStates: TrackedActionState[];

  /** Optional highlight target (e.g. last started action state) */
  highlightActionStateId?: number | null;

  // ----------------------
  // Local transition locks
  // ----------------------

  /** Active local locks shared across tabs and user/admin views for the same authenticated user. */
  localLocks: LocalLock[];

  /** Acquire/refresh a local lock for the object (typically called in mutation onMutate). */
  acquireLocalLock: AcquireLocalMutationLock;

  /**
   * Finish a mutation's local lock. Ambiguous missing-task responses retain a
   * persisted uncertainty lock; ordinary failures release the unbound lock.
   */
  settleLocalLock: (
    ref: ObjectRef,
    error: unknown,
    generation?: LocalMutationGeneration
  ) => void;

  /** Release an unbound local lock (typically called in mutation onSettled). */
  releaseLocalLock: (ref: ObjectRef) => void;

  /** Clear an ambiguous lock after the user explicitly reconciled/acknowledged the outcome. */
  acknowledgeUncertainLocalLock: (ref: ObjectRef, uncertaintyId?: string) => void;

  /** Release any lock bound to the given action_state_id (typically called when it finishes). */
  releaseLocalLocksByActionStateId: (actionStateId: number) => void;

  /** True when there is an active local lock for this object. */
  isLocallyLocked: (ref: ObjectRef) => boolean;
}

const ChromeContext = createContext<ChromeContextValue | null>(null);

export function ChromeContextProvider(props: { value: ChromeContextValue; children: React.ReactNode }) {
  return <ChromeContext.Provider value={props.value}>{props.children}</ChromeContext.Provider>;
}

export function useChrome() {
  const ctx = useContext(ChromeContext);
  if (!ctx) throw new Error('useChrome must be used within ChromeContextProvider');
  return ctx;
}
