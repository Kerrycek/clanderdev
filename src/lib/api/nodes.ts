import { expectArray, haveApiCall } from './haveapi';
import type { Location } from './appTypes';

export interface Node {
  id: number;
  active?: boolean;
  name?: string;
  domain_name?: string;
  fqdn?: string;
  type?: string;
  hypervisor_type?: string;
  location?: Location;
  ip_addr?: string;

  // Live metrics (availability depends on the API action)
  status?: boolean;
  uptime?: number;
  loadavg1?: number;
  loadavg5?: number;
  loadavg15?: number;
  process_count?: number;

  cpus?: number;

  cpu_user?: number;
  cpu_nice?: number;
  cpu_system?: number;
  cpu_idle?: number;
  cpu_iowait?: number;
  cpu_irq?: number;
  cpu_softirq?: number;
  cpu_guest?: number;

  total_memory?: number;
  used_memory?: number;
  total_swap?: number;
  used_swap?: number;

  arc_c_max?: number;
  arc_c?: number;
  arc_size?: number;
  arc_hitpercent?: number;

  version?: string;
  kernel?: string;
  cgroup_version?: string;

  pool_state?: string;
  pool_scan?: string;
  pool_scan_percent?: number;
  pool_checked_at?: string;
  pool_status?: boolean;

  maintenance_lock?: string;
  maintenance_lock_reason?: string;

  [k: string]: unknown;
}

export interface NodeStatus {
  id: number;
  uptime?: number;
  loadavg1?: number;
  loadavg5?: number;
  loadavg15?: number;
  process_count?: number;
  cpus?: number;

  cpu_user?: number;
  cpu_nice?: number;
  cpu_system?: number;
  cpu_idle?: number;
  cpu_iowait?: number;
  cpu_irq?: number;
  cpu_softirq?: number;
  cpu_guest?: number;

  total_memory?: number;
  used_memory?: number;
  total_swap?: number;
  used_swap?: number;

  arc_c_max?: number;
  arc_c?: number;
  arc_size?: number;
  arc_hitpercent?: number;

  version?: string;
  kernel?: string;

  created_at?: string;

  [k: string]: unknown;
}

export interface NodeEvacuateResult {
  migration_plan_id?: number;
  [k: string]: unknown;
}

export interface NodePool {
  id: number;
  node?: { id?: number; name?: string; domain_name?: string } | number;
  label?: string;
  name?: string;
  filesystem?: string;
  role?: string | number;
  state?: string | number;
  scan?: string | number;
  scan_percent?: number;
  // Current upstream returns allocation metrics to admins, but omits them from
  // limited-role output and older deployments may not have them. A device
  // inventory is not part of the upstream Pool contract at all. Keep these
  // fields optional so missing data is never mistaken for zero capacity.
  total_space?: number;
  used_space?: number;
  available_space?: number;
  checked_at?: string;
  [k: string]: unknown;
}

// Nodes (admin)

export async function fetchNodes(
  opts: {
    limit?: number;
    fromId?: number;
    q?: string;
    state?: 'all' | 'active' | 'inactive';
    location?: number;
    type?: string;
    hypervisorType?: string;
    includes?: string;
  } = {}
) {
  const params: Record<string, string | number | boolean> = {};
  if (opts.limit !== undefined) params['limit'] = opts.limit;
  if (opts.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts.q) params['q'] = opts.q;
  if (opts.state) params['state'] = opts.state;
  if (opts.location !== undefined) params['location'] = opts.location;
  if (opts.type) params['type'] = opts.type;
  if (opts.hypervisorType) params['hypervisor_type'] = opts.hypervisorType;

  const res = await haveApiCall<unknown>({
    method: 'GET',
    path: '/nodes',
    namespace: 'node',
    params,
    meta: opts.includes ? { includes: opts.includes } : undefined,
  });

  // Be tolerant: some deployments wrap the list under a `nodes` key.
  const raw = res.data as unknown;
  let list: unknown = raw;
  if (!Array.isArray(raw) && raw && typeof raw === 'object') {
    const maybeNodes = (raw as { nodes?: unknown }).nodes;
    if (Array.isArray(maybeNodes)) list = maybeNodes;
  }

  return { ...res, data: expectArray<Node>(list, 'nodes') };
}

export async function fetchNode(nodeId: number) {
  return haveApiCall<Node>({
    method: 'GET',
    path: `/nodes/${nodeId}`,
  });
}

export async function fetchNodePools(nodeId: number, opts?: { limit?: number }) {
  const params: Record<string, number> = { node: nodeId };
  if (opts?.limit !== undefined) params['limit'] = opts.limit;

  const res = await haveApiCall<unknown>({
    method: 'GET',
    path: '/pools',
    namespace: 'pool',
    params,
  });

  const raw = res.data as unknown;
  let list: unknown = raw;
  if (!Array.isArray(raw) && raw && typeof raw === 'object') {
    const maybePools = (raw as { pools?: unknown }).pools;
    if (Array.isArray(maybePools)) list = maybePools;
  }

  return { ...res, data: expectArray<NodePool>(list, `nodes/${nodeId}/pools`) };
}

export async function setNodeMaintenance(nodeId: number, opts: { lock: boolean; reason?: string }) {
  return haveApiCall<void>({
    method: 'POST',
    path: `/nodes/${nodeId}/set_maintenance`,
    namespace: 'node',
    params: { lock: opts.lock, reason: opts.reason },
  });
}

export async function evacuateNode(
  nodeId: number,
  opts: {
    dst_node: number;
    stop_on_error?: boolean;
    maintenance_window?: boolean;
    concurrency?: number;
    cleanup_data?: boolean;
    send_mail?: boolean;
    reason?: string;
  }
) {
  return haveApiCall<NodeEvacuateResult>({
    method: 'POST',
    path: `/nodes/${nodeId}/evacuate`,
    namespace: 'node',
    params: opts,
  });
}

export async function fetchNodeStatuses(
  nodeId: number,
  opts?: { limit?: number; fromId?: number; from?: string; to?: string }
) {
  const params: Record<string, string | number> = {};
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.from) params['from'] = opts.from;
  if (opts?.to) params['to'] = opts.to;

  const res = await haveApiCall<NodeStatus[]>({
    method: 'GET',
    path: `/nodes/${nodeId}/statuses`,
    namespace: 'status',
    params,
  });
  return { ...res, data: expectArray<NodeStatus>(res.data, `nodes/${nodeId}/statuses`) };
}
