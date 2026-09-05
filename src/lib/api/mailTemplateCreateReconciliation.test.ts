import { describe, expect, it, vi } from 'vitest';

import {
  MailTemplateCreateReconciliationIncompleteError,
  reconcileMailTemplateCreate,
  reconcileMailTemplateCreateAfterSettling,
  reconcileMailTemplateTranslationCreate,
} from './mailTemplateCreateReconciliation';

const templateFingerprint = {
  name: 'password_reset',
  label: 'Password reset',
  template_id: 'password-reset-v2',
  user_visibility: 'visible',
};

describe('mail template create reconciliation', () => {
  it('walks keyset pages and recognizes the full template fingerprint', async () => {
    const loadPage = vi.fn(async ({ fromId }: { limit: number; fromId?: number }) => {
      if (fromId === undefined) {
        return [{ id: 4, name: 'welcome' }, { id: 3, name: 'report' }];
      }
      return [{ id: 2, name: 'notification' }, { id: 1, ...templateFingerprint }];
    });

    await expect(reconcileMailTemplateCreate(templateFingerprint, {
      pageSize: 2,
      loadPage,
    })).resolves.toMatchObject({ status: 'found', exact: true, resource: { id: 1 } });
    expect(loadPage).toHaveBeenNthCalledWith(2, { limit: 2, fromId: 3 });
  });

  it('reports an identity collision without treating different fields as exact', async () => {
    await expect(reconcileMailTemplateCreate(templateFingerprint, {
      loadPage: async () => [{ id: 9, ...templateFingerprint, template_id: 'different' }],
    })).resolves.toMatchObject({ status: 'found', exact: false, resource: { id: 9 } });
  });

  it('matches a nested translation by language and nullable body fingerprint', async () => {
    const fingerprint = {
      language: 2,
      from: 'noreply@example.test',
      reply_to: null,
      return_path: null,
      subject: 'Reset',
      text_plain: null,
      text_html: '<p>Reset</p>',
    };

    await expect(reconcileMailTemplateTranslationCreate(7, fingerprint, {
      loadPage: async () => [{
        id: 12,
        language: { id: 2, code: 'cs' },
        from: 'noreply@example.test',
        reply_to: null,
        return_path: null,
        subject: 'Reset',
        text_plain: null,
        text_html: '<p>Reset</p>',
      }],
    })).resolves.toMatchObject({ status: 'found', exact: true, resource: { id: 12 } });
  });

  it('fails closed on a non-advancing full page', async () => {
    await expect(reconcileMailTemplateCreate(templateFingerprint, {
      pageSize: 1,
      maxItems: 2,
      loadPage: async () => [{ id: 1, name: 'welcome' }],
    })).rejects.toBeInstanceOf(MailTemplateCreateReconciliationIncompleteError);
  });

  it('fails closed when a matching readback has a malformed resource id', async () => {
    await expect(reconcileMailTemplateCreate(templateFingerprint, {
      loadPage: async () => [{ id: true, ...templateFingerprint }] as never,
    })).rejects.toBeInstanceOf(MailTemplateCreateReconciliationIncompleteError);
  });

  it('keeps repeated complete absence unresolved after the settling window', async () => {
    const loadPage = vi.fn(async () => []);
    const sleep = vi.fn(async () => undefined);

    await expect(reconcileMailTemplateCreateAfterSettling(templateFingerprint, {
      attempts: 3,
      settleDelayMs: 0,
      sleep,
      loadPage,
    })).resolves.toEqual({ status: 'unresolved' });
    expect(loadPage).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
