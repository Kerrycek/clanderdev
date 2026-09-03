import React, { useEffect, useRef, useState } from 'react';

import { useI18n } from '../../../../app/i18n';
import { Alert } from '../../../../components/ui/Alert';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { Modal } from '../../../../components/ui/Modal';
import { Select } from '../../../../components/ui/Select';
import type {
  MailTemplate,
  MailTemplateCreateInput,
  MailTemplateUpdateInput,
} from '../../../../lib/api/mailer';

export interface MailTemplateEditorValues {
  name: string;
  label: string;
  templateId: string;
  userVisibility: string;
}

export type MailTemplateEditorCreatePayload = MailTemplateCreateInput;

export type MailTemplateEditorUpdatePayload = MailTemplateUpdateInput & {
  label: string;
  user_visibility: string;
};

function valuesFromTemplate(template: MailTemplate | null): MailTemplateEditorValues {
  return {
    name: String(template?.name ?? ''),
    label: String(template?.label ?? ''),
    templateId: String(template?.template_id ?? ''),
    userVisibility: String(template?.user_visibility ?? '').trim() || 'default',
  };
}

export function mailTemplateEditorPayload(values: MailTemplateEditorValues): MailTemplateEditorCreatePayload {
  return {
    name: values.name.trim(),
    label: values.label.trim(),
    template_id: values.templateId.trim(),
    user_visibility: values.userVisibility,
  };
}

export function mailTemplateEditorUpdatePayload(values: MailTemplateEditorValues): MailTemplateEditorUpdatePayload {
  return {
    label: values.label.trim(),
    user_visibility: values.userVisibility,
  };
}

export function MailTemplateEditorModal(props: {
  open: boolean;
  mode: 'create' | 'edit';
  template: MailTemplate | null;
  error?: string | null;
  saving?: boolean;
  stale?: boolean;
  onLoadLatest?: () => void;
  onClose: () => void;
  onSubmit: (values: MailTemplateEditorValues) => void;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState<MailTemplateEditorValues>(() => valuesFromTemplate(props.template));
  const [validationError, setValidationError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const wasSavingRef = useRef(false);
  const templateId = props.template?.id;

  useEffect(() => {
    if (!props.open) return;
    setValues(valuesFromTemplate(props.template));
    setValidationError(null);
    submittingRef.current = false;
    // Reset only when a new editor session starts. API errors and query
    // refreshes must never erase the draft for the same template.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, props.mode, templateId]);

  useEffect(() => {
    if (wasSavingRef.current && !props.saving) submittingRef.current = false;
    wasSavingRef.current = Boolean(props.saving);
  }, [props.saving]);

  const update = (field: keyof MailTemplateEditorValues, value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    setValidationError(null);
  };

  const submit = () => {
    if (props.saving || props.stale || submittingRef.current) return;
    if (!values.name.trim() || !values.label.trim() || !values.templateId.trim()) {
      setValidationError(t('mailer.templates.editor.validation.required'));
      return;
    }

    submittingRef.current = true;
    props.onSubmit(values);
  };

  const close = () => {
    if (!props.saving) props.onClose();
  };

  const displayedError = validationError ?? props.error;

  const loadLatest = () => {
    setValues(valuesFromTemplate(props.template));
    setValidationError(null);
    submittingRef.current = false;
    props.onLoadLatest?.();
  };

  return (
    <Modal
      open={props.open}
      onClose={close}
      title={t(`mailer.templates.editor.title.${props.mode}`)}
      size="md"
      mobileFullScreen
      testId="admin.mailer.template.editor"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="secondary"
            onClick={close}
            disabled={props.saving}
            testId="admin.mailer.template.editor.cancel"
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={props.saving}
            disabled={props.stale}
            disabledReason={props.stale ? t('mailer.templates.editor.stale.body') : undefined}
            testId="admin.mailer.template.editor.submit"
          >
            {t(`mailer.templates.editor.submit.${props.mode}`)}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {displayedError ? (
          <Alert variant="danger" title={t('mailer.templates.editor.error_title')} testId="admin.mailer.template.editor.error">
            {displayedError}
          </Alert>
        ) : null}

        {props.stale ? (
          <Alert
            variant="warn"
            title={t('mailer.templates.editor.stale.title')}
            testId="admin.mailer.template.editor.stale"
          >
            <div className="space-y-3">
              <p>{t('mailer.templates.editor.stale.body')}</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={loadLatest}
                testId="admin.mailer.template.editor.stale.reset"
              >
                {t('mailer.templates.editor.stale.reset')}
              </Button>
            </div>
          </Alert>
        ) : null}

        {props.mode === 'edit' ? (
          <Alert
            variant="info"
            title={t('mailer.templates.editor.identifiers_locked.title')}
            testId="admin.mailer.template.editor.identifiers_locked"
          >
            {t('mailer.templates.editor.identifiers_locked.body')}
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t('mailer.templates.editor.field.name')}
            value={values.name}
            onChange={(event) => update('name', event.target.value)}
            maxLength={100}
            disabled={props.saving || props.mode === 'edit'}
            autoComplete="off"
            ariaInvalid={Boolean(displayedError && !values.name.trim())}
            testId="admin.mailer.template.editor.name"
          />
          <Input
            label={t('mailer.templates.editor.field.label')}
            value={values.label}
            onChange={(event) => update('label', event.target.value)}
            maxLength={100}
            disabled={props.saving}
            autoComplete="off"
            ariaInvalid={Boolean(displayedError && !values.label.trim())}
            testId="admin.mailer.template.editor.label"
          />
          <Input
            label={t('mailer.templates.editor.field.template_id')}
            value={values.templateId}
            onChange={(event) => update('templateId', event.target.value)}
            maxLength={100}
            disabled={props.saving || props.mode === 'edit'}
            autoComplete="off"
            ariaInvalid={Boolean(displayedError && !values.templateId.trim())}
            testId="admin.mailer.template.editor.template_id"
          />
          <Select
            label={t('mailer.templates.editor.field.user_visibility')}
            value={values.userVisibility}
            onChange={(event) => update('userVisibility', event.target.value)}
            disabled={props.saving}
            options={[
              { value: 'default', label: t('mailer.templates.visibility.default') },
              { value: 'visible', label: t('mailer.templates.visibility.visible') },
              { value: 'invisible', label: t('mailer.templates.visibility.invisible') },
            ]}
            testId="admin.mailer.template.editor.user_visibility"
          />
        </div>
      </div>
    </Modal>
  );
}
