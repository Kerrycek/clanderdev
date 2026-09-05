import React from 'react';

import { useI18n } from '../../../../app/i18n';
import { Alert } from '../../../../components/ui/Alert';
import { Input } from '../../../../components/ui/Input';
import { Select, type SelectOption } from '../../../../components/ui/Select';
import { Textarea } from '../../../../components/ui/Textarea';

export interface MailTemplateTranslationDraft {
  language: string;
  from: string;
  reply_to: string;
  return_path: string;
  subject: string;
  text_plain: string;
  text_html: string;
}

export function emptyMailTemplateTranslationDraft(): MailTemplateTranslationDraft {
  return {
    language: '',
    from: '',
    reply_to: '',
    return_path: '',
    subject: '',
    text_plain: '',
    text_html: '',
  };
}

function translationDraftErrorMessage(error: unknown): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error ? error.message : undefined;

  return String(message ?? error);
}

export function MailTemplateTranslationDraftFields(props: {
  draft: MailTemplateTranslationDraft;
  languageOptions: SelectOption[];
  pending: boolean;
  error: unknown;
  onChange: (draft: MailTemplateTranslationDraft) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="grid gap-3">
      <div>
        <div className="text-xs font-medium text-muted">{t('mailer.translations.fields.language')}</div>
        <Select
          value={props.draft.language}
          onChange={(event) => props.onChange({ ...props.draft, language: event.target.value })}
          disabled={props.pending}
          ariaLabel={t('mailer.translations.fields.language')}
          options={props.languageOptions}
          testId="admin.mailer.templates.detail.translations.modal.language"
        />
      </div>

      <div>
        <div className="text-xs font-medium text-muted">{t('mailer.translations.fields.subject')}</div>
        <Input
          value={props.draft.subject}
          onChange={(event) => props.onChange({ ...props.draft, subject: event.target.value })}
          disabled={props.pending}
          ariaLabel={t('mailer.translations.fields.subject')}
          maxLength={255}
          placeholder={t('mailer.translations.fields.subject_placeholder')}
          testId="admin.mailer.templates.detail.translations.modal.subject"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <div className="text-xs font-medium text-muted">{t('mailer.translations.fields.from')}</div>
          <Input
            value={props.draft.from}
            onChange={(event) => props.onChange({ ...props.draft, from: event.target.value })}
            disabled={props.pending}
            ariaLabel={t('mailer.translations.fields.from')}
            maxLength={255}
            testId="admin.mailer.templates.detail.translations.modal.from"
          />
        </div>
        <div>
          <div className="text-xs font-medium text-muted">{t('mailer.translations.fields.reply_to')}</div>
          <Input
            value={props.draft.reply_to}
            onChange={(event) => props.onChange({ ...props.draft, reply_to: event.target.value })}
            disabled={props.pending}
            ariaLabel={t('mailer.translations.fields.reply_to')}
            maxLength={255}
            testId="admin.mailer.templates.detail.translations.modal.reply_to"
          />
        </div>
        <div>
          <div className="text-xs font-medium text-muted">{t('mailer.translations.fields.return_path')}</div>
          <Input
            value={props.draft.return_path}
            onChange={(event) => props.onChange({ ...props.draft, return_path: event.target.value })}
            disabled={props.pending}
            ariaLabel={t('mailer.translations.fields.return_path')}
            maxLength={255}
            testId="admin.mailer.templates.detail.translations.modal.return_path"
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="text-xs font-medium text-muted">{t('mailer.translations.fields.text_plain')}</div>
          <Textarea
            value={props.draft.text_plain}
            onChange={(event) => props.onChange({ ...props.draft, text_plain: event.target.value })}
            disabled={props.pending}
            ariaLabel={t('mailer.translations.fields.text_plain')}
            rows={10}
            className="font-mono text-xs"
            testId="admin.mailer.templates.detail.translations.modal.text_plain"
          />
        </div>
        <div>
          <div className="text-xs font-medium text-muted">{t('mailer.translations.fields.text_html')}</div>
          <Textarea
            value={props.draft.text_html}
            onChange={(event) => props.onChange({ ...props.draft, text_html: event.target.value })}
            disabled={props.pending}
            ariaLabel={t('mailer.translations.fields.text_html')}
            rows={10}
            className="font-mono text-xs"
            testId="admin.mailer.templates.detail.translations.modal.text_html"
          />
        </div>
      </div>

      {props.error ? (
        <Alert variant="danger" title={t('mailer.templates.detail.translations.modal.create_error')}>
          {translationDraftErrorMessage(props.error)}
        </Alert>
      ) : null}
    </div>
  );
}
