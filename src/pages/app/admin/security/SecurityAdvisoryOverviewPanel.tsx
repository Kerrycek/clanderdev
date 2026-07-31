import type { ReactNode } from 'react';

import { useI18n } from '../../../../app/i18n';
import { Alert } from '../../../../components/ui/Alert';
import { Card, CardBody, CardHeader } from '../../../../components/ui/Card';
import type { Language } from '../../../../lib/api/languages';
import type { SecurityAdvisory } from '../../../../lib/api/securityAdvisories';
import { formatDateTime } from '../../../../lib/format';
import type { PublishReadinessIssue } from './securityAdvisoryAdminModel';
import {
  finiteSecurityAdvisoryCount,
  securityAdvisoryReadinessMessage,
} from './securityAdvisoryDetailViewModel';

function StatCard(props: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/55 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-faint">{props.label}</div>
      <div className="mt-1 text-2xl font-semibold text-fg">{props.value}</div>
    </div>
  );
}

export function SecurityAdvisoryOverviewPanel(props: {
  advisory: SecurityAdvisory;
  languages: Language[];
  readinessIssues: PublishReadinessIssue[];
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('admin.security_advisories.table.nodes')}
          value={finiteSecurityAdvisoryCount(props.advisory.affected_node_count)}
        />
        <StatCard
          label={t('admin.security_advisories.table.users')}
          value={finiteSecurityAdvisoryCount(props.advisory.affected_user_count)}
        />
        <StatCard
          label={t('admin.security_advisories.table.vps')}
          value={finiteSecurityAdvisoryCount(props.advisory.affected_vps_count)}
        />
        <StatCard
          label={t('admin.security_advisories.table.published')}
          value={
            <span className="text-base">
              {props.advisory.published_at ? formatDateTime(props.advisory.published_at) : '—'}
            </span>
          }
        />
      </div>

      <Alert
        variant={props.readinessIssues.length === 0 ? 'ok' : 'warn'}
        title={
          props.readinessIssues.length === 0
            ? t('admin.security_advisories.readiness.ready')
            : t('admin.security_advisories.readiness.not_ready')
        }
        testId="admin.security_advisory.readiness"
      >
        {props.readinessIssues.length === 0 ? (
          t('admin.security_advisories.readiness.ready_body')
        ) : (
          <ul className="list-disc space-y-1 pl-5">
            {props.readinessIssues.slice(0, 8).map((issue, index) => (
              <li key={`${issue.type}-${index}`}>{securityAdvisoryReadinessMessage(issue, t)}</li>
            ))}
            {props.readinessIssues.length > 8 ? (
              <li>{t('admin.security_advisories.readiness.more', { count: props.readinessIssues.length - 8 })}</li>
            ) : null}
          </ul>
        )}
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        {props.languages.map((language) => {
          const code = String(language.code ?? '').trim().toLowerCase();
          if (!code) return null;
          return (
            <Card key={language.id}>
              <CardHeader title={String(language.label ?? code.toUpperCase())} subtitle={code.toUpperCase()} />
              <CardBody className="space-y-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-faint">
                    {t('admin.security_advisories.field.summary')}
                  </div>
                  <p className="mt-1 text-sm text-fg">{String(props.advisory[`${code}_summary`] ?? '—')}</p>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-faint">
                    {t('admin.security_advisories.field.description')}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted">
                    {String(props.advisory[`${code}_description`] ?? '—')}
                  </p>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-faint">
                    {t('admin.security_advisories.field.response')}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted">
                    {String(props.advisory[`${code}_response`] ?? '—')}
                  </p>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
