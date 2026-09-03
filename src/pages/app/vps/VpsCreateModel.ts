import type { CreateVpsPayload } from '../../../lib/api/vps';
import type { Location } from '../../../lib/api/infra';
import type { Node } from '../../../lib/api/nodes';
import type { OsFamily, OsTemplate } from '../../../lib/api/osTemplates';

export type FormState = {
  locationId: string;
  nodeId: string;
  osTemplateId: string;
  userId: string;
  hostname: string;
  cpu: string;
  memory: string;
  diskspace: string;
  swap: string;
  ipv4: string;
  ipv6: string;
  ipv4Private: string;
  start: boolean;
  info: string;
};

export type HiddenAdminTarget = { userId?: number; nodeId?: number };

export type ResourcePresetId = 'compact' | 'balanced' | 'performance';

export type ResourcePreset = {
  id: ResourcePresetId;
  cpu: string;
  memory: string;
  diskspace: string;
  swap: string;
};

const HOSTNAME_RE = /^[a-zA-Z0-9][a-zA-Z\-_.0-9]*[a-zA-Z0-9]$/;

export const RESOURCE_PRESETS: ResourcePreset[] = [
  { id: 'compact', cpu: '2', memory: '2048', diskspace: '20480', swap: '0' },
  { id: 'balanced', cpu: '8', memory: '4096', diskspace: '122880', swap: '0' },
  { id: 'performance', cpu: '16', memory: '16384', diskspace: '245760', swap: '4096' },
];

export function defaultForm(): FormState {
  return {
    locationId: '',
    nodeId: '',
    osTemplateId: '',
    userId: '',
    hostname: '',
    cpu: '8',
    memory: '4096',
    diskspace: '122880',
    swap: '0',
    ipv4: '1',
    ipv6: '1',
    ipv4Private: '0',
    start: true,
    info: '',
  };
}

export function toPositiveInt(raw: string): number | undefined {
  const n = Number(String(raw).trim());
  if (!Number.isInteger(n) || n <= 0) return undefined;
  return n;
}

export function toNonNegativeInt(raw: string): number | undefined {
  const n = Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 0) return undefined;
  return n;
}

export function optionalResource(raw: string): number | undefined {
  const trimmed = String(raw).trim();
  if (!trimmed) return undefined;
  return toPositiveInt(trimmed);
}

export function labelOf(x: { id: number; label?: string; name?: string; domain?: string; fqdn?: string }): string {
  const main = x.label || x.name || x.fqdn || x.domain || `#${x.id}`;
  return `${main} (#${x.id})`;
}

export function templateLabel(t: OsTemplate): string {
  const bits = [t.label || t.name || `#${t.id}`, t.distribution, t.version, t.arch].filter(Boolean);
  return `${bits.join(' · ')} (#${t.id})`;
}

export function nodeLabel(n: Node): string {
  const loc = n.location?.label || n.location?.domain;
  return `${n.name || n.fqdn || `#${n.id}`}${loc ? ` · ${loc}` : ''} (#${n.id})`;
}

export function osFamilyLabel(family: OsTemplate['os_family'], fallback: string): string {
  const full = family as OsFamily | undefined;
  return full?.label || full?.description || (full?.id ? `#${full.id}` : fallback);
}

