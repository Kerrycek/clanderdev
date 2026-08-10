import React from 'react';
import { Link } from 'react-router-dom';

import { useI18n } from '../../../app/i18n';
import type { IpAddress } from '../../../lib/api/ipAddresses';
import type { Vps } from '../../../lib/api/vps';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { ChipLink } from '../../../components/ui/ChipLink';
import { formatDateTime } from '../../../lib/format';
import { objectStateBadge, runtimeStateBadge } from '../../../lib/taskStatus';
import {
  locationLabel,
  nodeLabel,
  ownerId,
  ownerLabel,
  resourceId,
  resourceLabel,
} from './VpsOverviewModel';

function unknownId(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const id = (value as { id?: unknown }).id;
  return typeof id === 'number' && Number.isFinite(id) ? id : undefined;
}

function adminField(props: {
  label: React.ReactNode;
  value: React.ReactNode;
  testId?: string;
  hint?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3" data-testid={props.testId}>
      <div className="text-xs text-faint">{props.label}</div>
      <div className="mt-1 text-sm font-medium text-fg">{props.value ?? '—'}</div>
      {props.hint ? <div className="mt-1 text-xs text-muted">{props.hint}</div> : null}
    </div>
  );
}

function resourceLink(props: { to?: string; label?: string }) {
  if (!props.label) return <span className="text-muted">—</span>;
  if (!props.to) return <span>{props.label}</span>;
  return (
    <Link className="text-link underline" to={props.to}>
      {props.label}
    </Link>
  );
}

function ipAddressLabel(ip: IpAddress): string {
  const addr = String(ip.addr ?? '').trim() || `#${ip.id}`;
  if (typeof ip.prefix === 'number' && Number.isFinite(ip.prefix)) return `${addr}/${ip.prefix}`;
  return addr;
}

