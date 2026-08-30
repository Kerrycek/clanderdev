import React from 'react';

import { useI18n } from '../../../app/i18n';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { isMissingActionStateError } from '../../../lib/api/haveapi';

export function VpsCreateOutcomeAlert(props: {
  phase: 'uncertain' | 'accepted';
  error: unknown;
  actionStateId?: number;
  reviewed: boolean;
  reviewPending: boolean;
  reviewError?: string | null;
  candidateVpsId?: number | null;
  onReview?: () => void;
  onAcknowledge?: () => void;
}) {
  const { t } = useI18n();
  const accepted = props.phase === 'accepted';
  return (
    <Alert
      variant={accepted ? 'info' : 'danger'}
      title={t(accepted ? 'vps.create.accepted.title' : 'vps.create.error.title')}
      testId={accepted ? 'vps.create.accepted' : 'vps.create.error'}
    >
      {accepted ? (
        <div>{t('vps.create.accepted.body', { id: props.actionStateId ?? '—' })}</div>
      ) : (
        <>
          {isMissingActionStateError(props.error) ? <div>{t('vps.create.error.missing_action_state')}</div> : null}
          <div>{t('vps.create.error.outcome_uncertain')}</div>
        </>
      )}
      {props.candidateVpsId ? (
        <div className="mt-2 font-medium" data-testid="vps.create.uncertain.candidate">
          {t('vps.create.error.reconcile_candidate', { id: props.candidateVpsId })}
        </div>
      ) : null}
      {props.reviewError ? (
        <div className="mt-2 text-danger" data-testid="vps.create.uncertain.review_error">
          {props.reviewError}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          testId="vps.create.uncertain.open_tasks"
          size="sm"
          variant="secondary"
          loading={props.reviewPending}
          onClick={props.onReview}
        >
          {t('common.open_tasks')}
        </Button>
        <Button
          testId="vps.create.uncertain.acknowledge"
          size="sm"
          variant="secondary"
          disabled={!props.reviewed || props.reviewPending}
          onClick={props.onAcknowledge}
        >
          {props.candidateVpsId ? t('vps.create.error.open_candidate') : t('vps.create.error.acknowledge')}
        </Button>
      </div>
    </Alert>
  );
}
