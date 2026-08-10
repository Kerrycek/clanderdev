import React from 'react';
import {
  Activity,
  HardDrive,
  KeyRound,
  Network,
  Server,
  Terminal,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { useI18n } from '../../../app/i18n';
import type { IpAddress } from '../../../lib/api/ipAddresses';
import type { TransactionChain } from '../../../lib/api/transactions';
import type { Vps } from '../../../lib/api/vps';
import { Badge } from '../../../components/ui/Badge';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { ChipLink } from '../../../components/ui/ChipLink';
import { CopyButton } from '../../../components/ui/CopyButton';
import { Spinner } from '../../../components/ui/Spinner';
import { UsageBar } from '../../../components/ui/UsageBar';
import { formatDateTime, formatDurationSeconds, formatMiB } from '../../../lib/format';
import {
  chainBadgeFromState,
  chainProgressLabel,
  isFailedChainState,
  runtimeStateBadge,
} from '../../../lib/taskStatus';
import {
  classifyIpAddress,
  formatLoadavg,
  ipAddressDisplayLabel,
  isRemoteConsoleAvailable,
  overviewHealthKey,
  overviewUsageMetric,
  resourceId,
  resourceLabel,
  selectOverviewIpAddresses,
  sortChainsForOverview,
  usageValue,
} from './VpsOverviewModel';

const iconClass = 'h-4 w-4 shrink-0 text-muted';

function SectionTitle(props: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      {props.icon}
      <span>{props.children}</span>
    </span>
  );
}

function MiniStat(props: { label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="text-xs text-faint">{props.label}</div>
      <div className="mt-1 break-words text-sm font-semibold text-fg">{props.value}</div>
      {props.hint ? <div className="mt-1 text-xs text-muted">{props.hint}</div> : null}
    </div>
  );
}

