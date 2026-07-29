import type { Location } from '../../../lib/api/infra';
import type { Node } from '../../../lib/api/nodes';
import type { Vps, VpsBootPayload, VpsMigratePayload, VpsReplacePayload } from '../../../lib/api/vps';
import { parseLookupIdLike } from '../../../lib/lookupInput';
import {
  locationEnvironmentId,
  nodeLocation,
  parseOptionalId,
  parseOptionalNonNegativeInt,
  parseRequiredId,
  pickedNodeLabel,
  resourceId,
} from './VpsLifecycleModel';

export type TemplateForm = {
  osTemplate: string;
  autoUpdate: boolean;
};

export type BootForm = {
  osTemplate: string;
  mountRootDataset: boolean;
  mountpoint: string;
};

export type ReplaceForm = {
  node: string;
  expirationDate: string;
  start: boolean;
  reason: string;
};

export type MigrateScheduleMode = 'now' | 'maintenance' | 'custom';

export type MigrateForm = {
  node: string;
  replaceIpAddresses: boolean;
  transferIpAddresses: boolean;
  scheduleMode: MigrateScheduleMode;
  finishWeekday: string;
  finishHour: string;
  stopOnError: boolean;
  cleanupData: boolean;
  noStart: boolean;
  skipStart: boolean;
  sendMail: boolean;
  reason: string;
  confirm: boolean;
};

export type MigrateTargetContext = {
  targetNode?: Node;
  targetSelected: boolean;
  sourceNodeId: number | null;
  targetNodeId: number | null;
  sourceLocationId: number | null;
  targetLocationId: number | null;
  sourceEnvironmentId?: number;
  targetEnvironmentId?: number;
  canTransferIpAddresses: boolean;
  canReplaceIpAddresses: boolean;
};

