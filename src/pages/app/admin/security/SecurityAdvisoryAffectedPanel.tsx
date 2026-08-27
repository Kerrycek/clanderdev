import { Link } from 'react-router-dom';

import { useI18n } from '../../../../app/i18n';
import { Alert } from '../../../../components/ui/Alert';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../../components/ui/Card';
import { LoadingState } from '../../../../components/ui/LoadingState';
import { TableCard } from '../../../../components/ui/TableCard';
import type {
  SecurityAdvisoryAffectedUser,
  SecurityAdvisoryAffectedVps,
} from '../../../../lib/api/securityAdvisories';
import { formatErrorMessage } from '../../../../lib/errors';
import { formatDateTime } from '../../../../lib/format';
import { resourceId, resourceLabel } from './securityAdvisoryAdminModel';
import {
  finiteSecurityAdvisoryCount,
  nodeStateTranslationKey,
} from './securityAdvisoryDetailViewModel';

export function SecurityAdvisoryAffectedPanel(props: {
  users: SecurityAdvisoryAffectedUser[];
  vps: SecurityAdvisoryAffectedVps[];
  usersLoading: boolean;
  vpsLoading: boolean;
  usersError?: unknown;
  vpsError?: unknown;
}) {
  const { t } = useI18n();
  const loading = props.usersLoading || props.vpsLoading;
  const error = props.usersError ?? props.vpsError;

  return (
    <div className="space-y-4">
      {loading ? <LoadingState /> : null}
      {error ? (
        <Alert variant="danger" title={t('common.error')}>{formatErrorMessage(error)}</Alert>
      ) : null}

      {!props.usersLoading && !props.usersError ? (
        <Card>
          <CardHeader
            title={t('admin.security_advisories.affected.users_title')}
            subtitle={t('admin.security_advisories.affected.users_subtitle')}
          />
          {props.users.length === 0 ? (
            <CardBody><Alert variant="neutral" title={t('admin.security_advisories.affected.no_users')} /></CardBody>
          ) : (
            <TableCard minWidth="md">
              <thead>
                <tr>
                  <th>{t('admin.security_advisories.affected.user')}</th>
                  <th className="text-right">{t('admin.security_advisories.table.vps')}</th>
                  <th className="text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {props.users.map((row) => {
                  const id = resourceId(row.user, row.user_id);
                  return (
                    <tr key={row.id} className="table-row-tone">
                      <td>{resourceLabel(row.user)}</td>
                      <td className="text-right tabular-nums">{finiteSecurityAdvisoryCount(row.vps_count)}</td>
                      <td className="text-right">
                        {id ? (
                          <Button to={`/admin/users/${id}`} size="sm" variant="secondary">{t('common.open')}</Button>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableCard>
          )}
        </Card>
      ) : null}

      {!props.vpsLoading && !props.vpsError ? (
        <Card>
          <CardHeader
            title={t('admin.security_advisories.affected.vps_title')}
            subtitle={t('admin.security_advisories.affected.vps_subtitle')}
          />
          {props.vps.length === 0 ? (
            <CardBody><Alert variant="neutral" title={t('admin.security_advisories.affected.no_vps')} /></CardBody>
          ) : (
            <TableCard minWidth="xl">
              <thead>
                <tr>
                  <th>VPS</th>
                  <th>{t('admin.security_advisories.affected.user')}</th>
                  <th>{t('admin.security_advisories.affected.node')}</th>
                  <th>{t('admin.security_advisories.table.state')}</th>
                  <th>{t('admin.security_advisories.nodes.vulnerable_until')}</th>
                  <th>{t('admin.security_advisories.nodes.mitigated_since')}</th>
                </tr>
              </thead>
              <tbody>
                {props.vps.map((row) => {
                  const id = resourceId(row.vps, row.vps_id);
                  return (
                    <tr key={row.id} className="table-row-tone">
                      <td>
                        {id ? (
                          <Link className="font-medium text-accent hover:underline" to={`/admin/vps/${id}`}>
                            {resourceLabel(row.vps)}
                          </Link>
                        ) : resourceLabel(row.vps)}
                      </td>
                      <td>{resourceLabel(row.user)}</td>
                      <td>{resourceLabel(row.node)}</td>
                      <td>
                        <Badge variant={row.node_state === 'mitigated' ? 'ok' : 'warn'}>
                          {t(nodeStateTranslationKey(row.node_state ?? 'unknown'))}
                        </Badge>
                      </td>
                      <td>{row.vulnerable_until ? formatDateTime(row.vulnerable_until) : '—'}</td>
                      <td>{row.mitigated_since ? formatDateTime(row.mitigated_since) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </TableCard>
          )}
        </Card>
      ) : null}
    </div>
  );
}
