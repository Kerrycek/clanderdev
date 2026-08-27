import type { ResourceRef, User, Vps, NetworkInterface } from './app';
import { expectArray, haveApiCall } from './haveapi';
import type { IpAddress } from './ipAddresses';

export interface HostIpAddress {
  id: number;
  ip_address?: ResourceRef & { id?: number; ip_addr?: string; addr?: string; user?: User | ResourceRef; network_interface?: NetworkInterface | ResourceRef };
  addr?: string;
  assigned?: boolean;
  reverse_record_value?: string | null;
  user_created?: boolean;
  [k: string]: unknown;
}

export interface IpAddressAssignment {
  id: number;
  ip_address?: IpAddress | (ResourceRef & { id?: number; addr?: string; ip_addr?: string });
  ip_addr?: string;
  ip_prefix?: number;
  user?: User | ResourceRef;
  raw_user_id?: number;
  vps?: Vps | ResourceRef;
  raw_vps_id?: number;
  from_date?: string;
  to_date?: string | null;
  assigned_by_chain?: ResourceRef & { id?: number; name?: string };
  unassigned_by_chain?: ResourceRef & { id?: number; name?: string };
  reconstructed?: boolean;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
}

export interface NetworkInterfaceMonitorRow {
  id: number;
  network_interface?: NetworkInterface | ResourceRef;
  bytes?: number;
  bytes_in?: number;
  bytes_out?: number;
  packets?: number;
  packets_in?: number;
  packets_out?: number;
  delta?: number;
  updated_at?: string;
  [k: string]: unknown;
}

export interface NetworkTrafficUserTopRow {
  user?: User | ResourceRef;
  bytes?: number;
  bytes_in?: number;
  bytes_out?: number;
  packets?: number;
  packets_in?: number;
  packets_out?: number;
  year?: number;
  month?: number;
  [k: string]: unknown;
}

export async function fetchHostIpAddresses(opts?: {
  limit?: number;
  fromId?: number;
  q?: string;
  ipAddress?: number;
  networkInterface?: number;
  user?: number;
  vps?: number;
  assigned?: boolean;
  routed?: boolean;
  addr?: string;
  version?: number;
  location?: number;
  network?: number;
  order?: 'asc' | 'interface';
}) {
  const params: Record<string, unknown> = {};
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.q) params['q'] = opts.q;
  if (opts?.ipAddress !== undefined) params['ip_address'] = opts.ipAddress;
  if (opts?.networkInterface !== undefined) params['network_interface'] = opts.networkInterface;
  if (opts?.user !== undefined) params['user'] = opts.user;
  if (opts?.vps !== undefined) params['vps'] = opts.vps;
  if (opts?.assigned !== undefined) params['assigned'] = opts.assigned;
  if (opts?.routed !== undefined) params['routed'] = opts.routed;
  if (opts?.addr) params['addr'] = opts.addr;
  if (opts?.version !== undefined) params['version'] = opts.version;
  if (opts?.location !== undefined) params['location'] = opts.location;
  if (opts?.network !== undefined) params['network'] = opts.network;
  if (opts?.order) params['order'] = opts.order;

  const res = await haveApiCall<HostIpAddress[]>({
    method: 'GET',
    path: '/host_ip_addresses',
    namespace: 'host_ip_address',
    params,
    meta: { includes: 'ip_address,ip_address.user,ip_address.network_interface,ip_address.network_interface.vps' },
  });
  return { ...res, data: expectArray<HostIpAddress>(res.data, 'host_ip_addresses#index') };
}

export async function createHostIpAddress(payload: { ip_address: number; addr: string }) {
  return haveApiCall<HostIpAddress>({
    method: 'POST',
    path: '/host_ip_addresses',
    namespace: 'host_ip_address',
    params: payload,
  });
}

export async function updateHostIpAddress(hostIpAddressId: number, params: Record<string, unknown>) {
  return haveApiCall<HostIpAddress>({
    method: 'PUT',
    path: `/host_ip_addresses/${hostIpAddressId}`,
    namespace: 'host_ip_address',
    params,
  });
}

