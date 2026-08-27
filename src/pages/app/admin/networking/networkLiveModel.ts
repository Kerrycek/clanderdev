import type { ResourceRef } from '../../../../lib/api/appTypes';
import type { NetworkInterfaceMonitorRow } from '../../../../lib/api/networking';

export type LiveTrafficTotals = {
  bytesIn: number;
  bytesOut: number;
  packetsIn: number;
  packetsOut: number;
};

export type LiveTrafficTalker = {
  id: number;
  label: string;
  bytesIn: number;
  bytesOut: number;
  total: number;
};

type RelatedObject = ResourceRef & {
  hostname?: string;
  login?: string;
  domain_name?: string;
  user?: RelatedObject;
  node?: RelatedObject;
};

export function relatedObject(value: unknown): RelatedObject | null {
  return value && typeof value === 'object' ? value as RelatedObject : null;
}

export function monitorInterface(row: NetworkInterfaceMonitorRow): RelatedObject | null {
  return relatedObject(row.network_interface);
}

export function monitorVps(row: NetworkInterfaceMonitorRow): RelatedObject | null {
  return relatedObject(monitorInterface(row)?.['vps']);
}

export function monitorUser(row: NetworkInterfaceMonitorRow): RelatedObject | null {
  return relatedObject(monitorVps(row)?.user);
}

export function monitorNode(row: NetworkInterfaceMonitorRow): RelatedObject | null {
  return relatedObject(monitorVps(row)?.node);
}

export function objectLabel(
  value: RelatedObject | null,
  fields: Array<'hostname' | 'login' | 'domain_name' | 'name' | 'label'>,
  fallback = '—',
): string {
  if (!value) return fallback;
  for (const field of fields) {
    const candidate = String(value[field] ?? '').trim();
    if (candidate) return candidate;
  }
  return Number.isInteger(value.id) && value.id > 0 ? `#${value.id}` : fallback;
}

export function perSecond(value: number | undefined, delta: number | undefined): number {
  const amount = Number(value ?? 0);
  const seconds = Number(delta ?? 1);
  if (!Number.isFinite(amount)) return 0;
  if (!Number.isFinite(seconds) || seconds <= 0) return amount;
  return amount / seconds;
}

export function trafficTotals(rows: NetworkInterfaceMonitorRow[]): LiveTrafficTotals {
  return rows.reduce<LiveTrafficTotals>((total, row) => ({
    bytesIn: total.bytesIn + perSecond(row.bytes_in, row.delta),
    bytesOut: total.bytesOut + perSecond(row.bytes_out, row.delta),
    packetsIn: total.packetsIn + perSecond(row.packets_in, row.delta),
    packetsOut: total.packetsOut + perSecond(row.packets_out, row.delta),
  }), { bytesIn: 0, bytesOut: 0, packetsIn: 0, packetsOut: 0 });
}

export function topTalkers(
  rows: NetworkInterfaceMonitorRow[],
  kind: 'vps' | 'user',
  limit = 5,
): LiveTrafficTalker[] {
  const byId = new Map<number, LiveTrafficTalker>();

  for (const row of rows) {
    const object = kind === 'vps' ? monitorVps(row) : monitorUser(row);
    const id = Number(object?.id);
    if (!Number.isInteger(id) || id <= 0) continue;

    const bytesIn = perSecond(row.bytes_in, row.delta);
    const bytesOut = perSecond(row.bytes_out, row.delta);
    const current = byId.get(id) ?? {
      id,
      label: objectLabel(object, kind === 'vps' ? ['hostname', 'name', 'label'] : ['login', 'name', 'label']),
      bytesIn: 0,
      bytesOut: 0,
      total: 0,
    };
    current.bytesIn += bytesIn;
    current.bytesOut += bytesOut;
    current.total += bytesIn + bytesOut;
    byId.set(id, current);
  }

  return [...byId.values()]
    .sort((left, right) => right.total - left.total || left.label.localeCompare(right.label))
    .slice(0, Math.max(0, limit));
}

export function oldestMonitorTimestamp(rows: NetworkInterfaceMonitorRow[]): number | null {
  let oldest: number | null = null;
  for (const row of rows) {
    const timestamp = Date.parse(String(row.updated_at ?? ''));
    if (!Number.isFinite(timestamp)) continue;
    if (oldest === null || timestamp < oldest) oldest = timestamp;
  }
  return oldest;
}

export function monitorDataIsStale(timestamp: number | null, now = Date.now(), thresholdMs = 30_000): boolean {
  if (timestamp === null) return true;
  return now - timestamp > thresholdMs;
}

export function staleMonitorCount(
  rows: NetworkInterfaceMonitorRow[],
  now = Date.now(),
  thresholdMs = 30_000,
): number {
  return rows.reduce((count, row) => {
    const timestamp = Date.parse(String(row.updated_at ?? ''));
    return count + (monitorDataIsStale(Number.isFinite(timestamp) ? timestamp : null, now, thresholdMs) ? 1 : 0);
  }, 0);
}
