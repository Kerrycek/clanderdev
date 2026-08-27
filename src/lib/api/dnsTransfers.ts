import { expectArray, haveApiCall } from './haveapi';
import { withoutDnsSecrets } from './dnsSecretScrubber';
import type { DnsServerZone, DnsZone, ResourceRef } from './dns';

export interface HostIpAddress {
  id: number;
  ip_address?: ResourceRef & { ip_addr?: string; addr?: string };
  addr?: string;
  reverse_record_value?: string | null;
  vps?: ResourceRef & { hostname?: string };
  user?: ResourceRef & { login?: string };
  network_interface?: ResourceRef & { name?: string };
  [k: string]: unknown;
}

export interface DnsZoneTransfer {
  id: number;
  dns_zone?: ResourceRef & { name?: string };
  host_ip_address?: HostIpAddress | ResourceRef;
  peer_type?: string;
  dns_tsig_key?: ResourceRef & { name?: string } | null;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
}

export interface DnsServerZoneTransferLog {
  id: number;
  dns_server_zone?: DnsServerZone | ResourceRef;
  event_at?: string;
  status?: string;
  reason_code?: string | null;
  reason?: string | null;
  primary_addr?: string | null;
  serial?: number | null;
  message?: string | null;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
}

export async function fetchHostIpAddresses(opts?: {
  fromId?: number;
  limit?: number;
  q?: string;
  user?: number;
  vps?: number;
  assigned?: boolean;
}) {
  const params: Record<string, unknown> = {};
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.q !== undefined) params['q'] = opts.q;
  if (opts?.user !== undefined) params['user'] = opts.user;
  if (opts?.vps !== undefined) params['vps'] = opts.vps;
  if (opts?.assigned !== undefined) params['assigned'] = opts.assigned;

  const res = await haveApiCall<HostIpAddress[]>({
    method: 'GET',
    path: '/host_ip_addresses',
    namespace: 'host_ip_address',
    params,
    meta: { includes: 'ip_address,user,vps,network_interface' },
  });
  return { ...res, data: expectArray<HostIpAddress>(res.data, 'host_ip_addresses#index') };
}

export async function fetchDnsZoneTransfers(opts?: {
  fromId?: number;
  limit?: number;
  dns_zone?: number;
  host_ip_address?: number;
  peer_type?: string;
  dns_tsig_key?: number;
}) {
  const params: Record<string, unknown> = {};
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.dns_zone !== undefined) params['dns_zone'] = opts.dns_zone;
  if (opts?.host_ip_address !== undefined) params['host_ip_address'] = opts.host_ip_address;
  if (opts?.peer_type !== undefined) params['peer_type'] = opts.peer_type;
  if (opts?.dns_tsig_key !== undefined) params['dns_tsig_key'] = opts.dns_tsig_key;

  const res = await haveApiCall<DnsZoneTransfer[]>({
    method: 'GET',
    path: '/dns_zone_transfers',
    namespace: 'dns_zone_transfer',
    params,
    meta: { includes: 'dns_zone,host_ip_address,dns_tsig_key' },
  });
  const safeRes = withoutDnsSecrets(res);
  return {
    ...safeRes,
    data: expectArray<DnsZoneTransfer>(safeRes.data, 'dns_zone_transfers#index'),
  };
}

export async function createDnsZoneTransfer(payload: {
  dns_zone: number;
  host_ip_address: number;
  peer_type?: string;
  dns_tsig_key?: number;
}) {
  return haveApiCall<DnsZoneTransfer>({
    method: 'POST',
    path: '/dns_zone_transfers',
    namespace: 'dns_zone_transfer',
    params: payload,
  });
}

export async function deleteDnsZoneTransfer(id: number) {
  return haveApiCall<void>({ method: 'DELETE', path: `/dns_zone_transfers/${id}` });
}

export async function fetchDnsServerZoneTransferLogs(opts?: {
  fromId?: number;
  limit?: number;
  dns_zone?: number;
  dns_server_zone?: number;
  status?: string;
  reason_code?: string;
  primary_addr?: string;
  order?: 'oldest' | 'latest';
}) {
  const params: Record<string, unknown> = {};
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.dns_zone !== undefined) params['dns_zone'] = opts.dns_zone;
  if (opts?.dns_server_zone !== undefined) params['dns_server_zone'] = opts.dns_server_zone;
  if (opts?.status !== undefined) params['status'] = opts.status;
  if (opts?.reason_code !== undefined) params['reason_code'] = opts.reason_code;
  if (opts?.primary_addr !== undefined) params['primary_addr'] = opts.primary_addr;
  if (opts?.order !== undefined) params['order'] = opts.order;

  const res = await haveApiCall<DnsServerZoneTransferLog[]>({
    method: 'GET',
    path: '/dns_server_zone_transfer_logs',
    namespace: 'dns_server_zone_transfer_log',
    params,
    meta: { includes: 'dns_server_zone__dns_server,dns_server_zone__dns_zone' },
  });

  return {
    ...res,
    data: expectArray<DnsServerZoneTransferLog>(
      res.data,
      'dns_server_zone_transfer_logs#index'
    ),
  };
}