export function groupOsTemplatesByFamily(templates: OsTemplate[], fallback: string) {
  const groups = new Map<string, OsTemplate[]>();
  for (const template of templates) {
    const family = osFamilyLabel(template.os_family, fallback);
    groups.set(family, [...(groups.get(family) ?? []), template]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function locationEnvironmentId(loc: Location | undefined): number | undefined {
  const nested = loc?.environment?.id;
  if (typeof nested === 'number') return nested;

  const raw = (loc as (Location & { environment_id?: unknown }) | undefined)?.environment_id;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }

  return undefined;
}

export function isVpsHypervisorNode(node: Node): boolean {
  const typeOk = node.type === undefined || node.type === 'node';
  const hypervisorOk = node.hypervisor_type === undefined || node.hypervisor_type === 'vpsadminos';
  return typeOk && hypervisorOk;
}

export function matchingResourcePreset(form: FormState): ResourcePresetId | undefined {
  return RESOURCE_PRESETS.find(
    (preset) =>
      preset.cpu === form.cpu.trim() &&
      preset.memory === form.memory.trim() &&
      preset.diskspace === form.diskspace.trim() &&
      preset.swap === form.swap.trim()
  )?.id;
}

export function formatMib(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  if (n === 0) return '0 MiB';
  if (n % 1024 === 0) return `${n / 1024} GiB`;
  if (n > 1024) return `${(n / 1024).toFixed(1)} GiB`;
  return `${n} MiB`;
}

export function validateForm(
  form: FormState,
  isAdmin: boolean,
  hiddenAdminTarget?: HiddenAdminTarget
): string[] {
  const errors: string[] = [];
  const hostname = form.hostname.trim();
  if (!hostname) errors.push('vps.create.validation.hostname_required');
  else if (hostname.length < 2 || hostname.length > 64 || !HOSTNAME_RE.test(hostname)) errors.push('vps.create.validation.hostname_format');
  if (!optionalResource(form.osTemplateId)) errors.push('vps.create.validation.os_template_required');
  if (!optionalResource(form.locationId)) errors.push('vps.create.validation.target_required');
  if (isAdmin) {
    if (!form.userId.trim()) errors.push('vps.create.validation.user_required');
    else if (!optionalResource(form.userId)) errors.push('vps.create.validation.user_invalid');
    if (!optionalResource(form.nodeId)) errors.push('vps.create.validation.node_required');
  } else if (hiddenAdminTarget) {
    if (!hiddenAdminTarget.userId) errors.push('vps.create.validation.user_required');
    if (!hiddenAdminTarget.nodeId) errors.push('vps.create.validation.auto_node_required');
  }

  const numeric: Array<[keyof FormState, number, number, string]> = [
    ['cpu', 1, 32, 'vps.create.validation.cpu'],
    ['memory', 1024, 131072, 'vps.create.validation.memory'],
    ['diskspace', 1024, 10485760, 'vps.create.validation.diskspace'],
    ['swap', 0, 12288, 'vps.create.validation.swap'],
    ['ipv4', 0, 64, 'vps.create.validation.ipv4'],
    ['ipv6', 0, 64, 'vps.create.validation.ipv6'],
    ['ipv4Private', 0, 64, 'vps.create.validation.ipv4_private'],
  ];

  for (const [key, min, max, msg] of numeric) {
    const n = Number(form[key]);
    if (!Number.isInteger(n) || n < min || n > max) errors.push(msg);
  }

  return errors;
}

export function buildVpsCreatePayload(
  form: FormState,
  opts: {
    isAdminMode: boolean;
    needsAdminPayload: boolean;
    hiddenAdminTarget?: HiddenAdminTarget;
  }
): CreateVpsPayload {
  const commonPayload = {
    hostname: form.hostname.trim(),
    os_template: optionalResource(form.osTemplateId),
    start: form.start,
    cpu: toPositiveInt(form.cpu),
    memory: toPositiveInt(form.memory),
    diskspace: toPositiveInt(form.diskspace),
    swap: toNonNegativeInt(form.swap),
    ipv4: toNonNegativeInt(form.ipv4),
    ipv6: toNonNegativeInt(form.ipv6),
    ipv4_private: toNonNegativeInt(form.ipv4Private),
  };

  if (opts.needsAdminPayload) {
    return {
      ...commonPayload,
      mode: 'admin',
      node: (opts.isAdminMode ? optionalResource(form.nodeId) : opts.hiddenAdminTarget?.nodeId) as number,
      user: (opts.isAdminMode ? optionalResource(form.userId) : opts.hiddenAdminTarget?.userId) as number,
      info: opts.isAdminMode ? form.info : '',
    };
  }

  return {
    ...commonPayload,
    mode: 'user',
    location: optionalResource(form.locationId),
  };
}
