import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAppMode } from '../../../../app/appMode';
import { useI18n } from '../../../../app/i18n';
import { Alert } from '../../../../components/ui/Alert';
import { Button } from '../../../../components/ui/Button';
import {
  reconcileMailTemplateTranslationCreateAfterSettling,
  type MailTemplateTranslationCreateFingerprint,
} from '../../../../lib/api/mailTemplateCreateReconciliation';

export type IndeterminateMailTemplateTranslationCreateAttempt = MailTemplateTranslationCreateFingerprint & {
  languageLabel: string;
};

export function MailTemplateTranslationCreateIndeterminateGuard(props: {
  templateId: number;
  attempt: IndeterminateMailTemplateTranslationCreateAttempt;
  onListRefresh: () => void | Promise<unknown>;
  onResolved: () => void;
}) {
  const { basePath } = useAppMode();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [verifying, setVerifying] = useState(false);
  const [verificationFailed, setVerificationFailed] = useState(false);
  const [verificationUnresolved, setVerificationUnresolved] = useState(false);
  const [found, setFound] = useState<{ id: number; exact: boolean }>();

  const verify = async () => {
    if (verifying) return;
    setVerifying(true);
    setVerificationFailed(false);
    setVerificationUnresolved(false);
    try {
      const result = await reconcileMailTemplateTranslationCreateAfterSettling(
        props.templateId,
        props.attempt,
      );
      await props.onListRefresh();
      if (result.status === 'found') {
        setFound({ id: result.resource.id, exact: result.exact });
      } else {
        setVerificationUnresolved(true);
      }
    } catch {
      setVerificationFailed(true);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Alert
      variant="danger"
      title={t('mailer.templates.detail.translations.indeterminate.title')}
      testId="admin.mailer.templates.detail.translations.indeterminate"
    >
      <div className="space-y-3">
        <p>{t('mailer.templates.detail.translations.indeterminate.body')}</p>
        <p className="font-medium" data-testid="admin.mailer.templates.detail.translations.indeterminate.fingerprint">
          {t('mailer.templates.detail.translations.indeterminate.attempt', {
            language: props.attempt.languageLabel,
            subject: props.attempt.subject,
          })}
        </p>
        {verificationFailed ? (
          <p data-testid="admin.mailer.templates.detail.translations.indeterminate.verify_error">
            {t('mailer.templates.detail.translations.indeterminate.verify_failed')}
          </p>
        ) : null}
        {verificationUnresolved ? (
          <p data-testid="admin.mailer.templates.detail.translations.indeterminate.unresolved">
            {t('mailer.templates.detail.translations.indeterminate.unresolved')}
          </p>
        ) : null}
        {found ? (
          <div className="space-y-2" data-testid="admin.mailer.templates.detail.translations.indeterminate.found">
            <p>
              {t(found.exact
                ? 'mailer.templates.detail.translations.indeterminate.found_exact'
                : 'mailer.templates.detail.translations.indeterminate.found_conflict')}
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                props.onResolved();
                navigate(`${basePath}/mailer/templates/${props.templateId}/translations/${found.id}`);
              }}
              testId="admin.mailer.templates.detail.translations.indeterminate.open"
            >
              {t('mailer.templates.detail.translations.indeterminate.open')}
            </Button>
          </div>
        ) : (
          <Button
            variant="secondary"
            onClick={() => void verify()}
            loading={verifying}
            testId="admin.mailer.templates.detail.translations.indeterminate.verify"
          >
            {t('mailer.templates.detail.translations.indeterminate.verify')}
          </Button>
        )}
      </div>
    </Alert>
  );
}
