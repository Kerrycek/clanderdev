import type { MailTemplateTranslation } from '../../../../lib/api/mailer';

export interface TranslationForm {
  from: string;
  reply_to: string;
  return_path: string;
  subject: string;
  text_plain: string;
  text_html: string;
}

export function translationToForm(translation: MailTemplateTranslation): TranslationForm {
  return {
    from: String(translation.from ?? ''),
    reply_to: String(translation.reply_to ?? ''),
    return_path: String(translation.return_path ?? ''),
    subject: String(translation.subject ?? ''),
    text_plain: String(translation.text_plain ?? ''),
    text_html: String(translation.text_html ?? ''),
  };
}

export function translationVersion(translation: MailTemplateTranslation): string {
  return JSON.stringify([
    typeof translation.updated_at === 'string' ? translation.updated_at : null,
    translationToForm(translation),
  ]);
}
