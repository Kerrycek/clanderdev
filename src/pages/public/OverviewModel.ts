import type { Outage, PublicClusterStats, PublicNodeStatus } from '../../lib/api/public';
import { compareClusterLocationLabels } from '../../lib/clusterLocations';
import { categorizeOutage, sortOutagesNewestFirst } from '../../lib/outage';
import type { BadgeVariant } from '../../lib/taskStatus';

export type PublicOutagesByCategory = {
  current: Outage[];
  planned: Outage[];
  resolved: Outage[];
  unknown: Outage[];
};

export type PublicNodeLocationGroup = {
  location: string;
  ok: number;
  down: number;
  total: number;
  nodes: PublicNodeStatus[];
};

export type PublicNodeSummary = {
  ok: number;
  down: number;
  total: number;
};

export type PublicIpv4Level = 'ok' | 'warn' | 'critical';

function locationLabel(node: PublicNodeStatus, unknownLabel: string): string {
  const raw = node.location?.label ?? node.location?.id;
  const normalized = String(raw ?? '').trim();
  return normalized || unknownLabel;
}

export function groupPublicNodesByLocation(nodes: readonly PublicNodeStatus[], unknownLabel: string): PublicNodeLocationGroup[] {
  const groups = new Map<string, PublicNodeLocationGroup>();

  for (const node of nodes) {
    const location = locationLabel(node, unknownLabel);
    const group = groups.get(location) ?? { location, ok: 0, down: 0, total: 0, nodes: [] };
    group.total += 1;
    group.nodes.push(node);
    if (node.status) group.ok += 1;
    else group.down += 1;
    groups.set(location, group);
  }

  return Array.from(groups.values()).sort((a, b) => compareClusterLocationLabels(a.location, b.location));
}

export function summarizePublicNodes(groups: readonly PublicNodeLocationGroup[]): PublicNodeSummary {
  return groups.reduce<PublicNodeSummary>(
    (acc, group) => ({
      ok: acc.ok + group.ok,
      down: acc.down + group.down,
      total: acc.total + group.total,
    }),
    { ok: 0, down: 0, total: 0 }
  );
}

export function categorizePublicOutages(outages: readonly Outage[], now = new Date()): PublicOutagesByCategory {
  const output: PublicOutagesByCategory = { current: [], planned: [], resolved: [], unknown: [] };
  const list = outages.slice().sort(sortOutagesNewestFirst);

  for (const outage of list) {
    output[categorizeOutage(outage, now)].push(outage);
  }

  return output;
}

export function resolvePublicIpv4Left(stats?: PublicClusterStats): number | null {
  return typeof stats?.ipv4_left === 'number' ? Number(stats.ipv4_left) : null;
}

export function publicIpv4Level(left: number | null, warnThreshold: number, criticalThreshold: number): PublicIpv4Level {
  if (left == null) return 'ok';
  if (left <= criticalThreshold) return 'critical';
  if (left <= warnThreshold) return 'warn';
  return 'ok';
}

export function publicIpv4BadgeVariant(level: PublicIpv4Level, left: number | null): BadgeVariant {
  if (left == null) return 'neutral';
  if (level === 'critical') return 'danger';
  if (level === 'warn') return 'warn';
  return 'neutral';
}
