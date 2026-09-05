import React from 'react';

import { useI18n } from '../../../../app/i18n';
import { formatErrorMessage } from '../../../../lib/errors';
import { Alert } from '../../../../components/ui/Alert';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';

export function MailTemplateTranslationDialogs(props: {
  enableEditingOpen: boolean;
  deleteOpen: boolean;
  deletePending: boolean;
  deleteError: unknown;
  onCancelEnableEditing: () => void;
  onConfirmEnableEditing: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const { t } = useI18n();

  return (
    <>
      <ConfirmDialog
        open={props.enableEditingOpen}
        title={t('mailer.translations.detail.enable_editing_confirm.title')}
        description={t('mailer.translations.detail.enable_editing_confirm.description')}
        onCancel={props.onCancelEnableEditing}
        onConfirm={props.onConfirmEnableEditing}
        testId="admin.mailer.templates.translation.detail.enable_editing_confirm"
      />
      <ConfirmDialog
        open={props.deleteOpen}
        title={t('mailer.translations.detail.delete_confirm.title')}
        description={t('mailer.translations.detail.delete_confirm.description')}
        danger
        confirmLabel={t('common.delete')}
        confirmLoading={props.deletePending}
        onCancel={props.onCancelDelete}
        onConfirm={props.onConfirmDelete}
        testId="admin.mailer.templates.translation.detail.delete_confirm"
      >
        {props.deleteError ? (
          <Alert variant="danger" title={t('mailer.translations.detail.delete_error')} testId="admin.mailer.templates.translation.detail.delete_error">
            {formatErrorMessage(props.deleteError)}
          </Alert>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
