import React from 'react';

import { useI18n } from '../../../../app/i18n';
import { formatErrorMessage } from '../../../../lib/errors';

import { Alert } from '../../../../components/ui/Alert';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { Modal } from '../../../../components/ui/Modal';
import type { MailRecipientEditorForm } from './mailRecipientEditSafety';

export function MailRecipientEditorModal(props: {
  open: boolean;
  editing: boolean;
  form: MailRecipientEditorForm;
  pending: boolean;
  saveDisabled: boolean;
  stale: boolean;
  error: unknown;
  onChange: (form: MailRecipientEditorForm) => void;
  onClose: () => void;
  onLoadServerVersion: () => void;
  onSubmit: () => void;
}) {
  const { t } = useI18n();

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={props.editing ? t('mailer.recipients.edit.title') : t('mailer.recipients.create.title')}
      size="lg"
      testId="admin.mailer.recipients.editor"
      footer={(
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={props.onClose} disabled={props.pending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={props.pending}
            disabled={props.saveDisabled || props.stale}
            onClick={props.onSubmit}
            testId="admin.mailer.recipients.editor.save"
          >
            {t('common.save')}
          </Button>
        </div>
      )}
    >
      <div className="grid gap-3">
        {props.editing && props.stale ? (
          <Alert
            variant="danger"
            title={t('mailer.recipients.edit.stale.title')}
            testId="admin.mailer.recipients.editor.stale"
          >
            <div className="space-y-3">
              <p>{t('mailer.recipients.edit.stale.body')}</p>
              <Button
                variant="secondary"
                size="sm"
                disabled={props.pending}
                onClick={props.onLoadServerVersion}
                testId="admin.mailer.recipients.editor.stale.reset"
              >
                {t('mailer.recipients.edit.stale.reset')}
              </Button>
            </div>
          </Alert>
        ) : null}

        {([
          { name: 'label', label: t('common.label'), maxLength: 100, placeholder: t('mailer.recipients.create.label_placeholder') },
          { name: 'to', label: t('mailer.recipients.fields.to'), maxLength: 500, placeholder: t('mailer.recipients.create.address_placeholder') },
          { name: 'cc', label: t('mailer.recipients.fields.cc'), maxLength: 500, placeholder: t('mailer.recipients.create.address_placeholder') },
          { name: 'bcc', label: t('mailer.recipients.fields.bcc'), maxLength: 500, placeholder: t('mailer.recipients.create.address_placeholder') },
        ] as const).map((field) => (
          <div key={field.name}>
            <div className="text-xs font-medium text-muted">{field.label}</div>
            <Input
              value={props.form[field.name]}
              onChange={(event) => props.onChange({ ...props.form, [field.name]: event.target.value })}
              disabled={props.pending}
              ariaLabel={field.label}
              maxLength={field.maxLength}
              placeholder={field.placeholder}
              testId={`admin.mailer.recipients.editor.${field.name}`}
            />
          </div>
        ))}

        {props.error ? (
          <Alert variant="danger" title={t('mailer.recipients.editor.save_error')}>
            {formatErrorMessage(props.error)}
          </Alert>
        ) : null}
      </div>
    </Modal>
  );
}
