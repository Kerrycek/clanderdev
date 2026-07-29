import { expectArray, haveApiCall } from './haveapi';

export interface ResourceRef {
  id: number;
  [k: string]: unknown;
}
export interface DnsZone {
  id: number;
  user?: ResourceRef;
  name?: string;
  label?: string;
  role?: string;
  source?: string;
  type?: string;
  zone_type?: string;
  reverse_network_address?: string;
  reverse_network_prefix?: number;
  dnssec_enabled?: boolean;
  serial?: number;
  enabled?: boolean;
  default_ttl?: number;
  email?: string;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
}
export interface DnsRecord {
  id: number;
  user?: ResourceRef;
  dns_zone?: ResourceRef;
  name?: string;
  type?: string;
  content?: string;
  ttl?: number;
  priority?: number;
  comment?: string;
  enabled?: boolean;
  dynamic_update_enabled?: boolean;
  dynamic_update_url?: string;
  [k: string]: unknown;
}

export interface DnsRecordLog {
  id: number;
  user?: ResourceRef;
  dns_zone?: ResourceRef;
  dns_zone_name?: string;
  change_type?: string;
  name?: string;
  type?: string;
  attr_changes?: unknown;
  transaction_chain?: ResourceRef;
  created_at?: string;
  [k: string]: unknown;
}

export async function fetchDnsZones(opts?: {
  fromId?: number;
  limit?: number;
  q?: string;
  user?: number;
  enabled?: boolean;
  dnssec_enabled?: boolean;
  role?: string;
  source?: string;
}) {
  const params: Record<string, unknown> = {};
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.q !== undefined) params['q'] = opts.q;
  if (opts?.user !== undefined) params['user'] = opts.user;
  if (opts?.enabled !== undefined) params['enabled'] = opts.enabled;
  if (opts?.dnssec_enabled !== undefined) params['dnssec_enabled'] = opts.dnssec_enabled;
  if (opts?.role !== undefined) params['role'] = opts.role;
  if (opts?.source !== undefined) params['source'] = opts.source;

  const res = await haveApiCall<DnsZone[]>({
    method: 'GET',
    path: '/dns_zones',
    namespace: 'dns_zone',
    params,
  });

  return { ...res, data: expectArray<DnsZone>(res.data, 'dns_zones#index') };
}

export async function fetchDnsZone(zoneId: number) {
  return haveApiCall<DnsZone>({
    method: 'GET',
    path: `/dns_zones/${zoneId}`,
  });
}

export async function createDnsZone(payload: {
  user?: number;
  name: string;
  label?: string;
  email?: string;
  default_ttl?: number;
  dnssec_enabled?: boolean;
  enabled?: boolean;
  seed_vps?: number;
  role?: string;
  source?: string;
  reverse_network_address?: string;
  reverse_network_prefix?: number;
}) {
  return haveApiCall<DnsZone>({
    method: 'POST',
    path: '/dns_zones',
    namespace: 'dns_zone',
    params: payload,
  });
}

export async function updateDnsZone(zoneId: number, payload: {
  label?: string;
  email?: string;
  default_ttl?: number;
  dnssec_enabled?: boolean;
  enabled?: boolean;
}) {
  return haveApiCall<DnsZone>({
    method: 'PUT',
    path: `/dns_zones/${zoneId}`,
    namespace: 'dns_zone',
    params: payload,
  });
}

export async function deleteDnsZone(zoneId: number) {
  return haveApiCall<void>({
    method: 'DELETE',
    path: `/dns_zones/${zoneId}`,
  });
}

export async function fetchDnsRecords(opts?: {
  fromId?: number;
  limit?: number;
  user?: number;
  dns_zone?: number;
  q?: string;
}) {
  const params: Record<string, unknown> = {};
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.user !== undefined) params['user'] = opts.user;
  if (opts?.dns_zone !== undefined) params['dns_zone'] = opts.dns_zone;
  if (opts?.q !== undefined) params['q'] = opts.q;

  const res = await haveApiCall<DnsRecord[]>({
    method: 'GET',
    path: '/dns_records',
    namespace: 'dns_record',
    params,
  });

  return { ...res, data: expectArray<DnsRecord>(res.data, 'dns_records#index') };
}

