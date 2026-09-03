import React, { useEffect, useState } from 'react';

import { useI18n } from '../../app/i18n';
import type { LocalLock } from '../../lib/localLocks';
import type { ObjectRef } from '../../lib/objectRef';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { useChrome } from './ChromeContext';

export type MutationReconcileResult = 'clear' | 'busy' | 'error';

export function MutationUncertaintyPanel(props: {
  object: ObjectRef;
  lock?: LocalLock;
  reconcile: () => Promise<MutationReconcileResult>;
  testIdPrefix?: string;
}) {
  const { t } = useI18n();
  const chrome = useChrome();
  const [reviewStarted, setReviewStarted] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<'refresh_failed' | 'still_busy' | null>(null);
  const testIdPrefix = props.testIdPrefix ?? 'vps.mutation.uncertain';

  useEffect(() => {
    setReviewStarted(false);
    setPending(false);
    setErrorKey(null);
  }, [props.lock?.uncertaintyId, props.object.id]);

  if (!props.lock) return null;

  const acknowledge = async () => {
    if (!reviewStarted || pending) return;
    setPending(true);
    setErrorKey(null);
    const result = await props.reconcile();
    if (result !== 'clear') {
      setErrorKey(result === 'busy' ? 'still_busy' : 'refresh_failed');
      setPending(false);
      if (result === 'busy') chrome.openTasks();
      return;
    }
    chrome.acknowledgeUncertainLocalLock(props.object, props.lock?.uncertaintyId);
    setReviewStarted(false);
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
            setReviewStarted(true);
            chrome.openTasks();
          }}
        >
          {t('common.open_tasks')}
        </Button>
        <Button
          testId={`${testIdPrefix}.acknowledge`}
          size="sm"
          variant="secondary"
          disabled={!reviewStarted || pending}
          onClick={() => void acknowledge()}
        >
          {pending ? t('common.loading') : t('vps.mutation.uncertain.acknowledge')}
        </Button>
      </div>
    </Alert>
  );
}
