import React from 'react';

import { useI18n } from '../../../app/i18n';
import { Badge } from '../../../components/ui/Badge';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { Spinner } from '../../../components/ui/Spinner';
import type { OutageUpdate } from '../../../lib/api/public';
import { formatDateTime } from '../../../lib/format';
import { outageUpdateBadges } from '../../../lib/outageBadges';
import { pickLocalizedField } from '../../../lib/translations';

export function OutageUpdatesCard(props: {
  updates?: OutageUpdate[];
  loading: boolean;
  preferredLanguageCodes: string[];
}) {
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader title={t('admin.outages.section.updates')} />
      <CardBody>
        {props.loading ? <Spinner label={t('common.loading')} /> : props.updates?.length ? (
          <div className="space-y-3">
            {props.updates.map((update) => {
              const badges = outageUpdateBadges(update, t);
              const summary = pickLocalizedField(update, 'summary', props.preferredLanguageCodes)
                ?? t('public.outage_detail.updates.update_fallback', { id: update.id });
              return (
                <div key={update.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={badges.lifecycle.variant}>{badges.lifecycle.label}</Badge>
                    {badges.impact ? <Badge variant={badges.impact.variant}>{badges.impact.label}</Badge> : null}
                  </div>
                  <div className="mt-2 text-sm font-medium">{summary}</div>
                  <div className="mt-1 text-xs text-muted">
                    {formatDateTime(update.created_at)} · {update.reporter_name || '—'}
                  </div>
                </div>
              );
            })}
          </div>
        ) : <div className="text-sm text-muted">{t('public.outage_detail.updates.empty')}</div>}
      </CardBody>
    </Card>
  );
}
