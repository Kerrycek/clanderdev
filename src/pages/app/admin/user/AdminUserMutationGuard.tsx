import React, { useEffect, useMemo, useState } from 'react';

import { useI18n } from '../../../../app/i18n';
import { useChrome } from '../../../../components/layout/ChromeContext';
import { Alert } from '../../../../components/ui/Alert';
import { Button } from '../../../../components/ui/Button';
import { objectRef, type ObjectRef } from '../../../../lib/objectRef';
import type { LocalMutationGeneration } from '../../../../lib/localLocks';

type AdminUserMutationContext = { lockRef: ObjectRef; mutationGeneration: LocalMutationGeneration };

export function useAdminUserLifetimeMutationGuard(userId: number) {
  const chrome = useChrome();
  const userRef = useMemo(() => objectRef('User', userId), [userId]);

  return {
    locked: chrome.isLocallyLocked(userRef),
    acquire: async (targetUserId: number) => {
      const lockRef = objectRef('User', targetUserId);
      const mutationGeneration = await chrome.acquireLocalLock(lockRef, { durable: true });
      return { lockRef, mutationGeneration };
    },
    settle: (error: unknown, context?: AdminUserMutationContext) => (
      context && chrome.settleLocalLock(context.lockRef, error, context.mutationGeneration)
    ),
    track: (
      actionStateId: number,
      actionLabel: string,
      objectLabel: string,
      context?: AdminUserMutationContext
    ) => {
      chrome.trackActionState(actionStateId, {
        actionLabel,
        objectLabel,
        object: context?.lockRef,
        mutationGeneration: context?.mutationGeneration,
      });
    },
  };
}

export function AdminUserMutationGuardAlert(props: {
  userId: number;
  refetch: () => Promise<void>;
}) {
  const { t } = useI18n();
  const chrome = useChrome();
  const userRef = useMemo(() => objectRef('User', props.userId), [props.userId]);
  const lock = chrome.localLocks.find(
    (candidate) => candidate.kind === userRef.kind
      && candidate.id === userRef.id
      && (candidate.pending === true || candidate.uncertain === true)
  );
  const [reviewStarted, setReviewStarted] = useState(false);
  const [refreshComplete, setRefreshComplete] = useState(false);
  const [refreshPending, setRefreshPending] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    setReviewStarted(false);
    setRefreshComplete(false);
    setRefreshPending(false);
    setRefreshError(null);
  }, [lock?.pending, lock?.uncertain, lock?.uncertaintyId]);

  if (!lock) return null;

  const refreshOutcome = async () => {
    if (refreshPending) return;
    setRefreshPending(true);
    setRefreshComplete(false);
    setRefreshError(null);
    try {
      await props.refetch();
      setRefreshComplete(true);
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : t('admin.user.mutation.refresh_failed'));
    } finally {
      setRefreshPending(false);
    }
  };

  const acknowledgeOutcome = () => {
    if (lock.uncertain !== true || !reviewStarted || !refreshComplete || refreshPending) return;
    chrome.acknowledgeUncertainLocalLock(userRef, lock.uncertaintyId);
  };

  const pending = lock.pending === true;

  return (
    <div className="lg:col-span-2">
      <Alert
        testId={pending ? 'admin.user.mutation.pending' : 'admin.user.mutation.uncertain'}
        variant="warn"
        title={t(pending
          ? 'admin.user.mutation.pending.title'
          : 'admin.user.mutation.uncertain.title')}
      >
        <div>
          {t(pending
            ? 'admin.user.mutation.pending.body'
            : 'admin.user.mutation.uncertain.body')}
        </div>
        {refreshError ? (
          <div className="mt-2 text-danger" data-testid="admin.user.mutation.refresh_error">
            {refreshError}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            testId="admin.user.mutation.open_tasks"
            size="sm"
            variant="secondary"
            onClick={() => {
              setReviewStarted(true);
              chrome.openTasks();
            }}
          >
            {t('common.open_tasks')}
          </Button>
          <Button
            testId="admin.user.mutation.refresh"
            size="sm"
            variant="secondary"
            loading={refreshPending}
            onClick={() => void refreshOutcome()}
          >
            {t('common.refresh')}
          </Button>
          {lock.uncertain === true ? (
            <Button
              testId="admin.user.mutation.acknowledge"
              size="sm"
              variant="secondary"
              disabled={!reviewStarted || !refreshComplete || refreshPending}
              onClick={acknowledgeOutcome}
            >
              {t('admin.user.mutation.acknowledge')}
            </Button>
          ) : null}
        </div>
      </Alert>
    </div>
  );
}