export async function createDnsRecord(payload: {
  user?: number;
  dns_zone: number;
  name: string;
  type: string;
  content: string;
  ttl?: number;
  priority?: number;
  comment?: string;
  enabled?: boolean;
  dynamic_update_enabled?: boolean;
}) {
  return haveApiCall<DnsRecord>({
    method: 'POST',
    path: '/dns_records',
    namespace: 'dns_record',
    params: payload,
  });
}

export async function updateDnsRecord(recordId: number, payload: {
  user?: number;
  content?: string;
  ttl?: number;
  priority?: number;
  comment?: string;
  enabled?: boolean;
  dynamic_update_enabled?: boolean;
}) {
  return haveApiCall<DnsRecord>({
    method: 'PUT',
    path: `/dns_records/${recordId}`,
    namespace: 'dns_record',
    params: payload,
  });
}

export async function deleteDnsRecord(recordId: number) {
  return haveApiCall<void>({
    method: 'DELETE',
    path: `/dns_records/${recordId}`,
  });
}

export async function fetchDnsRecordLogs(opts?: {
  fromId?: number;
  limit?: number;
  user?: number;
  dns_zone?: number;
  dns_zone_name?: string;
  change_type?: string;
  name?: string;
  type?: string;
  q?: string;
}) {
  const params: Record<string, unknown> = {};
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.user !== undefined) params['user'] = opts.user;
  if (opts?.dns_zone !== undefined) params['dns_zone'] = opts.dns_zone;
  if (opts?.q !== undefined) params['q'] = opts.q;
  if (opts?.dns_zone_name !== undefined) params['dns_zone_name'] = opts.dns_zone_name;
  if (opts?.change_type !== undefined) params['change_type'] = opts.change_type;
  if (opts?.name !== undefined) params['name'] = opts.name;
  if (opts?.type !== undefined) params['type'] = opts.type;

  const res = await haveApiCall<DnsRecordLog[]>({
    method: 'GET',
    path: '/dns_record_logs',
    namespace: 'dns_record_log',
    params,
  });

  return { ...res, data: expectArray<DnsRecordLog>(res.data, 'dns_record_logs#index') };
}


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

export interface DnssecRecord {
  id: number;
  dns_zone?: ResourceRef & { name?: string };
  keyid?: number;
  dnskey_algorithm?: number;
  dnskey_pubkey?: string;
  ds_algorithm?: number;
  ds_digest_type?: number;
  ds_digest?: string;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
}

export interface DnsServer {
  id: number;
  node?: ResourceRef & { domain_name?: string };
  name?: string;
  ipv4_addr?: string;
  ipv6_addr?: string;
  hidden?: boolean;
  enable_user_dns_zones?: boolean;
  user_dns_zone_type?: string;
  [k: string]: unknown;
}

export interface DnsServerZone {
  id: number;
  dns_server?: DnsServer | ResourceRef;
  dns_zone?: DnsZone | ResourceRef;
  type?: string;
  serial?: number;
  loaded_at?: string | null;
  expires_at?: string | null;
  refresh_at?: string | null;
  last_check_at?: string | null;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
}

export interface DnsTsigKey {
  id: number;
  user?: ResourceRef & { login?: string };
  name?: string;
  algorithm?: string;
  secret?: string;
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
  return { ...res, data: expectArray<DnsZoneTransfer>(res.data, 'dns_zone_transfers#index') };
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

export async function fetchDnssecRecords(opts?: { fromId?: number; limit?: number; dns_zone?: number }) {
  const params: Record<string, unknown> = {};
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.dns_zone !== undefined) params['dns_zone'] = opts.dns_zone;
  const res = await haveApiCall<DnssecRecord[]>({
    method: 'GET',
    path: '/dnssec_records',
    namespace: 'dnssec_record',
    params,
    meta: { includes: 'dns_zone' },
  });
  return { ...res, data: expectArray<DnssecRecord>(res.data, 'dnssec_records#index') };
}

