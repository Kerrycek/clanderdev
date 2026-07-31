import React, { useEffect, useMemo, useState } from 'react';

import { useI18n } from '../../../../app/i18n';
import { Alert } from '../../../../components/ui/Alert';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { Modal } from '../../../../components/ui/Modal';
import { Textarea } from '../../../../components/ui/Textarea';
import type { Language } from '../../../../lib/api/languages';
import type { SecurityAdvisory, SecurityAdvisoryPayload } from '../../../../lib/api/securityAdvisories';
import { isoToLocalInput, localInputToIso } from '../../../../lib/datetimeLocal';
import { clsx } from '../../../../components/ui/clsx';
import { parseSecurityAdvisoryCves } from './securityAdvisoryAdminModel';

export interface SecurityAdvisoryTranslationValues {
  summary: string;
  description: string;
  response: string;
}

export interface SecurityAdvisoryEditorValues {
  name: string;
  publishedAt: string;
  cves: string;
  translations: Record<string, SecurityAdvisoryTranslationValues>;
}

function languageCode(language: Language): string {
  return String(language.code ?? '').trim().toLowerCase();
}

function languageLabel(language: Language): string {
  return String(language.label ?? language.code ?? `#${language.id}`);
}

function initialValues(advisory: SecurityAdvisory | null, languages: Language[], cves: string[]): SecurityAdvisoryEditorValues {
  const translations: Record<string, SecurityAdvisoryTranslationValues> = {};
  for (const language of languages) {
    const code = languageCode(language);
    if (!code) continue;
    translations[code] = {
      summary: String(advisory?.[`${code}_summary`] ?? ''),
      description: String(advisory?.[`${code}_description`] ?? ''),
      response: String(advisory?.[`${code}_response`] ?? ''),
    };
  }

  return {
    name: String(advisory?.name ?? ''),
    publishedAt: isoToLocalInput(String(advisory?.published_at ?? '')),
    cves: cves.join(', '),
    translations,
  };
}

export function securityAdvisoryEditorPayload(values: SecurityAdvisoryEditorValues): SecurityAdvisoryPayload {
  const parsedDate = localInputToIso(values.publishedAt);
  const payload: SecurityAdvisoryPayload = {
    name: values.name.trim() || null,
    published_at: parsedDate.valid ? parsedDate.iso ?? null : null,
  };

  for (const [code, translation] of Object.entries(values.translations)) {
    payload[`${code}_summary`] = translation.summary.trim();
    payload[`${code}_description`] = translation.description.trim();
    payload[`${code}_response`] = translation.response.trim();
  }

  return payload;
}

