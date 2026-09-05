import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAppMode } from '../../../../app/appMode';
import { useI18n } from '../../../../app/i18n';
import { Alert } from '../../../../components/ui/Alert';
import { Button } from '../../../../components/ui/Button';
import {
  reconcileMailTemplateCreateAfterSettling,
  type MailTemplateCreateFingerprint,
} from '../../../../lib/api/mailTemplateCreateReconciliation';

export type IndeterminateMailTemplateCreateAttempt = MailTemplateCreateFingerprint;

export function MailTemplateCreateIndeterminateGuard(props: {
  attempt: IndeterminateMailTemplateCreateAttempt;
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
      const result = await reconcileMailTemplateCreateAfterSettling(props.attempt);
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
      title={t('mailer.templates.create.indeterminate.title')}
      testId="admin.mailer.templates.create.indeterminate"
    >
      <div className="space-y-3">
        <p>{t('mailer.templates.create.indeterminate.body')}</p>
        <p className="font-medium" data-testid="admin.mailer.templates.create.indeterminate.fingerprint">
          {t('mailer.templates.create.indeterminate.attempt', {
            name: props.attempt.name,
            templateId: props.attempt.template_id,
          })}
        </p>
        {verificationFailed ? (
          <p data-testid="admin.mailer.templates.create.indeterminate.verify_error">
            {t('mailer.templates.create.indeterminate.verify_failed')}
          </p>
        ) : null}
        {verificationUnresolved ? (
          <p data-testid="admin.mailer.templates.create.indeterminate.unresolved">
            {t('mailer.templates.create.indeterminate.unresolved')}
          </p>
        ) : null}
        {found ? (
          <div className="space-y-2" data-testid="admin.mailer.templates.create.indeterminate.found">
            <p>
              {t(found.exact
                ? 'mailer.templates.create.indeterminate.found_exact'
                : 'mailer.templates.create.indeterminate.found_conflict')}
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                props.onResolved();
                navigate(`${basePath}/mailer/templates/${found.id}`);
              }}
              testId="admin.mailer.templates.create.indeterminate.open"
            >
              {t('mailer.templates.create.indeterminate.open')}
            </Button>
          </div>
        ) : (
          <Button
            variant="secondary"
            onClick={() => void verify()}
            loading={verifying}
            testId="admin.mailer.templates.create.indeterminate.verify"
          >
            {t('mailer.templates.create.indeterminate.verify')}
          </Button>
        )}
      </div>
    </Alert>
  );
}
