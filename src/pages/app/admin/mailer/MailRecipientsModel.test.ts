import { describe, expect, test } from 'vitest';

import {
  filterMailRecipients,
  parseMailRecipientPage,
  parseMailRecipientPageLimit,
} from './MailRecipientsModel';

const recipients = [
  { id: 10, label: 'Support', to: 'support@example.test', cc: 'team@example.test', bcc: null },
  { id: 11, label: 'Accounting', to: 'billing@example.test', cc: null, bcc: 'audit@example.test' },
];

describe('MailRecipientsModel', () => {
  test('searches id, label and every address locally', () => {
    for (const q of ['#11', 'ACCOUNT', 'billing@', 'audit@']) {
      expect(filterMailRecipients(recipients, { q, label: '', to: '', cc: '', bcc: '' })).toEqual([recipients[1]]);
    }
  });

  test('combines case-insensitive field filters', () => {
    expect(filterMailRecipients(recipients, {
      q: '',
      label: 'supp',
      to: 'EXAMPLE.TEST',
      cc: 'team@',
      bcc: '',
    })).toEqual([recipients[0]]);
  });

  test('normalizes page sizes and clamps pages', () => {
    expect(parseMailRecipientPageLimit('25')).toBe(25);
    expect(parseMailRecipientPageLimit('999')).toBe(50);
    expect(parseMailRecipientPage('4', 3)).toBe(3);
    expect(parseMailRecipientPage('invalid', 3)).toBe(1);
  });
});