export function VpsHealthBanner(props: {
  vps: Vps;
  busy: boolean;
  stale: boolean;
  sshCommand?: string | null;
  ipAddressesLoading: boolean;
  ipAddressesError: boolean;
}) {
  const { t } = useI18n();
  const networkEnabled = props.vps.enable_network !== false;
  const key = overviewHealthKey({
    running: props.vps.is_running,
    busy: props.busy,
    stale: props.stale,
    networkEnabled,
    sshCommand: props.sshCommand,
    ipAddressesLoading: props.ipAddressesLoading,
    ipAddressesError: props.ipAddressesError,
  });
  const isReady = key === 'ready';
  const needsAttention = key === 'running_no_access'
    || key === 'network_disabled'
    || key === 'access_error'
    || key === 'busy'
    || key === 'stale';
  const tone = isReady
    ? 'border-ok-border bg-ok-bg'
    : key === 'stopped'
      ? 'border-danger-border bg-danger-bg'
      : needsAttention
        ? 'border-warn-border bg-warn-bg'
        : 'border-border bg-surface-2';
  const dot = needsAttention
    ? 'bg-warn'
    : isReady
    ? 'bg-ok'
    : key === 'stopped'
      ? 'bg-danger'
      : 'bg-muted';

  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${tone}`}
      data-testid="vps.overview.health"
      role="status"
      aria-live="polite"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
        <div className="min-w-0">
          <div className="font-semibold text-fg">{t(`vps.control.health.${key}.title`)}</div>
          <div className="mt-0.5 text-sm text-muted">{t(`vps.control.health.${key}.body`)}</div>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Badge variant={needsAttention ? 'warn' : runtimeStateBadge(props.vps.is_running, t).variant}>
          {runtimeStateBadge(props.vps.is_running, t).label}
        </Badge>
        {props.busy ? <Badge variant="warn">{t('vps.overview.status_access.busy_title')}</Badge> : null}
      </div>
    </div>
  );
}

function ResourceUsage(props: {
  label: string;
  used: unknown;
  max: unknown;
  testId: string;
}) {
  const usage = overviewUsageMetric(props.used, props.max);
  return (
    <UsageBar
      testId={props.testId}
      label={props.label}
      used={usage.used}
      max={usage.max}
      formatValue={formatMiB}
      ariaLabel={props.label}
    />
  );
}

export function VpsResourcesCard(props: { vps: Vps; basePath: string }) {
  const { t } = useI18n();
  const cpu = usageValue(props.vps.cpu ?? props.vps['cpus']);
  const swap = usageValue(props.vps.swap);

  return (
    <Card className="lg:col-span-7" testId="vps.overview.resources_usage.card">
      <CardHeader
        title={<SectionTitle icon={<Server className={iconClass} />}>{t('vps.control.resources.title')}</SectionTitle>}
        subtitle={t('vps.control.resources.subtitle')}
        actions={(
          <ChipLink to={`${props.basePath}/vps/${props.vps.id}/config`}>
            {t('vps.control.resources.edit')}
          </ChipLink>
        )}
      />
      <CardBody className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <MiniStat
            label={t('vps.control.resources.cpu')}
            value={cpu == null ? '—' : t('vps.list.resources.cpu', { count: cpu })}
          />
          <MiniStat
            label={t('vps.control.resources.swap')}
            value={swap == null ? '—' : formatMiB(swap)}
          />
        </div>
        <div className="space-y-4 text-sm">
          <ResourceUsage
            testId="vps.overview.usage.memory"
            label={t('vps.control.resources.memory')}
            used={props.vps.used_memory}
            max={props.vps.memory}
          />
          <ResourceUsage
            testId="vps.overview.usage.disk"
            label={t('vps.control.resources.disk')}
            used={props.vps.used_diskspace}
            max={props.vps.diskspace}
          />
          {swap != null && swap > 0 ? (
            <ResourceUsage
              testId="vps.overview.usage.swap"
              label={t('vps.control.resources.swap')}
              used={props.vps.used_swap}
              max={swap}
            />
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

export function VpsAccessCard(props: { vps: Vps; basePath: string; sshCommand?: string | null }) {
  const { t } = useI18n();
  const consoleAvailable = isRemoteConsoleAvailable(props.vps);

  return (
    <Card className="lg:col-span-5" testId="vps.overview.status_access.card">
      <CardHeader
        title={<SectionTitle icon={<KeyRound className={iconClass} />}>{t('vps.control.access.title')}</SectionTitle>}
        subtitle={t('vps.control.access.subtitle')}
        actions={<ChipLink to={`${props.basePath}/vps/${props.vps.id}/access`}>{t('vps.control.access.open')}</ChipLink>}
      />
      <CardBody className="space-y-3">
        <div data-testid="vps.overview.status_access.ssh">
          <div className="text-xs text-faint">{t('vps.control.access.ssh')}</div>
          {props.sshCommand ? (
            <div className="mt-1 flex min-w-0 items-center gap-2 rounded-lg border border-border bg-surface-2 p-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-fg">{props.sshCommand}</code>
              <CopyButton text={props.sshCommand} label={t('common.copy')} />
            </div>
          ) : (
            <div className="mt-1 rounded-lg border border-border bg-surface-2 p-3 text-sm text-muted">
              {t('vps.control.access.no_ssh')}
            </div>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <MiniStat label={t('vps.control.access.uptime')} value={formatDurationSeconds(props.vps.uptime)} />
          <MiniStat label={t('vps.control.access.load')} value={formatLoadavg(props.vps)} />
        </div>
        {consoleAvailable ? (
          <Link
            to={`${props.basePath}/vps/${props.vps.id}/console`}
            className="inline-flex items-center gap-2 text-sm font-medium text-link hover:underline"
            data-testid="vps.overview.access.console"
          >
            <Terminal className="h-4 w-4" aria-hidden="true" />
            {t('vps.control.access.console')}
          </Link>
        ) : (
          <div className="text-xs text-faint" data-testid="vps.overview.access.console_unavailable">
            {t('vps.control.access.console_unavailable')}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function VpsNetworkCard(props: {
  vps: Vps;
  basePath: string;
  ipAddresses: IpAddress[];
  loading: boolean;
  error: boolean;
}) {
  const { t } = useI18n();
  const shown = React.useMemo(() => selectOverviewIpAddresses(props.ipAddresses, 3), [props.ipAddresses]);

  return (
    <Card className="lg:col-span-6" testId="vps.overview.network.card">
      <CardHeader
        title={<SectionTitle icon={<Network className={iconClass} />}>{t('vps.control.network.title')}</SectionTitle>}
        subtitle={t('vps.control.network.subtitle')}
        actions={<ChipLink to={`${props.basePath}/vps/${props.vps.id}/network`}>{t('vps.control.network.open')}</ChipLink>}
      />
      <CardBody>
        {props.loading ? (
          <div className="flex items-center gap-2 text-sm text-muted"><Spinner /> {t('common.loading')}</div>
        ) : props.error ? (
          <div className="text-sm text-muted">{t('vps.control.network.error')}</div>
        ) : shown.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">
            {t('vps.control.network.empty')}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((ip) => {
              const kind = classifyIpAddress(ip);
              const label = ipAddressDisplayLabel(ip);
              const typeKey = kind === 'ipv4_public'
                ? 'public_ipv4'
                : kind === 'ipv4_private' ? 'private_ipv4' : 'ipv6';
              return (
                <li key={ip.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-sm font-semibold text-fg">{label}</div>
                    <div className="mt-1"><Badge variant={kind === 'ipv4_public' ? 'info' : 'neutral'}>{t(`vps.control.network.type.${typeKey}`)}</Badge></div>
                  </div>
                  <CopyButton text={label} label={t('common.copy')} />
                </li>
              );
            })}
          </ul>
        )}
        {props.ipAddresses.length > shown.length ? (
          <div className="mt-3 text-xs text-faint">
            {t('vps.control.network.more', { count: props.ipAddresses.length - shown.length })}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

export function VpsStorageBackupsCard(props: { vps: Vps; basePath: string }) {
  const { t } = useI18n();
  const datasetId = resourceId(props.vps.dataset);
  const dataset = resourceLabel(props.vps.dataset);
  const usage = overviewUsageMetric(props.vps.used_diskspace, props.vps.diskspace);

  return (
    <Card className="lg:col-span-6" testId="vps.overview.storage.card">
      <CardHeader
        title={<SectionTitle icon={<HardDrive className={iconClass} />}>{t('vps.control.storage.title')}</SectionTitle>}
        subtitle={t('vps.control.storage.subtitle')}
        actions={<ChipLink to={`${props.basePath}/vps/${props.vps.id}/storage`}>{t('vps.control.storage.open')}</ChipLink>}
      />
      <CardBody className="space-y-4">
        <MiniStat
          label={t('vps.control.storage.dataset')}
          value={datasetId && dataset ? (
            <Link className="text-link hover:underline" to={`${props.basePath}/datasets/${datasetId}`}>{dataset}</Link>
          ) : t('vps.control.storage.no_dataset')}
        />
        <UsageBar
          label={t('vps.control.storage.usage')}
          used={usage.used}
          max={usage.max}
          formatValue={formatMiB}
          ariaLabel={t('vps.control.storage.usage')}
        />
        {datasetId ? (
          <Link
            className="inline-flex items-center gap-2 text-sm font-medium text-link hover:underline"
            to={`${props.basePath}/backups?tab=snapshots&dataset=${datasetId}`}
          >
            <Activity className="h-4 w-4" aria-hidden="true" />
            {t('vps.control.storage.open_backups')}
          </Link>
        ) : null}
      </CardBody>
    </Card>
  );
}

export function VpsActivityCard(props: {
  vps: Vps;
  basePath: string;
  chains: TransactionChain[];
  loading: boolean;
  error: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const chains = React.useMemo(() => sortChainsForOverview(props.chains).slice(0, 4), [props.chains]);

  return (
    <Card className={props.className ?? 'lg:col-span-12'} testId="vps.overview.tx.card">
      <CardHeader
        title={<SectionTitle icon={<Activity className={iconClass} />}>{t('vps.control.activity.title')}</SectionTitle>}
        subtitle={t('vps.control.activity.subtitle')}
        actions={(
          <ChipLink to={`${props.basePath}/transactions?class_name=Vps&row_id=${props.vps.id}`}>
            {t('vps.control.activity.open')}
          </ChipLink>
        )}
      />
      <CardBody>
        {props.loading ? (
          <div className="flex items-center gap-2 text-sm text-muted"><Spinner /> {t('common.loading')}</div>
        ) : props.error ? (
          <div className="text-sm text-muted">{t('vps.control.activity.error')}</div>
        ) : chains.length === 0 ? (
          <div className="text-sm text-muted">{t('vps.control.activity.empty')}</div>
        ) : (
          <ul className="divide-y divide-border">
            {chains.map((chain) => {
              const badge = chainBadgeFromState(chain.state, t);
              const progress = chainProgressLabel(chain);
              return (
                <li
                  key={chain.id}
                  className={`flex flex-wrap items-center justify-between gap-3 py-3 ${isFailedChainState(chain.state) ? 'text-danger' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      className="block max-w-full truncate text-sm font-medium text-link hover:underline"
                      to={`${props.basePath}/transactions/${chain.id}`}
                      title={chain.label || `#${chain.id}`}
                    >
                      {chain.label || `#${chain.id}`}
                    </Link>
                    <div className="mt-1 truncate text-xs text-faint">
                      #{chain.id} · {formatDateTime(chain.created_at)}{progress ? ` · ${progress}` : ''}
                    </div>
                  </div>
                  <span className="shrink-0"><Badge variant={badge.variant}>{badge.label}</Badge></span>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
