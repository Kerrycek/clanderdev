import React, { useState } from 'react';

import { useI18n } from '../../../app/i18n';
import { Alert } from '../../../components/ui/Alert';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { Input } from '../../../components/ui/Input';
import type { Snapshot } from '../../../lib/api/datasets';
import type { GateDecision } from '../../../lib/gates/types';

export type DatasetSnapshotConfirmState =
  | null
  | {
      kind: 'rollback' | 'delete';
      snapshot: Snapshot;
    };

export function datasetSnapshotLabel(snapshot: Snapshot): string {
  const label = String(snapshot.label ?? '').trim();
  if (label) return label;
  const name = String(snapshot.name ?? '').trim();
  return name || `#${snapshot.id}`;
}

export function DatasetSnapshotConfirmDialog(props: {
  confirm: DatasetSnapshotConfirmState;
  gate: GateDecision | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (confirm: Exclude<DatasetSnapshotConfirmState, null>) => void;
}) {
  const { t } = useI18n();
  const [rollbackConfirmation, setRollbackConfirmation] = useState('');
  const confirmationValue = props.confirm?.kind === 'rollback'
    ? datasetSnapshotLabel(props.confirm.snapshot)
    : '';
  const confirmationMatches = props.confirm?.kind !== 'rollback'
    || rollbackConfirmation === confirmationValue;
  const testId = props.confirm?.kind === 'rollback'
    ? 'dataset.snapshots.rollback_confirm'
    : props.confirm?.kind === 'delete'
      ? 'dataset.snapshots.delete_confirm'
      : undefined;

  return (
    <ConfirmDialog
      open={props.confirm !== null}
      testId={testId}
      title={props.confirm?.kind === 'rollback'
        ? t('dataset.snapshots.confirm.rollback.title')
        : props.confirm?.kind === 'delete'
          ? t('dataset.snapshots.confirm.delete.title')
          : ''}
      description={props.confirm?.kind === 'rollback'
        ? t('dataset.snapshots.confirm.rollback.body', { snapshot: confirmationValue })
        : props.confirm?.kind === 'delete'
          ? t('dataset.snapshots.confirm.delete.body', {
              snapshot: datasetSnapshotLabel(props.confirm.snapshot),
            })
          : ''}
      confirmLabel={props.confirm?.kind === 'rollback' ? t('common.rollback') : t('common.delete')}
      danger
      confirmLoading={props.busy}
      confirmDisabled={props.busy || !confirmationMatches || (props.gate ? !props.gate.allowed : false)}
      cancelDisabled={props.busy}
      onCancel={props.onCancel}
      onConfirm={() => {
        if (!props.confirm || props.busy || !confirmationMatches || (props.gate && !props.gate.allowed)) return;
        props.onConfirm(props.confirm);
      }}
    >
      {props.confirm?.kind === 'rollback' ? (
        <Input
          label={t('confirm.type_to_confirm', { value: confirmationValue })}
          ariaLabel={t('confirm.type_to_confirm', { value: confirmationValue })}
          value={rollbackConfirmation}
          onChange={(event) => setRollbackConfirmation(event.target.value)}
          autoComplete="off"
          disabled={props.busy}
          testId="dataset.snapshots.rollback_confirm.input"
        />
      ) : null}

      {props.gate && !props.gate.allowed && props.gate.reason ? (
        <Alert title={t(props.gate.reason.titleKey)} variant="warn">
          {props.gate.reason.descriptionKey ? t(props.gate.reason.descriptionKey) : null}
        </Alert>
      ) : null}

      {props.error ? (
        <Alert title={t('common.action_failed')} variant="danger">
          {props.error}
        </Alert>
      ) : null}
    </ConfirmDialog>
  );
}
