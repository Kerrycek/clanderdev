import { expectArray, haveApiCall, requireActionStateResult } from './haveapi';
import type { ResourceRef } from './appTypes';

export interface NetworkInterface {
  id: number;
  vps?: ResourceRef;
  name: string;
  type?: string;
  mac?: string;
  max_tx?: number;
  max_rx?: number;
  enable?: boolean;
  [k: string]: unknown;
}

export interface NetworkInterfaceAccounting {
  id: number;
  network_interface?: NetworkInterface | ResourceRef;
  bytes?: number;
  bytes_in?: number;
  bytes_out?: number;
  packets?: number;
  packets_in?: number;
  packets_out?: number;
  year?: number;
  month?: number;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
}

export interface NetworkInterfaceAccountingListOpts {
  vps?: number;
  user?: number;
  environment?: number;
  location?: number;
  node?: number;
  year?: number;
  month?: number;
  limit?: number;
  fromBytes?: number;
  order?: 'created_at' | 'updated_at' | 'descending' | 'ascending';
  includes?: string;
}

export async function fetchNetworkInterfaces(vpsId: number, opts?: { limit?: number }) {
  const res = await haveApiCall<NetworkInterface[]>({
    method: 'GET',
    path: '/network_interfaces',
    namespace: 'network_interface',
    params: {
      vps: vpsId,
      limit: opts?.limit ?? 100,
    },
  });
  return { ...res, data: expectArray<NetworkInterface>(res.data, 'network_interfaces') };
}

export async function updateNetworkInterface(netifId: number, params: Record<string, unknown>) {
  const res = await haveApiCall<NetworkInterface>({
    method: 'PUT',
    path: `/network_interfaces/${netifId}`,
    namespace: 'network_interface',
    params,
  });
  return requireActionStateResult(res, 'network interface update');
}

export async function fetchNetworkInterfaceAccountings(opts?: NetworkInterfaceAccountingListOpts) {
  const params: Record<string, unknown> = {};
  if (opts?.vps !== undefined) params['vps'] = opts.vps;
  if (opts?.user !== undefined) params['user'] = opts.user;
  if (opts?.environment !== undefined) params['environment'] = opts.environment;
  if (opts?.location !== undefined) params['location'] = opts.location;
  if (opts?.node !== undefined) params['node'] = opts.node;
  if (opts?.year !== undefined) params['year'] = opts.year;
  if (opts?.month !== undefined) params['month'] = opts.month;
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromBytes !== undefined) params['from_bytes'] = opts.fromBytes;
  if (opts?.order) params['order'] = opts.order;

  const res = await haveApiCall<NetworkInterfaceAccounting[]>({
    method: 'GET',
    path: '/network_interface_accountings',
    namespace: 'network_interface_accounting',
    params,
    meta: opts?.includes ? { includes: opts.includes } : undefined,
  });
  return {
    ...res,
    data: expectArray<NetworkInterfaceAccounting>(res.data, 'network_interface_accountings'),
  };
}

export async function fetchNetworkInterfaceAccountingForVps(vpsId: number, year: number, month: number) {
  return fetchNetworkInterfaceAccountings({
    vps: vpsId,
    year,
    month,
    limit: 250,
  });
}
