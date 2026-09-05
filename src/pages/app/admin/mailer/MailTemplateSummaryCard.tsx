import React from 'react';

import { useI18n } from '../../../../app/i18n';
import { Badge } from '../../../../components/ui/Badge';
import { Card } from '../../../../components/ui/Card';
import type { MailTemplate } from '../../../../lib/api/mailer';
import { formatDateTime } from '../../../../lib/format';

function visibilityLabelKey(value: string | undefined): string {
  if (value === 'visible') return 'mailer.templates.visibility.visible';
  if (value === 'invisible') return 'mailer.templates.visibility.invisible';
  return 'mailer.templates.visibility.default';
}

export function MailTemplateSummaryCard(props: { template: MailTemplate }) {
  const { t } = useI18n();
  const template = props.template;

  return (
    <Card testId="admin.mailer.templates.detail.summary">
      <div className="grid gap-4 p-4 md:grid-cols-2">
        <div>
          <div className="text-xs font-medium text-muted">{t('mailer.templates.fields.name')}</div>
          <div className="mt-1 text-sm">{String(template.name ?? t('common.na'))}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted">{t('mailer.templates.fields.template_id')}</div>
          <div className="mt-1 text-sm font-mono">{String(template.template_id ?? t('common.na'))}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted">{t('mailer.templates.fields.label')}</div>
          <div className="mt-1 text-sm">{String(template.label ?? t('common.na'))}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted">{t('mailer.templates.fields.updated')}</div>
          <div className="mt-1 text-sm">{formatDateTime(template.updated_at)}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted">{t('mailer.templates.fields.user_visibility')}</div>
          <div className="mt-1">
            <Badge variant="neutral">{t(visibilityLabelKey(template.user_visibility))}</Badge>
          </div>
        </div>
      </div>
    </Card>
  );
}