export function defaultExpirationInput(now = new Date()): string {
  const d = new Date(now);
  d.setMonth(d.getMonth() + 2);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function defaultTemplateForm(osTemplateId: number | null, autoUpdate: boolean): TemplateForm {
  return {
    osTemplate: osTemplateId ? String(osTemplateId) : '',
    autoUpdate,
  };
}

export function defaultBootForm(osTemplateId: number | null): BootForm {
  return {
    osTemplate: osTemplateId ? String(osTemplateId) : '',
    mountRootDataset: true,
    mountpoint: '/mnt/vps',
  };
}

export function defaultReplaceForm(nodeId: number | null, now = new Date()): ReplaceForm {
  return {
    node: nodeId ? String(nodeId) : '',
    expirationDate: defaultExpirationInput(now),
    start: false,
    reason: '',
  };
}

export function defaultMigrateForm(): MigrateForm {
  return {
    node: '',
    replaceIpAddresses: false,
    transferIpAddresses: true,
    scheduleMode: 'maintenance',
    finishWeekday: '',
    finishHour: '',
    stopOnError: true,
    cleanupData: true,
    noStart: false,
    skipStart: false,
    sendMail: true,
    reason: '',
    confirm: false,
  };
}

export function toIsoDateTime(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const d = new Date(trimmed);
  if (!Number.isFinite(d.getTime())) throw new Error('invalid-date');
  return d.toISOString();
}

export function buildVpsTemplatePayload(form: TemplateForm): Record<string, unknown> {
  return {
    os_template: parseRequiredId(form.osTemplate),
    enable_os_template_auto_update: form.autoUpdate,
  };
}

export function buildVpsBootPayload(form: BootForm): VpsBootPayload {
  const payload: VpsBootPayload = {
    os_template: parseRequiredId(form.osTemplate),
  };

  if (form.mountRootDataset) {
    const mountpoint = form.mountpoint.trim();
    if (!mountpoint || !mountpoint.startsWith('/')) throw new Error('invalid-id');
    payload.mount_root_dataset = mountpoint;
  }

  return payload;
}

export function buildVpsReplacePayload(form: ReplaceForm): VpsReplacePayload {
  return {
    node: parseOptionalId(form.node),
    expiration_date: toIsoDateTime(form.expirationDate),
    start: form.start,
    reason: form.reason.trim() || undefined,
  };
}

export function findMigrateTargetNode(rawNode: string, nodes: Node[]): Node | undefined {
  const nodeId = parseLookupIdLike(rawNode.trim());
  return nodeId !== null ? nodes.find((node) => Number(node.id) === nodeId) : undefined;
}

export function buildMigrateTargetContext(vps: Vps, targetNode?: Node): MigrateTargetContext {
  const sourceLocation = (vps.node?.location ?? vps['location']) as Location | undefined;
  const sourceLocationId = resourceId(sourceLocation);
  const sourceEnvironmentId = locationEnvironmentId(sourceLocation);
  const targetLocation = nodeLocation(targetNode);
  const targetLocationId = resourceId(targetLocation);
  const targetEnvironmentId = locationEnvironmentId(targetLocation);
  const sourceNodeId = resourceId(vps.node);
  const targetNodeId = resourceId(targetNode);

  return {
    targetNode,
    targetSelected: Boolean(targetNode),
    sourceNodeId,
    targetNodeId,
    sourceLocationId,
    targetLocationId,
    sourceEnvironmentId,
    targetEnvironmentId,
    canTransferIpAddresses:
      sourceEnvironmentId !== undefined &&
      targetEnvironmentId !== undefined &&
      sourceEnvironmentId !== targetEnvironmentId,
    canReplaceIpAddresses:
      sourceLocationId !== null &&
      targetLocationId !== null &&
      sourceLocationId !== targetLocationId,
  };
}

export function nextMigrateFormForNodeChange(prev: MigrateForm, nextNodeValue: string, context: MigrateTargetContext): MigrateForm {
  return {
    ...prev,
    node: nextNodeValue,
    transferIpAddresses: context.canTransferIpAddresses ? prev.transferIpAddresses : false,
    replaceIpAddresses: context.canReplaceIpAddresses ? prev.replaceIpAddresses : false,
    scheduleMode: context.canTransferIpAddresses || context.canReplaceIpAddresses ? 'now' : 'maintenance',
    confirm: false,
  };
}

export function isMigrateReady(form: MigrateForm): boolean {
  return Boolean(
    form.confirm &&
    form.node.trim() &&
    (form.scheduleMode !== 'custom' || (form.finishWeekday && form.finishHour))
  );
}

export function buildVpsMigratePayload(form: MigrateForm, context: Pick<MigrateTargetContext, 'canReplaceIpAddresses' | 'canTransferIpAddresses'>): VpsMigratePayload {
  const finishWeekday = form.scheduleMode === 'custom' ? parseOptionalNonNegativeInt(form.finishWeekday) : undefined;
  const finishHour = form.scheduleMode === 'custom' ? parseOptionalNonNegativeInt(form.finishHour) : undefined;
  if (form.scheduleMode === 'custom' && (finishWeekday === undefined || finishHour === undefined || finishHour > 23)) {
    throw new Error('invalid-id');
  }

  const payload: VpsMigratePayload = {
    node: parseRequiredId(form.node),
    replace_ip_addresses: context.canReplaceIpAddresses ? form.replaceIpAddresses : false,
    transfer_ip_addresses: context.canTransferIpAddresses ? form.transferIpAddresses : false,
    maintenance_window: form.scheduleMode === 'maintenance',
    stop_on_error: form.stopOnError,
    cleanup_data: form.cleanupData,
    no_start: form.noStart,
    skip_start: form.skipStart,
    send_mail: form.sendMail,
  };

  if (finishWeekday !== undefined) payload.finish_weekday = finishWeekday;
  if (finishHour !== undefined) payload.finish_minutes = finishHour * 60;

  const reason = form.reason.trim();
  if (reason) payload.reason = reason;

  return payload;
}

export function migrateNodeDisplay(node: Node | undefined, fallback: string): string {
  if (!node) return fallback.trim() || '—';
  return pickedNodeLabel(node) || `#${node.id}`;
}