export async function deleteHostIpAddress(hostIpAddressId: number) {
  return haveApiCall<null>({
    method: 'DELETE',
    path: `/host_ip_addresses/${hostIpAddressId}`,
  });
}

export async function assignHostIpAddress(hostIpAddressId: number, payload: { network_interface: number }) {
  return haveApiCall<HostIpAddress>({
    method: 'POST',
    path: `/host_ip_addresses/${hostIpAddressId}/assign`,
    namespace: 'host_ip_address',
    params: { network_interface: payload.network_interface },
  });
}

export async function freeHostIpAddress(hostIpAddressId: number) {
  return haveApiCall<HostIpAddress>({
    method: 'POST',
    path: `/host_ip_addresses/${hostIpAddressId}/free`,
  });
}

export async function fetchIpAddressAssignments(opts?: {
  limit?: number;
  fromId?: number;
  q?: string;
  user?: number;
  vps?: number;
  active?: boolean;
  location?: number;
  network?: number;
  order?: 'newest' | 'oldest';
  includes?: string;
}) {
  const params: Record<string, unknown> = {};
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.q) params['q'] = opts.q;
  if (opts?.user !== undefined) params['user'] = opts.user;
  if (opts?.vps !== undefined) params['vps'] = opts.vps;
  if (opts?.active !== undefined) params['active'] = opts.active;
  if (opts?.location !== undefined) params['location'] = opts.location;
  if (opts?.network !== undefined) params['network'] = opts.network;
  if (opts?.order) params['order'] = opts.order;

  const res = await haveApiCall<IpAddressAssignment[]>({
    method: 'GET',
    path: '/ip_address_assignments',
    namespace: 'ip_address_assignment',
    params,
    meta: {
      includes: opts?.includes ?? 'user,vps,assigned_by_chain,unassigned_by_chain,ip_address',
    },
  });
  return { ...res, data: expectArray<IpAddressAssignment>(res.data, 'ip_address_assignments#index') };
}

export async function fetchNetworkInterfaceMonitor(opts?: {
  limit?: number;
  user?: number;
  environment?: number;
  location?: number;
  node?: number;
  vps?: number;
  networkInterface?: number;
  order?: string;
  includes?: string;
}) {
  const params: Record<string, unknown> = {};
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.user !== undefined) params['user'] = opts.user;
  if (opts?.environment !== undefined) params['environment'] = opts.environment;
  if (opts?.location !== undefined) params['location'] = opts.location;
  if (opts?.node !== undefined) params['node'] = opts.node;
  if (opts?.vps !== undefined) params['vps'] = opts.vps;
  if (opts?.networkInterface !== undefined) params['network_interface'] = opts.networkInterface;
  if (opts?.order) params['order'] = opts.order;

  const res = await haveApiCall<NetworkInterfaceMonitorRow[]>({
    method: 'GET',
    path: '/network_interface_monitors',
    namespace: 'network_interface_monitor',
    params,
    meta: {
      includes: opts?.includes ?? 'network_interface__vps',
    },
  });
  return { ...res, data: expectArray<NetworkInterfaceMonitorRow>(res.data, 'network_interface_monitors#index') };
}

export async function fetchNetworkTrafficUserTop(opts?: {
  limit?: number;
  fromBytes?: number;
  q?: string;
  environment?: number;
  location?: number;
  node?: number;
  year?: number;
  month?: number;
}) {
  const params: Record<string, unknown> = {};
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromBytes !== undefined) params['from_bytes'] = opts.fromBytes;
  if (opts?.q) params['q'] = opts.q;
  if (opts?.environment !== undefined) params['environment'] = opts.environment;
  if (opts?.location !== undefined) params['location'] = opts.location;
  if (opts?.node !== undefined) params['node'] = opts.node;
  if (opts?.year !== undefined) params['year'] = opts.year;
  if (opts?.month !== undefined) params['month'] = opts.month;

  const res = await haveApiCall<NetworkTrafficUserTopRow[]>({
    method: 'GET',
    path: '/network_interface_accountings/user_top',
    namespace: 'network_interface_accounting',
    params,
    meta: { includes: 'user' },
  });
  return { ...res, data: expectArray<NetworkTrafficUserTopRow>(res.data, 'network_interface_accountings#user_top') };
}
