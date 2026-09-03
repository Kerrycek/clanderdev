import React from 'react';

import { useI18n } from '../../../../app/i18n';
import { Button } from '../../../../components/ui/Button';

export function MailTemplateTranslationActions(props: {
  editingEnabled: boolean;
  canSave: boolean;
  savePending: boolean;
  deletePending: boolean;
  onSave: () => void;
  onReset: () => void;
  onDelete: () => void;
  onEnableEditing: () => void;
}) {
  const { t } = useI18n();

  if (!props.editingEnabled) {
    return (
      <Button variant="secondary" onClick={props.onEnableEditing} testId="admin.mailer.templates.translation.detail.enable_editing">
        {t('mailer.translations.detail.enable_editing')}
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="primary"
        onClick={props.onSave}
        loading={props.savePending}
        disabled={!props.canSave}
        testId="admin.mailer.templates.translation.detail.save"
      >
        {t('common.save')}
      </Button>
      <Button
        variant="secondary"
        onClick={props.onReset}
        disabled={props.savePending}
        testId="admin.mailer.templates.translation.detail.reset"
      >
        {t('common.reset')}
      </Button>
      <Button
        variant="danger"
        onClick={props.onDelete}
        disabled={props.savePending || props.deletePending}
        testId="admin.mailer.templates.translation.detail.delete"
      >
        {t('common.delete')}
      </Button>
    </>
  );
}
