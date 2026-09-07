import { expectArray, HaveApiError, haveApiCall } from './haveapi';
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
  max_tx?: number;
  max_rx?: number;
  max_vps?: number;

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
  maintenance_lock?: 'no' | 'lock' | 'master_lock' | string;
  maintenance_lock_reason?: string | null;
  [k: string]: unknown;
}

export interface NodeCreateInput {
  name: string;
  type: 'node' | 'storage' | 'mailer' | 'dns_server';
  location: number;
  ip_addr: string;
  hypervisor_type?: 'vpsadminos';
  max_tx?: number;
  max_rx?: number;
  max_vps?: number;
  cpus?: number;
  total_memory?: number;
  total_swap?: number;
  maintenance?: boolean;
}

export interface NodeUpdateInput {
  active?: boolean;
  name?: string;
  fqdn?: string;
  hypervisor_type?: 'vpsadminos';
  ip_addr?: string;
  max_tx?: number | null;
  max_rx?: number | null;
  max_vps?: number | null;
}

export type NodeCreateCapacityField = 'cpus' | 'total_memory' | 'total_swap';

export interface NodeWriteParameterDescription {
  required?: boolean;
  nullable?: boolean;
  [k: string]: unknown;
}

export interface NodeWriteCapabilityDescription {
  input?: {
    parameters?: Record<string, NodeWriteParameterDescription | unknown>;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export interface NodeCreateCapacityRequirements {
  cpus: boolean;
  total_memory: boolean;
  total_swap: boolean;
}

export type NodeNullableUpdateField = 'max_tx' | 'max_rx' | 'max_vps';
export type NodeUpdateNullability = Record<NodeNullableUpdateField, boolean>;

const NODE_CREATE_CAPACITY_FIELDS: readonly NodeCreateCapacityField[] = [
  'cpus',
  'total_memory',
  'total_swap',
];

/** Read requiredness from the effective OPTIONS contract of the deployed API. */
export function nodeCreateCapacityRequirements(
  capability: NodeWriteCapabilityDescription | undefined
): NodeCreateCapacityRequirements {
  const parameters = capability?.input?.parameters;
  const result: NodeCreateCapacityRequirements = {
    cpus: false,
    total_memory: false,
    total_swap: false,
  };

  for (const field of NODE_CREATE_CAPACITY_FIELDS) {
    const descriptor = parameters?.[field];
    result[field] = Boolean(
      descriptor
      && typeof descriptor === 'object'
      && (descriptor as NodeWriteParameterDescription).required === true
    );
  }
  return result;
}

/**
 * HaveAPI only accepts `null` for parameters explicitly marked nullable in the
 * effective update contract. The deployed 4.1 and current 4.2 node contracts
 * do not mark any of these limits nullable, but reading OPTIONS keeps a future
 * nullable contract honest without pretending that an omitted field was
 * cleared.
 */
export function nodeUpdateNullability(
  capability: NodeWriteCapabilityDescription | undefined
): NodeUpdateNullability {
  const parameters = capability?.input?.parameters;
  return {
    max_tx: parameterIsNullable(parameters?.['max_tx']),
    max_rx: parameterIsNullable(parameters?.['max_rx']),
    max_vps: parameterIsNullable(parameters?.['max_vps']),
  };
}

function parameterIsNullable(value: unknown): boolean {
  return Boolean(
    value
    && typeof value === 'object'
    && (value as NodeWriteParameterDescription).nullable === true
  );
}

/**
 * Node creation is not idempotent. A lost response or HTTP 5xx can therefore
 * mean that the node was already registered. Callers must refresh and verify
 * the node list before another POST is enabled.
 */
export class NodeCreateIndeterminateError extends Error {
  readonly originalError: unknown;

  constructor(originalError: unknown) {
    super('The node create result is unknown; refresh and verify the node list before retrying.');
    this.name = 'NodeCreateIndeterminateError';
    this.originalError = originalError;
  }
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

/**
 * HaveAPI exposes per-action authorization and the effective input contract
 * through OPTIONS. Keep write controls fail-closed when this probe is denied
 * or unavailable instead of showing a form that cannot be submitted.
 */
export async function fetchNodeCreateCapability() {
  return haveApiCall<NodeWriteCapabilityDescription>({
    method: 'OPTIONS',
    path: '/nodes?method=POST',
  });
}

export async function fetchNodeUpdateCapability(nodeId: number) {
  return haveApiCall<NodeWriteCapabilityDescription>({
    method: 'OPTIONS',
    path: `/nodes/${nodeId}?method=PUT`,
  });
}

export async function createNode(payload: NodeCreateInput) {
  try {
    return await haveApiCall<Node>({
      method: 'POST',
      path: '/nodes',
      namespace: 'node',
      params: { ...payload },
    });
  } catch (error) {
    const isDefinitiveApiRejection = error instanceof HaveApiError
      && (error.httpStatus === undefined || error.httpStatus < 500);
    if (isDefinitiveApiRejection) throw error;
    throw new NodeCreateIndeterminateError(error);
  }
}

export async function updateNode(nodeId: number, payload: NodeUpdateInput) {
  return haveApiCall<void>({
    method: 'PUT',
    path: `/nodes/${nodeId}`,
    namespace: 'node',
    params: { ...payload },
  });
}

export async function fetchNodePools(nodeId: number, opts?: { limit?: number; signal?: AbortSignal }) {
  const params: Record<string, number> = { node: nodeId };
  if (opts?.limit !== undefined) params['limit'] = opts.limit;

  const res = await haveApiCall<unknown>({
    method: 'GET',
    path: '/pools',
    namespace: 'pool',
    params,
    signal: opts?.signal,
  });

  const raw = res.data as unknown;
  let list: unknown = raw;
  if (!Array.isArray(raw) && raw && typeof raw === 'object') {
    const maybePools = (raw as { pools?: unknown }).pools;
    if (Array.isArray(maybePools)) list = maybePools;
  }

  return { ...res, data: expectArray<NodePool>(list, `nodes/${nodeId}/pools`) };
}

export async function fetchPool(poolId: number, opts?: { signal?: AbortSignal }) {
  const res = await haveApiCall<unknown>({
    method: 'GET',
    path: `/pools/${poolId}`,
    signal: opts?.signal,
  });
  const raw = res.data;

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError(`pools/${poolId}: expected object`);
  }

  const pool = raw as NodePool;
  if (!Number.isSafeInteger(pool.id) || pool.id !== poolId) {
    throw new TypeError(`pools/${poolId}: response id does not match requested pool`);
  }

  return { ...res, data: pool };
}

export async function setPoolMaintenance(poolId: number, opts: { lock: boolean; reason?: string }) {
  return haveApiCall<void>({
    method: 'POST',
    path: `/pools/${poolId}/set_maintenance`,
    namespace: 'pool',
    params: { lock: opts.lock, reason: opts.reason },
  });
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
