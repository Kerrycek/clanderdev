import {
  fetchMailTemplates,
  fetchMailTemplateTranslations,
  type MailTemplate,
  type MailTemplateTranslation,
} from './mailer';
import { resourceId } from '../resources';

const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_MAX_ITEMS = 5_000;

export class MailTemplateCreateReconciliationIncompleteError extends Error {
  constructor(resource: 'template' | 'translation') {
    super(`The bounded mail ${resource} scan ended before the full list could be verified.`);
    this.name = 'MailTemplateCreateReconciliationIncompleteError';
  }
}

export interface MailTemplateCreateFingerprint {
  name: string;
  label: string;
  template_id: string;
  user_visibility: string;
}

export interface MailTemplateTranslationCreateFingerprint {
  language: number;
  from: string;
  reply_to?: string | null;
  return_path?: string | null;
  subject: string;
  text_plain?: string | null;
  text_html?: string | null;
}

export type CreateReconciliationResult<T> =
  | { status: 'found'; resource: T; exact: boolean }
  | { status: 'absent' };

type PageOptions = { limit: number; fromId?: number };

function reconciliationResourceId(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function scanKeyset<T extends { id: number }>(opts: {
  resource: 'template' | 'translation';
  pageSize?: number;
  maxItems?: number;
  loadPage: (page: PageOptions) => Promise<T[]>;
  identify: (item: T) => { identity: boolean; exact: boolean };
}): Promise<CreateReconciliationResult<T>> {
  const pageSize = Math.max(1, Math.min(500, Math.floor(opts.pageSize ?? DEFAULT_PAGE_SIZE)));
  const maxItems = Math.max(pageSize, Math.floor(opts.maxItems ?? DEFAULT_MAX_ITEMS));
  const seenIds = new Set<number>();
  let fromId: number | undefined;

  while (seenIds.size < maxItems) {
    const limit = Math.min(pageSize, maxItems - seenIds.size);
    const page = await opts.loadPage({ limit, fromId });

    let cursor: number | undefined;
    for (const item of page) {
      const id = reconciliationResourceId(item.id);
      if (id === null) {
        throw new MailTemplateCreateReconciliationIncompleteError(opts.resource);
      }

      const normalizedItem = id === item.id ? item : { ...item, id };
      const match = opts.identify(normalizedItem);
      if (match.identity) return { status: 'found', resource: normalizedItem, exact: match.exact };
      seenIds.add(id);
      if (cursor === undefined || id < cursor) cursor = id;
    }

    // HaveAPI indexes are ordered by id descending; the next `from_id` is the
    // smallest id from this page (the same contract used by list pagination).

    if (page.length < limit) return { status: 'absent' };
    if (cursor === undefined || (fromId !== undefined && cursor >= fromId)) {
      throw new MailTemplateCreateReconciliationIncompleteError(opts.resource);
    }
    fromId = cursor;
  }

  throw new MailTemplateCreateReconciliationIncompleteError(opts.resource);
}

function sameOptionalString(actual: unknown, expected: unknown): boolean {
  return String(actual ?? '') === String(expected ?? '');
}

export async function reconcileMailTemplateCreate(
  fingerprint: MailTemplateCreateFingerprint,
  opts: {
    pageSize?: number;
    maxItems?: number;
    loadPage?: (page: PageOptions) => Promise<MailTemplate[]>;
  } = {},
): Promise<CreateReconciliationResult<MailTemplate>> {
  const expectedName = fingerprint.name.trim();
  const expectedLabel = fingerprint.label.trim();
  const expectedTemplateId = fingerprint.template_id.trim();
  const expectedVisibility = fingerprint.user_visibility.trim();

  return scanKeyset({
    resource: 'template',
    pageSize: opts.pageSize,
    maxItems: opts.maxItems,
    loadPage: opts.loadPage ?? (async (page) => (await fetchMailTemplates(page)).data),
    identify: (template) => ({
      identity: String(template.name ?? '').trim() === expectedName,
      exact: String(template.label ?? '').trim() === expectedLabel
        && String(template.template_id ?? '').trim() === expectedTemplateId
        && String(template.user_visibility ?? '').trim() === expectedVisibility,
    }),
  });
}

export async function reconcileMailTemplateTranslationCreate(
  mailTemplateId: number,
  fingerprint: MailTemplateTranslationCreateFingerprint,
  opts: {
    pageSize?: number;
    maxItems?: number;
    loadPage?: (page: PageOptions) => Promise<MailTemplateTranslation[]>;
  } = {},
): Promise<CreateReconciliationResult<MailTemplateTranslation>> {
  return scanKeyset({
    resource: 'translation',
    pageSize: opts.pageSize,
    maxItems: opts.maxItems,
    loadPage: opts.loadPage ?? (async (page) => (
      await fetchMailTemplateTranslations(mailTemplateId, page)
    ).data),
    identify: (translation) => ({
      identity: resourceId(translation.language) === fingerprint.language,
      exact: sameOptionalString(translation.from, fingerprint.from)
        && sameOptionalString(translation.reply_to, fingerprint.reply_to)
        && sameOptionalString(translation.return_path, fingerprint.return_path)
        && sameOptionalString(translation.subject, fingerprint.subject)
        && sameOptionalString(translation.text_plain, fingerprint.text_plain)
        && sameOptionalString(translation.text_html, fingerprint.text_html),
    }),
  });
}

async function reconcileAfterSettling<T>(opts: {
  reconcile: () => Promise<CreateReconciliationResult<T>>;
  attempts?: number;
  settleDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
}): Promise<Extract<CreateReconciliationResult<T>, { status: 'found' }> | { status: 'unresolved' }> {
  const attempts = Math.max(2, Math.min(6, Math.floor(opts.attempts ?? 4)));
  const settleDelayMs = Math.max(0, Math.floor(opts.settleDelayMs ?? 2_000));
  const sleep = opts.sleep ?? ((delayMs: number) => new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, delayMs);
  }));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await opts.reconcile();
    if (result.status === 'found') return result;
    if (attempt < attempts - 1) await sleep(settleDelayMs);
  }

  return { status: 'unresolved' };
}

export async function reconcileMailTemplateCreateAfterSettling(
  fingerprint: MailTemplateCreateFingerprint,
  opts: Parameters<typeof reconcileMailTemplateCreate>[1] & {
    attempts?: number;
    settleDelayMs?: number;
    sleep?: (delayMs: number) => Promise<void>;
  } = {},
) {
  return reconcileAfterSettling({
    reconcile: () => reconcileMailTemplateCreate(fingerprint, opts),
    attempts: opts.attempts,
    settleDelayMs: opts.settleDelayMs,
    sleep: opts.sleep,
  });
}

export async function reconcileMailTemplateTranslationCreateAfterSettling(
  mailTemplateId: number,
  fingerprint: MailTemplateTranslationCreateFingerprint,
  opts: Parameters<typeof reconcileMailTemplateTranslationCreate>[2] & {
    attempts?: number;
    settleDelayMs?: number;
    sleep?: (delayMs: number) => Promise<void>;
  } = {},
) {
  return reconcileAfterSettling({
    reconcile: () => reconcileMailTemplateTranslationCreate(mailTemplateId, fingerprint, opts),
    attempts: opts.attempts,
    settleDelayMs: opts.settleDelayMs,
    sleep: opts.sleep,
  });
}
