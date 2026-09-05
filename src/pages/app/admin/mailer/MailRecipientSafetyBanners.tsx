import React, { useState } from 'react';

import { useI18n } from '../../../../app/i18n';
import { Alert } from '../../../../components/ui/Alert';
import { Button } from '../../../../components/ui/Button';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import type { MailRecipientCreateGuardAttempt } from './mailRecipientMutationGuardStorage';

export function MailRecipientSafetyBanners(props: {
  fetchLimitReached: boolean;
  fetchLimit: number;
  indeterminateCreate: MailRecipientCreateGuardAttempt | null;
  refreshing: boolean;
  onRefresh: () => void;
  onUnlock: () => void;
}) {
  const { t } = useI18n();
  const [reviewOpen, setReviewOpen] = useState(false);

  return (
    <>
      <div className="space-y-3">
      {props.fetchLimitReached ? (
        <Alert variant="warn" testId="admin.mailer.recipients.fetch_limit_notice">
          {t('mailer.recipients.list.fetch_limit_notice', { limit: props.fetchLimit })}
        </Alert>
      ) : null}
      <Alert
        variant="warn"
        title={t('mailer.recipients.delete.blocked_title')}
        testId="admin.mailer.recipients.delete_blocked"
      >
        {t('mailer.recipients.delete.blocked_body')}
      </Alert>
      {props.indeterminateCreate ? (
        <Alert
          variant="danger"
          title={t('mailer.recipients.create.indeterminate.title')}
          testId="admin.mailer.recipients.create.indeterminate"
        >
          <div className="space-y-3">
            <p>{t('mailer.recipients.create.indeterminate.body')}</p>
            <p className="font-medium">
              {t('mailer.recipients.create.indeterminate.attempt', { label: props.indeterminateCreate.label })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={props.onRefresh} loading={props.refreshing} testId="admin.mailer.recipients.create.indeterminate.refresh">
                {t('common.refresh')}
              </Button>
              <Button variant="secondary" onClick={() => setReviewOpen(true)} testId="admin.mailer.recipients.create.indeterminate.reviewed">
                {t('mailer.recipients.create.indeterminate.reviewed')}
              </Button>
            </div>
          </div>
        </Alert>
      ) : null}
      </div>
      <ConfirmDialog
        open={reviewOpen}
        title={t('mailer.recipients.create.indeterminate.reviewed_confirm.title')}
        description={t('mailer.recipients.create.indeterminate.reviewed_confirm.description')}
        danger
        confirmLabel={t('mailer.recipients.create.indeterminate.reviewed')}
        onCancel={() => setReviewOpen(false)}
        onConfirm={() => {
          props.onUnlock();
          setReviewOpen(false);
        }}
        testId="admin.mailer.recipients.create.indeterminate.reviewed_confirm"
      />
    </>
  );
}
