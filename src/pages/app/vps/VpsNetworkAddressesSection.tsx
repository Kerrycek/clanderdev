import React from 'react';

import { useI18n } from '../../../app/i18n';
import { Card, CardBody } from '../../../components/ui/Card';
import type { IpAddress } from '../../../lib/api/ipAddresses';
import type { HostIpAddress } from '../../../lib/api/networking';
import type { NetworkInterface } from '../../../lib/api/networkInterfaces';
import type { GateDecision } from '../../../lib/gates/types';
import { VpsNetworkHostAddressesCard } from './VpsNetworkHostAddressesCard';
import { VpsNetworkIpRoutesCard } from './VpsNetworkIpRoutesCard';
import { VpsNetworkAdminActionsCard } from './VpsNetworkOverviewCard';

export function VpsNetworkAddressesSection(props: {
  canAdmin: boolean;
  canMutate: boolean;
  adminBasePath: string;
  netEnabled: boolean;
  gate: GateDecision;
  netToggleError: string | null;
  routesLoading: boolean;
  routesErrorMessage: string | null;
  hostsLoading: boolean;
  hostsErrorMessage: string | null;
  networkActionErrorMessage: string | null;
  netifs: NetworkInterface[];
  ipByNetif: Map<number, IpAddress[]>;
  unassignedIps: IpAddress[];
  hostRows: HostIpAddress[];
  freeRoutePending: boolean;
  updatePtrPending: boolean;
  assignHostPending: boolean;
  freeHostPending: boolean;
  deleteHostPending: boolean;
  onAddRoute: () => void;
  onDisableNetwork: () => void;
  onEnableNetwork: () => void;
  onRefreshRoutes: () => void;
  onRefreshHosts: () => void;
  onEditOwner: (ip: IpAddress) => void;
  onFreeRoute: (ip: IpAddress) => void;
  onAssignRoute: (ip: IpAddress) => void;
  onEditPtr: (row: HostIpAddress) => void;
  onAssignHost: (row: HostIpAddress) => void;
  onFreeHost: (row: HostIpAddress) => void;
  onDeleteHost: (row: HostIpAddress) => void;
}) {
  const { t } = useI18n();

  return (
    <section data-testid="vps.network.addresses" className="space-y-4">
      <Card>
        <CardBody className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h2 className="text-lg font-semibold">{t('vps.network.addresses.title')}</h2>
            <p className="mt-1 text-sm text-muted">{t('vps.network.addresses.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-accent font-semibold text-accent-fg">1</span>
            <span>{t('vps.network.addresses.step.route')}</span>
            <span aria-hidden="true">→</span>
            <span className="grid h-6 w-6 place-items-center rounded-full bg-accent font-semibold text-accent-fg">2</span>
            <span>{t('vps.network.addresses.step.interface')}</span>
          </div>
        </CardBody>
      </Card>

      <VpsNetworkIpRoutesCard
        canAdmin={props.canAdmin}
        canMutate={props.canMutate}
        adminBasePath={props.adminBasePath}
        gate={props.gate}
        isLoading={props.routesLoading}
        errorMessage={props.routesErrorMessage}
        netifs={props.netifs}
        ipByNetif={props.ipByNetif}
        unassignedIps={props.unassignedIps}
        freeRoutePending={props.freeRoutePending}
        onAddRoute={props.onAddRoute}
        onRefresh={props.onRefreshRoutes}
        onEditOwner={props.onEditOwner}
        onFreeRoute={props.onFreeRoute}
        onAssignRoute={props.onAssignRoute}
      />

      <VpsNetworkHostAddressesCard
        canMutate={props.canMutate}
        gate={props.gate}
        isLoading={props.hostsLoading}
        errorMessage={props.hostsErrorMessage}
        actionErrorMessage={props.networkActionErrorMessage}
        rows={props.hostRows}
        updatePtrPending={props.updatePtrPending}
        assignHostPending={props.assignHostPending}
        freeHostPending={props.freeHostPending}
        deleteHostPending={props.deleteHostPending}
        onRefresh={props.onRefreshHosts}
        onEditPtr={props.onEditPtr}
        onAssign={props.onAssignHost}
        onFree={props.onFreeHost}
        onDelete={props.onDeleteHost}
      />

      {props.canAdmin && props.canMutate ? (
        <Card testId="vps.network.admin_settings">
          <details>
            <summary
              className="flex cursor-pointer list-none items-start justify-between gap-3 p-4 focus:outline-none focus:ring-2 focus:ring-focus/35"
              data-testid="vps.network.admin_settings.toggle"
            >
              <div>
                <div className="font-semibold">{t('vps.network.admin_settings.title')}</div>
                <div className="mt-0.5 text-sm text-muted">{t('vps.network.admin_settings.subtitle')}</div>
              </div>
              <span className="rounded-md border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-muted">
                {t('vps.network.admin_settings.show')}
              </span>
            </summary>
            <CardBody className="border-t border-border">
              <VpsNetworkAdminActionsCard
                canAdmin={props.canAdmin}
                netEnabled={props.netEnabled}
                gate={props.gate}
                netToggleError={props.netToggleError}
                onDisable={props.onDisableNetwork}
                onEnable={props.onEnableNetwork}
              />
            </CardBody>
          </details>
        </Card>
      ) : null}
    </section>
  );
}
