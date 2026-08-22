import type { Node, NodePool } from '../../../../lib/api/nodes';

export type NodeDetailSection = 'overview' | 'storage' | 'maintenance';

export type NodeStorageDevice = {
  key: string;
  name: string;
  state?: string;
};

export type NodeStorageSummary = {
  total?: number;
  used?: number;
  available?: number;
  measuredPools: number;
};

const POOL_ROLE_VALUES = ['hypervisor', 'primary', 'backup'] as const;
const POOL_STATE_VALUES = ['unknown', 'online', 'degraded', 'suspended', 'faulted', 'error'] as const;
const POOL_SCAN_VALUES = ['unknown', 'none', 'scrub', 'resilver', 'error'] as const;

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function apiEnumValue(value: unknown, values: readonly string[]): string {
  if (typeof value === 'number' && Number.isInteger(value)) return values[value] ?? 'unknown';
  if (typeof value !== 'string') return 'unknown';

  const normalized = value.trim().toLowerCase();
  if (!normalized) return 'unknown';
  if (/^\d+$/.test(normalized)) return values[Number(normalized)] ?? 'unknown';
  return values.includes(normalized) ? normalized : 'unknown';
}

/**
 * HaveAPI normally serializes these enum values as their string choices. Older
 * responses and fixtures can still contain the ActiveRecord enum index, so
 * resolve both shapes without ever exposing the internal number in the UI.
 */
export function nodePoolRoleValue(value: unknown): string {
  return apiEnumValue(value, POOL_ROLE_VALUES);
}

export function nodePoolStateValue(value: unknown): string {
  return apiEnumValue(value, POOL_STATE_VALUES);
}

export function nodePoolScanValue(value: unknown): string {
  return apiEnumValue(value, POOL_SCAN_VALUES);
}

export function parseNodeDetailSection(value: string | null | undefined): NodeDetailSection {
  if (value === 'storage' || value === 'maintenance') return value;
  return 'overview';
}

export function nodePoolTitle(pool: NodePool): string {
  return nonEmptyString(pool.label) ?? nonEmptyString(pool.name) ?? nonEmptyString(pool.filesystem) ?? `#${pool.id}`;
}

export function nodePoolCapacity(pool: NodePool): {
  total?: number;
  used?: number;
  available?: number;
} {
  const total = finiteNumber(pool.total_space);
  const used = finiteNumber(pool.used_space);
  const available = finiteNumber(pool.available_space);

  return {
    total,
    used: used ?? (total !== undefined && available !== undefined ? Math.max(0, total - available) : undefined),
    available,
  };
}

export function summarizeNodePools(pools: NodePool[]): NodeStorageSummary {
  let total = 0;
  let used = 0;
  let available = 0;
  let hasTotal = false;
  let hasUsed = false;
  let hasAvailable = false;
  let measuredPools = 0;

  for (const pool of pools) {
    const capacity = nodePoolCapacity(pool);
    if (capacity.total !== undefined && capacity.used !== undefined && capacity.available !== undefined) measuredPools += 1;
    if (capacity.total !== undefined) {
      total += capacity.total;
      hasTotal = true;
    }
    if (capacity.used !== undefined) {
      used += capacity.used;
      hasUsed = true;
    }
    if (capacity.available !== undefined) {
      available += capacity.available;
      hasAvailable = true;
    }
  }

  return {
    total: hasTotal ? total : undefined,
    used: hasUsed ? used : undefined,
    available: hasAvailable ? available : undefined,
    measuredPools,
  };
}

function extractDevice(value: unknown, fallbackKey: string): NodeStorageDevice | null {
  if (typeof value === 'string' && value.trim()) {
    return { key: `${fallbackKey}:${value}`, name: value.trim() };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const row = value as Record<string, unknown>;
  const name =
    nonEmptyString(row['name']) ??
    nonEmptyString(row['path']) ??
    nonEmptyString(row['device']) ??
    nonEmptyString(row['dev']) ??
    nonEmptyString(row['id']);
  if (!name) return null;

  return {
    key: `${fallbackKey}:${name}`,
    name,
    state: nonEmptyString(row['state']) ?? nonEmptyString(row['status']) ?? nonEmptyString(row['health']),
  };
}

function collectDevices(value: unknown, key: string, out: NodeStorageDevice[], depth: number): void {
  if (depth > 3 || value == null) return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectDevices(entry, `${key}.${index}`, out, depth + 1));
    return;
  }

  const device = extractDevice(value, key);
  if (device) out.push(device);

  if (typeof value !== 'object') return;
  const row = value as Record<string, unknown>;
  for (const childKey of ['children', 'disks', 'devices', 'vdevs']) {
    if (childKey in row) collectDevices(row[childKey], `${key}.${childKey}`, out, depth + 1);
  }
}

export function extractNodePoolDevices(pool: NodePool): NodeStorageDevice[] {
  const out: NodeStorageDevice[] = [];
  for (const key of ['disks', 'devices', 'vdevs'] as const) {
    if (key in pool) collectDevices(pool[key], key, out, 0);
  }

  const seen = new Set<string>();
  return out.filter((device) => {
    const identity = `${device.name}\u0000${device.state ?? ''}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function nodeAggregatePool(node: Node): NodePool {
  return {
    id: node.id,
    label: node.domain_name ?? node.name ?? node.fqdn ?? `#${node.id}`,
    state: node.pool_state,
    scan: node.pool_scan,
    scan_percent: node.pool_scan_percent,
    checked_at: node.pool_checked_at,
  };
}
