import type { TableRowVariant } from '../components/ui/TableRowLink';
import type { BadgeVariant } from './requestsBadges';
import type { ObjectHistoryEvent } from './api/audit';

export function eventVariant(eventType: string | undefined): TableRowVariant | undefined {
  const t = String(eventType ?? '').toLowerCase();
  if (!t) return undefined;

  // Exception tinting: only highlight “important” classes so the table stays scannable.
  if (t.includes('delete') || t.includes('destroy') || t.includes('remove') || t.includes('revoke')) return 'danger';
  if (t.includes('create') || t.includes('add') || t.includes('grant')) return 'ok';
  if (t.includes('deny') || t.includes('fail')) return 'warn';
  return undefined;
}

export function eventBadgeVariant(eventType: string | undefined): BadgeVariant {
  const v = eventVariant(eventType);
  if (v === 'danger') return 'danger';
  if (v === 'ok') return 'ok';
  if (v === 'warn') return 'warn';
  return 'neutral';
}

export function eventDataSummary(ev: ObjectHistoryEvent): string {
  const data = ev.event_data;
  if (!data) return '';
  if (typeof data !== 'object') return String(data);
  const keys = Object.keys(data);
  if (keys.length === 0) return '';
  const head = keys.slice(0, 3).join(', ');
  return keys.length > 3 ? `${head}, …` : head;
}

export function userLabel(ev: ObjectHistoryEvent, na: string): string {
  const user = ev.user as ObjectHistoryEvent['user'] | number | undefined;
  if (!user) return na;
  if (typeof user === 'number') return `#${user}`;
  const login = typeof user.login === 'string' && user.login ? user.login : undefined;
  const id = typeof user.id === 'number' ? user.id : undefined;
  if (login && id) return `${login} (#${id})`;
  if (login) return login;
  if (id) return `#${id}`;
  return na;
}

export function sessionLabel(ev: ObjectHistoryEvent, na: string): string {
  const session = ev.user_session as ObjectHistoryEvent['user_session'] | number | undefined;
  if (!session) return na;
  if (typeof session === 'number') return `#${session}`;
  const ip = typeof session.api_ip_addr === 'string' && session.api_ip_addr ? session.api_ip_addr : undefined;
  const id = typeof session.id === 'number' ? session.id : undefined;
  if (ip && id) return `${ip} (#${id})`;
  if (ip) return ip;
  if (id) return `#${id}`;
  return na;
}

export function trackedObjectLabel(ev: ObjectHistoryEvent, na: string): string {
  const obj = typeof ev.object === 'string' ? ev.object.trim() : '';
  const id = typeof ev.object_id === 'number' ? ev.object_id : undefined;
  if (obj && id) return `${obj} #${id}`;
  if (obj) return obj;
  if (id) return `#${id}`;
  return na;
}