export async function fetchDnsServers(opts?: {
  fromId?: number;
  limit?: number;
  q?: string;
  hidden?: boolean;
  enable_user_dns_zones?: boolean;
}) {
  const params: Record<string, unknown> = {};
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.q !== undefined) params['q'] = opts.q;
  if (opts?.hidden !== undefined) params['hidden'] = opts.hidden;
  if (opts?.enable_user_dns_zones !== undefined) params['enable_user_dns_zones'] = opts.enable_user_dns_zones;
  const res = await haveApiCall<DnsServer[]>({
    method: 'GET',
    path: '/dns_servers',
    namespace: 'dns_server',
    params,
    meta: { includes: 'node' },
  });
  return { ...res, data: expectArray<DnsServer>(res.data, 'dns_servers#index') };
}

export async function createDnsServer(payload: {
  node: number;
  name: string;
  ipv4_addr?: string;
  ipv6_addr?: string;
  hidden?: boolean;
  enable_user_dns_zones?: boolean;
  user_dns_zone_type?: string;
}) {
  return haveApiCall<DnsServer>({ method: 'POST', path: '/dns_servers', namespace: 'dns_server', params: payload });
}

export async function updateDnsServer(id: number, payload: {
  node?: number;
  name?: string;
  ipv4_addr?: string;
  ipv6_addr?: string;
  hidden?: boolean;
  enable_user_dns_zones?: boolean;
  user_dns_zone_type?: string;
}) {
  return haveApiCall<DnsServer>({ method: 'PUT', path: `/dns_servers/${id}`, namespace: 'dns_server', params: payload });
}

export async function deleteDnsServer(id: number) {
  return haveApiCall<void>({ method: 'DELETE', path: `/dns_servers/${id}` });
}

export async function fetchDnsServerZones(opts?: {
  fromId?: number;
  limit?: number;
  dns_server?: number;
  dns_zone?: number;
}) {
  const params: Record<string, unknown> = {};
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.dns_server !== undefined) params['dns_server'] = opts.dns_server;
  if (opts?.dns_zone !== undefined) params['dns_zone'] = opts.dns_zone;
  const res = await haveApiCall<DnsServerZone[]>({
    method: 'GET',
    path: '/dns_server_zones',
    namespace: 'dns_server_zone',
    params,
    meta: { includes: 'dns_server,dns_zone' },
  });
  return { ...res, data: expectArray<DnsServerZone>(res.data, 'dns_server_zones#index') };
}

export async function createDnsServerZone(payload: { dns_server: number; dns_zone: number; type?: string }) {
  return haveApiCall<DnsServerZone>({ method: 'POST', path: '/dns_server_zones', namespace: 'dns_server_zone', params: payload });
}

export async function deleteDnsServerZone(id: number) {
  return haveApiCall<void>({ method: 'DELETE', path: `/dns_server_zones/${id}` });
}

export async function fetchDnsTsigKeys(opts?: {
  fromId?: number;
  limit?: number;
  q?: string;
  user?: number;
  algorithm?: string;
}) {
  const params: Record<string, unknown> = {};
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.q !== undefined) params['q'] = opts.q;
  if (opts?.user !== undefined) params['user'] = opts.user;
  if (opts?.algorithm !== undefined) params['algorithm'] = opts.algorithm;
  const res = await haveApiCall<DnsTsigKey[]>({
    method: 'GET',
    path: '/dns_tsig_keys',
    namespace: 'dns_tsig_key',
    params,
    meta: { includes: 'user' },
  });
  return { ...res, data: expectArray<DnsTsigKey>(res.data, 'dns_tsig_keys#index') };
}

export async function createDnsTsigKey(payload: { user?: number; name: string; algorithm?: string }) {
  return haveApiCall<DnsTsigKey>({ method: 'POST', path: '/dns_tsig_keys', namespace: 'dns_tsig_key', params: payload });
}

export async function deleteDnsTsigKey(id: number) {
  return haveApiCall<void>({ method: 'DELETE', path: `/dns_tsig_keys/${id}` });
}
