import { useI18n } from '../../app/i18n';
import { Link } from 'react-router-dom';
import type { DashboardDensity } from '../../app/dashboardSettingsModel';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { advisoryCveLabels, type SecurityAdvisory } from '../../lib/api/securityAdvisories';
import { securityAdvisoryStateLabel } from '../../lib/apiValues';
import type { BadgeVariant } from '../../lib/taskStatus';
import { formatDateTime } from '../../lib/time';
import { pickTranslation } from '../../lib/translations';

function advisoryStateBadge(
  state: unknown,
  t: (key: string, vars?: Record<string, unknown>) => string,
): { variant: BadgeVariant; label: string } {
  const normalized = String(state ?? '').trim();
  if (normalized === 'published') return { variant: 'ok', label: securityAdvisoryStateLabel(t, normalized) };
  if (normalized === 'retracted') return { variant: 'warn', label: securityAdvisoryStateLabel(t, normalized) };
  if (normalized === 'draft') return { variant: 'neutral', label: securityAdvisoryStateLabel(t, normalized) };
  return {
    variant: 'neutral',
    label: normalized ? securityAdvisoryStateLabel(t, normalized) : t('state.unknown'),
  };
}

function SecurityAdvisoryItem(props: { advisory: SecurityAdvisory; detailBasePath: string }) {
  const i18n = useI18n();
  const advisory = props.advisory;
  const cves = advisoryCveLabels(advisory);
  const summary = pickTranslation(advisory, 'summary', i18n.preferredLanguageCodes);
  const stateBadge = advisoryStateBadge(advisory.state, i18n.t);
  const title = advisory.name || i18n.t('dashboard.section.security.fallback_title', { id: advisory.id });
  const detailHref = `${props.detailBasePath}/${advisory.id}`;
  const affectedUserCount = typeof advisory.affected_user_count === 'number' ? advisory.affected_user_count : null;
  const affectedVpsCount = typeof advisory.affected_vps_count === 'number' ? advisory.affected_vps_count : null;
  const affectedNodeCount = typeof advisory.affected_node_count === 'number' ? advisory.affected_node_count : null;
  return (
    <div className="space-y-1.5 bg-surface-2 px-3 py-2.5" data-testid="app.dashboard.security.item">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link to={detailHref} className="font-medium hover:underline">{title}</Link>
        <Badge variant={stateBadge.variant}>{stateBadge.label}</Badge>
        {advisory.affected === true ? (
          <Badge variant="danger">{i18n.t('dashboard.section.security.affects_me')}</Badge>
        ) : advisory.affected === false ? (
          <Badge variant="neutral">{i18n.t('dashboard.section.security.not_affected')}</Badge>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span>
          {i18n.t('dashboard.section.security.published')}: {formatDateTime(advisory.published_at)}
        </span>
        {affectedNodeCount !== null ? (
          <span>· {i18n.t('dashboard.section.security.affected_nodes', { count: affectedNodeCount })}</span>
        ) : null}
        {affectedUserCount !== null || affectedVpsCount !== null ? (
          <span>
            · {i18n.t('dashboard.section.security.affected_users_vps', {
              users: affectedUserCount ?? '—',
              vps: affectedVpsCount ?? '—',
            })}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1">
        {cves.length > 0 ? (
          cves.slice(0, 6).map((cve) => <Badge key={cve} variant="info">{cve}</Badge>)
        ) : (
          <Badge variant="neutral">{i18n.t('dashboard.section.security.no_cves')}</Badge>
        )}
        {cves.length > 6 ? (
          <span className="text-xs text-muted">{i18n.t('common.more_n', { count: cves.length - 6 })}</span>
        ) : null}
      </div>
      {summary ? <div className="text-sm text-muted">{summary}</div> : null}
    </div>
  );
}

export function SecurityAdvisoriesCard(props: {
  isLoading: boolean;
  isError: boolean;
  advisories: SecurityAdvisory[];
  listPath: string;
  detailBasePath: string;
  collapsed?: boolean;
  density?: DashboardDensity;
  itemLimit?: number;
  onToggleCollapsed?: () => void;
}) {
  const { t } = useI18n();
  const collapsed = props.collapsed === true;
  const compact = props.density === 'compact';
  const itemLimit = props.itemLimit ?? 3;
  return (
    <Card testId="app.dashboard.security.card">
      <CardHeader
        className="items-center p-3"
        title={t('dashboard.section.security.title')}
        subtitle={t('dashboard.section.security.subtitle')}
        actions={
          <>
            {props.onToggleCollapsed ? (
              <Button variant="secondary" size="sm" onClick={props.onToggleCollapsed} testId="app.dashboard.widget.security.collapse">
                {collapsed ? t('dashboard.preferences.widget.expand') : t('dashboard.preferences.widget.collapse')}
              </Button>
            ) : null}
            <Button to={props.listPath} variant="secondary" size="sm">
              {t('dashboard.section.security.open')}
            </Button>
          </>
        }
      />
      <CardBody className={compact ? 'p-2.5' : 'p-3'}>
        {props.isLoading ? (
          <Spinner label={t('dashboard.section.security.loading')} />
        ) : props.isError ? (
          <Alert title={t('dashboard.section.security.error')} variant="danger" />
        ) : props.advisories.length === 0 ? (
          <div className="text-sm text-muted">{t('dashboard.section.security.empty')}</div>
        ) : collapsed ? (
          <div className="text-sm text-muted">
            {t('dashboard.widget.security.collapsed_summary', { count: props.advisories.length })}
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {props.advisories.slice(0, itemLimit).map((advisory) => (
              <SecurityAdvisoryItem key={advisory.id} advisory={advisory} detailBasePath={props.detailBasePath} />
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
