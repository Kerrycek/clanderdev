import { Link2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useI18n } from '../../../../app/i18n';
import { Alert } from '../../../../components/ui/Alert';
import { Button } from '../../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../../components/ui/Card';
import { Input } from '../../../../components/ui/Input';
import { LoadingState } from '../../../../components/ui/LoadingState';
import { TableCard } from '../../../../components/ui/TableCard';
import type { SecurityAdvisoryOutageLink } from '../../../../lib/api/securityAdvisories';
import { formatErrorMessage } from '../../../../lib/errors';
import { formatDateTime } from '../../../../lib/format';
import { pickLocalizedField } from '../../../../lib/translations';
import { resourceId, resourceLabel } from './securityAdvisoryAdminModel';
import { securityAdvisoryOutageObject } from './securityAdvisoryDetailViewModel';

export function SecurityAdvisoryOutagesPanel(props: {
  links: SecurityAdvisoryOutageLink[];
  outageId: string;
  loading: boolean;
  linking: boolean;
  error?: unknown;
  onOutageIdChange: (value: string) => void;
  onLink: () => void;
  onUnlink: (link: SecurityAdvisoryOutageLink) => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={t('admin.security_advisories.outages.link_title')}
          subtitle={t('admin.security_advisories.outages.link_subtitle')}
        />
        <CardBody>
          <div className="flex max-w-lg flex-col gap-2 sm:flex-row">
            <Input
              value={props.outageId}
              onChange={(event) => props.onOutageIdChange(event.target.value)}
              inputMode="numeric"
              placeholder={t('admin.security_advisories.outages.id_placeholder')}
              testId="admin.security_advisory.outages.id"
            />
            <Button
              variant="primary"
              onClick={props.onLink}
              loading={props.linking}
              disabled={!props.outageId.trim()}
            >
              <Link2 size={16} /> {t('admin.security_advisories.action.link_outage')}
            </Button>
          </div>
        </CardBody>
      </Card>

      {props.loading ? <LoadingState /> : props.error ? (
        <Alert variant="danger" title={t('common.error')}>{formatErrorMessage(props.error)}</Alert>
      ) : props.links.length === 0 ? (
        <Alert variant="neutral" title={t('admin.security_advisories.outages.empty')} />
      ) : (
        <TableCard minWidth="lg">
          <thead>
            <tr>
              <th>{t('admin.security_advisories.outages.outage')}</th>
              <th>{t('admin.security_advisories.outages.begins_at')}</th>
              <th>{t('admin.security_advisories.outages.summary')}</th>
              <th className="text-right">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {props.links.map((link) => {
              const outage = securityAdvisoryOutageObject(link);
              const id = resourceId(link.outage, link.outage_id);
              const summary = outage
                ? pickLocalizedField(outage, 'summary', i18n.preferredLanguageCodes)
                : undefined;
              return (
                <tr key={link.id} className="table-row-tone">
                  <td>
                    {id ? (
                      <Link to={`/admin/outages/${id}`} className="font-medium text-accent hover:underline">
                        #{id}
                      </Link>
                    ) : resourceLabel(link.outage)}
                  </td>
                  <td>{outage?.['begins_at'] ? formatDateTime(String(outage['begins_at'])) : '—'}</td>
                  <td>{summary ?? '—'}</td>
                  <td className="text-right">
                    <Button size="sm" variant="danger" onClick={() => props.onUnlink(link)}>
                      {t('admin.security_advisories.action.unlink')}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableCard>
      )}
    </div>
  );
}
