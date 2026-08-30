import type { ResourceRef } from './api/appTypes';
import type { IpAddress } from './api/ipAddresses';
import type { NetworkInterface } from './api/networkInterfaces';
import type { LocalLock, LocalMutationIntent } from './localLocks';

export type IpAddressMutationReconcileResult = 'clear' | 'busy' | 'error';

type IdLike = number | string | ResourceRef | null | undefined;

function resourceId(value: IdLike): number | null {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? value : null;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
  if (!value || typeof value !== 'object') return null;
  return resourceId(value.id);
}

function networkInterfaceId(ip: IpAddress): number | null {
  return resourceId(ip.network_interface as IdLike);
}

function networkInterfaceVpsId(ip: IpAddress): number | null {
  const direct = resourceId(ip.vps as IdLike);
  if (direct) return direct;
  const networkInterface = ip.network_interface;
  if (!networkInterface || typeof networkInterface !== 'object') return null;
  return resourceId((networkInterface as NetworkInterface).vps as IdLike);
}

function ownerId(ip: IpAddress): number | null {
  return resourceId(ip.user as IdLike);
}

function chargedEnvironmentId(ip: IpAddress): number | null {
  return resourceId(ip.charged_environment as IdLike);
}

export function ipRouteAssignIntent(
  ip: IpAddress,
  expectedNetworkInterfaceId: number,
  expectedVpsId: number
): LocalMutationIntent | null {
  if (!Number.isInteger(expectedNetworkInterfaceId) || expectedNetworkInterfaceId <= 0
    || !Number.isInteger(expectedVpsId) || expectedVpsId <= 0
    || networkInterfaceId(ip) !== null) return null;
  return {
    type: 'ip-route-assign',
    previousNetworkInterfaceId: null,
    expectedNetworkInterfaceId,
    expectedVpsId,
  };
}

export function ipRouteFreeIntent(ip: IpAddress): LocalMutationIntent | null {
  const previousNetworkInterfaceId = networkInterfaceId(ip);
  if (!previousNetworkInterfaceId) return null;
  return {
    type: 'ip-route-free',
    previousNetworkInterfaceId,
    expectedNetworkInterfaceId: null,
  };
}

export function ipOwnerUpdateIntent(
  ip: IpAddress,
  expectedUserId: number | null,
  expectedEnvironmentId: number | null
): LocalMutationIntent | null {
  if ((expectedUserId === null) !== (expectedEnvironmentId === null)) return null;
  const previousUserId = ownerId(ip);
  const previousEnvironmentId = chargedEnvironmentId(ip);
  if (previousUserId === expectedUserId && previousEnvironmentId === expectedEnvironmentId) return null;
  return {
    type: 'ip-owner-update',
    previousUserId,
    previousEnvironmentId,
    expectedUserId,
    expectedEnvironmentId,
  };
}

export function reconcileIpAddressMutation(
  lock: Pick<LocalLock, 'kind' | 'intent'>,
  current: IpAddress
): IpAddressMutationReconcileResult {
  if (lock.kind !== 'IpAddress' || !lock.intent) return 'error';
  const intent = lock.intent;

  if (intent.type === 'ip-route-assign') {
    return networkInterfaceId(current) === intent.expectedNetworkInterfaceId
      && networkInterfaceVpsId(current) === intent.expectedVpsId
      ? 'clear'
      : 'busy';
  }
  if (intent.type === 'ip-route-free') {
    return networkInterfaceId(current) === null ? 'clear' : 'busy';
  }
  if (intent.type === 'ip-owner-update') {
    return ownerId(current) === intent.expectedUserId
      && chargedEnvironmentId(current) === intent.expectedEnvironmentId
      ? 'clear'
      : 'busy';
  }
  return 'error';
}
