import { Plus } from 'lucide-react';

import { useI18n } from '../../../../app/i18n';
import { Alert } from '../../../../components/ui/Alert';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../../components/ui/Card';
import { LoadingState } from '../../../../components/ui/LoadingState';
import type { SecurityAdvisoryUpdate } from '../../../../lib/api/securityAdvisories';
import { securityAdvisoryStateLabel } from '../../../../lib/apiValues';
import { formatErrorMessage } from '../../../../lib/errors';
import { formatDateTime } from '../../../../lib/format';
import { pickLocalizedField } from '../../../../lib/translations';
import { resourceLabel } from './securityAdvisoryAdminModel';
import { securityAdvisoryStateVariant } from './securityAdvisoryDetailViewModel';

export function SecurityAdvisoryUpdatesPanel(props: {
  updates: SecurityAdvisoryUpdate[];
  state: string;
  canPostUpdate: boolean;
  languagesReady: boolean;
  loading: boolean;
  error?: unknown;
  onCreate: () => void;
  onEdit: (update: SecurityAdvisoryUpdate) => void;
  onDelete: (update: SecurityAdvisoryUpdate) => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;

  return (
    <div className="space-y-3">
      {props.canPostUpdate ? (
        <div className="flex justify-end">
          <Button
            variant="primary"
            onClick={props.onCreate}
            disabled={!props.languagesReady}
            disabledReason={!props.languagesReady ? t('admin.security_advisories.validation.languages_unavailable') : undefined}
            testId="admin.security_advisory.updates.post_update"
          >
            <Plus size={16} /> {t('admin.security_advisories.action.post_update')}
          </Button>
        </div>
      ) : (
        <Alert
          variant="neutral"
          title={t(
            props.state === 'retracted'
              ? 'admin.security_advisories.updates.retracted_help'
              : 'admin.security_advisories.updates.draft_help',
          )}
        />
      )}

      {props.loading ? <LoadingState /> : props.error ? (
        <Alert variant="danger" title={t('common.error')}>{formatErrorMessage(props.error)}</Alert>
      ) : props.updates.length === 0 ? (
        <Alert variant="neutral" title={t('admin.security_advisories.updates.empty')} />
      ) : props.updates.map((update) => {
        const summary = pickLocalizedField(update, 'summary', i18n.preferredLanguageCodes) ?? '—';
        const message = pickLocalizedField(update, 'message', i18n.preferredLanguageCodes);
        return (
          <Card key={update.id} testId={`admin.security_advisory.update.${update.id}`}>
            <CardHeader
              title={summary}
              subtitle={`${formatDateTime(update.created_at)} · ${update.reporter_name || resourceLabel(update.reported_by)}`}
              actions={(
                <div className="flex flex-wrap items-center gap-2">
                  {update.state ? (
                    <Badge variant={securityAdvisoryStateVariant(String(update.state))}>
                      {securityAdvisoryStateLabel(t, String(update.state))}
                    </Badge>
                  ) : null}
                  <Button variant="secondary" size="sm" onClick={() => props.onEdit(update)} testId={`admin.security_advisory.update.${update.id}.edit`}>
                    {t('common.edit')}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => props.onDelete(update)} testId={`admin.security_advisory.update.${update.id}.delete`}>
                    {t('common.delete')}
                  </Button>
                </div>
              )}
            />
            {message ? <CardBody><p className="whitespace-pre-wrap text-sm text-muted">{message}</p></CardBody> : null}
          </Card>
        );
      })}
    </div>
  );
}
