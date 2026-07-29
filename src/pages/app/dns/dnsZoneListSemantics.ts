import type { DnsZone } from '../../../lib/api/dns';

export function zoneName(zone: DnsZone): string {
  if (typeof zone.name === 'string' && zone.name) return zone.name;
  return `#${zone.id}`;
}

export function canonicalDnsZoneName(value: string): string {
  const name = value.trim();
  if (!name) return '';
  return name.endsWith('.') ? name : `${name}.`;
}

export function isValidDnsZoneEmail(value: string): boolean {
  return /^[^@\s]+@[^\s]+$/.test(value.trim());
}

export function normalizeRole(value: string): 'forward_role' | 'reverse_role' | undefined {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'forward' || normalized === 'forward_role') return 'forward_role';
  if (normalized === 'reverse' || normalized === 'reverse_role') return 'reverse_role';
  return undefined;
}

export function normalizeSource(value: string): 'internal_source' | 'external_source' | undefined {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'internal' || normalized === 'internal_source') return 'internal_source';
  if (normalized === 'external' || normalized === 'external_source') return 'external_source';
  return undefined;
}

export function roleLabel(t: (key: string) => string, role: string): string {
  if (role === 'forward_role') return t('dns.zones.role.forward');
  if (role === 'reverse_role') return t('dns.zones.role.reverse');
  return role.replace(/[_-]+/g, ' ');
}

export function sourceLabel(source: string): string {
  if (source === 'internal_source') return 'internal';
  if (source === 'external_source') return 'external';
  return source;
}

type SmartKey = 'q' | 'user' | 'enabled' | 'dnssec' | 'role' | 'source' | 'id';

export function canonicalKey(raw: string): SmartKey | null {
  const key = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!key) return null;

  if (key === 'q' || key === 'query' || key === 'search') return 'q';
  if (key === 'user' || key === 'owner') return 'user';
  if (key === 'enabled' || key === 'status') return 'enabled';
  if (key === 'dnssec' || key === 'dnssec_enabled') return 'dnssec';
  if (key === 'role') return 'role';
  if (key === 'source') return 'source';
  if (key === 'id') return 'id';
  return null;
}
