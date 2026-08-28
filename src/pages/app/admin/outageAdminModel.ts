import type { Outage, OutageEntity, OutageHandler } from '../../../lib/api/public';
import { outageHandlerUserId, type OutageSystemsPayload } from '../../../lib/api/outages';

export type OutageScopeKind = 'Cluster' | 'Environment' | 'Location' | 'Node' | 'vpsAdmin' | 'Custom';

export interface OutageScopeSelection {
  kind: OutageScopeKind;
  id: number | null;
  label: string;
  /** API entity name for custom entries, otherwise derived from kind. */
  apiName?: string;
}

export interface OutageHandlerSelection {
  id: number;
  label: string;
}

export interface OutageSystemsFormState {
  scope: OutageScopeSelection[];
  handlers: OutageHandlerSelection[];
}

export type OutageListGroup = 'active' | 'planned' | 'finished';

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Convert an API timestamp to the wall-clock format required by
 * `datetime-local`. Using UTC fields here would silently shift edited outages
 * by the browser's timezone offset.
 */
export function toOutageDateTimeInput(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value.slice(0, 16);

  return [
    `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`,
    `${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`,
  ].join('T');
}

export function fromOutageDateTimeInput(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date.toISOString() : normalized;
}

function scopeKey(item: OutageScopeSelection): string {
  return `${item.kind}:${item.apiName ?? ''}:${item.id ?? ''}`;
}

export function addScopeSelection(
  items: OutageScopeSelection[],
  item: OutageScopeSelection
): OutageScopeSelection[] {
  if (items.some((candidate) => scopeKey(candidate) === scopeKey(item))) return items;
  return [...items, item];
}

export function addHandlerSelection(
  items: OutageHandlerSelection[],
  item: OutageHandlerSelection
): OutageHandlerSelection[] {
  if (items.some((candidate) => candidate.id === item.id)) return items;
  return [...items, item];
}

export function outageEntityName(item: OutageScopeSelection): string {
  return item.kind === 'Custom' ? (item.apiName ?? item.label) : item.kind;
}

export function desiredOutageSystems(form: OutageSystemsFormState): OutageSystemsPayload {
  return {
    entities: form.scope.map((item) => item.id === null
      ? { name: outageEntityName(item) }
      : { name: outageEntityName(item), entity_id: item.id }),
    handlers: form.handlers.map((handler) => handler.id),
  };
}

function entityKind(entity: OutageEntity): OutageScopeKind {
  if (['Cluster', 'Environment', 'Location', 'Node', 'vpsAdmin'].includes(entity.name)) {
    return entity.name as OutageScopeKind;
  }
  return 'Custom';
}

export function initOutageSystemsForm(
  entities: OutageEntity[],
  handlers: OutageHandler[]
): OutageSystemsFormState {
  return {
    scope: entities.map((entity) => ({
      kind: entityKind(entity),
      id: typeof entity.entity_id === 'number' ? entity.entity_id : null,
      label: entity.label || `${entity.name}${entity.entity_id ? ` #${entity.entity_id}` : ''}`,
      apiName: entityKind(entity) === 'Custom' ? entity.name : undefined,
    })),
    handlers: handlers.flatMap((handler) => {
      const id = outageHandlerUserId(handler);
      if (id === null) return [];
      return [{
        id,
        label: handler.full_name || handler.reporter_name || `#${id}`,
      }];
    }),
  };
}

export function classifyOutage(outage: Outage, now = new Date()): OutageListGroup {
  if (outage.state === 'resolved' || outage.state === 'cancelled') return 'finished';
  if (outage.state === 'staged') return 'planned';

  const beginsAt = typeof outage.begins_at === 'string' ? new Date(outage.begins_at) : null;
  if (beginsAt && Number.isFinite(beginsAt.getTime()) && beginsAt.getTime() > now.getTime()) {
    return 'planned';
  }

  return 'active';
}

export function groupOutages(rows: Outage[], now = new Date()): Record<OutageListGroup, Outage[]> {
  const grouped: Record<OutageListGroup, Outage[]> = { active: [], planned: [], finished: [] };
  for (const outage of rows) grouped[classifyOutage(outage, now)].push(outage);
  return grouped;
}
