import React, { useEffect, useRef, useState } from 'react';

import { useI18n } from '../../../app/i18n';
import {
  MutationUncertaintyPanel,
  type ManualMutationReconcileResult,
} from '../../../components/layout/MutationUncertaintyPanel';
import { useChrome } from '../../../components/layout/ChromeContext';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import {
  normalizeLocalMutationIntent,
  type LocalLock,
} from '../../../lib/localLocks';
import type { ObjectRef } from '../../../lib/objectRef';

export function DatasetSnapshotRollbackUncertaintyPanel(props: {
  object: ObjectRef;
  lock?: LocalLock;
  reconcile: () => Promise<ManualMutationReconcileResult>;
}) {
  const { t } = useI18n();
  const chrome = useChrome();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmGeneration, setConfirmGeneration] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [errorKey, setErrorKey] = useState<'refresh_failed' | 'still_busy' | null>(null);
  const currentGenerationRef = useRef(props.lock?.uncertaintyId);
  currentGenerationRef.current = props.lock?.uncertaintyId;
  const normalizedIntent = normalizeLocalMutationIntent(props.lock?.intent);
  const intent = normalizedIntent?.type === 'dataset-snapshot-rollback'
    ? normalizedIntent
    : null;
  const expectedConfirmation = intent ? String(intent.snapshotId) : '';

  useEffect(() => {
    setConfirmOpen(false);
    setConfirmGeneration(null);
    setConfirmation('');
    setConfirming(false);
    setErrorKey(null);
  }, [props.lock?.uncertaintyId, props.object.id]);

  const closeConfirm = () => {
    if (confirming) return;
    setConfirmOpen(false);
    setConfirmGeneration(null);
    setConfirmation('');
    setErrorKey(null);
  };

  const unlock = async () => {
    if (!intent
      || !confirmGeneration
      || confirmGeneration !== currentGenerationRef.current
      || confirmation !== expectedConfirmation
      || confirming) return;
    setConfirming(true);
    setErrorKey(null);
    const result = await props.reconcile();
    if (result !== 'manual' || confirmGeneration !== currentGenerationRef.current) {
      setErrorKey(result === 'busy' ? 'still_busy' : 'refresh_failed');
      setConfirming(false);
      if (result === 'busy') chrome.openTasks();
      return;
    }
    chrome.acknowledgeUncertainLocalLock(props.object, confirmGeneration);
    setConfirming(false);
    setConfirmOpen(false);
    setConfirmGeneration(null);
    setConfirmation('');
  };

  return (
    <>
      <MutationUncertaintyPanel
        object={props.object}
        lock={props.lock}
        reconcile={props.reconcile}
        onManualConfirm={() => {
          const generation = props.lock?.uncertaintyId;
          if (!intent || !generation || generation !== currentGenerationRef.current) return;
          setConfirmGeneration(generation);
          setConfirmation('');
          setErrorKey(null);
          setConfirmOpen(true);
        }}
        testIdPrefix="dataset.snapshots.rollback_uncertain"
      />
      <Modal
        open={confirmOpen && intent !== null}
        onClose={closeConfirm}
        title={t('dataset.snapshots.rollback_guard.title')}
        testId="dataset.snapshots.rollback_guard.confirm"
        size="sm"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              onClick={closeConfirm}
              disabled={confirming}
              testId="dataset.snapshots.rollback_guard.cancel"
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={confirmation !== expectedConfirmation || confirming}
              loading={confirming}
              onClick={() => void unlock()}
              testId="dataset.snapshots.rollback_guard.unlock"
            >
              {t('dataset.snapshots.rollback_guard.unlock')}
            </Button>
          </div>
        }
      >
        {intent ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              {t('dataset.snapshots.rollback_guard.body', {
                label: intent.snapshotLabel,
                id: intent.snapshotId,
              })}
            </p>
            <Alert variant="danger" title={t('dataset.snapshots.rollback_guard.risk_title')}>
              {t('dataset.snapshots.rollback_guard.risk_body')}
            </Alert>
            {errorKey ? (
              <div data-testid="dataset.snapshots.rollback_guard.error" className="text-sm text-danger">
                {t(`vps.mutation.uncertain.${errorKey}`)}
              </div>
            ) : null}
            <Input
              label={t('confirm.type_to_confirm', { value: expectedConfirmation })}
              ariaLabel={t('confirm.type_to_confirm', { value: expectedConfirmation })}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              inputMode="numeric"
              autoComplete="off"
              disabled={confirming}
              testId="dataset.snapshots.rollback_guard.input"
            />
          </div>
        ) : null}
      </Modal>
    </>
  );
}
