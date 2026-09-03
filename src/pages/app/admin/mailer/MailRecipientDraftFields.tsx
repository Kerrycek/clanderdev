import React from 'react';

import { useI18n } from '../../../../app/i18n';
import { Input } from '../../../../components/ui/Input';
import type { MailRecipientDraft } from './MailTemplateRecipientCreateModel';

export function MailRecipientDraftFields(props: {
  draft: MailRecipientDraft;
  disabled: boolean;
  testIdPrefix: string;
  onChange: (draft: MailRecipientDraft) => void;
}) {
  const { t } = useI18n();
  const fields = [
    { name: 'label', label: t('common.label'), maxLength: 100, placeholder: t('mailer.recipients.create.label_placeholder') },
    { name: 'to', label: t('mailer.recipients.fields.to'), maxLength: 500, placeholder: t('mailer.recipients.create.address_placeholder') },
    { name: 'cc', label: t('mailer.recipients.fields.cc'), maxLength: 500, placeholder: t('mailer.recipients.create.address_placeholder') },
    { name: 'bcc', label: t('mailer.recipients.fields.bcc'), maxLength: 500, placeholder: t('mailer.recipients.create.address_placeholder') },
  ] as const;

  return fields.map((field) => (
    <div key={field.name}>
      <div className="text-xs font-medium text-muted">{field.label}</div>
      <Input
        value={props.draft[field.name]}
        onChange={(event) => props.onChange({ ...props.draft, [field.name]: event.target.value })}
        placeholder={field.placeholder}
        disabled={props.disabled}
        maxLength={field.maxLength}
        ariaLabel={field.label}
        testId={`${props.testIdPrefix}.${field.name}`}
      />
    </div>
  ));
}
