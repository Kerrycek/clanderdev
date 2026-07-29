import type { DnsZone } from '../../../lib/api/dns';

function normalizedToken(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Zones created and edited by vpsAdmin are internal primary zones. External
 * zones are represented by the API as zones whose content is obtained from
 * another authoritative source, so the useful UI is server/transfer oriented.
 */
export function isSecondaryDnsZone(zone: DnsZone): boolean {
  const source = normalizedToken(zone.source);
  if (source === 'external_source' || source === 'external' || source === 'secondary_source') return true;

  const type = normalizedToken(zone.type ?? zone.zone_type);
  if (type === 'secondary_type' || type === 'secondary') return true;

  return false;
}
