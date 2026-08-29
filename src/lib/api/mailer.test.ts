import { describe, expect, test, vi } from 'vitest';

import { fetchMailLogs, fetchMailRecipients, fetchMailboxes } from './mailer';

function mockFetchOk(response: any) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: true, response }) });
}

function lastFetchCall() {
  const calls = (globalThis.fetch as any).mock.calls;
  return calls[calls.length - 1] as [string, RequestInit?];
}

describe('mailer API wrappers', () => {
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

  test('fetchMailRecipients forwards q and per-field address filters', async () => {
    globalThis.fetch = mockFetchOk({ mail_recipients: [], _meta: { total_count: 0 } }) as any;

    await fetchMailRecipients({
      limit: 25,
      fromId: 9,
      q: 'ops',
      label: 'alerts',
      to: 'to@example.test',
      cc: 'cc@example.test',
      bcc: 'bcc@example.test',
    });

    const [url] = lastFetchCall();
    const u = new URL(url);

    expect(u.pathname).toBe('/v7.0/mail_recipients');
    expect(u.searchParams.get('mail_recipient[limit]')).toBe('25');
    expect(u.searchParams.get('mail_recipient[from_id]')).toBe('9');
    expect(u.searchParams.get('mail_recipient[q]')).toBe('ops');
    expect(u.searchParams.get('mail_recipient[label]')).toBe('alerts');
    expect(u.searchParams.get('mail_recipient[to]')).toBe('to@example.test');
    expect(u.searchParams.get('mail_recipient[cc]')).toBe('cc@example.test');
    expect(u.searchParams.get('mail_recipient[bcc]')).toBe('bcc@example.test');
  });
});
