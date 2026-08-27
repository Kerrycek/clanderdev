import type { ResourceRef } from '../../../lib/api/payments';
import type { PaidUntilStatus } from '../../../lib/paymentsBadges';
import { safeContentUrl } from '../../../lib/safeUrl';
import { sanitizeHtml, type HtmlSanitizerPolicy } from '../../../lib/sanitizeHtml';

export type PaymentSubtitleToken =
  | { kind: 'text'; key: string }
  | { kind: 'plural'; key: string; count: number };

export function parsePositiveInt(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

export function paidUntilSubtitleToken(status: { status: PaidUntilStatus; days?: number }): PaymentSubtitleToken {
  if (status.status === 'overdue' && status.days === undefined) {
    return { kind: 'text', key: 'payments.my.stat.paid_until.missing' };
  }

  if (status.status === 'unknown' || status.days === undefined) {
    return { kind: 'text', key: 'common.na' };
  }

  if (status.status === 'overdue') {
    const overdueDays = Math.max(0, Math.abs(status.days));
    if (overdueDays === 0) return { kind: 'text', key: 'payments.my.stat.paid_until.today' };
    return { kind: 'plural', key: 'payments.my.stat.paid_until.expired', count: overdueDays };
  }

  const daysLeft = Math.max(0, status.days);
  if (daysLeft === 0) return { kind: 'text', key: 'payments.my.stat.paid_until.today' };
  return { kind: 'plural', key: 'payments.my.stat.paid_until.in_days', count: daysLeft };
}

export function resourceRefLabel(ref: ResourceRef | null | undefined): string {
  if (!ref) return '—';

  const primary = [ref.login, ref.label, ref.name]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .find(Boolean);

  if (primary && typeof ref.id === 'number') return `${primary} (#${ref.id})`;
  if (primary) return primary;
  if (typeof ref.id === 'number') return `#${ref.id}`;

  return '—';
}

export function normalizePaymentInstructions(data: { instructions?: string | null } | undefined): string {
  return String(data?.instructions ?? '').trim();
}

export type PaymentInstructionsLanguage = 'en' | 'cs';

const PAYMENT_INSTRUCTIONS_CS_REPLACEMENTS: Array<[RegExp, string]> = [
  [/^General info$/i, 'Obecné informace'],
  [/^Payment in CZK$/i, 'Platba v CZK'],
  [/^Payment in EUR$/i, 'Platba v EUR'],
  [/^Back account for CZK \(CZ\):$/i, 'Bankovní účet pro CZK (CZ):'],
  [/^Bank account for CZK \(CZ\):$/i, 'Bankovní účet pro CZK (CZ):'],
  [/^Back account for EUR \(SK\):$/i, 'Bankovní účet pro EUR (SK):'],
  [/^Bank account for EUR \(SK\):$/i, 'Bankovní účet pro EUR (SK):'],
  [/^Variable symbol:$/i, 'Variabilní symbol:'],
  [/^Message \($/i, 'Zpráva ('],
  [/^Message$/i, 'Zpráva'],
  [/^Message:$/i, 'Zpráva:'],
  [/^Sum:$/i, 'Částka:'],
  [/^Bank account overview:$/i, 'Přehled bankovního účtu:'],
  [/^\(more info\)$/i, '(více informací)'],
  [/^more info$/i, 'více informací'],
  [/^per month$/i, 'měsíčně'],
];

const PAYMENT_INSTRUCTIONS_CS_TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  [
    /Payments can be made either in CZK or EUR, see below for bank account numbers\./gi,
    'Platbu můžeš provést v CZK nebo EUR. Čísla účtů najdeš níže.',
  ],
  [
    /Platby je možné provádět v CZK nebo EUR, čísla bankovních účtů najdete níže\./gi,
    'Platbu můžeš provést v CZK nebo EUR. Čísla účtů najdeš níže.',
  ],
  [
    /Payments for at least three months are preferred, but not mandatory\. Please pay for longer periods if you require invoices\./gi,
    'Preferujeme platby alespoň na tři měsíce, není to ale povinné. Pokud potřebuješ faktury, plať prosím na delší období.',
  ],
  [
    /Upřednostňujeme platby alespoň na tři měsíce, ale není to povinné\. Pokud potřebujete faktury, plaťte prosím na delší období\./gi,
    'Preferujeme platby alespoň na tři měsíce, není to ale povinné. Pokud potřebuješ faktury, plať prosím na delší období.',
  ],
  [
    /If you need an invoice, please write to support at podpora@vpsfree\.cz or support@vpsfree\.org and we will issue it\. Do not forget to include your billing credentials\./gi,
    'Pokud potřebuješ fakturu, napiš na podpora@vpsfree.cz nebo support@vpsfree.org. Nezapomeň přiložit fakturační údaje.',
  ],
  [
    /Pokud potřebujete fakturu, napište prosím na podporu na podpora@vpsfree\.cz nebo support@vpsfree\.org a vystavíme ji\. Nezapomeňte uvést své fakturační údaje\./gi,
    'Pokud potřebuješ fakturu, napiš na podpora@vpsfree.cz nebo support@vpsfree.org. Nezapomeň přiložit fakturační údaje.',
  ],
  [
    /Pokud vaše banka nepodporuje variabilní symboly, můžete své členské ID poslat ve zprávě pro příjemce jako\s+\/VS\/(\d+)\s*\.\s*Přesné znění závisí na vaší bance\./gi,
    'Pokud tvoje banka nepodporuje variabilní symboly, můžeš svoje členské ID poslat ve zprávě pro příjemce jako /VS/$1. Přesné znění závisí na tvojí bance.',
  ],
  [/CZK per month/gi, 'CZK měsíčně'],
  [/EUR per month/gi, 'EUR měsíčně'],
];

const PAYMENT_INSTRUCTIONS_CS_BLOCK_REPLACEMENTS = new Map<string, string>([
  [
    'Payments can be made either in CZK or EUR, see below for bank account numbers.',
    'Platbu můžeš provést v CZK nebo EUR. Čísla účtů najdeš níže.',
  ],
  [
    'Platby je možné provádět v CZK nebo EUR, čísla bankovních účtů najdete níže.',
    'Platbu můžeš provést v CZK nebo EUR. Čísla účtů najdeš níže.',
  ],
  [
    'Payments for at least three months are preferred, but not mandatory. Please pay for longer periods if you require invoices.',
    'Preferujeme platby alespoň na tři měsíce, není to ale povinné. Pokud potřebuješ faktury, plať prosím na delší období.',
  ],
  [
    'Upřednostňujeme platby alespoň na tři měsíce, ale není to povinné. Pokud potřebujete faktury, plaťte prosím na delší období.',
    'Preferujeme platby alespoň na tři měsíce, není to ale povinné. Pokud potřebuješ faktury, plať prosím na delší období.',
  ],
  [
    'If you need an invoice, please write to support at podpora@vpsfree.cz or support@vpsfree.org and we will issue it. Do not forget to include your billing credentials.',
    'Pokud potřebuješ fakturu, napiš na podpora@vpsfree.cz nebo support@vpsfree.org. Nezapomeň přiložit fakturační údaje.',
  ],
  [
    'Pokud potřebujete fakturu, napište prosím na podporu na podpora@vpsfree.cz nebo support@vpsfree.org a vystavíme ji. Nezapomeňte uvést své fakturační údaje.',
    'Pokud potřebuješ fakturu, napiš na podpora@vpsfree.cz nebo support@vpsfree.org. Nezapomeň přiložit fakturační údaje.',
  ],
]);

function normalizePaymentInstructionSentence(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function translatePaymentInstructionText(value: string, lang: PaymentInstructionsLanguage): string {
  if (lang !== 'cs') return value;

  let next = value;
  for (const [pattern, replacement] of PAYMENT_INSTRUCTIONS_CS_TEXT_REPLACEMENTS) {
    next = next.replace(pattern, replacement);
  }

  const trimmed = next.trim();
  const leading = next.slice(0, next.indexOf(trimmed));
  const trailing = next.slice(leading.length + trimmed.length);

  for (const [pattern, replacement] of PAYMENT_INSTRUCTIONS_CS_REPLACEMENTS) {
    if (pattern.test(trimmed)) return `${leading}${trimmed.replace(pattern, replacement)}${trailing}`;
  }

  return next;
}

const PAYMENT_ALLOWED_TAGS = new Set([
  'a',
  'b',
  'br',
  'caption',
  'code',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'i',
  'img',
  'li',
  'ol',
  'p',
  'small',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);
const PAYMENT_MAILTO_ATTRIBUTES = new Set(['a.href']);

function localizePaymentInstructionsFragment(fragment: DocumentFragment, lang: PaymentInstructionsLanguage): void {
  if (lang !== 'cs') return;

  for (const el of Array.from(fragment.querySelectorAll('p, h1, h2, h3, h4, h5, h6'))) {
    const normalized = normalizePaymentInstructionSentence(el.textContent ?? '');
    const replacement = PAYMENT_INSTRUCTIONS_CS_BLOCK_REPLACEMENTS.get(normalized);
    if (replacement) {
      el.textContent = replacement;
    }
  }

  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }

  for (const node of textNodes) {
    node.nodeValue = translatePaymentInstructionText(node.nodeValue ?? '', lang);
  }
}

function markPaymentInstructionTables(fragment: DocumentFragment): void {
  for (const table of Array.from(fragment.querySelectorAll('table'))) {
    table.setAttribute('data-payment-table', 'true');
    if (table.querySelector('img')) table.setAttribute('data-payment-qr-table', 'true');
  }

  for (const cell of Array.from(fragment.querySelectorAll('td, th'))) {
    if (cell.querySelector('img')) cell.setAttribute('data-payment-qr-cell', 'true');
  }
}

function paymentInstructionsSanitizerPolicy(lang: PaymentInstructionsLanguage): HtmlSanitizerPolicy {
  return {
    allowedTags: PAYMENT_ALLOWED_TAGS,
    allowMailtoAttributes: PAYMENT_MAILTO_ATTRIBUTES,
    hardenLinks: true,
    sanitizeAttributes: ({ tagName, sourceAttributes: attributes }) => {
      if (tagName === 'a') return { href: attributes.get('href') };

      if (tagName === 'img') {
        const src = attributes.get('src');
        if (!src || !safeContentUrl(src)) return {};

        return {
          src,
          alt: attributes.get('alt')?.trim() || 'QR',
          loading: 'lazy',
          width: '160',
          height: '160',
          'data-payment-qr-image': 'true',
        };
      }

      if (tagName === 'td' || tagName === 'th') {
        const colspan = attributes.get('colspan')?.trim();
        const rowspan = attributes.get('rowspan')?.trim();

        return {
          colspan: colspan && /^\d{1,2}$/.test(colspan) ? colspan : null,
          rowspan: rowspan && /^\d{1,2}$/.test(rowspan) ? rowspan : null,
        };
      }

      return {};
    },
    afterSanitize: (fragment) => {
      localizePaymentInstructionsFragment(fragment, lang);
      markPaymentInstructionTables(fragment);
    },
  };
}

export function sanitizePaymentInstructionsHtml(
  rawHtml: string,
  lang: PaymentInstructionsLanguage = 'en',
): string {
  return sanitizeHtml(rawHtml, paymentInstructionsSanitizerPolicy(lang));
}

function timestampOrNull(value: unknown): number | null {
  if (!value || typeof value !== 'string') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.getTime();
}

export type PaymentSettingsReview = {
  monthlyChanged: boolean;
  paidUntilChanged: boolean;
  hasChanges: boolean;
  clearsPaidUntil: boolean;
  movesPaidUntilBackward: boolean;
};

export function buildPaymentSettingsReview(input: {
  currentMonthly?: number;
  nextMonthly: number | null;
  currentPaidUntil: unknown;
  nextPaidUntilIso: string | null;
}): PaymentSettingsReview {
  const monthlyChanged = input.nextMonthly !== null && input.currentMonthly !== input.nextMonthly;
  const currentPaidUntilTs = timestampOrNull(input.currentPaidUntil);
  const nextPaidUntilTs = timestampOrNull(input.nextPaidUntilIso);
  const paidUntilChanged = currentPaidUntilTs !== nextPaidUntilTs;

  return {
    monthlyChanged,
    paidUntilChanged,
    hasChanges: monthlyChanged || paidUntilChanged,
    clearsPaidUntil: currentPaidUntilTs !== null && nextPaidUntilTs === null,
    movesPaidUntilBackward: currentPaidUntilTs !== null && nextPaidUntilTs !== null && nextPaidUntilTs < currentPaidUntilTs,
  };
}

export type ManualPaymentPreview = {
  months: number | null;
  amount?: number;
  canSubmit: boolean;
  validationKey?: string;
};

export function buildManualPaymentPreview(input: {
  monthlyPayment?: number;
  rawMonths: string;
}): ManualPaymentPreview {
  if (!input.monthlyPayment) {
    return {
      months: null,
      canSubmit: false,
      validationKey: 'admin.user.payments.add_payment.validation.no_monthly_payment',
    };
  }

  const months = parsePositiveInt(input.rawMonths);
  if (!months) {
    return {
      months,
      canSubmit: false,
      validationKey: 'admin.user.payments.add_payment.validation.months',
    };
  }

  return {
    months,
    amount: input.monthlyPayment * months,
    canSubmit: true,
  };
}
