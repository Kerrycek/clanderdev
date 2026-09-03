import { LinkButton } from '../../components/ui/LinkButton';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { CompactOutageSummary } from '../../components/outages/CompactOutageSummary';
import type { NewsLog, Outage } from '../../lib/api/public';
import type { SecurityAdvisory } from '../../lib/api/securityAdvisories';
import {
  isDashboardWidgetCollapsed,
  toggleDashboardWidgetCollapsed,
  visibleDashboardWidgets,
  type DashboardSettings,
  type DashboardWidgetId,
} from '../../app/dashboardSettingsModel';
import { useI18n } from '../../app/i18n';

import {
  ClusterHealthCard,
  DashboardNewsItem,
  SecurityAdvisoriesCard,
  summarizeNodes,
} from './DashboardOperationalCards';

type NodeData = ReturnType<typeof summarizeNodes>;

function widgetCollapseButton(props: {
  id: DashboardWidgetId;
  collapsed: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <Button variant="secondary" size="sm" onClick={props.onClick} testId={`app.dashboard.widget.${props.id}.collapse`}>
      {props.label}
    </Button>
  );
}

export function DashboardWidgetGrid(props: {
  dashboardSettings: DashboardSettings;
  setDashboardSettings: (settings: DashboardSettings) => void;
  density: 'comfortable' | 'compact';
  outages: {
    isLoading: boolean;
    isError: boolean;
    dataCount: number;
    currentCount: number;
    plannedCount: number;
    resolvedCount: number;
    highlighted: Outage[];
    listPath: string;
    detailPath: (id: number) => string;
  };
  news: {
    isLoading: boolean;
    isError: boolean;
    items: NewsLog[];
    path: string;
  };
  security: {
    isLoading: boolean;
    isError: boolean;
    advisories: SecurityAdvisory[];
    listPath: string;
    detailBasePath: string;
  };
  cluster: {
    isLoading: boolean;
    isError: boolean;
    nodeData: NodeData;
    nodeIssueCount: number;
  };
}) {
  const { t } = useI18n();
  const compact = props.density === 'compact';
  const itemLimit = compact ? 2 : 3;
  const hasRecentOutages = props.outages.currentCount > 0 || props.outages.plannedCount > 0;
  const showOutages = props.outages.isLoading || props.outages.isError || hasRecentOutages;
  const showSecurity = props.security.isLoading || props.security.isError || props.security.advisories.length > 0;

  const toggleCollapsed = (id: DashboardWidgetId) => {
    props.setDashboardSettings(
      toggleDashboardWidgetCollapsed(props.dashboardSettings, id, !isDashboardWidgetCollapsed(props.dashboardSettings, id)),
    );
  };

  const collapseLabel = (collapsed: boolean) =>
    collapsed ? t('dashboard.preferences.widget.expand') : t('dashboard.preferences.widget.collapse');

  const renderWidget = (id: DashboardWidgetId) => {
    const collapsed = isDashboardWidgetCollapsed(props.dashboardSettings, id);

    if (id === 'outages') {
      if (!showOutages) return null;

      return (
        <Card key={id} testId="app.dashboard.outages.card">
          <CardHeader
            className="items-center p-3"
            title={t('dashboard.section.outages.title')}
            subtitle={t('dashboard.section.outages.subtitle_compact', {
              current: props.outages.currentCount,
              planned: props.outages.plannedCount,
            })}
            actions={
              <>
                {widgetCollapseButton({ id, collapsed, onClick: () => toggleCollapsed(id), label: collapseLabel(collapsed) })}
                <LinkButton to={props.outages.listPath} variant="secondary" size="sm">
                  {t('dashboard.section.outages.open')}
                </LinkButton>
              </>
            }
          />
          <CardBody className={compact ? 'p-2.5' : 'p-3'}>
            {props.outages.isLoading ? (
              <Spinner label={t('dashboard.section.outages.loading')} />
            ) : props.outages.isError ? (
              <Alert title={t('dashboard.section.outages.error')} variant="danger" />
            ) : props.outages.dataCount === 0 ? (
              <div className="text-sm text-muted">{t('dashboard.section.outages.empty')}</div>
            ) : collapsed ? (
              <div className="text-sm text-muted">
                {t('dashboard.widget.outages.collapsed_summary', {
                  current: props.outages.currentCount,
                  planned: props.outages.plannedCount,
                  resolved: props.outages.resolvedCount,
                })}
              </div>
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
                {props.outages.highlighted.slice(0, itemLimit).map((o) => (
                  <CompactOutageSummary key={o.id} outage={o} to={props.outages.detailPath(o.id)} />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      );
    }

    if (id === 'security') {
      if (!showSecurity) return null;

      return (
        <SecurityAdvisoriesCard
          key={id}
          isLoading={props.security.isLoading}
          isError={props.security.isError}
          advisories={props.security.advisories}
          listPath={props.security.listPath}
          detailBasePath={props.security.detailBasePath}
          collapsed={collapsed}
          density={props.density}
          itemLimit={itemLimit}
          onToggleCollapsed={() => toggleCollapsed(id)}
        />
      );
    }

    if (id === 'news') {
      return (
        <Card key={id} testId="app.dashboard.news.card">
          <CardHeader
            className="items-center p-3"
            title={t('dashboard.section.news.title')}
            subtitle={t('dashboard.section.news.subtitle_compact')}
            actions={
              <>
                {widgetCollapseButton({ id, collapsed, onClick: () => toggleCollapsed(id), label: collapseLabel(collapsed) })}
                <LinkButton to={props.news.path} variant="secondary" size="sm">
                  {t('dashboard.section.news.all')}
                </LinkButton>
              </>
            }
          />
          <CardBody className={compact ? 'p-2.5' : 'p-3'}>
            {props.news.isLoading ? (
              <Spinner label={t('dashboard.section.news.loading')} />
            ) : props.news.isError ? (
              <Alert title={t('dashboard.section.news.error')} variant="danger" />
            ) : props.news.items.length === 0 ? (
              <div className="text-sm text-muted">{t('dashboard.section.news.empty')}</div>
            ) : collapsed ? (
              <div className="text-sm text-muted">
                {t('dashboard.widget.news.collapsed_summary', { count: props.news.items.length })}
              </div>
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
                {props.news.items.slice(0, itemLimit).map((news) => (
                  <DashboardNewsItem key={news.id} news={news} />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      );
    }

    return (
      <ClusterHealthCard
        key={id}
        isLoading={props.cluster.isLoading}
        isError={props.cluster.isError}
        nodeData={props.cluster.nodeData}
        nodeIssueCount={props.cluster.nodeIssueCount}
        collapsed={collapsed}
        density={props.density}
        onToggleCollapsed={() => toggleCollapsed(id)}
      />
    );
  };

  const widgets = visibleDashboardWidgets(props.dashboardSettings);

  return <div className="space-y-3">{widgets.map(renderWidget)}</div>;
}
