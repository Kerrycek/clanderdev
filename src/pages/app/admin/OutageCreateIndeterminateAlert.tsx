import React from 'react';

import { useI18n } from '../../../app/i18n';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';

export function OutageCreateIndeterminateAlert(props: {
  loading: boolean;
  onVerify: () => void;
}) {
  const { t } = useI18n();

  return (
    <Alert
      variant="danger"
      title={t('admin.outages.create.indeterminate_title')}
      testId="admin.outages.create.indeterminate"
    >
      <div className="space-y-3">
        <p>{t('admin.outages.create.indeterminate_body')}</p>
        <Button
          variant="secondary"
          loading={props.loading}
          onClick={props.onVerify}
          testId="admin.outages.create.verify"
        >
          {t('admin.outages.create.verify')}
        </Button>
      </div>
    </Alert>
  );
}
