import type { IncidentReport } from '../../../lib/api/incidents';
import type { Mailbox } from '../../../lib/api/mailer';

export function safeNumber(value: string): number | undefined {
  const t = value.trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  const i = Math.floor(n);
  if (i <= 0) return undefined;
  return i;
}

type SmartKey = 'id' | 'q' | 'vps' | 'user' | 'filed_by' | 'ip' | 'assignment' | 'codename' | 'mailbox';

export function canonicalKey(raw: string): SmartKey | null {
  const k = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!k) return null;

  if (['id', '#', 'incident', 'report'].includes(k)) return 'id';
  if (['q', 'query', 'search', 'text'].includes(k)) return 'q';
  if (['vps', 'vm', 'host'].includes(k)) return 'vps';
  if (['user', 'owner', 'login'].includes(k)) return 'user';
  if (['filed_by', 'filed', 'reporter'].includes(k)) return 'filed_by';
  if (['ip', 'ip_addr', 'addr'].includes(k)) return 'ip';
  if (['assignment', 'ip_assignment', 'ip_address_assignment', 'assign', 'ipa'].includes(k)) return 'assignment';
  if (['codename', 'code'].includes(k)) return 'codename';
  if (['mailbox', 'mb'].includes(k)) return 'mailbox';
  return null;
}

export function looksLikeIpish(raw: string): boolean {
  const value = raw.trim();
  if (!value) return false;
  if (/^(\d{1,3}\.){1,3}\d{0,3}(\/\d{1,3})?$/.test(value)) return true;
  return /^[0-9a-fA-F:]+(\/\d{1,3})?$/.test(value) && value.includes(':');
}

export function vpsActionVariant(action?: string): 'neutral' | 'warn' | 'danger' {
  if (action === 'stop') return 'danger';
  if (action === 'suspend' || action === 'disable_network') return 'warn';
  return 'neutral';
}

export function vpsActionLabelKey(action?: string): string {
  if (!action || action === 'none') return 'incidents.action.none';
  if (action === 'stop') return 'incidents.action.stop';
  if (action === 'suspend') return 'incidents.action.suspend';
  if (action === 'disable_network') return 'incidents.action.disable_network';
  return 'incidents.action.unknown';
}

export function incidentRowVariant(report: IncidentReport): 'neutral' | 'warn' | 'danger' {
  const action = String(report.vps_action ?? 'none');
  if (action === 'stop') return 'danger';
  if (action !== 'none') return 'warn';
  return 'neutral';
}

export function mailboxLabel(mailbox: Mailbox): string {
  const label = mailbox.label ? String(mailbox.label) : '';
  const user = mailbox.user ? String(mailbox.user) : '';
  const server = mailbox.server ? String(mailbox.server) : '';
  if (label) return label;
  if (user && server) return `${user}@${server}`;
  return `#${mailbox.id}`;
}

export function resolveMailboxId(
  mailboxes: Mailbox[],
  value: string,
): { id: number } | { err: 'none' | 'ambiguous' } {
  const needle = value.trim().toLowerCase();
  if (!needle) return { err: 'none' };

  const idMatch = mailboxes.find((mailbox) => String(mailbox.id) === needle);
  if (idMatch) return { id: Number(idMatch.id) };

  const exact = mailboxes.filter(
    (mailbox) => mailboxLabel(mailbox).trim().toLowerCase() === needle,
  );
  const [onlyExact] = exact;
  if (exact.length === 1 && onlyExact) return { id: Number(onlyExact.id) };
  if (exact.length > 1) return { err: 'ambiguous' };

  const partial = mailboxes.filter((mailbox) => mailboxLabel(mailbox).trim().toLowerCase().includes(needle));
  const [onlyPartial] = partial;
  if (partial.length === 1 && onlyPartial) return { id: Number(onlyPartial.id) };
  if (partial.length > 1) return { err: 'ambiguous' };
  return { err: 'none' };
}
