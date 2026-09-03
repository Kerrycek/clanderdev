import { describe, expect, it, vi } from 'vitest';

import type { ChromeContextValue } from '../../../components/layout/ChromeContext';
import type { LocalMutationGeneration, LocalMutationIntent } from '../../../lib/localLocks';
import {
  acquireIpRouteAssignmentLocks,
  ipRouteAssignmentAction,
  isEligibleRouteVia,
} from './IpRouteAssignmentModel';

describe('ipRouteAssignmentAction', () => {
  it('keeps route-only, atomic route-and-host, and route-via distinct', () => {
    expect(ipRouteAssignmentAction('route')).toEqual({ action: 'route', routeVia: undefined });
    expect(ipRouteAssignmentAction('route_host')).toEqual({ action: 'route_host' });
    expect(ipRouteAssignmentAction('route_via', 17)).toEqual({ action: 'route', routeVia: 17 });
  });

  it('accepts only a route-via address from the current eligible result set', () => {
    expect(isEligibleRouteVia('17', [{ id: 17 }, { id: 18 }])).toBe(true);
    expect(isEligibleRouteVia('19', [{ id: 17 }, { id: 18 }])).toBe(false);
    expect(isEligibleRouteVia('', [{ id: 17 }])).toBe(false);
    expect(isEligibleRouteVia('17', undefined)).toBe(false);
  });

  it('preflights the destination and guards both the IP route and VPS', async () => {
    const ipGeneration = {} as LocalMutationGeneration;
    const vpsGeneration = {} as LocalMutationGeneration;
    const preflight = vi.fn().mockResolvedValue(undefined);
    const acquireLocalLock = vi.fn()
      .mockResolvedValueOnce(ipGeneration)
      .mockResolvedValueOnce(vpsGeneration);
    const settleLocalLock = vi.fn();
    const intent: LocalMutationIntent = {
      type: 'ip-route-assign',
      previousNetworkInterfaceId: null,
      expectedNetworkInterfaceId: 501,
      expectedVpsId: 22,
    };

    await expect(acquireIpRouteAssignmentLocks({
      ipId: 42,
      vpsId: 22,
      intent,
      knownBusy: false,
      t: (key) => String(key),
      acquireLocalLock: acquireLocalLock as unknown as ChromeContextValue['acquireLocalLock'],
      settleLocalLock,
      preflight,
    })).resolves.toEqual({
      ipLockRef: { kind: 'IpAddress', id: 42 },
      ipMutationGeneration: ipGeneration,
      vpsLockRef: { kind: 'Vps', id: 22 },
      vpsMutationGeneration: vpsGeneration,
    });

    expect(preflight).toHaveBeenCalledWith(expect.objectContaining({ vpsId: 22, knownBusy: false }));
    expect(acquireLocalLock).toHaveBeenNthCalledWith(1, { kind: 'IpAddress', id: 42 }, {
      durable: true,
      intent,
    });
    expect(acquireLocalLock).toHaveBeenNthCalledWith(2, { kind: 'Vps', id: 22 }, { durable: true });
    expect(settleLocalLock).not.toHaveBeenCalled();
  });

  it('releases the IP guard if acquiring the destination VPS guard fails', async () => {
    const ipGeneration = {} as LocalMutationGeneration;
    const lockError = new Error('lock storage failed');
    const acquireLocalLock = vi.fn()
      .mockResolvedValueOnce(ipGeneration)
      .mockRejectedValueOnce(lockError);
    const settleLocalLock = vi.fn();

    await expect(acquireIpRouteAssignmentLocks({
      ipId: 42,
      vpsId: 22,
      intent: {
        type: 'ip-route-assign',
        previousNetworkInterfaceId: null,
        expectedNetworkInterfaceId: 501,
        expectedVpsId: 22,
      },
      t: (key) => String(key),
      acquireLocalLock: acquireLocalLock as unknown as ChromeContextValue['acquireLocalLock'],
      settleLocalLock,
      preflight: vi.fn().mockResolvedValue(undefined),
    })).rejects.toBe(lockError);

    expect(settleLocalLock).toHaveBeenCalledWith(
      { kind: 'IpAddress', id: 42 },
      lockError,
      ipGeneration,
    );
  });
});