export function SecurityAdvisoryEditorModal(props: {
  open: boolean;
  mode: 'create' | 'edit';
  advisory: SecurityAdvisory | null;
  languages: Language[];
  cves: string[];
  error?: string | null;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (values: SecurityAdvisoryEditorValues, cves: string[]) => void;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState<SecurityAdvisoryEditorValues>(() => initialValues(props.advisory, props.languages, props.cves));
  const codes = useMemo(() => props.languages.map(languageCode).filter(Boolean), [props.languages]);
  const [activeLanguage, setActiveLanguage] = useState(codes[0] ?? 'en');
  const cveResult = useMemo(() => parseSecurityAdvisoryCves(values.cves), [values.cves]);
  const parsedDate = useMemo(() => localInputToIso(values.publishedAt), [values.publishedAt]);

  useEffect(() => {
    if (!props.open) return;
    const next = initialValues(props.advisory, props.languages, props.cves);
    setValues(next);
    setActiveLanguage(languageCode(props.languages[0] ?? { id: 0, code: 'en' }) || 'en');
  }, [props.advisory, props.cves, props.languages, props.open]);

  const missingSummary = codes.find((code) => !values.translations[code]?.summary.trim());
  const valid = codes.length > 0 && cveResult.valid && parsedDate.valid && !missingSummary;
  const activeValues = values.translations[activeLanguage] ?? { summary: '', description: '', response: '' };

  const updateTranslation = (field: keyof SecurityAdvisoryTranslationValues, value: string) => {
    setValues((previous) => ({
      ...previous,
      translations: {
        ...previous.translations,
        [activeLanguage]: {
          ...(previous.translations[activeLanguage] ?? { summary: '', description: '', response: '' }),
          [field]: value,
        },
      },
    }));
  };

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={props.mode === 'create' ? t('admin.security_advisories.editor.create_title') : t('admin.security_advisories.editor.edit_title')}
      size="lg"
      testId="admin.security_advisories.editor"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={props.onClose} disabled={props.saving}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => cveResult.valid && props.onSubmit(values, cveResult.cves)}
            loading={props.saving}
            disabled={!valid}
            testId="admin.security_advisories.editor.save"
          >
            {props.mode === 'create' ? t('admin.security_advisories.action.create_draft') : t('common.save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {props.error ? <Alert variant="danger" title={t('common.error')}>{props.error}</Alert> : null}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">{t('admin.security_advisories.field.cves')}</span>
            <Input
              value={values.cves}
              onChange={(event) => setValues((previous) => ({ ...previous, cves: event.target.value }))}
              placeholder={t('admin.security_advisories.field.cves_placeholder')}
              testId="admin.security_advisories.editor.cves"
            />
            <span className="mt-1 block text-xs text-faint">{t('admin.security_advisories.field.cves_help')}</span>
            {!cveResult.valid ? (
              <span className="mt-1 block text-xs text-danger">
                {cveResult.reason === 'empty'
                  ? t('admin.security_advisories.validation.cves_required')
                  : t('admin.security_advisories.validation.cve_invalid', { cve: cveResult.invalid ?? '' })}
              </span>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">{t('admin.security_advisories.field.name')}</span>
            <Input
              value={values.name}
              onChange={(event) => setValues((previous) => ({ ...previous, name: event.target.value }))}
              placeholder={t('admin.security_advisories.field.name_placeholder')}
              testId="admin.security_advisories.editor.name"
            />
            <span className="mt-1 block text-xs text-faint">{t('admin.security_advisories.field.name_help')}</span>
          </label>
        </div>

        <label className="block md:max-w-sm">
          <span className="mb-1 block text-xs font-semibold text-muted">{t('admin.security_advisories.field.published_at')}</span>
          <Input
            type="datetime-local"
            value={values.publishedAt}
            onChange={(event) => setValues((previous) => ({ ...previous, publishedAt: event.target.value }))}
            testId="admin.security_advisories.editor.published_at"
          />
          <span className="mt-1 block text-xs text-faint">{t('admin.security_advisories.field.published_at_help')}</span>
          {!parsedDate.valid ? <span className="mt-1 block text-xs text-danger">{t('admin.security_advisories.validation.date')}</span> : null}
        </label>

        <div className="rounded-lg border border-border bg-surface-2/45 p-3">
          <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label={t('admin.security_advisories.editor.languages')}>
            {props.languages.map((language) => {
              const code = languageCode(language);
              if (!code) return null;
              const complete = Boolean(values.translations[code]?.summary.trim());
              return (
                <button
                  key={language.id}
                  type="button"
                  role="tab"
                  aria-selected={activeLanguage === code}
                  onClick={() => setActiveLanguage(code)}
                  className={clsx(
                    'rounded-md px-3 py-2 text-sm font-medium ring-1 transition',
                    activeLanguage === code
                      ? 'bg-surface text-fg ring-border'
                      : 'bg-transparent text-muted ring-transparent hover:bg-surface hover:text-fg',
                  )}
                  data-testid={`admin.security_advisories.editor.language.${code}`}
                >
                  {languageLabel(language)} {complete ? '✓' : '•'}
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
                testId={`admin.security_advisories.editor.${activeLanguage}.summary`}
              />
              <span className="mt-1 block text-xs text-faint">{t('admin.security_advisories.field.summary_help')}</span>
              {!activeValues.summary.trim() ? <span className="mt-1 block text-xs text-danger">{t('admin.security_advisories.validation.summary_required')}</span> : null}
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted">{t('admin.security_advisories.field.description')}</span>
              <Textarea
                rows={5}
                value={activeValues.description}
                onChange={(event) => updateTranslation('description', event.target.value)}
                testId={`admin.security_advisories.editor.${activeLanguage}.description`}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted">{t('admin.security_advisories.field.response')}</span>
              <Textarea
                rows={5}
                value={activeValues.response}
                onChange={(event) => updateTranslation('response', event.target.value)}
                testId={`admin.security_advisories.editor.${activeLanguage}.response`}
              />
            </label>
          </div>
        </div>

        {missingSummary && missingSummary !== activeLanguage ? (
          <Alert variant="warn" title={t('admin.security_advisories.validation.incomplete_languages')}>
            {t('admin.security_advisories.validation.incomplete_languages_body')}
          </Alert>
        ) : null}
      </div>
    </Modal>
  );
}
