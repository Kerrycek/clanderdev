import type { MailRecipient } from '../../../../lib/api/mailer';

export const MAIL_RECIPIENT_FETCH_LIMIT = 500;
export const MAIL_RECIPIENT_PAGE_LIMITS = [25, 50, 100] as const;
export const MAIL_RECIPIENT_DEFAULT_PAGE_LIMIT = 50;

export interface MailRecipientListFilters {
  q: string;
  label: string;
  to: string;
  cc: string;
  bcc: string;
}

export function filterMailRecipients(
  rows: readonly MailRecipient[],
  filters: MailRecipientListFilters,
): MailRecipient[] {
  const q = filters.q.trim().toLowerCase();
  const label = filters.label.trim().toLowerCase();
  const to = filters.to.trim().toLowerCase();
  const cc = filters.cc.trim().toLowerCase();
  const bcc = filters.bcc.trim().toLowerCase();

  return rows.filter((recipient) => {
    const recipientLabel = String(recipient.label ?? '').toLowerCase();
    const recipientTo = String(recipient.to ?? '').toLowerCase();
    const recipientCc = String(recipient.cc ?? '').toLowerCase();
    const recipientBcc = String(recipient.bcc ?? '').toLowerCase();

    if (label && !recipientLabel.includes(label)) return false;
    if (to && !recipientTo.includes(to)) return false;
    if (cc && !recipientCc.includes(cc)) return false;
    if (bcc && !recipientBcc.includes(bcc)) return false;
    if (!q) return true;

    return [
      String(recipient.id),
      `#${recipient.id}`,
      recipientLabel,
      recipientTo,
      recipientCc,
      recipientBcc,
    ].some((value) => value.toLowerCase().includes(q));
  });
}

export function parseMailRecipientPageLimit(raw: string | null): number {
  const parsed = Number(raw);
  return MAIL_RECIPIENT_PAGE_LIMITS.includes(parsed as (typeof MAIL_RECIPIENT_PAGE_LIMITS)[number])
    ? parsed
    : MAIL_RECIPIENT_DEFAULT_PAGE_LIMIT;
}

export function parseMailRecipientPage(raw: string | null, pageCount: number): number {
  const parsed = Number(raw);
  const requested = Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  return Math.min(requested, Math.max(1, pageCount));
}
