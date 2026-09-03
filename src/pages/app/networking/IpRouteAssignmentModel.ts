import type { ChromeContextValue } from '../../../components/layout/ChromeContext';
import type { LocalMutationGeneration, LocalMutationIntent } from '../../../lib/localLocks';
import { objectRef, type ObjectRef } from '../../../lib/objectRef';
import { preflightVpsNotBusy } from '../vps/vpsPreflight';

export type IpRouteAssignmentMode = 'route' | 'route_host' | 'route_via';

export function ipRouteAssignmentAction(mode: IpRouteAssignmentMode, routeVia?: number) {
  return mode === 'route_host'
    ? { action: 'route_host' as const }
    : { action: 'route' as const, routeVia: mode === 'route_via' ? routeVia : undefined };
}

export function isEligibleRouteVia(
  routeViaId: string,
  rows: Array<{ id: number }> | undefined,
): boolean {
  if (!routeViaId) return false;
  return (rows ?? []).some((row) => String(row.id) === routeViaId);
}

type IpRouteAssignmentLockContext = {
  ipLockRef: ObjectRef;
  ipMutationGeneration: LocalMutationGeneration;
  vpsLockRef: ObjectRef;
  vpsMutationGeneration: LocalMutationGeneration;
};

export async function acquireIpRouteAssignmentLocks(args: {
  ipId: number;
  vpsId: number;
  intent: LocalMutationIntent;
  knownBusy?: boolean;
  t: (key: any, vars?: any) => string;
  acquireLocalLock: ChromeContextValue['acquireLocalLock'];
  settleLocalLock: ChromeContextValue['settleLocalLock'];
  preflight?: typeof preflightVpsNotBusy;
}): Promise<IpRouteAssignmentLockContext> {
  await (args.preflight ?? preflightVpsNotBusy)({
    vpsId: args.vpsId,
    t: args.t,
    knownBusy: args.knownBusy,
  });

  const ipLockRef = objectRef('IpAddress', args.ipId);
  const vpsLockRef = objectRef('Vps', args.vpsId);
  const ipMutationGeneration = await args.acquireLocalLock(ipLockRef, {
    durable: true,
    intent: args.intent,
  });

  try {
    const vpsMutationGeneration = await args.acquireLocalLock(vpsLockRef, { durable: true });
    return { ipLockRef, ipMutationGeneration, vpsLockRef, vpsMutationGeneration };
  } catch (error) {
    // A durable acquire leaves a persisted request-generation marker. Settle
    // that exact generation instead of merely removing the in-memory lock.
    args.settleLocalLock(ipLockRef, error, ipMutationGeneration);
    throw error;
  }
}
