import React from 'react';

import { useI18n } from '../../../../app/i18n';
import { Button } from '../../../../components/ui/Button';
import { Drawer } from '../../../../components/ui/Drawer';
import { Input } from '../../../../components/ui/Input';

export interface MailRecipientFilterValues {
  q: string;
  label: string;
  to: string;
  cc: string;
  bcc: string;
}

export function MailRecipientsAdvancedFilters(props: {
  open: boolean;
  filtersActive: boolean;
  values: MailRecipientFilterValues;
  onClose: () => void;
  onClear: () => void;
  onChange: (name: keyof MailRecipientFilterValues, value: string) => void;
}) {
  const { t } = useI18n();
  const fields: Array<{ name: keyof MailRecipientFilterValues; label: string; placeholder: string }> = [
    { name: 'q', label: t('common.search'), placeholder: t('mailer.recipients.filters.search.placeholder') },
    { name: 'label', label: t('mailer.recipients.fields.label'), placeholder: t('mailer.recipients.fields.label') },
    { name: 'to', label: t('mailer.recipients.fields.to'), placeholder: t('mailer.recipients.fields.to') },
    { name: 'cc', label: t('mailer.recipients.fields.cc'), placeholder: t('mailer.recipients.fields.cc') },
    { name: 'bcc', label: t('mailer.recipients.fields.bcc'), placeholder: t('mailer.recipients.fields.bcc') },
  ];

  return (
    <Drawer
      open={props.open}
      onClose={props.onClose}
      title={t('filters.advanced.title')}
      width="lg"
      testId="admin.mailer.recipients.advanced"
      footer={(
        <div className="flex items-center justify-end gap-2">
          {props.filtersActive ? <Button variant="secondary" size="sm" onClick={props.onClear}>{t('common.clear_filters')}</Button> : null}
          <Button variant="primary" size="sm" onClick={props.onClose}>{t('common.close')}</Button>
        </div>
      )}
    >
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map((field) => (
          <div key={field.name}>
            <div className="text-sm font-medium">{field.label}</div>
            <div className="mt-1">
              <Input
                value={props.values[field.name]}
                onChange={(event) => props.onChange(field.name, event.target.value)}
                ariaLabel={field.label}
                placeholder={field.placeholder}
                autoComplete="off"
                testId={`admin.mailer.recipients.advanced.${field.name}`}
              />
            </div>
          </div>
        ))}
      </div>
    </Drawer>
  );
}
