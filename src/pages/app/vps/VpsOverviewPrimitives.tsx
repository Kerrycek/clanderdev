import React from 'react';
import { Link } from 'react-router-dom';

import { useI18n } from '../../../app/i18n';
import type { Vps } from '../../../lib/api/vps';
import { Badge } from '../../../components/ui/Badge';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { Alert } from '../../../components/ui/Alert';
import { ChipLink } from '../../../components/ui/ChipLink';
import { CopyButton } from '../../../components/ui/CopyButton';
import { UsageBar } from '../../../components/ui/UsageBar';
import { formatDateTime, formatDurationSeconds, formatMiB } from '../../../lib/format';
import {
  objectStateBadge,
  runtimeStateBadge,
} from '../../../lib/taskStatus';
import {
  formatLoadavg,
  locationLabel,
  nodeLabel,
  ownerId,
  ownerLabel,
  resourceId,
  resourceLabel,
  shouldShowVpsOwner,
  usageValue,
  type ManagementAction,
} from './VpsOverviewModel';

function FieldRow(props: { label: React.ReactNode; value: React.ReactNode; testId?: string }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1" data-testid={props.testId}>
      <div className="text-sm text-faint">{props.label}</div>
      <div className="col-span-2 text-sm text-fg">{props.value ?? '—'}</div>
    </div>
  );
}

export function ManagementActionLink({ action }: { action: ManagementAction }) {
  const toneClass = action.danger
    ? 'border-danger-border bg-danger-bg hover:bg-danger-row'
    : 'border-border bg-surface hover:bg-surface-2';

  return (
    <Link
      to={action.to}
      data-testid={action.testId}
      className={
        'block rounded-lg border p-3 text-left shadow-card transition focus:outline-none focus:ring-2 focus:ring-focus ' +
        toneClass
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium text-fg">{action.label}</div>
        {action.badge ? <div className="shrink-0">{action.badge}</div> : null}
      </div>
      <div className="mt-1 text-xs leading-5 text-muted">{action.description}</div>
    </Link>
  );
}

function UsageMetric(props: { label: string; used: unknown; max: unknown; testId?: string }) {
  const used = usageValue(props.used);
  const max = usageValue(props.max);

  if (used == null || max == null || max <= 0) {
    return (
      <div className="flex items-center justify-between gap-3" data-testid={props.testId}>
        <div className="text-sm text-faint">{props.label}</div>
        <div className="text-sm text-muted">—</div>
      </div>
    );
  }

  return <UsageBar testId={props.testId} label={props.label} used={used} max={max} formatValue={formatMiB} />;
}

export function OverviewStatusAccessCard(props: {
  vps: Vps;
  basePath: string;
  busyTransaction: boolean;
  chainsStale: boolean;
  activeChainIds: number[];
  sshCommand?: string | null;
}) {
  const { t } = useI18n();
  const rt = runtimeStateBadge(props.vps.is_running, t);
  const lc = objectStateBadge(props.vps.object_state, t);
  const node = nodeLabel(props.vps, t('common.na'));
  const location = locationLabel(props.vps, t('common.na'));
  const chainIds = props.activeChainIds.length > 0 ? props.activeChainIds.map((id) => `#${id}`).join(', ') : '—';
  const consoleAvailable = props.vps.is_running === true;

  return (
    <Card className="lg:col-span-2" testId="vps.overview.status_access.card">
      <CardHeader
        title={t('vps.overview.status_access.title')}
        subtitle={t('vps.overview.status_access.subtitle')}
        actions={(
          <>
            <ChipLink to={`${props.basePath}/vps/${props.vps.id}/access`} title={t('vps.overview.status_access.open_access_title')}>
              {t('vps.tabs.access')}
            </ChipLink>
            <ChipLink to={`${props.basePath}/vps/${props.vps.id}/network`} title={t('vps.overview.status_access.open_network_title')}>
              {t('vps.tabs.network')}
            </ChipLink>
          </>
        )}
      />
      <CardBody className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="text-xs text-faint">{t('vps.overview.status_access.runtime')}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant={rt.variant}>{rt.label}</Badge>
              <Badge variant={lc.variant}>{lc.label}</Badge>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="text-xs text-faint">{t('common.location')}</div>
            <div className="mt-1 text-sm font-medium text-fg">{location}</div>
            <div className="mt-0.5 text-xs text-muted">{node}</div>
          </div>

          <div className="rounded-lg border border-border bg-surface-2 p-3" data-testid="vps.overview.status_access.ssh">
            <div className="text-xs text-faint">{t('vps.header.ssh.label')}</div>
            {props.sshCommand ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <code className="rounded bg-surface px-2 py-1 font-mono text-xs text-fg">{props.sshCommand}</code>
                <CopyButton text={props.sshCommand} label={t('common.copy')} />
              </div>
            ) : (
              <div className="mt-1 text-sm text-muted">{t('vps.overview.status_access.no_ssh')}</div>
            )}
          </div>
        </div>

        {props.busyTransaction ? (
          <Alert variant="warn" title={t('vps.overview.status_access.busy_title')} testId="vps.overview.status_access.busy">
            {t('vps.overview.status_access.busy_body', { ids: chainIds })}
          </Alert>
        ) : null}

        {props.chainsStale ? (
          <Alert variant="warn" title={t('vps.overview.status_access.stale_title')}>
            {t('vps.overview.status_access.stale_body')}
          </Alert>
        ) : null}

        {!props.sshCommand ? (
          <Alert variant="neutral" title={t('vps.overview.status_access.no_ip_title')}>
            <span>{t('vps.overview.status_access.no_ip_body')} </span>
            <Link className="underline" to={`${props.basePath}/vps/${props.vps.id}/network`}>
              {t('vps.overview.status_access.no_ip_link')}
            </Link>
          </Alert>
        ) : null}

        {!consoleAvailable ? (
          <Alert variant="neutral" title={t('vps.overview.status_access.console_unavailable_title')}>
            {t('vps.overview.status_access.console_unavailable_body')}
          </Alert>
        ) : null}
      </CardBody>
    </Card>
  );
}

