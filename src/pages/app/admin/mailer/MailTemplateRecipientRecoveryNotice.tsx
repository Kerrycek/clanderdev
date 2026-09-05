import React, { useEffect, useState } from 'react';

import { useI18n } from '../../../../app/i18n';
import { Alert } from '../../../../components/ui/Alert';
import { Button } from '../../../../components/ui/Button';
import type { MailRecipientCreateRecovery } from './MailTemplateRecipientCreateModel';

type RecoveryNotice = MailRecipientCreateRecovery | {
  phase: 'existing_link_uncertain';
  recipientId: number;
};

export function MailTemplateRecipientRecoveryNotice(props: {
  recovery: RecoveryNotice;
  pending: boolean;
  onResetRetry: () => void;
  onUnlockUncertain: () => void;
}) {
  const { t } = useI18n();
  const [reviewConfirmOpen, setReviewConfirmOpen] = useState(false);
  useEffect(() => {
    setReviewConfirmOpen(false);
  }, [props.recovery.phase, 'recipientId' in props.recovery ? props.recovery.recipientId : null]);
  if (props.recovery.phase === 'draft') return null;

  const uncertain = props.recovery.phase !== 'link_retry';
  const titleKey = `mailer.templates.detail.recipients.modal.${props.recovery.phase}.title`;
  const bodyKey = `mailer.templates.detail.recipients.modal.${props.recovery.phase}.body`;
  const recipientId = 'recipientId' in props.recovery ? props.recovery.recipientId : undefined;
  const testId = props.recovery.phase === 'create_uncertain'
    ? 'admin.mailer.templates.detail.recipients.modal.create.uncertain'
    : props.recovery.phase === 'existing_link_uncertain'
      ? 'admin.mailer.templates.detail.recipients.modal.existing_link_uncertain'
      : `admin.mailer.templates.detail.recipients.modal.create.${props.recovery.phase}`;

  return (
    <Alert variant="warn" title={t(titleKey)} testId={testId}>
      <div className="space-y-3">
        <p>{t(bodyKey, recipientId ? { id: recipientId } : undefined)}</p>
        {uncertain && reviewConfirmOpen ? (
          <div
            className="rounded-md border border-danger-border bg-surface p-3"
            role="group"
            aria-live="polite"
            aria-label={t('mailer.recipients.create.indeterminate.reviewed_confirm.title')}
            data-testid={`${testId}.reviewed.confirmation`}
          >
            <p className="text-sm">{t('mailer.recipients.create.indeterminate.reviewed_confirm.description')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="danger"
                size="sm"
                autoFocus
                disabled={props.pending}
                onClick={props.onUnlockUncertain}
                testId={`${testId}.reviewed.confirm`}
              >
                {t('mailer.templates.detail.recipients.modal.uncertain_reviewed')}
              </Button>
              <Button variant="secondary" size="sm" disabled={props.pending} onClick={() => setReviewConfirmOpen(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        ) : uncertain ? (
          <Button variant="danger" size="sm" disabled={props.pending} onClick={() => setReviewConfirmOpen(true)} testId={`${testId}.reviewed`}>
            {t('mailer.templates.detail.recipients.modal.uncertain_reviewed')}
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={props.onResetRetry} disabled={props.pending} testId="admin.mailer.templates.detail.recipients.modal.create.reset">
            {t('mailer.templates.detail.recipients.modal.create_reset')}
          </Button>
        )}
      </div>
    </Alert>
  );
}
