import { describe, expect, it, vi } from 'vitest';

import type { MailRecipient } from '../../../../lib/api/mailer';
import {
  mailRecipientEditFingerprint,
  mailRecipientEditorForm,
  updateMailRecipientWithPreflight,
} from './mailRecipientEditSafety';

const original: MailRecipient = {
  id: 19,
  label: 'Operations',
  to: 'ops@example.test',
  cc: null,
  bcc: 'audit@example.test',
};

const payload = {
  label: 'Draft operations',
  to: 'draft@example.test',
  cc: null,
  bcc: null,
};

describe('mail recipient lost-update safety', () => {
  it('fingerprints all editable fields while normalizing null addresses', () => {
    expect(mailRecipientEditorForm(original)).toEqual({
      label: 'Operations',
      to: 'ops@example.test',
      cc: '',
      bcc: 'audit@example.test',
    });
    expect(mailRecipientEditFingerprint({ ...original, cc: '' })).toBe(
      mailRecipientEditFingerprint(original),
    );

    for (const changed of [
      { label: 'Changed' },
      { to: 'changed@example.test' },
      { cc: 'changed@example.test' },
      { bcc: 'changed@example.test' },
    ]) {
      expect(mailRecipientEditFingerprint({ ...original, ...changed })).not.toBe(
        mailRecipientEditFingerprint(original),
      );
    }
  });

  it('does not send PUT when the authoritative readback differs from the opening snapshot', async () => {
    const latest = { ...original, label: 'Changed on server' };
    const fetchCurrent = vi.fn().mockResolvedValue({ data: latest, meta: {} });
    const update = vi.fn();

    await expect(updateMailRecipientWithPreflight({
      id: 19,
      baselineFingerprint: mailRecipientEditFingerprint(original),
      payload,
    }, { fetchCurrent, update })).resolves.toEqual({ status: 'stale', latest });

    expect(fetchCurrent).toHaveBeenCalledWith(19);
    expect(update).not.toHaveBeenCalled();
  });

  it('sends PUT only after a matching authoritative readback', async () => {
    const updated = { ...original, ...payload };
    const calls: string[] = [];
    const fetchCurrent = vi.fn().mockImplementation(async () => {
      calls.push('GET');
      return { data: original, meta: {} };
    });
    const update = vi.fn().mockImplementation(async () => {
      calls.push('PUT');
      return { data: updated, meta: {} };
    });

    await expect(updateMailRecipientWithPreflight({
      id: 19,
      baselineFingerprint: mailRecipientEditFingerprint(original),
      payload,
    }, { fetchCurrent, update })).resolves.toEqual({ status: 'updated', recipient: updated });

    expect(update).toHaveBeenCalledWith(19, payload);
    expect(calls).toEqual(['GET', 'PUT']);
  });

  it('fails closed on a malformed or mismatched authoritative readback', async () => {
    const fetchCurrent = vi.fn().mockResolvedValue({ data: { ...original, id: 20 }, meta: {} });
    const update = vi.fn();

    await expect(updateMailRecipientWithPreflight({
      id: 19,
      baselineFingerprint: mailRecipientEditFingerprint(original),
      payload,
    }, { fetchCurrent, update })).rejects.toThrow('mismatched id');

    expect(update).not.toHaveBeenCalled();
  });
});
