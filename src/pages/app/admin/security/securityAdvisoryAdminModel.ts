import type { Node } from '../../../../lib/api/nodes';

export const SECURITY_ADVISORY_STATES = ['draft', 'published', 'retracted'] as const;
export const SECURITY_ADVISORY_NODE_STATES = ['unknown', 'not_affected', 'vulnerable', 'mitigated'] as const;

export type SecurityAdvisoryNodeState = (typeof SECURITY_ADVISORY_NODE_STATES)[number];

/**
 * Advisory metadata is the immutable public record once it has been published.
 * Follow-up information must be added through advisory updates instead.
 */
export function canEditSecurityAdvisory(state: unknown): boolean {
  return state === 'draft';
}

/**
 * Updates belong to the published lifecycle. Drafts must go through the
 * dedicated publish action and retracted advisories are terminal.
 */
export function canPostSecurityAdvisoryUpdate(state: unknown): boolean {
  return state === 'published';
}

/**
 * The API exposes the complete advisory state enum, but an update is only
 * allowed to keep a published advisory published or retract it.
 */
export function securityAdvisoryUpdateStateChange(
  currentState: unknown,
  requestedState: unknown,
): 'retracted' | null {
  return canPostSecurityAdvisoryUpdate(currentState) && requestedState === 'retracted'
    ? 'retracted'
    : null;
}

export interface AdvisoryNodeStatusLike {
  node_id?: number;
  state?: string;
  vulnerable_until?: string | null;
  mitigated_since?: string | null;
}

export type CveParseResult =
  | { valid: true; cves: string[] }
  | { valid: false; cves: string[]; reason: 'empty' | 'invalid'; invalid?: string };

export function parseSecurityAdvisoryCves(value: string): CveParseResult {
  const values = value
    .split(/[\s,;]+/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  const cves = [...new Set(values)];

  if (cves.length === 0) return { valid: false, cves: [], reason: 'empty' };

  const invalid = cves.find((cve) => !/^CVE-\d{4}-\d{4,}$/.test(cve));
  if (invalid) return { valid: false, cves, reason: 'invalid', invalid };

  return { valid: true, cves };
}

export function relevantSecurityAdvisoryNodes(nodes: Node[]): Node[] {
  return nodes
    .filter((node) => node.active !== false && (node.type === 'node' || node.type === 'storage'))
    .sort((a, b) => a.id - b.id);
}

export type PublishReadinessIssue =
  | { type: 'missing_cves' }
  | { type: 'missing_node_status'; nodeId: number; nodeName: string }
  | { type: 'unresolved_node'; nodeId: number; nodeName: string; state: string }
  | { type: 'missing_mitigation_times'; nodeId: number; nodeName: string };

function nodeLabel(node: Node): string {
  return String(node.domain_name ?? node.fqdn ?? node.name ?? `#${node.id}`);
}

/**
 * Publishing is intentionally stricter than the API's minimal validation.
 * An advisory without a CVE or without an explicit assessment of every active
 * compute/storage node is operationally incomplete and must stay a draft.
 */
export function securityAdvisoryPublishIssues(opts: {
  cves: string[];
  nodes: Node[];
  statuses: AdvisoryNodeStatusLike[];
}): PublishReadinessIssue[] {
  const issues: PublishReadinessIssue[] = [];
  if (opts.cves.length === 0) issues.push({ type: 'missing_cves' });

  const statuses = new Map(
    opts.statuses
      .filter((status): status is AdvisoryNodeStatusLike & { node_id: number } => typeof status.node_id === 'number')
      .map((status) => [status.node_id, status]),
  );

  for (const node of relevantSecurityAdvisoryNodes(opts.nodes)) {
    const status = statuses.get(node.id);
    const label = nodeLabel(node);

    if (!status) {
      issues.push({ type: 'missing_node_status', nodeId: node.id, nodeName: label });
      continue;
    }

    const state = String(status.state ?? 'unknown');
    if (state === 'unknown' || state === 'vulnerable') {
      issues.push({ type: 'unresolved_node', nodeId: node.id, nodeName: label, state });
      continue;
    }

    if (state === 'mitigated' && (!status.vulnerable_until || !status.mitigated_since)) {
      issues.push({ type: 'missing_mitigation_times', nodeId: node.id, nodeName: label });
    }
  }

  return issues;
}

export function resourceId(value: unknown, fallback?: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object') {
    const id = (value as Record<string, unknown>)['id'];
    if (typeof id === 'number' && Number.isFinite(id)) return id;
  }
  if (typeof fallback === 'number' && Number.isFinite(fallback)) return fallback;
  return null;
}

export function resourceLabel(value: unknown, fallback = '—'): string {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number') return `#${value}`;
  if (!value || typeof value !== 'object') return fallback;

  const object = value as Record<string, unknown>;
  for (const key of ['label', 'login', 'hostname', 'domain_name', 'name']) {
    const item = object[key];
    if (typeof item === 'string' && item.trim()) return item;
  }

  const id = object['id'];
  return typeof id === 'number' ? `#${id}` : fallback;
}
