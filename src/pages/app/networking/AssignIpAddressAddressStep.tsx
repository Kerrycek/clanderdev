import { useI18n } from '../../../app/i18n';
import { Select } from '../../../components/ui/Select';
import { Spinner } from '../../../components/ui/Spinner';
import type { IpAddress } from '../../../lib/api/ipAddresses';
import type { HostIpAddress } from '../../../lib/api/networking';
import type { NetworkInterface } from '../../../lib/api/networkInterfaces';
import type { Vps } from '../../../lib/api/vps';
import {
  ipAddressLabel,
  isOwnedByUser,
  type AssignableIpKind,
  vpsLabel,
} from './IpAddressAssignmentModel';
import type { IpRouteAssignmentMode } from './IpRouteAssignmentModel';

function resourceIdFromVps(vps: Vps | null | undefined): number | null {
  const id = Number(vps?.user?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function AssignIpAddressAddressStep(props: {
  selectedVps?: Vps;
  selectedInterface?: NetworkInterface;
  kind: AssignableIpKind;
  availableIps: IpAddress[];
  availableLoading: boolean;
  ipId: string;
  selectedIp?: IpAddress;
  assignmentMode: IpRouteAssignmentMode;
  routeViaId: string;
  routeViaRows: HostIpAddress[];
  routeViaLoading: boolean;
  pending: boolean;
  onIpChange: (value: string) => void;
  onAssignmentModeChange: (value: IpRouteAssignmentMode) => void;
  onRouteViaChange: (value: string) => void;
}) {
  const { t } = useI18n();

  return (
    <>
      <div className="grid gap-2 rounded-lg border border-border bg-surface-2 p-3 text-sm sm:grid-cols-3">
        <div>
          <div className="text-xs text-muted">{t('network.user.assign.vps')}</div>
          <div className="mt-0.5 font-medium">{props.selectedVps ? vpsLabel(props.selectedVps) : '—'}</div>
        </div>
        <div>
          <div className="text-xs text-muted">{t('network.user.assign.interface')}</div>
          <div className="mt-0.5 font-medium">
            {props.selectedInterface?.name || (props.selectedInterface ? `#${props.selectedInterface.id}` : '—')}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">{t('network.user.assign.kind')}</div>
          <div className="mt-0.5 font-medium">
            {props.kind === 'ipv4_private'
              ? t('network.user.kind.ipv4_private')
              : props.kind === 'ipv6'
                ? t('network.user.kind.ipv6')
                : t('network.user.kind.ipv4_public')}
          </div>
        </div>
      </div>

      {props.availableLoading ? (
        <div className="py-2"><Spinner label={t('common.loading')} /></div>
      ) : (
        <Select
          label={t('network.user.assign.address')}
          testId="network.user.assign.address"
          value={props.ipId}
          onChange={(event) => props.onIpChange(event.target.value)}
          disabled={props.pending || props.availableIps.length === 0}
          options={[
            {
              value: '',
              label: props.availableIps.length > 0
                ? t('network.user.assign.address.placeholder')
                : t('network.user.assign.address.none'),
            },
            ...props.availableIps.map((ip) => ({
              value: String(ip.id),
              label: `${ipAddressLabel(ip)}${isOwnedByUser(ip, resourceIdFromVps(props.selectedVps)) ? ` · ${t('network.user.assign.address.owned')}` : ''}`,
            })),
          ]}
        />
      )}

      <Select
        label={t('network.user.assign.mode')}
        testId="network.user.assign.mode"
        value={props.assignmentMode}
        onChange={(event) => props.onAssignmentModeChange(event.target.value as IpRouteAssignmentMode)}
        disabled={props.pending || !props.selectedIp}
        options={[
          { value: 'route', label: t('network.user.assign.mode.route') },
          { value: 'route_host', label: t('network.user.assign.mode.route_host') },
          { value: 'route_via', label: t('network.user.assign.mode.route_via') },
        ]}
      />

      {props.assignmentMode === 'route_via' ? (
        <Select
          label={t('network.user.assign.route_via')}
          testId="network.user.assign.route_via"
          value={props.routeViaId}
          onChange={(event) => props.onRouteViaChange(event.target.value)}
          disabled={props.routeViaLoading || props.pending}
          options={[
            {
              value: '',
              label: props.routeViaLoading
                ? t('common.loading')
                : t('network.user.assign.route_via.placeholder'),
            },
            ...props.routeViaRows.map((host) => ({
              value: String(host.id),
              label: String(host.addr ?? `#${host.id}`),
            })),
          ]}
        />
      ) : null}
    </>
  );
}
