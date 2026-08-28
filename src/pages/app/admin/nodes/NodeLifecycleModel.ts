import type {
  Node,
  NodeCreateCapacityRequirements,
  NodeCreateInput,
  NodeUpdateNullability,
  NodeUpdateInput,
} from '../../../../lib/api/nodes';

export type NodeRole = NodeCreateInput['type'];

export interface NodeCreateDraft {
  name: string;
  role: NodeRole;
  locationId: string;
  ipAddress: string;
  maxTx: string;
  maxRx: string;
  maxVps: string;
  cpus: string;
  totalMemory: string;
  totalSwap: string;
  maintenance: boolean;
}

export interface NodeEditDraft {
  active: boolean;
  name: string;
  ipAddress: string;
  maxTx: string;
  maxRx: string;
  maxVps: string;
}

export interface NodeReviewChange {
  key: string;
  before?: string;
  after: string;
}

export const NODE_ROLES: readonly NodeRole[] = ['node', 'storage', 'mailer', 'dns_server'];

export function emptyNodeCreateDraft(): NodeCreateDraft {
  return {
    name: '',
    role: 'node',
    locationId: '',
    ipAddress: '',
    maxTx: '',
    maxRx: '',
    maxVps: '',
    cpus: '',
    totalMemory: '',
    totalSwap: '',
    maintenance: true,
  };
}

export function nodeEditDraft(node: Node): NodeEditDraft {
  return {
    active: node.active !== false,
    name: String(node.name ?? ''),
    ipAddress: String(node.ip_addr ?? ''),
    maxTx: numberText(node.max_tx),
    maxRx: numberText(node.max_rx),
    maxVps: numberText(node.max_vps),
  };
}

function numberText(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function requiredInteger(value: string, field: string, min = 0): number {
  const trimmed = value.trim();
  const n = Number(trimmed);
  if (!trimmed || !Number.isInteger(n) || n < min) throw new Error(field);
  return n;
}

function optionalInteger(value: string, field: string, min = 0): number | undefined {
  if (!value.trim()) return undefined;
  return requiredInteger(value, field, min);
}

export function validateIpv4(value: string): boolean {
  const parts = value.trim().split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

export function buildNodeCreateInput(
  draft: NodeCreateDraft,
  capacityRequired: NodeCreateCapacityRequirements = {
    cpus: false,
    total_memory: false,
    total_swap: false,
  }
): NodeCreateInput {
  const name = draft.name.trim();
  if (!name || !/^[a-zA-Z0-9._-]+$/.test(name)) throw new Error('name');
  if (!validateIpv4(draft.ipAddress)) throw new Error('ip_addr');

  const payload: NodeCreateInput = {
    name,
    type: draft.role,
    location: requiredInteger(draft.locationId, 'location', 1),
    ip_addr: draft.ipAddress.trim(),
    maintenance: draft.maintenance,
  };

  const cpus = capacityRequired.cpus
    ? requiredInteger(draft.cpus, 'cpus', 1)
    : optionalInteger(draft.cpus, 'cpus', 1);
  const totalMemory = capacityRequired.total_memory
    ? requiredInteger(draft.totalMemory, 'total_memory', 1)
    : optionalInteger(draft.totalMemory, 'total_memory', 1);
  const totalSwap = capacityRequired.total_swap
    ? requiredInteger(draft.totalSwap, 'total_swap', 0)
    : optionalInteger(draft.totalSwap, 'total_swap', 0);
  if (cpus !== undefined) payload.cpus = cpus;
  if (totalMemory !== undefined) payload.total_memory = totalMemory;
  if (totalSwap !== undefined) payload.total_swap = totalSwap;

  if (draft.role === 'node' || draft.role === 'storage') payload.hypervisor_type = 'vpsadminos';
  const maxTx = optionalInteger(draft.maxTx, 'max_tx', 0);
  const maxRx = optionalInteger(draft.maxRx, 'max_rx', 0);
  if (maxTx !== undefined) payload.max_tx = maxTx;
  if (maxRx !== undefined) payload.max_rx = maxRx;
  if (draft.role === 'node') payload.max_vps = requiredInteger(draft.maxVps, 'max_vps', 0);

  return payload;
}

export function buildNodeUpdateInput(
  node: Node,
  draft: NodeEditDraft,
  nullable: NodeUpdateNullability = { max_tx: false, max_rx: false, max_vps: false }
): NodeUpdateInput {
  const name = draft.name.trim();
  if (!name || !/^[a-zA-Z0-9._-]+$/.test(name)) throw new Error('name');
  if (!validateIpv4(draft.ipAddress)) throw new Error('ip_addr');

  const candidate: NodeUpdateInput = {
    active: draft.active,
    name,
    ip_addr: draft.ipAddress.trim(),
    max_tx: updateOptionalInteger(draft.maxTx, node.max_tx, 'max_tx', 0, nullable.max_tx),
    max_rx: updateOptionalInteger(draft.maxRx, node.max_rx, 'max_rx', 0, nullable.max_rx),
    max_vps: updateOptionalInteger(draft.maxVps, node.max_vps, 'max_vps', 0, nullable.max_vps),
  };

  const out: NodeUpdateInput = {};
  for (const [key, value] of Object.entries(candidate)) {
    const before = node[key];
    if (value !== before && !(value === undefined && before == null)) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

function updateOptionalInteger(
  value: string,
  before: unknown,
  field: string,
  min: number,
  nullable: boolean
): number | null | undefined {
  if (value.trim()) return requiredInteger(value, field, min);
  if (before === undefined || before === null) return undefined;
  if (nullable) return null;
  throw new Error(field);
}

function displayValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

export function createReviewChanges(payload: NodeCreateInput, locationLabel: string): NodeReviewChange[] {
  const values: Record<string, unknown> = { ...payload, location: locationLabel };
  return Object.entries(values).map(([key, value]) => ({ key, after: displayValue(value) }));
}

export function updateReviewChanges(node: Node, payload: NodeUpdateInput): NodeReviewChange[] {
  return Object.entries(payload).map(([key, value]) => ({
    key,
    before: displayValue(node[key]),
    after: displayValue(value),
  }));
}

export function hasNodeUpdateChanges(payload: NodeUpdateInput): boolean {
  return Object.keys(payload).length > 0;
}
