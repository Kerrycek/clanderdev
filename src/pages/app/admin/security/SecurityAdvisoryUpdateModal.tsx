import React, { useEffect, useMemo, useState } from 'react';

import { useI18n } from '../../../../app/i18n';
import { Alert } from '../../../../components/ui/Alert';
import { Button } from '../../../../components/ui/Button';
import { Checkbox } from '../../../../components/ui/Checkbox';
import { clsx } from '../../../../components/ui/clsx';
import { Input } from '../../../../components/ui/Input';
import { Modal } from '../../../../components/ui/Modal';
import { Select } from '../../../../components/ui/Select';
import { Textarea } from '../../../../components/ui/Textarea';
import type { Language } from '../../../../lib/api/languages';
import type {
  SecurityAdvisoryUpdate,
  SecurityAdvisoryUpdateCreatePayload,
  SecurityAdvisoryUpdateTextPayload,
} from '../../../../lib/api/securityAdvisories';
import { isoToLocalInput, localInputToIso } from '../../../../lib/datetimeLocal';
import { securityAdvisoryStateLabel } from '../../../../lib/apiValues';
import {
  canPostSecurityAdvisoryUpdate,
  securityAdvisoryUpdateStateChange,
} from './securityAdvisoryAdminModel';

export interface SecurityAdvisoryUpdateValues {
  state: string;
  publishedAt: string;
  /** Exact API value used when the datetime field remains unchanged. */
  originalPublishedAt?: string | null;
  sendMail: boolean;
  translations: Record<string, { summary: string; message: string }>;
}

function code(language: Language): string {
  return String(language.code ?? '').trim().toLowerCase();
}

function label(language: Language): string {
  return String(language.label ?? language.code ?? `#${language.id}`);
}

function initialValues(
  update: SecurityAdvisoryUpdate | null,
  languages: Language[],
  advisoryPublishedAt?: string | null,
): SecurityAdvisoryUpdateValues {
  const translations: SecurityAdvisoryUpdateValues['translations'] = {};
  for (const language of languages) {
    const languageCode = code(language);
    if (!languageCode) continue;
    translations[languageCode] = {
      summary: String(update?.[`${languageCode}_summary`] ?? ''),
      message: String(update?.[`${languageCode}_message`] ?? ''),
    };
  }
  return {
    state: '',
    publishedAt: isoToLocalInput(advisoryPublishedAt),
    originalPublishedAt: advisoryPublishedAt,
    sendMail: false,
    translations,
  };
}

export function securityAdvisoryUpdateTextPayload(values: SecurityAdvisoryUpdateValues): SecurityAdvisoryUpdateTextPayload {
  const payload: SecurityAdvisoryUpdateTextPayload = {};
  for (const [languageCode, translation] of Object.entries(values.translations)) {
    payload[`${languageCode}_summary`] = translation.summary.trim();
    payload[`${languageCode}_message`] = translation.message.trim() || null;
  }
  return payload;
}

export function securityAdvisoryUpdateCreatePayload(
  advisoryId: number,
  values: SecurityAdvisoryUpdateValues,
  currentState: unknown,
): SecurityAdvisoryUpdateCreatePayload {
  const parsedDate = localInputToIso(values.publishedAt);
  const publishedAtUnchanged =
    values.originalPublishedAt !== undefined &&
    values.publishedAt === isoToLocalInput(values.originalPublishedAt);

  return {
    security_advisory: advisoryId,
    state: securityAdvisoryUpdateStateChange(currentState, values.state),
    published_at: publishedAtUnchanged
      ? values.originalPublishedAt
      : parsedDate.valid
        ? parsedDate.iso ?? null
        : null,
    send_mail: values.sendMail,
    ...securityAdvisoryUpdateTextPayload(values),
  };
}

