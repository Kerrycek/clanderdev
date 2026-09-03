import type {
  MailRecipientCreateRecovery,
  MailRecipientDraft,
} from './MailTemplateRecipientCreateModel';

export type MailRecipientCreateGuardAttempt = MailRecipientDraft;

export interface MailTemplateRecipientGuardState {
  draft: MailRecipientDraft;
  recovery: MailRecipientCreateRecovery;
  existingLinkUncertainRecipientId: number | null;
}

const GLOBAL_CREATE_KEY_PREFIX = 'webui-next.mailer.mail-recipient-create.v2.';
const TEMPLATE_RECIPIENT_KEY_PREFIX = 'webui-next.mailer.mail-template-recipient.v2.';

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function stringField(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.length <= maxLength ? value : null;
}

function normalizeDraft(raw: unknown): MailRecipientDraft | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const label = stringField(value['label'], 100);
  const to = stringField(value['to'], 500);
  const cc = stringField(value['cc'], 500);
  const bcc = stringField(value['bcc'], 500);
  if (label === null || to === null || cc === null || bcc === null) return null;
  return { label, to, cc, bcc };
}

function normalizeRecovery(raw: unknown): MailRecipientCreateRecovery | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (value['phase'] === 'draft' || value['phase'] === 'create_uncertain') {
    return { phase: value['phase'] };
  }
  if (value['phase'] === 'link_retry' || value['phase'] === 'link_uncertain') {
    const recipientId = Number(value['recipientId']);
    if (!Number.isInteger(recipientId) || recipientId <= 0) return null;
    return { phase: value['phase'], recipientId };
  }
  return null;
}

function readJson(key: string): unknown {
  try {
    const raw = storage()?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    const target = storage();
    if (!target) return false;
    target.setItem(key, JSON.stringify(value));
    return target.getItem(key) !== null;
  } catch {
    return false;
  }
}

function remove(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // A failed cleanup leaves the mutation safely locked on the next mount.
  }
}

function scopedKey(prefix: string, scopeKey: string | number): string {
  return `${prefix}${encodeURIComponent(String(scopeKey))}`;
}

export function readMailRecipientCreateGuard(scopeKey: string | number): MailRecipientCreateGuardAttempt | null {
  const raw = readJson(scopedKey(GLOBAL_CREATE_KEY_PREFIX, scopeKey));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return normalizeDraft((raw as Record<string, unknown>)['attempt']);
}

export function persistMailRecipientCreateGuard(
  scopeKey: string | number,
  attempt: MailRecipientCreateGuardAttempt,
): boolean {
  return writeJson(scopedKey(GLOBAL_CREATE_KEY_PREFIX, scopeKey), { attempt });
}

export function clearMailRecipientCreateGuard(scopeKey: string | number): void {
  remove(scopedKey(GLOBAL_CREATE_KEY_PREFIX, scopeKey));
}

function templateKey(scopeKey: string | number, templateId: number): string {
  return `${scopedKey(TEMPLATE_RECIPIENT_KEY_PREFIX, scopeKey)}.${templateId}`;
}

export function readMailTemplateRecipientGuard(
  scopeKey: string | number,
  templateId: number,
): MailTemplateRecipientGuardState | null {
  const raw = readJson(templateKey(scopeKey, templateId));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const draft = normalizeDraft(value['draft']);
  const recovery = normalizeRecovery(value['recovery']);
  const existingRaw = value['existingLinkUncertainRecipientId'];
  const existingLinkUncertainRecipientId = existingRaw === null
    ? null
    : Number(existingRaw);
  if (
    !draft
    || !recovery
    || (existingLinkUncertainRecipientId !== null
      && (!Number.isInteger(existingLinkUncertainRecipientId) || existingLinkUncertainRecipientId <= 0))
  ) return null;
  if (existingLinkUncertainRecipientId !== null && recovery.phase !== 'draft') return null;
  return { draft, recovery, existingLinkUncertainRecipientId };
}

export function persistMailTemplateRecipientGuard(
  scopeKey: string | number,
  templateId: number,
  state: MailTemplateRecipientGuardState,
): boolean {
  return writeJson(templateKey(scopeKey, templateId), state);
}

export function clearMailTemplateRecipientGuard(scopeKey: string | number, templateId: number): void {
  remove(templateKey(scopeKey, templateId));
}
