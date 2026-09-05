import { beforeEach, describe, expect, test } from 'vitest';

import {
  clearMailRecipientCreateGuard,
  clearMailTemplateRecipientGuard,
  persistMailRecipientCreateGuard,
  persistMailTemplateRecipientGuard,
  readMailRecipientCreateGuard,
  readMailTemplateRecipientGuard,
} from './mailRecipientMutationGuardStorage';

describe('mailer recipient mutation guard storage', () => {
  beforeEach(() => window.sessionStorage.clear());

  test('persists a global create fingerprint until explicitly cleared', () => {
    const attempt = { label: 'Ops', to: 'ops@example.test', cc: '', bcc: '' };
    expect(persistMailRecipientCreateGuard(1, attempt)).toBe(true);
    expect(readMailRecipientCreateGuard(1)).toEqual(attempt);
    expect(readMailRecipientCreateGuard(2)).toBeNull();
    clearMailRecipientCreateGuard(1);
    expect(readMailRecipientCreateGuard(1)).toBeNull();
  });

  test('persists template create/link recovery by template id', () => {
    expect(persistMailTemplateRecipientGuard(1, 7, {
      draft: { label: 'Ops', to: '', cc: 'ops@example.test', bcc: '' },
      recovery: { phase: 'link_uncertain', recipientId: 55 },
      existingLinkUncertainRecipientId: null,
    })).toBe(true);
    expect(readMailTemplateRecipientGuard(1, 7)).toEqual({
      draft: { label: 'Ops', to: '', cc: 'ops@example.test', bcc: '' },
      recovery: { phase: 'link_uncertain', recipientId: 55 },
      existingLinkUncertainRecipientId: null,
    });
    expect(readMailTemplateRecipientGuard(1, 8)).toBeNull();
    expect(readMailTemplateRecipientGuard(2, 7)).toBeNull();
    clearMailTemplateRecipientGuard(1, 7);
    expect(readMailTemplateRecipientGuard(1, 7)).toBeNull();
  });

  test('rejects malformed or contradictory stored guards', () => {
    window.sessionStorage.setItem(
      'webui-next.mailer.mail-template-recipient.v2.1.7',
      JSON.stringify({
        draft: { label: 'Ops', to: '', cc: '', bcc: '' },
        recovery: { phase: 'create_uncertain' },
        existingLinkUncertainRecipientId: 12,
      }),
    );
    expect(readMailTemplateRecipientGuard(1, 7)).toBeNull();
  });
});
