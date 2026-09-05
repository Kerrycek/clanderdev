export interface MailRecipientDraft {
  label: string;
  to: string;
  cc: string;
  bcc: string;
}

export type MailRecipientCreateRecovery =
  | { phase: 'draft' }
  | { phase: 'link_retry'; recipientId: number }
  | { phase: 'link_uncertain'; recipientId: number }
  | { phase: 'create_uncertain' };

export function emptyMailRecipientDraft(): MailRecipientDraft {
  return { label: '', to: '', cc: '', bcc: '' };
}

export function isMailRecipientDraftValid(draft: MailRecipientDraft): boolean {
  return Boolean(
    draft.label.trim()
    && (draft.to.trim() || draft.cc.trim() || draft.bcc.trim())
  );
}

export function isMailRecipientDraftLocked(recovery: MailRecipientCreateRecovery): boolean {
  return recovery.phase !== 'draft';
}

export function retryMailRecipientId(recovery: MailRecipientCreateRecovery): number | null {
  return recovery.phase === 'link_retry' ? recovery.recipientId : null;
}

export function canSubmitMailRecipientCreate(args: {
  draft: MailRecipientDraft;
  recovery: MailRecipientCreateRecovery;
  pending: boolean;
}): boolean {
  if (
    args.pending
    || args.recovery.phase === 'create_uncertain'
    || args.recovery.phase === 'link_uncertain'
  ) return false;
  if (args.recovery.phase === 'link_retry') return true;
  return isMailRecipientDraftValid(args.draft);
}
