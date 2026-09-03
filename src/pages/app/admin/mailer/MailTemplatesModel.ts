import type { MailTemplate } from '../../../../lib/api/mailer';

export const MAIL_TEMPLATE_FETCH_LIMIT = 500;
export const MAIL_TEMPLATE_PAGE_LIMITS = [25, 50, 100] as const;
export const MAIL_TEMPLATE_DEFAULT_PAGE_LIMIT = 50;

export interface MailTemplateListFilters {
  q: string;
  templateId: string;
  userVisibility: string;
}

export type MailTemplateListParamName = 'q' | 'template_id' | 'user_visibility' | 'page' | 'limit';

export function normalizeMailTemplateListParam(
  name: MailTemplateListParamName,
  value: string | number,
): string {
  const raw = String(value);
  return name === 'q' ? raw : raw.trim();
}

export function filterMailTemplates(
  rows: readonly MailTemplate[],
  filters: MailTemplateListFilters,
): MailTemplate[] {
  const q = filters.q.trim().toLowerCase();
  const templateId = filters.templateId.trim();
  const userVisibility = filters.userVisibility.trim();

  return rows.filter((template) => {
    if (templateId && String(template.template_id ?? '').trim() !== templateId) return false;
    if (userVisibility && String(template.user_visibility ?? '').trim() !== userVisibility) return false;
    if (!q) return true;

    return [
      String(template.id),
      `#${template.id}`,
      String(template.name ?? ''),
      String(template.label ?? ''),
      String(template.template_id ?? ''),
    ].some((value) => value.toLowerCase().includes(q));
  });
}


export function parseMailTemplatePageLimit(raw: string | null): number {
  const parsed = Number(raw);
  return MAIL_TEMPLATE_PAGE_LIMITS.includes(parsed as (typeof MAIL_TEMPLATE_PAGE_LIMITS)[number])
    ? parsed
    : MAIL_TEMPLATE_DEFAULT_PAGE_LIMIT;
}

export function parseMailTemplatePage(raw: string | null, pageCount: number): number {
  const parsed = Number(raw);
  const requested = Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  return Math.min(requested, Math.max(1, pageCount));
}
