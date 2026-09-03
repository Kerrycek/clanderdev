import React from 'react';

import { useI18n } from '../../../../app/i18n';
import type { MailTemplateTranslation } from '../../../../lib/api/mailer';
import { formatErrorMessage } from '../../../../lib/errors';
import { formatDateTime } from '../../../../lib/format';

import { Alert } from '../../../../components/ui/Alert';
import { Button } from '../../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../../components/ui/Card';
import { Checkbox } from '../../../../components/ui/Checkbox';
import { Input } from '../../../../components/ui/Input';
import { SandboxedHtml } from '../../../../components/ui/SandboxedHtml';
import { Textarea } from '../../../../components/ui/Textarea';

import type { TranslationForm } from './MailTemplateTranslationModel';

export function MailTemplateTranslationContent(props: {
  translation: MailTemplateTranslation;
  editingEnabled: boolean;
  editingStale: boolean;
  savePending: boolean;
  saveError: unknown;
  form: TranslationForm;
  tab: 'plain' | 'html';
  showRawHtml: boolean;
  onFormChange: (form: TranslationForm) => void;
  onTabChange: (tab: 'plain' | 'html') => void;
  onRawHtmlChange: (show: boolean) => void;
  onResetStale: () => void;
}) {
  const { t } = useI18n();
  const tr = props.translation;
  const hasBodyPlain = Boolean(props.form.text_plain.trim());
  const hasBodyHtml = Boolean(props.form.text_html.trim());

  const bodyPreview = props.tab === 'plain' ? (
    hasBodyPlain ? (
      <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-surface p-3 text-sm text-fg">
        {props.form.text_plain}
      </pre>
    ) : (
      <div className="text-sm text-muted">{t('mailer.translations.detail.body.empty_plain')}</div>
    )
  ) : hasBodyHtml ? (
    props.showRawHtml ? (
      <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-surface p-3 text-xs text-fg">
        {props.form.text_html}
      </pre>
    ) : (
      <SandboxedHtml html={props.form.text_html} testId="admin.mailer.templates.translation.detail.preview" />
    )
  ) : (
    <div className="text-sm text-muted">{t('mailer.translations.detail.body.empty_html')}</div>
  );

  return (
    <>
      {!props.editingEnabled ? (
        <Alert variant="info" title={t('mailer.translations.detail.readonly.title')} testId="admin.mailer.templates.translation.detail.readonly">
          {t('mailer.translations.detail.readonly.body')}
        </Alert>
      ) : (
        <Alert variant="warn" title={t('mailer.translations.detail.editing.title')} testId="admin.mailer.templates.translation.detail.editing">
          {t('mailer.translations.detail.editing.body')}
        </Alert>
      )}

      {props.editingStale ? (
        <Alert variant="danger" title={t('mailer.translations.detail.stale.title')} testId="admin.mailer.templates.translation.detail.stale">
          <div className="space-y-3">
            <p>{t('mailer.translations.detail.stale.body')}</p>
            <Button variant="secondary" size="sm" onClick={props.onResetStale} testId="admin.mailer.templates.translation.detail.stale.reset">
              {t('mailer.translations.detail.stale.reset')}
            </Button>
          </div>
        </Alert>
      ) : null}

      <Card testId="admin.mailer.templates.translation.detail.fields">
        <CardHeader title={t('mailer.translations.detail.section.fields')} />
        <CardBody>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <div className="text-xs font-medium text-muted">{t('mailer.translations.fields.from')}</div>
              {props.editingEnabled ? (
                <Input
                  value={props.form.from}
                  onChange={(event) => props.onFormChange({ ...props.form, from: event.target.value })}
                  disabled={props.savePending}
                  ariaLabel={t('mailer.translations.fields.from')}
                  maxLength={255}
                  testId="admin.mailer.templates.translation.detail.from"
                />
              ) : (
                <div className="mt-1 text-sm">{String(tr.from ?? t('common.na'))}</div>
              )}
            </div>
            <div>
              <div className="text-xs font-medium text-muted">{t('mailer.translations.fields.reply_to')}</div>
              {props.editingEnabled ? (
                <Input
                  value={props.form.reply_to}
                  onChange={(event) => props.onFormChange({ ...props.form, reply_to: event.target.value })}
                  disabled={props.savePending}
                  ariaLabel={t('mailer.translations.fields.reply_to')}
                  maxLength={255}
                  testId="admin.mailer.templates.translation.detail.reply_to"
                />
              ) : (
                <div className="mt-1 text-sm">{String(tr.reply_to ?? t('common.na'))}</div>
              )}
            </div>
            <div>
              <div className="text-xs font-medium text-muted">{t('mailer.translations.fields.return_path')}</div>
              {props.editingEnabled ? (
                <Input
                  value={props.form.return_path}
                  onChange={(event) => props.onFormChange({ ...props.form, return_path: event.target.value })}
                  disabled={props.savePending}
                  ariaLabel={t('mailer.translations.fields.return_path')}
                  maxLength={255}
                  testId="admin.mailer.templates.translation.detail.return_path"
                />
              ) : (
                <div className="mt-1 text-sm">{String(tr.return_path ?? t('common.na'))}</div>
              )}
            </div>

            <div className="md:col-span-3">
              <div className="text-xs font-medium text-muted">{t('mailer.translations.fields.subject')}</div>
              {props.editingEnabled ? (
                <Input
                  value={props.form.subject}
                  onChange={(event) => props.onFormChange({ ...props.form, subject: event.target.value })}
                  disabled={props.savePending}
                  ariaLabel={t('mailer.translations.fields.subject')}
                  maxLength={255}
                  testId="admin.mailer.templates.translation.detail.subject"
                />
              ) : (
                <div className="mt-1 text-sm">{String(tr.subject ?? t('common.na'))}</div>
              )}
            </div>

            <div>
              <div className="text-xs text-muted">{t('common.updated')}</div>
              <div className="mt-1 text-sm">{formatDateTime(tr.updated_at)}</div>
            </div>
            <div>
              <div className="text-xs text-muted">{t('common.created')}</div>
              <div className="mt-1 text-sm">{formatDateTime(tr.created_at)}</div>
            </div>
          </div>

          {props.saveError ? (
            <div className="mt-4">
              <Alert variant="danger" title={t('mailer.translations.detail.save_error')}>
                {formatErrorMessage(props.saveError)}
              </Alert>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card testId="admin.mailer.templates.translation.detail.body">
        <CardHeader
          title={t('mailer.translations.detail.section.body')}
          actions={(
            <div className="flex flex-wrap items-center gap-2" aria-label={t('mailer.translations.detail.section.body')}>
              <Button
                variant={props.tab === 'plain' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => props.onTabChange('plain')}
                aria-pressed={props.tab === 'plain'}
                testId="admin.mailer.templates.translation.detail.tab.plain"
              >
                {t('mailer.translations.detail.tab.plain')}
              </Button>
              <Button
                variant={props.tab === 'html' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => props.onTabChange('html')}
                aria-pressed={props.tab === 'html'}
                testId="admin.mailer.templates.translation.detail.tab.html"
              >
                {t('mailer.translations.detail.tab.html')}
              </Button>
            </div>
          )}
        />
        <CardBody>
          {props.tab === 'html' && hasBodyHtml ? (
            <Checkbox
              checked={props.showRawHtml}
              onChange={props.onRawHtmlChange}
              label={t('mailer.translations.detail.body.raw_toggle')}
              description={t('mailer.translations.detail.body.raw_toggle_desc')}
              testId="admin.mailer.templates.translation.detail.body.raw_toggle"
              className="mb-3"
            />
          ) : null}

          {props.editingEnabled ? (
            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-xs font-medium text-muted">{t('mailer.translations.fields.text_plain')}</div>
                <Textarea
                  value={props.form.text_plain}
                  onChange={(event) => props.onFormChange({ ...props.form, text_plain: event.target.value })}
                  disabled={props.savePending}
                  ariaLabel={t('mailer.translations.fields.text_plain')}
                  rows={10}
                  className="font-mono text-xs"
                  testId="admin.mailer.templates.translation.detail.text_plain"
                />
              </div>
              <div>
                <div className="text-xs font-medium text-muted">{t('mailer.translations.fields.text_html')}</div>
                <Textarea
                  value={props.form.text_html}
                  onChange={(event) => props.onFormChange({ ...props.form, text_html: event.target.value })}
                  disabled={props.savePending}
                  ariaLabel={t('mailer.translations.fields.text_html')}
                  rows={10}
                  className="font-mono text-xs"
                  testId="admin.mailer.templates.translation.detail.text_html"
                />
              </div>
            </div>
          ) : null}

          {bodyPreview}
        </CardBody>
      </Card>
    </>
  );
}
