import { describe, expect, test } from 'vitest';

import {
  buildManualPaymentPreview,
  buildPaymentSettingsReview,
  normalizePaymentInstructions,
  paidUntilSubtitleToken,
  parsePositiveInt,
  resourceRefLabel,
  sanitizePaymentInstructionsHtml,
} from './PaymentsModel';

describe('PaymentsModel', () => {
  test('parsePositiveInt accepts positive numbers and floors decimals', () => {
    expect(parsePositiveInt('3')).toBe(3);
    expect(parsePositiveInt('3.9')).toBe(3);
    expect(parsePositiveInt('0')).toBeNull();
    expect(parsePositiveInt('abc')).toBeNull();
  });

  test('paidUntilSubtitleToken maps status to translation descriptors', () => {
    expect(paidUntilSubtitleToken({ status: 'overdue' })).toEqual({
      kind: 'text',
      key: 'payments.my.stat.paid_until.missing',
    });
    expect(paidUntilSubtitleToken({ status: 'overdue', days: -4 })).toEqual({
      kind: 'plural',
      key: 'payments.my.stat.paid_until.expired',
      count: 4,
    });
    expect(paidUntilSubtitleToken({ status: 'paid', days: 12 })).toEqual({
      kind: 'plural',
      key: 'payments.my.stat.paid_until.in_days',
      count: 12,
    });
  });

  test('resourceRefLabel prefers login and includes numeric id', () => {
    expect(resourceRefLabel({ id: 7, login: 'alice' })).toBe('alice (#7)');
    expect(resourceRefLabel({ id: 8, label: 'Alice Example' })).toBe('Alice Example (#8)');
    expect(resourceRefLabel({ id: 9 })).toBe('#9');
    expect(resourceRefLabel(undefined)).toBe('—');
  });

  test('normalizes payment instructions safely', () => {
    expect(normalizePaymentInstructions({ instructions: '  VS: 42\n' })).toBe('VS: 42');
    expect(normalizePaymentInstructions(undefined)).toBe('');
  });

  test('sanitizes payment instructions while preserving tables and QR images', () => {
    const html = sanitizePaymentInstructionsHtml(`
      <style>.x{display:none}</style>
      <script>alert(1)</script>
      <h3 onclick="bad()">Payment in CZK</h3>
      <table style="width:750px"><tr><td>Variable symbol:</td><td><em>53</em></td><td><img src="/qr.php?vs=53" onerror="bad()" alt="QR"></td></tr></table>
      <a href="javascript:alert(1)">bad</a>
      <a href="https://example.com" target="_blank" onclick="bad()">ok</a>
    `);

    expect(html).toContain('<table');
    expect(html).toContain('data-payment-table="true"');
    expect(html).toContain('data-payment-qr-table="true"');
    expect(html).toContain('data-payment-qr-cell="true"');
    expect(html).toContain('<img src="/qr.php?vs=53" alt="QR" loading="lazy" width="160" height="160" data-payment-qr-image="true">');
    expect(html).toContain('<a>bad</a>');
    expect(html).toContain('<a href="https://example.com" rel="noopener noreferrer" target="_blank">ok</a>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('style=');
  });

  test('rejects protocol-relative payment links and images', () => {
    const html = sanitizePaymentInstructionsHtml(`
      <a href="//attacker.example/track">bad link</a>
      <img src="//attacker.example/pixel" alt="tracking">
    `);

    expect(html).toContain('<a>bad link</a>');
    expect(html).toContain('<img>');
    expect(html).not.toContain('attacker.example');
  });

  test('localizes legacy payment instructions for Czech UI', () => {
    const html = sanitizePaymentInstructionsHtml(`
      <h3>Payment in CZK</h3>
      <p>Payments can be made either in CZK or EUR, see below for bank account numbers.</p>
      <p>
        Payments for at least three months are preferred, but not mandatory.
        Please pay for longer periods if you require invoices.
      </p>
      <table>
        <tr><td>Back account for CZK (CZ):</td><td>2200041594/2010</td></tr>
        <tr><td>Variable symbol:</td><td>53</td></tr>
        <tr><td>Message (<a href="https://example.test">more info</a>):</td><td>/VS/53</td></tr>
        <tr><td>Sum:</td><td>0 CZK per month</td></tr>
      </table>
    `, 'cs');

    expect(html).toContain('Platba v CZK');
    expect(html).toContain('Platbu můžeš provést v CZK nebo EUR.');
    expect(html).toContain('Preferujeme platby alespoň na tři měsíce');
    expect(html).toContain('Bankovní účet pro CZK (CZ):');
    expect(html).toContain('Variabilní symbol:');
    expect(html).toContain('Zpráva');
    expect(html).toContain('více informací');
    expect(html).toContain('Částka:');
    expect(html).toContain('0 CZK měsíčně');
    expect(html).not.toContain('Payment in CZK');
    expect(html).not.toContain('Payments for at least three months');
    expect(html).not.toContain('Back account');
  });

  test('rewrites Czech payment instructions to informal address', () => {
    const html = sanitizePaymentInstructionsHtml(`
      <h3>Obecné informace</h3>
      <p>Platby je možné provádět v CZK nebo EUR, čísla bankovních účtů najdete níže.</p>
      <p>Upřednostňujeme platby alespoň na tři měsíce, ale není to povinné. Pokud potřebujete faktury, plaťte prosím na delší období.</p>
      <p>Pokud potřebujete fakturu, napište prosím na podporu na podpora@vpsfree.cz nebo support@vpsfree.org a vystavíme ji. Nezapomeňte uvést své fakturační údaje.</p>
      <h3>Variabilní symbol a zpráva</h3>
      <p>Pokud vaše banka nepodporuje variabilní symboly, můžete své členské ID poslat ve zprávě pro příjemce jako /VS/53 . Přesné znění závisí na vaší bance.</p>
    `, 'cs');

    expect(html).toContain('Platbu můžeš provést v CZK nebo EUR. Čísla účtů najdeš níže.');
    expect(html).toContain('Pokud potřebuješ faktury, plať prosím na delší období.');
    expect(html).toContain('Pokud potřebuješ fakturu, napiš na podpora@vpsfree.cz');
    expect(html).toContain('Nezapomeň přiložit fakturační údaje.');
    expect(html).toContain('Pokud tvoje banka nepodporuje variabilní symboly');
    expect(html).toContain('můžeš svoje členské ID poslat ve zprávě pro příjemce jako /VS/53.');
    expect(html).toContain('Přesné znění závisí na tvojí bance.');
    expect(html).not.toContain('najdete');
    expect(html).not.toContain('potřebujete');
    expect(html).not.toContain('plaťte');
    expect(html).not.toContain('vaší bance');
  });

  test('buildPaymentSettingsReview flags backward and cleared paid-until changes', () => {
    expect(
      buildPaymentSettingsReview({
        currentMonthly: 100,
        nextMonthly: 100,
        currentPaidUntil: '2026-04-01T00:00:00.000Z',
        nextPaidUntilIso: '2026-03-01T00:00:00.000Z',
      })
    ).toMatchObject({
      monthlyChanged: false,
      paidUntilChanged: true,
      hasChanges: true,
      movesPaidUntilBackward: true,
      clearsPaidUntil: false,
    });

    expect(
      buildPaymentSettingsReview({
        currentMonthly: 100,
        nextMonthly: 120,
        currentPaidUntil: '2026-04-01T00:00:00.000Z',
        nextPaidUntilIso: null,
      })
    ).toMatchObject({
      monthlyChanged: true,
      paidUntilChanged: true,
      clearsPaidUntil: true,
    });
  });

  test('buildManualPaymentPreview validates monthly payment and months', () => {
    expect(buildManualPaymentPreview({ monthlyPayment: undefined, rawMonths: '1' })).toMatchObject({
      canSubmit: false,
      validationKey: 'admin.user.payments.add_payment.validation.no_monthly_payment',
    });
    expect(buildManualPaymentPreview({ monthlyPayment: 100, rawMonths: '0' })).toMatchObject({
      canSubmit: false,
      validationKey: 'admin.user.payments.add_payment.validation.months',
    });
    expect(buildManualPaymentPreview({ monthlyPayment: 100, rawMonths: '3' })).toEqual({
      months: 3,
      amount: 300,
      canSubmit: true,
    });
  });
});
