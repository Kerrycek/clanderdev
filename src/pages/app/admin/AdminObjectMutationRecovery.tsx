import React, { useEffect, useRef, useState } from 'react';

import { useI18n } from '../../../app/i18n';
import { useChrome } from '../../../components/layout/ChromeContext';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { classifyError } from '../../../lib/errorMapping';
import type { ObjectRef } from '../../../lib/objectRef';

type FreshResult = { data?: unknown; error?: unknown; isError: boolean; fetchStatus?: string };

export function AdminObjectMutationRecovery(props: {
  object: ObjectRef | null;
  refetchObject: () => Promise<FreshResult>;
  refetchChains: () => Promise<FreshResult>;
  online: boolean;
  allowTerminalNotFound?: boolean;
  testIdPrefix: string;
}) {
  const { t } = useI18n();
  const chrome = useChrome();
  const onlineRef = useRef(props.online); onlineRef.current = props.online;
  const lock = props.object
    ? (chrome.localLocks ?? []).find((candidate) => candidate.kind === props.object?.kind
      && candidate.id === props.object.id && (candidate.pending === true || candidate.uncertain === true))
    : undefined;
  const [reviewedGeneration, setReviewedGeneration] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifiedGeneration, setVerifiedGeneration] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<'refresh_failed' | 'still_busy' | null>(null);

  useEffect(() => {
    setReviewedGeneration(null);
    setVerifying(false);
    setVerifiedGeneration(null);
    setErrorKey(null);
  }, [lock?.pending, lock?.uncertain, lock?.uncertaintyId, props.object?.id, props.object?.kind]);

  if (!props.object || !lock) return null;
  const object = props.object;
  const pending = lock.pending === true;
  const exactGenerationReviewed = !pending && Boolean(lock.uncertaintyId)
    && reviewedGeneration === lock.uncertaintyId;
  const exactGenerationVerified = !pending && lock.uncertain === true
    && Boolean(lock.uncertaintyId) && verifiedGeneration === lock.uncertaintyId;

  const reconcileFresh = async (): Promise<'clear' | 'busy' | 'error'> => {
    if (!onlineRef.current) return 'error';
    try {
      const [freshObject, freshChains] = await Promise.all([props.refetchObject(), props.refetchChains()]);
      if (!onlineRef.current || freshObject.fetchStatus === 'paused' || freshChains.fetchStatus === 'paused'
        || freshChains.isError || !Array.isArray(freshChains.data)) return 'error';
      if (freshChains.data.length > 0) return 'busy';
      const exactId = typeof freshObject.data === 'object' && freshObject.data !== null
        ? Number((freshObject.data as { id?: unknown }).id)
        : Number.NaN;
      const terminalNotFound = props.allowTerminalNotFound === true && freshObject.isError
        && classifyError(freshObject.error).kind === 'not_found';
      return (!freshObject.isError && exactId === object.id) || terminalNotFound ? 'clear' : 'error';
    } catch {
      return 'error';
    }
  };

  const handleReconcileResult = (result: 'clear' | 'busy' | 'error', generation: string) => {
    if (result === 'clear') setVerifiedGeneration(generation);
    else {
      setErrorKey(result === 'busy' ? 'still_busy' : 'refresh_failed');
      if (result === 'busy') chrome.openTasks();
    }
    return result === 'clear';
  };

  const verify = async () => {
    if (!exactGenerationReviewed || verifying || !lock.uncertaintyId) return;
    const generation = lock.uncertaintyId;
    setVerifying(true); setVerifiedGeneration(null); setErrorKey(null);
    const clear = handleReconcileResult(await reconcileFresh(), generation);
    if (!clear) setVerifiedGeneration(null);
    setVerifying(false);
  };

  const acknowledge = async () => {
    if (!exactGenerationVerified || !lock.uncertaintyId || verifying) return;
    const generation = lock.uncertaintyId;
    setVerifying(true); setVerifiedGeneration(null); setErrorKey(null);
    if (handleReconcileResult(await reconcileFresh(), generation)) {
      chrome.acknowledgeUncertainLocalLock(object, generation);
    }
    setVerifying(false);
  };

  return (
    <Alert
      testId={`${props.testIdPrefix}.${pending ? 'pending' : 'uncertain'}`}
      variant="warn"
      title={t(pending ? 'vps.mutation.pending.title' : 'vps.mutation.uncertain.title')}
    >
      <div>{t(pending ? 'vps.mutation.pending.body' : 'vps.mutation.uncertain.body')}</div>
      {errorKey ? (
        <div data-testid={`${props.testIdPrefix}.error`} className="mt-2 text-danger">
          {t(`vps.mutation.uncertain.${errorKey}`)}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button testId={`${props.testIdPrefix}.open_tasks`} size="sm" variant="secondary" onClick={() => {
          setReviewedGeneration(lock.uncertaintyId ?? null);
          chrome.openTasks();
        }}>
          {t('common.open_tasks')}
        </Button>
        {!pending ? (
          <Button testId={`${props.testIdPrefix}.verify`} size="sm" variant="secondary"
            disabled={!exactGenerationReviewed || verifying} loading={verifying} onClick={() => void verify()}>
            {t('common.refresh')}
          </Button>
        ) : null}
        <Button testId={`${props.testIdPrefix}.acknowledge`} size="sm" variant="secondary"
          disabled={!exactGenerationVerified || verifying} onClick={() => void acknowledge()}>
          {t('vps.mutation.uncertain.acknowledge')}
        </Button>
      </div>
    </Alert>
  );
}