export function SecurityAdvisoryUpdateModal(props: {
  open: boolean;
  mode: 'create' | 'edit';
  advisoryId: number;
  currentState: string;
  advisoryPublishedAt?: string | null;
  update: SecurityAdvisoryUpdate | null;
  languages: Language[];
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (values: SecurityAdvisoryUpdateValues) => void;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState(() =>
    initialValues(props.update, props.languages, props.advisoryPublishedAt),
  );
  const codes = useMemo(() => props.languages.map(code).filter(Boolean), [props.languages]);
  const [activeLanguage, setActiveLanguage] = useState(codes[0] ?? 'en');
  const parsedDate = useMemo(() => localInputToIso(values.publishedAt), [values.publishedAt]);

  useEffect(() => {
    if (!props.open) return;
    setValues(initialValues(props.update, props.languages, props.advisoryPublishedAt));
    setActiveLanguage(code(props.languages[0] ?? { id: 0, code: 'en' }) || 'en');
  }, [props.advisoryPublishedAt, props.languages, props.open, props.update]);

  const activeValues = values.translations[activeLanguage] ?? { summary: '', message: '' };
  const missingSummary = codes.some((languageCode) => !values.translations[languageCode]?.summary.trim());
  const canCreate = props.mode === 'edit' || canPostSecurityAdvisoryUpdate(props.currentState);
  const valid = codes.length > 0 && !missingSummary && canCreate && (props.mode === 'edit' || parsedDate.valid);

  const updateTranslation = (field: 'summary' | 'message', value: string) => {
    setValues((previous) => ({
      ...previous,
      translations: {
        ...previous.translations,
        [activeLanguage]: { ...(previous.translations[activeLanguage] ?? { summary: '', message: '' }), [field]: value },
      },
    }));
  };

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={props.mode === 'create' ? t('admin.security_advisories.update.create_title') : t('admin.security_advisories.update.edit_title')}
      size="lg"
      testId="admin.security_advisories.update.editor"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={props.onClose} disabled={props.saving}>{t('common.cancel')}</Button>
          <Button
            variant={values.state === 'retracted' ? 'danger' : 'primary'}
            onClick={() => props.onSubmit(values)}
            loading={props.saving}
            disabled={!valid}
            testId="admin.security_advisories.update.editor.save"
          >
            {props.mode === 'create' ? t('admin.security_advisories.action.post_update') : t('common.save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {props.error ? <Alert variant="danger" title={t('common.error')}>{props.error}</Alert> : null}

        {props.mode === 'create' && !canCreate ? (
          <Alert variant="warn" title={t('admin.security_advisories.update.lifecycle_unavailable_title')}>
            {t('admin.security_advisories.update.lifecycle_unavailable_body')}
          </Alert>
        ) : null}

        {props.mode === 'create' && canCreate ? (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted">{t('admin.security_advisories.update.state_change')}</span>
              <Select
                value={values.state}
                onChange={(event) => setValues((previous) => ({ ...previous, state: event.target.value }))}
                testId="admin.security_advisories.update.editor.state"
                options={[
                  { value: '', label: t('admin.security_advisories.update.no_state_change') },
                  { value: 'retracted', label: securityAdvisoryStateLabel(t, 'retracted') },
                ]}
              />
              <span className="mt-1 block text-xs text-faint">{t('admin.security_advisories.update.state_help')}</span>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted">{t('admin.security_advisories.field.published_at')}</span>
              <Input
                type="datetime-local"
                value={values.publishedAt}
                onChange={(event) => setValues((previous) => ({ ...previous, publishedAt: event.target.value }))}
                testId="admin.security_advisories.update.editor.published_at"
              />
            </label>
            <Checkbox
              checked={values.sendMail}
              onChange={(sendMail) => setValues((previous) => ({ ...previous, sendMail }))}
              label={t('admin.security_advisories.update.send_mail')}
              description={t('admin.security_advisories.update.send_mail_help')}
              testId="admin.security_advisories.update.editor.send_mail"
              className="md:col-span-2"
            />
          </div>
        ) : null}

        {values.state === 'retracted' ? (
          <Alert variant="warn" title={t('admin.security_advisories.update.retract_warning_title')}>
            {t('admin.security_advisories.update.retract_warning_body')}
          </Alert>
        ) : null}

        <div className="rounded-lg border border-border bg-surface-2/45 p-3">
          <div className="mb-3 flex flex-wrap gap-2" role="tablist">
            {props.languages.map((language) => {
              const languageCode = code(language);
              if (!languageCode) return null;
              return (
                <button
                  key={language.id}
                  type="button"
                  role="tab"
                  aria-selected={activeLanguage === languageCode}
                  onClick={() => setActiveLanguage(languageCode)}
                  className={clsx(
                    'rounded-md px-3 py-2 text-sm font-medium ring-1 transition',
                    activeLanguage === languageCode
                      ? 'bg-surface text-fg ring-border'
                      : 'text-muted ring-transparent hover:bg-surface hover:text-fg',
                  )}
                  data-testid={`admin.security_advisories.update.editor.language.${languageCode}`}
                >
                  {label(language)} {values.translations[languageCode]?.summary.trim() ? '✓' : '•'}
                </button>
              );
            })}
          </div>
          <div className="space-y-4" role="tabpanel">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted">{t('admin.security_advisories.field.summary')}</span>
              <Input
                value={activeValues.summary}
                onChange={(event) => updateTranslation('summary', event.target.value)}
                testId={`admin.security_advisories.update.editor.${activeLanguage}.summary`}
              />
              {!activeValues.summary.trim() ? <span className="mt-1 block text-xs text-danger">{t('admin.security_advisories.validation.summary_required')}</span> : null}
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted">{t('admin.security_advisories.update.message')}</span>
              <Textarea
                rows={6}
                value={activeValues.message}
                onChange={(event) => updateTranslation('message', event.target.value)}
                testId={`admin.security_advisories.update.editor.${activeLanguage}.message`}
              />
            </label>
          </div>
        </div>
      </div>
    </Modal>
  );
}
