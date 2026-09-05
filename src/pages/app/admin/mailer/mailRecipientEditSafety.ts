import {
  fetchMailRecipient,
  updateMailRecipient,
  type MailRecipient,
} from '../../../../lib/api/mailer';

import { strictPositiveIntegerId } from './mailerMutationSafety';

export interface MailRecipientEditorForm {
  label: string;
  to: string;
  cc: string;
  bcc: string;
}

export interface MailRecipientUpdatePayload {
  label: string;
  to: string | null;
  cc: string | null;
  bcc: string | null;
}

export function mailRecipientEditorForm(recipient: MailRecipient): MailRecipientEditorForm {
  return {
    label: String(recipient.label ?? ''),
    to: String(recipient.to ?? ''),
    cc: String(recipient.cc ?? ''),
    bcc: String(recipient.bcc ?? ''),
  };
}

/**
 * Capture every field overwritten by an ordinary global-recipient edit.
 * Empty strings and null addresses are equivalent because the editor renders
 * both as empty and normalizes cleared addresses to null on save.
 */
export function mailRecipientEditFingerprint(recipient: MailRecipient): string {
  const form = mailRecipientEditorForm(recipient);
  return JSON.stringify([form.label, form.to, form.cc, form.bcc]);
}

export type MailRecipientPreflightUpdateResult =
  | { status: 'stale'; latest: MailRecipient }
  | { status: 'updated'; recipient: MailRecipient };

interface MailRecipientEditDependencies {
  fetchCurrent: typeof fetchMailRecipient;
  update: typeof updateMailRecipient;
}

const defaultDependencies: MailRecipientEditDependencies = {
  fetchCurrent: fetchMailRecipient,
  update: updateMailRecipient,
};

export async function updateMailRecipientWithPreflight(
  attempt: {
    id: number;
    baselineFingerprint: string;
    payload: MailRecipientUpdatePayload;
  },
  dependencies: MailRecipientEditDependencies = defaultDependencies,
): Promise<MailRecipientPreflightUpdateResult> {
  const latest = (await dependencies.fetchCurrent(attempt.id)).data;
  const latestId = strictPositiveIntegerId(latest?.id);
  if (latestId !== attempt.id) {
    throw new TypeError('Malformed mail recipient readback: mismatched id');
  }

  if (mailRecipientEditFingerprint(latest) !== attempt.baselineFingerprint) {
    return { status: 'stale', latest };
  }

  const recipient = (await dependencies.update(attempt.id, attempt.payload)).data;
  return { status: 'updated', recipient };
}
