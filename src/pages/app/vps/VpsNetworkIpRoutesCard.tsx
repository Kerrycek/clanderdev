import React from 'react';

import { useI18n } from '../../../app/i18n';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { Spinner } from '../../../components/ui/Spinner';
import type { IpAddress } from '../../../lib/api/ipAddresses';
import type { NetworkInterface } from '../../../lib/api/networkInterfaces';
import type { GateDecision } from '../../../lib/gates/types';
import {
  ipAddressLabel,
  ipLocationLabel,
  labelFromResourceRef,
  routeStateForIp,
  type NetworkRouteState,
} from './VpsNetworkModel';

function routeStateBadgeVariant(state: NetworkRouteState): 'neutral' | 'ok' | 'warn' | 'info' {
  if (state === 'routed') return 'ok';
  if (state === 'active') return 'info';
  return 'warn';
}

function routeStateLabelKey(state: NetworkRouteState): string {
  if (state === 'routed') return 'vps.network.state.routed';
  if (state === 'active') return 'vps.network.state.active';
  if (state === 'busy') return 'vps.network.state.busy';
  return 'vps.network.state.detached';
}

function routeAddressLabel(ip: IpAddress): string {
  const address = ipAddressLabel(ip);
  return typeof ip.prefix === 'number' ? `${address}/${ip.prefix}` : address;
}

function routeTypeKey(ip: IpAddress) {
  if (Number(ip.network?.ip_version) === 6) return 'network.user.kind.ipv6' as const;
  if (String(ip.network?.role ?? '') === 'private_access') return 'network.user.kind.ipv4_private' as const;
  return 'network.user.kind.ipv4_public' as const;
}

export function VpsNetworkIpRoutesCard(props: {
  canAdmin: boolean;
  canMutate: boolean;
  adminBasePath: string;
  gate: GateDecision;
  isLoading: boolean;
  errorMessage: string | null;
  netifs: NetworkInterface[];
  ipByNetif: Map<number, IpAddress[]>;
  unassignedIps: IpAddress[];
  freeRoutePending: boolean;
  onAddRoute: () => void;
  onRefresh: () => void;
  onEditOwner: (ip: IpAddress) => void;
  onFreeRoute: (ip: IpAddress) => void;
  onAssignRoute: (ip: IpAddress) => void;
}) {
  const { t } = useI18n();
  const gate = props.gate;
  const assignedRoutes = props.netifs.flatMap((networkInterface) =>
    (props.ipByNetif.get(networkInterface.id) ?? []).map((ip) => ({ ip, networkInterface }))
  );

  return (
    <Card testId="vps.network.ip_addresses">
      <CardHeader
        title={
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-fg">1</span>
            <span>{t('vps.network.routing.title')}</span>
          </div>
        }
        subtitle={t('vps.network.routing.subtitle')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={props.onRefresh}>
              {t('common.refresh')}
            </Button>
            {props.canMutate ? <ActionButton
              variant="primary"
              size="sm"
              testId="vps.network.ip_addresses.add"
              disabled={!gate.allowed}
              disabledReason={!gate.allowed ? gate.reason : undefined}
              onClick={props.onAddRoute}
            >
              {t('vps.network.routing.add')}
            </ActionButton> : null}
          </div>
        }
      />

      <CardBody className="space-y-4">
        <div className="rounded-lg border border-info-border bg-info-bg p-3 text-sm text-muted">
          {t('vps.network.routing.explanation')}
        </div>

        {props.isLoading ? (
          <div className="py-2">
            <Spinner label={t('common.loading')} />
          </div>
        ) : props.errorMessage ? (
          <Alert title={t('vps.network.ip_addresses.load_error')} variant="danger">
            {props.errorMessage}
          </Alert>
        ) : assignedRoutes.length === 0 && props.unassignedIps.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">
            {t('vps.network.routing.empty')}
          </div>
        ) : (
          <div className="space-y-3">
            {assignedRoutes.map(({ ip, networkInterface }) => {
              const state = routeStateForIp(ip, !gate.allowed);
              const location = ipLocationLabel(ip);

              return (
                <div
                  key={ip.id}
                  data-testid={`vps.network.ip_addresses.item.${ip.id}`}
                  className="rounded-lg border border-border bg-surface-2 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold">{routeAddressLabel(ip)}</span>
                        <Badge variant="info">{t(routeTypeKey(ip))}</Badge>
                        <Badge variant={routeStateBadgeVariant(state)}>{t(routeStateLabelKey(state))}</Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                        <span>{t('vps.network.routing.interface', { interface: networkInterface.name ?? `#${networkInterface.id}` })}</span>
                        {location !== '—' ? <span>{t('vps.network.routing.location', { location })}</span> : null}
                        {props.canAdmin ? <span>{t('vps.network.ip_addresses.field.owner', { owner: labelFromResourceRef(ip.user) })}</span> : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {props.canAdmin ? (
                        <>
                          <Button
                            to={`${props.adminBasePath}/networking/ip-addresses/${ip.id}`}
                            variant="secondary"
                            size="sm"
                            testId={`vps.network.ip_addresses.item.${ip.id}.detail`}
                          >
                            {t('vps.network.ip_addresses.action.detail')}
                          </Button>
                          {props.canMutate ? <ActionButton
                            variant="secondary"
                            size="sm"
                            testId={`vps.network.ip_addresses.item.${ip.id}.owner`}
                            disabled={!gate.allowed}
                            disabledReason={!gate.allowed ? gate.reason : undefined}
                            onClick={() => props.onEditOwner(ip)}
                          >
                            {t('vps.network.ip_addresses.action.owner')}
                          </ActionButton> : null}
                        </>
                      ) : null}
                      {props.canMutate ? <ActionButton
                        variant="danger"
                        size="sm"
                        testId={`vps.network.ip_addresses.item.${ip.id}.free_route`}
                        disabled={!gate.allowed}
                        disabledReason={!gate.allowed ? gate.reason : undefined}
                        loading={props.freeRoutePending}
                        onClick={() => props.onFreeRoute(ip)}
                      >
                        {t('vps.network.ip_addresses.action.free_route')}
                      </ActionButton> : null}
                    </div>
                  </div>
                </div>
              );
            })}

            {props.unassignedIps.length > 0 ? (
              <div className="rounded-lg border border-warn-border bg-warn-bg p-3">
                <div className="font-medium">{t('vps.network.ip_addresses.unassigned.title')}</div>
                <div className="mt-0.5 text-sm text-muted">{t('vps.network.ip_addresses.unassigned.body')}</div>
                <div className="mt-3 space-y-2">
                  {props.unassignedIps.map((ip) => (
                    <div key={ip.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface p-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono">{routeAddressLabel(ip)}</span>
                        <Badge variant="info">{t(routeTypeKey(ip))}</Badge>
                      </div>
                      {props.canMutate ? <ActionButton
                        variant="primary"
                        size="sm"
                        testId={`vps.network.ip_addresses.unassigned.${ip.id}.assign`}
                        disabled={!gate.allowed}
                        disabledReason={!gate.allowed ? gate.reason : undefined}
                        onClick={() => props.onAssignRoute(ip)}
                      >
                        {t('vps.network.ip_addresses.action.assign_route')}
                      </ActionButton> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
