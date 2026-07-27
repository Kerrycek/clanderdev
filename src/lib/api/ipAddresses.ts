import { expectArray, haveApiCall } from './haveapi';
import type { ResourceRef } from './appTypes';
import type { NetworkInterface } from './networkInterfaces';
import type { User } from './users';
import type { Vps } from './vps';

export interface Network {
  id: number;
  address?: string;
  prefix?: number;
  ip_version?: number;
  role?: string;
  purpose?: string;
  primary_location?: {
    id?: number;
    label?: string;
    environment?: { id?: number; label?: string } | null;
  } | null;
  [k: string]: unknown;
}

export interface IpAddress {
  id: number;
  network?: Network;
  prefix?: number;
  size?: number;
  network_interface?: NetworkInterface | ResourceRef;
  user?: User | ResourceRef;
  addr?: string;
  routed?: boolean;
  vps?: Vps | ResourceRef;
  route_via?: ResourceRef;
  order?: number;
  [k: string]: unknown;
}

export async function fetchIpAddresses(opts?: {
  limit?: number;
  fromId?: number;
  includes?: string;

  /** Full text search (address, VPS, user, network…) */
  q?: string;

  location?: number;
  network?: number;
  version?: number;
  role?: string;
  purpose?: string;
  addr?: string;
  prefix?: number;
  vps?: number;
  user?: number | null;
  networkInterface?: number;
  assignedToInterface?: boolean;
  order?: string;
}) {
  const params: Record<string, string | number | boolean | null> = {};

  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;

  if (opts?.q) params['q'] = opts.q;

  if (opts?.location !== undefined) params['location'] = opts.location;
  if (opts?.network !== undefined) params['network'] = opts.network;
  if (opts?.version !== undefined) params['version'] = opts.version;
  if (opts?.role) params['role'] = opts.role;
  if (opts?.purpose) params['purpose'] = opts.purpose;
  if (opts?.addr) params['addr'] = opts.addr;
  if (opts?.prefix !== undefined) params['prefix'] = opts.prefix;
  if (opts?.vps !== undefined) params['vps'] = opts.vps;
  if (opts?.user !== undefined) params['user'] = opts.user;
  if (opts?.networkInterface !== undefined) params['network_interface'] = opts.networkInterface;
  if (opts?.assignedToInterface !== undefined) params['assigned_to_interface'] = opts.assignedToInterface;
  if (opts?.order) params['order'] = opts.order;

  const res = await haveApiCall<IpAddress[]>({
    method: 'GET',
    path: '/ip_addresses',
    namespace: 'ip_address',
    params,
    meta: opts?.includes ? { includes: opts.includes } : undefined,
  });

  return { ...res, data: expectArray<IpAddress>(res.data, 'ip_addresses') };
}

export async function fetchIpAddress(ipAddressId: number, opts?: { includes?: string }) {
  return haveApiCall<IpAddress>({
    method: 'GET',
    path: `/ip_addresses/${ipAddressId}`,
    meta: opts?.includes ? { includes: opts.includes } : undefined,
  });
}

export async function updateIpAddress(ipAddressId: number, params: Record<string, unknown>) {
  return haveApiCall<IpAddress>({
    method: 'PUT',
    path: `/ip_addresses/${ipAddressId}`,
    namespace: 'ip_address',
    params,
  });
}

export async function assignIpAddressRoute(
  ipAddressId: number,
  payload: { network_interface: number; route_via?: number | null }
) {
  const params: Record<string, unknown> = {
    network_interface: payload.network_interface,
  };
  if (payload.route_via !== undefined && payload.route_via !== null) params['route_via'] = payload.route_via;

  return haveApiCall<IpAddress>({
    method: 'POST',
    path: `/ip_addresses/${ipAddressId}/assign`,
    namespace: 'ip_address',
    params,
  });
}

export async function assignIpAddressRouteWithHostAddress(
  ipAddressId: number,
  payload: { network_interface: number; host_ip_address?: number | null }
) {
  const params: Record<string, unknown> = {
    network_interface: payload.network_interface,
  };
  if (payload.host_ip_address !== undefined && payload.host_ip_address !== null) {
    params['host_ip_address'] = payload.host_ip_address;
  }

  return haveApiCall<IpAddress>({
    method: 'POST',
    path: `/ip_addresses/${ipAddressId}/assign_with_host_address`,
    namespace: 'ip_address',
    params,
  });
}

export async function freeIpAddressRoute(ipAddressId: number) {
  return haveApiCall<IpAddress>({
    method: 'POST',
    path: `/ip_addresses/${ipAddressId}/free`,
  });
}

export async function fetchIpAddressesForVps(vpsId: number, opts?: { limit?: number; includes?: string }) {
  const res = await haveApiCall<IpAddress[]>({
    method: 'GET',
    path: '/ip_addresses',
    namespace: 'ip_address',
    params: {
      vps: vpsId,
      order: 'interface',
      limit: opts?.limit ?? 250,
    },
    meta: { includes: opts?.includes ?? 'network,user,network_interface' },
  });
  return { ...res, data: expectArray<IpAddress>(res.data, 'ip_addresses') };
}
