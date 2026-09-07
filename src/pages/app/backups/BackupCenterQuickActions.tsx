import React from 'react';

import { useI18n } from '../../../app/i18n';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';

export function BackupCenterQuickActions(props: {
  onRestore: () => void;
  onDownloads: () => void;
  onPlans: () => void;
}) {
  const { t } = useI18n();

  return (
    <Card testId="backups.quick">
      <CardHeader title={t('backups.quick.title')} subtitle={t('backups.quick.subtitle')} />
      <CardBody className="grid gap-3 md:grid-cols-3">
        <Button onClick={props.onRestore} variant="secondary" testId="backups.quick.restore">
          {t('backups.quick.restore')}
        </Button>
        <Button onClick={props.onDownloads} variant="secondary" testId="backups.quick.downloads">
          {t('backups.quick.downloads')}
        </Button>
        <Button onClick={props.onPlans} variant="secondary" testId="backups.quick.plans">
          {t('backups.quick.plans')}
        </Button>
      </CardBody>
    </Card>
  );
}