export function VpsOverviewAdminOperationsCard(props: {
  vps: Vps;
  basePath: string;
  busyTransaction: boolean;
  chainsStale: boolean;
  activeChainIds: number[];
  ipAddresses: IpAddress[];
  ipAddressesLoading: boolean;
  ipAddressesError: boolean;
}) {
  const { t } = useI18n();
  const userId = ownerId(props.vps);
  const owner = ownerLabel(props.vps);
  const nodeId = resourceId(props.vps.node);
  const node = nodeLabel(props.vps, t('common.na'));
  const location = locationLabel(props.vps, t('common.na'));
  const environment = resourceLabel(props.vps.node?.location?.['environment']) ?? t('common.na');
  const datasetId = resourceId(props.vps.dataset);
  const dataset = resourceLabel(props.vps.dataset);
  const pool = resourceLabel(props.vps.pool);
  const runtime = runtimeStateBadge(props.vps.is_running, t);
  const lifecycle = objectStateBadge(props.vps.object_state, t);
  const activeIds = props.activeChainIds.map((id) => `#${id}`).join(', ');
  const actionState = props.busyTransaction
    ? { label: t('vps.overview.admin_ops.action_state_busy'), variant: 'warn' as const, hint: activeIds || t('common.na') }
    : props.chainsStale
      ? { label: t('vps.overview.admin_ops.action_state_stale'), variant: 'warn' as const, hint: t('vps.overview.admin_ops.action_state_stale_hint') }
      : { label: t('vps.overview.admin_ops.action_state_idle'), variant: 'ok' as const, hint: undefined };

  return (
    <Card className="lg:col-span-12" testId="vps.overview.admin_ops.card">
      <CardHeader
        title={t('vps.overview.admin_ops.title')}
        subtitle={t('vps.overview.admin_ops.subtitle')}
        actions={(
          <>
            <ChipLink to={`${props.basePath}/vps/${props.vps.id}/lifecycle`} title={t('vps.overview.admin_ops.lifecycle_title')}>
              {t('vps.tabs.lifecycle')}
            </ChipLink>
            <ChipLink to={`${props.basePath}/transactions?class_name=Vps&row_id=${props.vps.id}`} title={t('vps.overview.tx.chains_title')}>
              {t('vps.overview.tx.chains')}
            </ChipLink>
          </>
        )}
      />
      <CardBody className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {adminField({
            label: t('vps.overview.admin_ops.owner'),
            testId: 'vps.overview.admin_ops.owner',
            value: resourceLink({ to: userId ? `${props.basePath}/users/${userId}` : undefined, label: owner }),
            hint: userId ? t('vps.overview.admin_ops.user_id_hint', { id: userId }) : undefined,
          })}
          {adminField({
            label: t('vps.overview.admin_ops.user_id'),
            testId: 'vps.overview.admin_ops.user_id',
            value: userId ? resourceLink({ to: `${props.basePath}/users/${userId}`, label: `#${userId}` }) : '—',
          })}
          {adminField({
            label: t('vps.overview.admin_ops.node'),
            testId: 'vps.overview.admin_ops.node',
            value: resourceLink({ to: nodeId ? `${props.basePath}/nodes/${nodeId}` : undefined, label: node }),
            hint: nodeId ? `#${nodeId}` : undefined,
          })}
          {adminField({
            label: t('vps.overview.admin_ops.location_environment'),
            testId: 'vps.overview.admin_ops.location_environment',
            value: location,
            hint: environment,
          })}
          {adminField({
            label: t('vps.overview.admin_ops.dataset'),
            testId: 'vps.overview.admin_ops.dataset',
            value: resourceLink({ to: datasetId ? `${props.basePath}/datasets/${datasetId}` : undefined, label: dataset }),
            hint: pool ? t('vps.overview.admin_ops.pool_hint', { pool }) : undefined,
          })}
          {adminField({
            label: t('vps.overview.admin_ops.state'),
            testId: 'vps.overview.admin_ops.state',
            value: (
              <span className="inline-flex flex-wrap items-center gap-2">
                <Badge variant={runtime.variant}>{runtime.label}</Badge>
                <Badge variant={lifecycle.variant}>{lifecycle.label}</Badge>
              </span>
            ),
            hint: props.vps.expiration_date
              ? t('vps.overview.admin_ops.expiration_hint', { date: formatDateTime(props.vps.expiration_date) })
              : undefined,
          })}
          {adminField({
            label: t('vps.overview.admin_ops.action_state'),
            testId: 'vps.overview.admin_ops.action_state',
            value: <Badge variant={actionState.variant}>{actionState.label}</Badge>,
            hint: actionState.hint,
          })}
          {adminField({
            label: t('vps.overview.admin_ops.created'),
            testId: 'vps.overview.admin_ops.created',
            value: formatDateTime(props.vps.created_at),
          })}
        </div>

        <section className="rounded-lg border border-border bg-surface-2 p-3" data-testid="vps.overview.admin_ops.ips">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs text-faint">{t('vps.overview.admin_ops.ips')}</div>
              <div className="mt-1 text-sm font-medium text-fg">{t('vps.overview.admin_ops.ips_subtitle')}</div>
            </div>
            <ChipLink to={`${props.basePath}/vps/${props.vps.id}/network`} title={t('vps.overview.status_access.open_network_title')}>
              {t('vps.tabs.network')}
            </ChipLink>
          </div>

          {props.ipAddressesLoading ? (
            <div className="mt-3 text-sm text-muted">{t('common.loading')}</div>
          ) : props.ipAddressesError ? (
            <Alert className="mt-3" variant="warn" title={t('vps.overview.admin_ops.ips_error')} />
          ) : props.ipAddresses.length === 0 ? (
            <div className="mt-3 text-sm text-muted">{t('vps.overview.admin_ops.ips_empty')}</div>
          ) : (
            <ul className="mt-3 grid gap-2 lg:grid-cols-2">
              {props.ipAddresses.map((ip) => {
                const label = ipAddressLabel(ip);
                const network = resourceLabel(ip.network);
                const ipOwnerId = unknownId(ip.user);
                const ipOwner = resourceLabel(ip.user) ?? owner;
                const bits = [
                  network ? t('vps.overview.admin_ops.ip_network_hint', { network }) : undefined,
                  ipOwner ? t('vps.overview.admin_ops.ip_owner_hint', { owner: ipOwner }) : undefined,
                  ip.routed === true ? t('vps.overview.admin_ops.ip_routed_hint') : undefined,
                ].filter(Boolean);

                return (
                  <li key={ip.id} className="rounded border border-border bg-surface p-2">
                    <div className="text-sm font-medium text-fg">
                      <Link className="text-link underline" to={`${props.basePath}/networking/ip-addresses/${ip.id}`}>
                        {label}
                      </Link>
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {bits.length > 0 ? bits.join(' · ') : t('common.na')}
                      {ipOwnerId ? (
                        <>
                          {' · '}
                          <Link className="text-link underline" to={`${props.basePath}/users/${ipOwnerId}`}>
                            #{ipOwnerId}
                          </Link>
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </CardBody>
    </Card>
  );
}
