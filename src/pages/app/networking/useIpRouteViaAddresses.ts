import { useQuery } from '@tanstack/react-query';

import { fetchHostIpAddresses } from '../../../lib/api/networking';

export function useIpRouteViaAddresses(options: {
  active: boolean;
  networkInterfaceId?: number;
  ipVersion?: unknown;
}) {
  return useQuery({
    queryKey: ['host_ip_address', 'route-via', {
      networkInterface: options.networkInterfaceId ?? null,
      version: options.ipVersion ?? null,
    }],
    queryFn: async () => (await fetchHostIpAddresses({
      networkInterface: options.networkInterfaceId!,
      assigned: true,
      version: Number(options.ipVersion),
      limit: 250,
      order: 'interface',
    })).data,
    enabled: options.active && Boolean(options.networkInterfaceId && options.ipVersion),
    staleTime: 10_000,
  });
}
