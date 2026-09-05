import { describe, expect, test, vi } from 'vitest';

import {
  createMailTemplate,
  fetchMailLogs,
  fetchMailboxes,
  fetchMailRecipient,
  fetchMailRecipients,
  fetchMailTemplateRecipients,
  fetchMailTemplateTranslation,
  fetchMailTemplateTranslations,
  fetchMailTemplates,
  updateMailTemplateTranslation,
  updateMailRecipient,
  updateMailTemplate,
  type MailTemplateUpdateInput,
} from './mailer';

function mockFetchOk(response: any) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: true, response }) });
}

function lastFetchCall() {
  const calls = (globalThis.fetch as any).mock.calls;
  return calls[calls.length - 1] as [string, RequestInit?];
}

describe('mailer API wrappers', () => {
  test('fetchMailTemplates forwards only supported pagination parameters', async () => {
    vi.stubGlobal('fetch', mockFetchOk({ mail_templates: [], _meta: { total_count: 0 } }));

    const optionsWithUnsupportedFilters = {
      limit: 25,
      fromId: 91,
      q: 'welcome',
      templateId: 'registration',
      userVisibility: 'visible',
      role: 'admin',
      public: true,
      languageId: 2,
    };
    await fetchMailTemplates(optionsWithUnsupportedFilters);

    const [url] = lastFetchCall();
    const u = new URL(url);

    expect(u.pathname).toBe('/v7.0/mail_templates');
    expect(Array.from(u.searchParams.entries())).toEqual([
      ['mail_template[limit]', '25'],
      ['mail_template[from_id]', '91'],
    ]);
  });

  test('mail template create sends identifiers while ordinary update only sends safe mutable fields', async () => {
    vi.stubGlobal('fetch', mockFetchOk({ mail_template: { id: 7 } }));

    await createMailTemplate({
      name: 'registration',
      label: 'Registration',
      template_id: 'registration-v2',
      user_visibility: 'visible',
    });

    let [url, init] = lastFetchCall();
    expect(new URL(url).pathname).toBe('/v7.0/mail_templates');
    expect(new URL(url).search).toBe('');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      mail_template: {
        name: 'registration',
        label: 'Registration',
        template_id: 'registration-v2',
        user_visibility: 'visible',
      },
    });

    await updateMailTemplate(7, {
      label: 'Updated registration',
      user_visibility: 'invisible',
      name: 'must-not-be-sent',
      template_id: 'must-not-be-sent',
    } as MailTemplateUpdateInput & { name: string; template_id: string });

    [url, init] = lastFetchCall();
    expect(new URL(url).pathname).toBe('/v7.0/mail_templates/7');
    expect(new URL(url).search).toBe('');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({
      mail_template: {
        label: 'Updated registration',
        user_visibility: 'invisible',
      },
    });
  });

  test('nested mail template reads request the relations rendered by the UI', async () => {
    vi.stubGlobal('fetch', mockFetchOk({ recipients: [], _meta: { total_count: 0 } }));

    await fetchMailTemplateRecipients(7, { limit: 50, fromId: 9 });

    let [url] = lastFetchCall();
    let parsed = new URL(url);
    expect(parsed.pathname).toBe('/v7.0/mail_templates/7/recipients');
    expect(parsed.searchParams.get('recipient[limit]')).toBe('50');
    expect(parsed.searchParams.get('recipient[from_id]')).toBe('9');
    expect(parsed.searchParams.get('_meta[includes]')).toBe('mail_recipient');

    vi.stubGlobal('fetch', mockFetchOk({ translations: [], _meta: { total_count: 0 } }));
    await fetchMailTemplateTranslations(7, { limit: 25, fromId: 11 });

    [url] = lastFetchCall();
    parsed = new URL(url);
    expect(parsed.pathname).toBe('/v7.0/mail_templates/7/translations');
    expect(parsed.searchParams.get('translation[limit]')).toBe('25');
    expect(parsed.searchParams.get('translation[from_id]')).toBe('11');
    expect(parsed.searchParams.get('_meta[includes]')).toBe('language');

    vi.stubGlobal('fetch', mockFetchOk({ translation: { id: 13 } }));
    await fetchMailTemplateTranslation(7, 13);

    [url] = lastFetchCall();
    parsed = new URL(url);
    expect(parsed.pathname).toBe('/v7.0/mail_templates/7/translations/13');
    expect(parsed.searchParams.get('_meta[includes]')).toBe('language');
  });

  test('translation update preserves explicit nulls when MIME bodies are cleared', async () => {
    vi.stubGlobal('fetch', mockFetchOk({ translation: { id: 13 } }));

    await updateMailTemplateTranslation(7, 13, {
      from: 'noreply@example.test',
      subject: 'Welcome',
      text_plain: null,
      text_html: null,
    });

    const [url, init] = lastFetchCall();
    expect(new URL(url).pathname).toBe('/v7.0/mail_templates/7/translations/13');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({
      translation: {
        from: 'noreply@example.test',
        subject: 'Welcome',
        text_plain: null,
        text_html: null,
      },
    });
  });

  test('recipient update preserves explicit nulls when address fields are cleared', async () => {
    vi.stubGlobal('fetch', mockFetchOk({ mail_recipient: { id: 19 } }));

    await updateMailRecipient(19, {
      label: 'Operations',
      to: 'ops@example.test',
      cc: null,
      bcc: null,
    });

    const [url, init] = lastFetchCall();
    expect(new URL(url).pathname).toBe('/v7.0/mail_recipients/19');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({
      mail_recipient: {
        label: 'Operations',
        to: 'ops@example.test',
        cc: null,
        bcc: null,
      },
    });
  });

  test('fetchMailRecipient reads the authoritative recipient before an edit update', async () => {
    vi.stubGlobal('fetch', mockFetchOk({
      mail_recipient: {
        id: 19,
        label: 'Operations',
        to: 'ops@example.test',
        cc: null,
        bcc: null,
      },
    }));

    const result = await fetchMailRecipient(19);

    const [url, init] = lastFetchCall();
    expect(new URL(url).pathname).toBe('/v7.0/mail_recipients/19');
    expect(new URL(url).search).toBe('');
    expect(init?.method).toBe('GET');
    expect(result.data).toEqual({
      id: 19,
      label: 'Operations',
      to: 'ops@example.test',
      cc: null,
      bcc: null,
    });
  });

  test('fetchMailLogs forwards search, relation and date-window filters', async () => {
    globalThis.fetch = mockFetchOk({ mail_logs: [], _meta: { total_count: 0 } }) as any;

    await fetchMailLogs({
      limit: 50,
      fromId: 123,
      q: 'subject:test',
      userId: 42,
      templateId: 7,
      createdAfter: '2026-03-01T00:00:00Z',
      createdBefore: '2026-03-09T00:00:00Z',
    });

    const [url] = lastFetchCall();
    const u = new URL(url);

    expect(u.pathname).toBe('/v7.0/mail_logs');
    expect(u.searchParams.get('mail_log[limit]')).toBe('50');
    expect(u.searchParams.get('mail_log[from_id]')).toBe('123');
    expect(u.searchParams.get('mail_log[q]')).toBe('subject:test');
    expect(u.searchParams.get('mail_log[user]')).toBe('42');
    expect(u.searchParams.get('mail_log[mail_template]')).toBe('7');
    expect(u.searchParams.get('mail_log[created_after]')).toBe('2026-03-01T00:00:00Z');
    expect(u.searchParams.get('mail_log[created_before]')).toBe('2026-03-09T00:00:00Z');
  });

  test('fetchMailboxes forwards pagination/count and never sends unsupported filters', async () => {
    globalThis.fetch = mockFetchOk({ mailboxes: [], _meta: { total_count: 0 } }) as any;

    const optionsWithUnsupportedFilters = {
      limit: 10,
      fromId: 5,
      q: 'imap',
      server: 'mail.example.test',
      user: 'ops',
      enableSsl: false,
      count: true,
    };
    await fetchMailboxes(optionsWithUnsupportedFilters);

    const [url] = lastFetchCall();
    const u = new URL(url);

    expect(u.pathname).toBe('/v7.0/mailboxes');
    expect(u.searchParams.get('mailbox[limit]')).toBe('10');
    expect(u.searchParams.get('mailbox[from_id]')).toBe('5');
    expect(u.searchParams.get('mailbox[q]')).toBeNull();
    expect(u.searchParams.get('mailbox[server]')).toBeNull();
    expect(u.searchParams.get('mailbox[user]')).toBeNull();
    expect(u.searchParams.get('mailbox[enable_ssl]')).toBeNull();
    expect(u.searchParams.get('_meta[count]')).toBe('true');
  });

  test('fetchMailRecipients sends only API-supported pagination parameters', async () => {
    globalThis.fetch = mockFetchOk({ mail_recipients: [], _meta: { total_count: 0 } }) as any;

    const optionsWithUnsupportedFilters = {
      limit: 25,
      fromId: 9,
      q: 'ops',
      label: 'alerts',
      to: 'to@example.test',
      cc: 'cc@example.test',
      bcc: 'bcc@example.test',
    };
    await fetchMailRecipients(optionsWithUnsupportedFilters);

    const [url] = lastFetchCall();
    const u = new URL(url);

    expect(u.pathname).toBe('/v7.0/mail_recipients');
    expect(u.searchParams.get('mail_recipient[limit]')).toBe('25');
    expect(u.searchParams.get('mail_recipient[from_id]')).toBe('9');
    expect(Array.from(u.searchParams.entries())).toEqual([
      ['mail_recipient[limit]', '25'],
      ['mail_recipient[from_id]', '9'],
    ]);
  });
});
