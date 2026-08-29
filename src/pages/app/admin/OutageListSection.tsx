import { Link } from 'react-router-dom';

import { useI18n } from '../../../app/i18n';
import { Badge } from '../../../components/ui/Badge';
import { Card, CardBody } from '../../../components/ui/Card';
import { TableCard } from '../../../components/ui/TableCard';
import type { Outage } from '../../../lib/api/public';
import { formatDateTime } from '../../../lib/format';
import { outageBadges } from '../../../lib/outageBadges';
import { pickLocalizedField } from '../../../lib/translations';
import type { OutageListGroup } from './outageAdminModel';

export function OutageListSection(props: {
  group: OutageListGroup;
  rows: Outage[];
}) {
  const i18n = useI18n();
  return (
    <section className="space-y-2" data-testid={`admin.outages.group.${props.group}`}>
      <div className="flex items-center gap-2 px-1">
        <h2 className="text-base font-semibold text-fg">{i18n.t(`admin.outages.group.${props.group}`)}</h2>
        <Badge variant={props.group === 'active' ? 'danger' : props.group === 'planned' ? 'info' : 'neutral'}>
          {i18n.t('admin.outages.group.page_count', { count: props.rows.length })}
        </Badge>
      </div>
      {props.rows.length ? (
        <TableCard testId={`admin.outages.table.${props.group}`} minWidth="lg">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted">{i18n.t('common.id')}</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted">{i18n.t('admin.outages.field.begins_at')}</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted">{i18n.t('admin.outages.field.state')}</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted">{i18n.t('admin.outages.field.summary')}</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-muted">{i18n.t('admin.outages.field.users')}</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-muted">{i18n.t('admin.outages.field.vps')}</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((outage) => {
              const badges = outageBadges(outage, i18n.t);
              const summary = pickLocalizedField(outage, 'summary', i18n.preferredLanguageCodes)
                ?? i18n.t('public.outage.fallback_title', { id: outage.id });
              return (
                <tr key={outage.id}>
                  <td className="px-3 py-2 font-mono text-xs"><Link className="underline" to={`/admin/outages/${outage.id}`}>#{outage.id}</Link></td>
                  <td className="px-3 py-2 text-sm">{formatDateTime(outage.begins_at)}</td>
                  <td className="px-3 py-2"><Badge variant={badges.lifecycle.variant}>{badges.lifecycle.label}</Badge></td>
                  <td className="px-3 py-2 text-sm"><Link className="font-medium text-link hover:underline" to={`/admin/outages/${outage.id}`}>{summary}</Link></td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{outage.state === 'staged' ? '—' : (outage.affected_user_count ?? '—')}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{outage.state === 'staged' ? '—' : (outage.affected_direct_vps_count ?? '—')}</td>
                </tr>
              );
            })}
          </tbody>
        </TableCard>
      ) : (
        <Card><CardBody className="text-sm text-muted">{i18n.t(`admin.outages.group.${props.group}_empty`)}</CardBody></Card>
      )}
    </section>
  );
}
