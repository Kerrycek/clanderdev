import React from 'react';

import { useI18n } from '../../../app/i18n';
import { Alert } from '../../../components/ui/Alert';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';

function RestoreStep(props: { number: number; title: string; body: string }) {
  return (
    <li className="flex gap-3 rounded-lg border border-border bg-surface-2 p-3">
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-fg"
        aria-hidden="true"
      >
        {props.number}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-fg">{props.title}</div>
        <div className="mt-1 text-xs text-muted">{props.body}</div>
      </div>
    </li>
  );
}

export function BackupCenterRestoreGuide() {
  const { t } = useI18n();

  return (
    <Card testId="backups.restore.guide">
      <CardHeader
        title={t('backups.restore.title')}
        subtitle={t('backups.restore.subtitle')}
      />
      <CardBody className="space-y-4">
        <ol className="grid gap-3 md:grid-cols-3">
          <RestoreStep
            number={1}
            title={t('backups.restore.step.dataset.title')}
            body={t('backups.restore.step.dataset.body')}
          />
          <RestoreStep
            number={2}
            title={t('backups.restore.step.snapshot.title')}
            body={t('backups.restore.step.snapshot.body')}
          />
          <RestoreStep
            number={3}
            title={t('backups.restore.step.confirm.title')}
            body={t('backups.restore.step.confirm.body')}
          />
        </ol>
        <Alert
          title={t('backups.restore.warning.title')}
          variant="warn"
          testId="backups.restore.warning"
        >
          {t('backups.restore.warning.body')}
        </Alert>
      </CardBody>
    </Card>
  );
}
