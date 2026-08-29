import React from 'react';

import { useI18n } from '../../../app/i18n';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { Spinner } from '../../../components/ui/Spinner';
import { formatErrorMessage } from '../../../lib/errors';
import type {
  OutageAffectedExport,
  OutageAffectedUser,
  OutageAffectedVps,
} from '../../../lib/api/outages';

interface QueryState<T> {
  data?: T[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}

interface OutageAffectedTablesProps {
  usersQ: QueryState<OutageAffectedUser>;
  vpsQ: QueryState<OutageAffectedVps>;
  exportsQ: QueryState<OutageAffectedExport>;
  userTotal?: number;
  vpsTotal?: number;
  exportTotal?: number;
}

function refValue(ref: unknown, key: string): string | undefined {
  if (!ref || typeof ref !== 'object') return undefined;
  const value = (ref as Record<string, unknown>)[key];
  return typeof value === 'string' && value ? value : undefined;
}

function refId(ref: unknown): number | undefined {
  if (!ref || typeof ref !== 'object') return undefined;
  const value = (ref as Record<string, unknown>)['id'];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function OutageAffectedTables(props: OutageAffectedTablesProps) {
  const { t } = useI18n();

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <AffectedCard
        title={t('admin.outages.section.affected_users')}
        query={props.usersQ}
        total={props.userTotal}
        render={(row) => `${refValue(row.user, 'login') || refValue(row.user, 'label') || `#${refId(row.user) ?? row.id}`} · VPS ${row.vps_count ?? 0} · exports ${row.export_count ?? 0}`}
        testId="admin.outages.affected.users"
      />
      <AffectedCard
        title={t('admin.outages.section.affected_vps')}
        query={props.vpsQ}
        total={props.vpsTotal}
        render={(row) => `#${refId(row.vps) ?? row.id} ${refValue(row.vps, 'hostname') || refValue(row.vps, 'label') || ''}${row.direct === false ? ` (${t('admin.outages.field.indirect')})` : ''}`}
        testId="admin.outages.affected.vps"
      />
      <AffectedCard
        title={t('admin.outages.section.affected_exports')}
        query={props.exportsQ}
        total={props.exportTotal}
        render={(row) => `#${refId(row.export) ?? row.id} ${refValue(row.export, 'path') || refValue(row.export, 'label') || ''}`}
        testId="admin.outages.affected.exports"
      />
    </div>
  );
}

function AffectedCard<T extends { id: number }>(props: {
  title: string;
  query: QueryState<T>;
  total?: number;
  render: (row: T) => string;
  testId: string;
}) {
  const { t } = useI18n();
  const rows = props.query.data ?? [];
  const shownRows = rows.slice(0, 20);
  const total = Math.max(props.total ?? rows.length, rows.length);

  return (
    <Card testId={props.testId}>
      <CardHeader title={props.title} />
      <CardBody>
        {props.query.isLoading ? <Spinner label={t('common.loading')} /> : props.query.isError ? (
          <div className="text-sm text-danger">{formatErrorMessage(props.query.error)}</div>
        ) : shownRows.length ? (
          <>
            <ul className="space-y-1 text-sm">{shownRows.map((row) => <li key={row.id}>{props.render(row)}</li>)}</ul>
            {total > shownRows.length ? (
              <div className="mt-3 text-xs text-muted" data-testid={`${props.testId}.preview_count`}>
                {t('admin.outages.affected.preview_count', { shown: shownRows.length, total })}
              </div>
            ) : null}
          </>
        ) : <div className="text-sm text-muted">{t('common.none')}</div>}
      </CardBody>
    </Card>
  );
}
