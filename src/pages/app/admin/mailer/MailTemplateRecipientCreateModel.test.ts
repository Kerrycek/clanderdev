import { describe, expect, test } from 'vitest';

import {
  canSubmitMailRecipientCreate,
  emptyMailRecipientDraft,
  isMailRecipientDraftLocked,
  isMailRecipientDraftValid,
  retryMailRecipientId,
  type MailRecipientCreateRecovery,
} from './MailTemplateRecipientCreateModel';

describe('mail template recipient create recovery', () => {
  test('requires a label and at least one address for a new recipient', () => {
    expect(isMailRecipientDraftValid({ label: '', to: '', cc: '', bcc: '' })).toBe(false);
    expect(isMailRecipientDraftValid({ label: 'Ops', to: '', cc: '', bcc: '' })).toBe(false);
    expect(isMailRecipientDraftValid({ label: '', to: 'ops@example.test', cc: '', bcc: '' })).toBe(false);
    expect(isMailRecipientDraftValid({ label: 'Ops', to: '', cc: 'ops@example.test', bcc: '' })).toBe(true);
  });

  test('locks a known created recipient while allowing only its link retry', () => {
    const recovery: MailRecipientCreateRecovery = { phase: 'link_retry', recipientId: 55 };
    expect(isMailRecipientDraftLocked(recovery)).toBe(true);
    expect(retryMailRecipientId(recovery)).toBe(55);
    expect(canSubmitMailRecipientCreate({
      draft: emptyMailRecipientDraft(),
      recovery,
      pending: false,
    })).toBe(true);
    expect(canSubmitMailRecipientCreate({
      draft: emptyMailRecipientDraft(),
      recovery,
      pending: true,
    })).toBe(false);
  });

  test('fails closed after an uncertain create outcome until an explicit reset', () => {
    const recovery: MailRecipientCreateRecovery = { phase: 'create_uncertain' };
    const validDraft = { label: 'Ops', to: 'ops@example.test', cc: '', bcc: '' };
    expect(isMailRecipientDraftLocked(recovery)).toBe(true);
    expect(retryMailRecipientId(recovery)).toBeNull();
    expect(canSubmitMailRecipientCreate({ draft: validDraft, recovery, pending: false })).toBe(false);

    const resetRecovery: MailRecipientCreateRecovery = { phase: 'draft' };
    expect(isMailRecipientDraftLocked(resetRecovery)).toBe(false);
    expect(emptyMailRecipientDraft()).toEqual({ label: '', to: '', cc: '', bcc: '' });
    expect(canSubmitMailRecipientCreate({
      draft: emptyMailRecipientDraft(),
      recovery: resetRecovery,
      pending: false,
    })).toBe(false);
  });

  test('does not retry an ambiguously settled link request', () => {
    const recovery: MailRecipientCreateRecovery = { phase: 'link_uncertain', recipientId: 55 };
    const validDraft = { label: 'Ops', to: 'ops@example.test', cc: '', bcc: '' };
    expect(isMailRecipientDraftLocked(recovery)).toBe(true);
    expect(retryMailRecipientId(recovery)).toBeNull();
    expect(canSubmitMailRecipientCreate({ draft: validDraft, recovery, pending: false })).toBe(false);
  });
});