export function OverviewResourceUsageCard(props: {
  vps: Vps;
  basePath: string;
  mode: 'user' | 'admin';
  currentUserId?: number;
}) {
  const { t } = useI18n();
  const mapId = resourceId(props.vps.user_namespace_map);
  const mapLabel = resourceLabel(props.vps.user_namespace_map);
  const owner = ownerLabel(props.vps);
  const showOwner =
    Boolean(owner) &&
    shouldShowVpsOwner({
      mode: props.mode,
      ownerId: ownerId(props.vps),
      currentUserId: props.currentUserId,
    });

  return (
    <Card className="lg:col-span-2" testId="vps.overview.resources_usage.card">
      <CardHeader title={t('vps.overview.resources_usage.title')} subtitle={t('vps.overview.resources_usage.subtitle')} />
      <CardBody>
        <div className="grid gap-6 lg:grid-cols-2">
          <section data-testid="vps.overview.config.card">
            <div className="mb-2 text-sm font-medium text-fg">{t('vps.overview.config.title')}</div>
            <FieldRow label={t('vps.overview.config.vps_id')} value={<span className="font-medium">#{props.vps.id}</span>} />
            <FieldRow label={t('vps.overview.config.hostname')} value={<span className="font-medium">{props.vps.hostname}</span>} />
            {showOwner ? (
              <FieldRow
                testId="vps.overview.config.owner"
                label={t('vps.overview.config.owner')}
                value={<span className="font-medium">{owner}</span>}
              />
            ) : null}
            <FieldRow label={t('vps.overview.config.os_template')} value={resourceLabel(props.vps.os_template) ?? '—'} />
            <FieldRow label={t('vps.overview.config.dns_resolver')} value={resourceLabel(props.vps.dns_resolver) ?? '—'} />
            <FieldRow
              label={t('vps.overview.config.user_namespace_map')}
              value={
                mapId ? (
                  <Link
                    className="text-link underline"
                    to={
                      props.mode === 'admin'
                        ? `${props.basePath}/user-namespaces/maps/${mapId}`
                        : `${props.basePath}/profile/user-namespaces/maps/${mapId}`
                    }
                  >
                    {mapLabel ?? `#${mapId}`}
                  </Link>
                ) : (
                  '—'
                )
              }
            />
            <FieldRow label={t('vps.overview.config.cpu')} value={typeof props.vps.cpu === 'number' ? `${props.vps.cpu} vCPU` : '—'} />
            <FieldRow label={t('vps.overview.config.memory')} value={formatMiB(props.vps.memory)} />
            <FieldRow label={t('vps.overview.config.swap')} value={formatMiB(props.vps.swap)} />
            <FieldRow label={t('vps.overview.config.diskspace')} value={formatMiB(props.vps.diskspace)} />
            <FieldRow label={t('vps.overview.config.created')} value={formatDateTime(props.vps.created_at)} />
          </section>

          <section data-testid="vps.overview.usage.card">
            <div className="mb-2 text-sm font-medium text-fg">{t('vps.overview.usage.title')}</div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-faint">{t('vps.overview.usage.uptime')}</div>
                  <div className="text-sm font-medium text-fg">{formatDurationSeconds(props.vps.uptime)}</div>
                </div>
                <div>
                  <div className="text-xs text-faint">{t('vps.overview.usage.load')}</div>
                  <div className="text-sm font-medium text-fg">{formatLoadavg(props.vps)}</div>
                </div>
              </div>

              <div className="space-y-4">
                <UsageMetric
                  testId="vps.overview.usage.memory"
                  label={t('vps.overview.usage.memory_used')}
                  used={props.vps.used_memory}
                  max={props.vps.memory}
                />
                <UsageMetric
                  testId="vps.overview.usage.swap"
                  label={t('vps.overview.usage.swap_used')}
                  used={props.vps.used_swap}
                  max={props.vps.swap}
                />
                <UsageMetric
                  testId="vps.overview.usage.disk"
                  label={t('vps.overview.usage.disk_used')}
                  used={props.vps.used_diskspace}
                  max={props.vps.diskspace}
                />
              </div>
            </div>
          </section>
        </div>
      </CardBody>
    </Card>
  );
}

export function OverviewNextActionsCard(props: {
  mode: 'user' | 'admin';
  sectionActions: ManagementAction[];
  lifecycleActions: ManagementAction[];
}) {
  const { t } = useI18n();

  return (
    <Card className="lg:col-span-2" testId="vps.overview.management.card">
      <CardHeader
        title={t('vps.overview.management.title')}
        subtitle={t(props.mode === 'admin' ? 'vps.overview.management.subtitle_admin' : 'vps.overview.management.subtitle_user')}
      />
      <CardBody>
        <Alert variant="info" title={t('vps.overview.management.hint_title')} testId="vps.overview.management.hint">
          {t(props.mode === 'admin' ? 'vps.overview.management.hint_admin' : 'vps.overview.management.hint_user')}
        </Alert>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section data-testid="vps.overview.management.sections_group">
            <div className="mb-2">
              <div className="text-sm font-medium text-fg">{t('vps.overview.management.sections_group')}</div>
              <div className="text-xs text-faint">{t('vps.overview.management.sections_group_hint')}</div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {props.sectionActions.map((action) => (
                <ManagementActionLink key={action.testId} action={action} />
              ))}
            </div>
          </section>

          <section data-testid="vps.overview.management.lifecycle_group">
            <div className="mb-2">
              <div className="text-sm font-medium text-fg">{t('vps.overview.management.lifecycle_group')}</div>
              <div className="text-xs text-faint">{t('vps.overview.management.lifecycle_group_hint')}</div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {props.lifecycleActions.map((action) => (
                <ManagementActionLink key={action.testId} action={action} />
              ))}
            </div>
          </section>
        </div>
      </CardBody>
    </Card>
  );
}

export function OverviewAdminContextCard(props: { vps: Vps; basePath: string }) {
  const { t } = useI18n();
  const id = ownerId(props.vps);

  return (
    <Card className="lg:col-span-12" testId="vps.overview.management.admin_context">
      <CardHeader
        title={t('vps.overview.management.admin_context_group')}
        subtitle={t('vps.overview.management.admin_context_hint')}
      />
      <CardBody>
        <div className="flex flex-wrap items-center gap-2">
          <ChipLink to={`${props.basePath}/vps/${props.vps.id}/config`} title={t('vps.overview.admin_actions.change_owner_title')}>
            {t('vps.overview.admin_actions.change_owner')}
          </ChipLink>
          <ChipLink to={`${props.basePath}/oom-reports?vps=${props.vps.id}`} title={t('vps.overview.admin_actions.oom_reports_title')}>
            {t('vps.overview.admin_actions.oom_reports')}
          </ChipLink>
          <ChipLink to={`${props.basePath}/oom-reports/rules/${props.vps.id}`} title={t('vps.overview.admin_actions.oom_rules_title')}>
            {t('vps.overview.admin_actions.oom_rules')}
          </ChipLink>
          <ChipLink to={`${props.basePath}/incidents?vps=${props.vps.id}`} title={t('vps.overview.admin_actions.incidents_title')}>
            {t('vps.overview.admin_actions.incidents')}
          </ChipLink>
          <ChipLink to={`${props.basePath}/incidents/new?vps=${props.vps.id}`} title={t('vps.overview.admin_actions.report_incident_title')}>
            {t('vps.overview.admin_actions.report_incident')}
          </ChipLink>
          <ChipLink to={`${props.basePath}/outages?vps=${props.vps.id}`} title={t('vps.overview.admin_actions.outages_title')}>
            {t('vps.overview.admin_actions.outages')}
          </ChipLink>
          <ChipLink to={`${props.basePath}/transactions?class_name=Vps&row_id=${props.vps.id}`} title={t('vps.overview.admin_actions.transaction_log_title')}>
            {t('vps.overview.admin_actions.transaction_log')}
          </ChipLink>
          {id ? (
            <ChipLink to={`${props.basePath}/users/${id}/user-data`} title={t('vps.overview.admin_actions.user_data_title')}>
              {t('vps.overview.admin_actions.user_data')}
            </ChipLink>
          ) : null}
          <ChipLink to={`${props.basePath}/user-namespaces`} title={t('vps.overview.admin_actions.user_namespaces_title')}>
            {t('vps.overview.admin_actions.user_namespaces')}
          </ChipLink>
        </div>
      </CardBody>
    </Card>
  );
}

export function OverviewDiagnosticsCard(props: { vps: Vps; basePath: string }) {
  const { t } = useI18n();

  return (
    <Card className="lg:col-span-12" testId="vps.overview.diagnostics.card">
      <CardHeader title={t('vps.overview.diagnostics.title')} subtitle={t('vps.overview.diagnostics.subtitle')} />
      <CardBody>
        <div className="flex flex-wrap items-center gap-2">
          <ChipLink to={`${props.basePath}/oom-reports?vps=${props.vps.id}`} title={t('vps.overview.diagnostics.oom_reports_title')}>
            {t('vps.overview.diagnostics.oom_reports')}
          </ChipLink>
          <ChipLink to={`${props.basePath}/oom-reports/rules/${props.vps.id}`} title={t('vps.overview.diagnostics.oom_rules_title')}>
            {t('vps.overview.diagnostics.oom_rules')}
          </ChipLink>
          <ChipLink to={`${props.basePath}/incidents?vps=${props.vps.id}`} title={t('vps.overview.diagnostics.incidents_title')}>
            {t('vps.overview.diagnostics.incidents')}
          </ChipLink>
        </div>
        <div className="mt-2 text-xs text-faint">{t('vps.overview.diagnostics.hint')}</div>
      </CardBody>
    </Card>
  );
}
