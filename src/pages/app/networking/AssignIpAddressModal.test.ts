import { describe, expect, it } from 'vitest';

import { ipRouteAssignmentAction } from './AssignIpAddressModal';

describe('ipRouteAssignmentAction', () => {
  it('keeps route-only, atomic route-and-host, and route-via distinct', () => {
    expect(ipRouteAssignmentAction('route')).toEqual({ action: 'route', routeVia: undefined });
    expect(ipRouteAssignmentAction('route_host')).toEqual({ action: 'route_host' });
    expect(ipRouteAssignmentAction('route_via', 17)).toEqual({ action: 'route', routeVia: 17 });
  });
});
