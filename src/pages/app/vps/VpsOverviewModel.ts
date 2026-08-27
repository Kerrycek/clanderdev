import type React from 'react';
import type { ResourceRef } from '../../../lib/api/appTypes';
import type { IpAddress } from '../../../lib/api/ipAddresses';
import type { TransactionChain } from '../../../lib/api/transactions';
import type { Vps, VpsStatus } from '../../../lib/api/vps';

export type ManagementAction = {
  to: string;
  label: React.ReactNode;
  description: React.ReactNode;
  testId: string;
  badge?: React.ReactNode;
  danger?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function resourceLabel(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (!isRecord(value)) return undefined;

  const label = value['label'];
  if (typeof label === 'string' && label.trim()) return label;

  const name = value['name'];
  if (typeof name === 'string' && name.trim()) return name;

  const fullName = value['full_name'];
  if (typeof fullName === 'string' && fullName.trim()) return fullName;

  const domainName = value['domain_name'];
  if (typeof domainName === 'string' && domainName.trim()) return domainName;

  const login = value['login'];
  if (typeof login === 'string' && login.trim()) return login;

  const addr = value['addr'];
  if (typeof addr === 'string' && addr.trim()) return addr;

  const id = value['id'];
  if (typeof id === 'number' && Number.isFinite(id)) return `#${id}`;
  if (typeof id === 'string' && id.trim()) return `#${id}`;

  return undefined;
}

export function resourceId(value: ResourceRef | undefined | null): number | undefined {
  const id = value?.id;
  return typeof id === 'number' && Number.isFinite(id) ? id : undefined;
}

export function ownerLabel(vps: Vps): string | undefined {
  if (!vps.user) return undefined;
  return vps.user.login || `#${vps.user.id}`;
}

export function ownerId(vps: Vps): number | undefined {
  const id = vps.user?.id;
  return typeof id === 'number' && Number.isFinite(id) ? id : undefined;
}

export function shouldShowVpsOwner(props: {
  mode: 'user' | 'admin';
  ownerId?: number;
  currentUserId?: number;
}): boolean {
  if (props.mode === 'admin') return true;
  if (props.ownerId === undefined || props.currentUserId === undefined) return false;
  return props.ownerId !== props.currentUserId;
}

export function nodeLabel(vps: Vps, fallback: string): string {
  return vps.node?.domain_name || vps.node?.name || fallback;
}

export function locationLabel(vps: Vps, fallback: string): string {
  return vps.node?.location?.label || fallback;
}

export function usageValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export type VpsOverviewIpKind = 'ipv4_public' | 'ipv4_private' | 'ipv6';

export function ipAddressDisplayLabel(ip: IpAddress): string {
  const address = String(ip.addr ?? '').trim();
  if (!address) return `#${ip.id}`;

  const prefix = typeof ip.prefix === 'number' ? ip.prefix : Number.NaN;
  if (!address.includes('/') && Number.isInteger(prefix) && prefix >= 0) {
    return `${address}/${prefix}`;
  }

  return address;
}

export function classifyIpAddress(ip: IpAddress): VpsOverviewIpKind {
  const version = Number(ip.network?.ip_version);
  const address = String(ip.addr ?? '').trim();

  if (version === 6 || (version !== 4 && address.includes(':'))) return 'ipv6';
  return String(ip.network?.role ?? '') === 'private_access' ? 'ipv4_private' : 'ipv4_public';
}

export function selectOverviewIpAddresses(ipAddresses: IpAddress[], limit = 3): IpAddress[] {
  if (limit <= 0) return [];

  const selected: IpAddress[] = [];
  const selectedIds = new Set<number>();
  const kinds: VpsOverviewIpKind[] = ['ipv4_public', 'ipv4_private', 'ipv6'];

  for (const kind of kinds) {
    const candidate = ipAddresses.find((ip) => classifyIpAddress(ip) === kind && !selectedIds.has(ip.id));
    if (!candidate) continue;
    selected.push(candidate);
    selectedIds.add(candidate.id);
    if (selected.length >= limit) return selected;
  }

  for (const ip of ipAddresses) {
    if (selectedIds.has(ip.id)) continue;
    selected.push(ip);
    selectedIds.add(ip.id);
    if (selected.length >= limit) break;
  }

  return selected;
}

function addressWithoutPrefix(value: unknown): string {
  return String(value ?? '').trim().split('/', 1)[0] ?? '';
}

function isPrivateIpv4(address: string): boolean {
  const octets = address.split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;

  const first = octets[0];
  const second = octets[1];
  if (first === undefined || second === undefined) return false;
  return first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
}

function isPrivateIpAddress(address: string): boolean {
  const normalized = addressWithoutPrefix(address).toLowerCase();
  if (!normalized) return true;
  if (!normalized.includes(':')) return isPrivateIpv4(normalized);
  return normalized === '::1'
    || normalized.startsWith('fe80:')
    || normalized.startsWith('fc')
    || normalized.startsWith('fd');
}

export function primarySshIpAddress(ipAddresses: IpAddress[] | undefined): string | null {
  const usable = (ipAddresses ?? [])
    .map((ip) => ({ ip, address: addressWithoutPrefix(ip.addr) }))
    .filter((item) => item.address.length > 0);

  if (usable.length === 0) return null;

  const explicitlyPublic = usable.find(({ ip }) => {
    const role = String(ip.network?.role ?? '');
    const purpose = String(ip.network?.purpose ?? '');
    return role === 'public_access' || role === 'public' || purpose === 'public_access' || purpose === 'public';
  });
  if (explicitlyPublic) return explicitlyPublic.address;

  const publicCandidate = usable.find(({ address }) => !isPrivateIpAddress(address));
  return publicCandidate?.address ?? usable[0]?.address ?? null;
}

export type VpsOverviewUsage = {
  state: 'known' | 'unknown';
  used: number | null;
  max: number | null;
  percent: number | null;
};

export function overviewUsageMetric(usedValue: unknown, maxValue: unknown): VpsOverviewUsage {
  const used = usageValue(usedValue);
  const max = usageValue(maxValue);

  if (used === undefined || max === undefined || used < 0 || max <= 0) {
    return { state: 'unknown', used: null, max: null, percent: null };
  }

  return {
    state: 'known',
    used,
    max,
    percent: (used / max) * 100,
  };
}

export type VpsOverviewHealthState = 'stale' | 'busy' | 'running' | 'stopped' | 'unknown';

export type VpsOverviewHealthKey =
  | Exclude<VpsOverviewHealthState, 'running'>
  | 'ready'
  | 'running_no_access'
  | 'network_disabled'
  | 'access_loading'
  | 'access_error';

export function overviewHealthState(input: {
  running: unknown;
  busy: boolean;
  stale: boolean;
}): VpsOverviewHealthState {
  if (input.stale) return 'stale';
  if (input.busy) return 'busy';
  if (input.running === true) return 'running';
  if (input.running === false) return 'stopped';
  return 'unknown';
}

export function overviewHealthKey(input: {
  running: unknown;
  busy: boolean;
  stale: boolean;
  networkEnabled: boolean;
  sshCommand?: string | null;
  ipAddressesLoading: boolean;
  ipAddressesError: boolean;
}): VpsOverviewHealthKey {
  const state = overviewHealthState(input);
  if (state !== 'running') return state;

  if (!input.networkEnabled) return 'network_disabled';
  if (input.sshCommand) return 'ready';
  if (input.ipAddressesError) return 'access_error';
  if (input.ipAddressesLoading) return 'access_loading';
  return 'running_no_access';
}

export function isRemoteConsoleAvailable(vps: Vps): boolean {
  const server = String(vps.node?.location?.remote_console_server ?? '').trim();
  return Boolean(vps.node && server);
}

export function formatLoadavg(vps: Vps): string {
  const a1 = typeof vps.loadavg1 === 'number' ? vps.loadavg1 : undefined;
  const a5 = typeof vps.loadavg5 === 'number' ? vps.loadavg5 : undefined;
  const a15 = typeof vps.loadavg15 === 'number' ? vps.loadavg15 : undefined;

  if (a1 == null && a5 == null && a15 == null) return '—';

  const fmt = (n: number | undefined) => (typeof n === 'number' ? n.toFixed(2) : '—');
  return `${fmt(a1)} / ${fmt(a5)} / ${fmt(a15)}`;
}

export function fmtLoad(value: unknown): string {
  const n = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(2);
}

export function safePercent(num: unknown, den: unknown): number | null {
  const n = typeof num === 'number' ? num : Number.NaN;
  const d = typeof den === 'number' ? den : Number.NaN;
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  return (n / d) * 100;
}

export function sortChainsForOverview(list: TransactionChain[]): TransactionChain[] {
  return list.slice().sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
}

export type MetricsWindow = '24h' | '7d' | '30d';

export function parseMetricsWindow(raw: string | null | undefined): MetricsWindow {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === '7d') return '7d';
  if (v === '30d') return '30d';
  return '24h';
}

export function metricsWindowMs(w: MetricsWindow): number {
  switch (w) {
    case '7d':
      return 7 * 24 * 60 * 60 * 1000;
    case '30d':
      return 30 * 24 * 60 * 60 * 1000;
    default:
      return 24 * 60 * 60 * 1000;
  }
}

export function metricsLimitForWindow(w: MetricsWindow): number {
  switch (w) {
    case '30d':
      return 900;
    case '7d':
      return 240;
    default:
      return 80;
  }
}

export function sortStatusesByTimeAsc(list: VpsStatus[]): VpsStatus[] {
  return list.slice().sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : Number.NaN;
    const tb = b.created_at ? new Date(b.created_at).getTime() : Number.NaN;
    if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
    if (!Number.isFinite(ta)) return -1;
    if (!Number.isFinite(tb)) return 1;
    return ta - tb;
  });
}
