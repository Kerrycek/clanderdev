import React, { useEffect, useState } from 'react';

import { useI18n } from '../../app/i18n';
import type { LocalLock } from '../../lib/localLocks';
import type { ObjectRef } from '../../lib/objectRef';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { useChrome } from './ChromeContext';

export type MutationReconcileResult = 'clear' | 'busy' | 'error';
export type ManualMutationReconcileResult = MutationReconcileResult | 'manual';

type MutationUncertaintyPanelProps = {
  object: ObjectRef;
  lock?: LocalLock;
  testIdPrefix?: string;
} & ({
  reconcile: () => Promise<ManualMutationReconcileResult>;
  onManualConfirm: () => void;
} | {
  reconcile: () => Promise<MutationReconcileResult>;
  onManualConfirm?: undefined;
});

export function MutationUncertaintyPanel(props: MutationUncertaintyPanelProps) {
  const { t } = useI18n();
  const chrome = useChrome();
  const [reviewedGeneration, setReviewedGeneration] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<'refresh_failed' | 'still_busy' | null>(null);
  const testIdPrefix = props.testIdPrefix ?? 'vps.mutation.uncertain';

  useEffect(() => {
    setReviewedGeneration(null);
    setPending(false);
    setErrorKey(null);
  }, [props.lock?.uncertaintyId, props.object.id]);

  if (!props.lock) return null;

  const acknowledge = async () => {
    const generation = props.lock?.uncertaintyId;
    if (!generation || reviewedGeneration !== generation || pending) return;
    setPending(true);
    setErrorKey(null);
    const result = await props.reconcile();
    if (result === 'manual') {
      setPending(false);
      if (props.onManualConfirm) props.onManualConfirm();
      else setErrorKey('refresh_failed');
      return;
    }
    if (result !== 'clear') {
      setErrorKey(result === 'busy' ? 'still_busy' : 'refresh_failed');
      setPending(false);
      if (result === 'busy') chrome.openTasks();
      return;
    }
    chrome.acknowledgeUncertainLocalLock(props.object, generation);
    setReviewedGeneration(null);
    setPending(false);
  };

  return (
    <Alert testId={testIdPrefix} variant="warn" title={t('vps.mutation.uncertain.title')}>
      <div>{t('vps.mutation.uncertain.body')}</div>
      {errorKey ? (
        <div data-testid={`${testIdPrefix}.error`} className="mt-2 text-danger">
          {t(`vps.mutation.uncertain.${errorKey}`)}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          testId={`${testIdPrefix}.open_tasks`}
          size="sm"
          variant="secondary"
          onClick={() => {
            setReviewedGeneration(props.lock?.uncertaintyId ?? null);
            chrome.openTasks();
          }}
        >
          {t('common.open_tasks')}
        </Button>
        <Button
          testId={`${testIdPrefix}.acknowledge`}
          size="sm"
          variant="secondary"
          disabled={!props.lock?.uncertaintyId
            || reviewedGeneration !== props.lock.uncertaintyId
            || pending}
          onClick={() => void acknowledge()}
        >
          {pending ? t('common.loading') : t('vps.mutation.uncertain.acknowledge')}
        </Button>
      </div>
    </Alert>
  );
}
