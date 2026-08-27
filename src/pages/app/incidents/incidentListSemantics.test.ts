import { describe, expect, it } from 'vitest';

import type { Mailbox } from '../../../lib/api/mailer';
import { resolveMailboxId } from './incidentListSemantics';

const mailboxes: Mailbox[] = [
  { id: 11, label: 'Operations Prague' },
  { id: 12, label: 'Operations Brno' },
  { id: 13, label: 'Support' },
];

describe('resolveMailboxId', () => {
  it('prefers an exact numeric id and resolves a unique label fragment', () => {
    expect(resolveMailboxId(mailboxes, '12')).toEqual({ id: 12 });
    expect(resolveMailboxId(mailboxes, 'prague')).toEqual({ id: 11 });
  });

  it('rejects ambiguous and unknown labels instead of silently choosing one', () => {
    expect(resolveMailboxId(mailboxes, 'operations')).toEqual({ err: 'ambiguous' });
    expect(resolveMailboxId(mailboxes, 'billing')).toEqual({ err: 'none' });
  });
});
