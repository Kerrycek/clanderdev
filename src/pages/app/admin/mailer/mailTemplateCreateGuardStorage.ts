import type { MailTemplateCreateFingerprint } from '../../../../lib/api/mailTemplateCreateReconciliation';
import type { IndeterminateMailTemplateTranslationCreateAttempt } from './MailTemplateTranslationCreateIndeterminateGuard';
import { strictPositiveIntegerId } from './mailerMutationSafety';

const TEMPLATE_CREATE_KEY_PREFIX = 'webui-next.mailer.mail-template-create.v2.';
const TRANSLATION_CREATE_KEY_PREFIX = 'webui-next.mailer.mail-template-translation-create.v2.';
const MAX_BODY_LENGTH = 1_000_000;

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
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
    // A failed cleanup intentionally leaves the next mount locked.
  }
}

function requiredString(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : null;
}

function optionalString(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined || value === null) return value;
  return typeof value === 'string' && value.length <= maxLength ? value : undefined;
}

function normalizeTemplateAttempt(raw: unknown): MailTemplateCreateFingerprint | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const name = requiredString(value['name'], 100);
  const label = requiredString(value['label'], 100);
  const templateId = requiredString(value['template_id'], 100);
  const visibility = value['user_visibility'];
  if (!name || !label || !templateId || !['default', 'visible', 'invisible'].includes(String(visibility))) {
    return null;
  }
  return { name, label, template_id: templateId, user_visibility: String(visibility) };
}

function normalizeTranslationAttempt(raw: unknown): IndeterminateMailTemplateTranslationCreateAttempt | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const language = strictPositiveIntegerId(value['language']);
  const from = requiredString(value['from'], 255);
  const subject = requiredString(value['subject'], 255);
  const languageLabel = requiredString(value['languageLabel'], 255);
  const replyTo = optionalString(value['reply_to'], 255);
  const returnPath = optionalString(value['return_path'], 255);
  const textPlain = optionalString(value['text_plain'], MAX_BODY_LENGTH);
  const textHtml = optionalString(value['text_html'], MAX_BODY_LENGTH);
  if (
    language === null
    || !from
    || !subject
    || !languageLabel
    || (replyTo === undefined && value['reply_to'] !== undefined)
    || (returnPath === undefined && value['return_path'] !== undefined)
    || (textPlain === undefined && value['text_plain'] !== undefined)
    || (textHtml === undefined && value['text_html'] !== undefined)
  ) return null;

  return {
    language,
    from,
    subject,
    languageLabel,
    ...(replyTo !== undefined ? { reply_to: replyTo } : {}),
    ...(returnPath !== undefined ? { return_path: returnPath } : {}),
    ...(textPlain !== undefined ? { text_plain: textPlain } : {}),
    ...(textHtml !== undefined ? { text_html: textHtml } : {}),
  };
}

function scopedKey(prefix: string, scopeKey: string | number): string {
  return `${prefix}${encodeURIComponent(String(scopeKey))}`;
}

export function readMailTemplateCreateGuard(scopeKey: string | number): MailTemplateCreateFingerprint | null {
  return normalizeTemplateAttempt(readJson(scopedKey(TEMPLATE_CREATE_KEY_PREFIX, scopeKey)));
}

export function persistMailTemplateCreateGuard(
  scopeKey: string | number,
  attempt: MailTemplateCreateFingerprint,
): boolean {
  return writeJson(scopedKey(TEMPLATE_CREATE_KEY_PREFIX, scopeKey), attempt);
}

export function clearMailTemplateCreateGuard(scopeKey: string | number): void {
  remove(scopedKey(TEMPLATE_CREATE_KEY_PREFIX, scopeKey));
}

function translationKey(scopeKey: string | number, templateId: number): string {
  return `${scopedKey(TRANSLATION_CREATE_KEY_PREFIX, scopeKey)}.${templateId}`;
}

export function readMailTemplateTranslationCreateGuard(
  scopeKey: string | number,
  templateId: number,
): IndeterminateMailTemplateTranslationCreateAttempt | null {
  return normalizeTranslationAttempt(readJson(translationKey(scopeKey, templateId)));
}

export function persistMailTemplateTranslationCreateGuard(
  scopeKey: string | number,
  templateId: number,
  attempt: IndeterminateMailTemplateTranslationCreateAttempt,
): boolean {
  return writeJson(translationKey(scopeKey, templateId), attempt);
}

export function clearMailTemplateTranslationCreateGuard(scopeKey: string | number, templateId: number): void {
  remove(translationKey(scopeKey, templateId));
}
