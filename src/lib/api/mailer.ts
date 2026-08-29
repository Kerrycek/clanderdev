import { expectArray, haveApiCall } from './haveapi';

export interface ResourceRef {
  id: number;
  label?: string;
  name?: string;
  login?: string;
  code?: string;
  [k: string]: unknown;
}

export interface MailTemplate {
  id: number;
  name?: string;
  label?: string;
  template_id?: string;
  user_visibility?: string;

  // Admin list derived fields (see api/resources/mail_template.rb)
  translations_count?: number;
  recipients_count?: number;
  registry_roles?: string;
  registry_public?: boolean;
  registry_description?: string;
  registry_vars?: string;
  registry_params?: string;

  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
}

export interface MailRecipient {
  id: number;
  label?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
}

export interface MailTemplateRecipient {
  id: number;
  mail_recipient?: MailRecipient | ResourceRef;
  [k: string]: unknown;
}

export interface MailTemplateTranslation {
  id: number;
  language?: ResourceRef;
  from?: string;
  reply_to?: string;
  return_path?: string;
  subject?: string;
  text_plain?: string;
  text_html?: string;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
}

export interface MailLog {
  id: number;
  user?: ResourceRef;

  to?: string;
  cc?: string;
  bcc?: string;

  from?: string;
  reply_to?: string;
  return_path?: string;

  message_id?: string;
  in_reply_to?: string;
  references?: string;

  subject?: string;
  text_plain?: string;
  text_html?: string;

  mail_template?: MailTemplate | ResourceRef;
  mail_transaction?: ResourceRef;

  created_at?: string;
  [k: string]: unknown;
}

export async function fetchMailLogs(opts?: {
  limit?: number;
  fromId?: number;
  userId?: number;
  templateId?: number;
  q?: string;
  createdAfter?: string;
  createdBefore?: string;
}) {
  const params: Record<string, unknown> = {};

  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;

  const q = opts?.q ? String(opts.q).trim() : '';
  if (q) params['q'] = q;
  if (opts?.userId !== undefined) params['user'] = opts.userId;
  if (opts?.templateId !== undefined) params['mail_template'] = opts.templateId;

  if (opts?.createdAfter) params['created_after'] = opts.createdAfter;
  if (opts?.createdBefore) params['created_before'] = opts.createdBefore;

  const res = await haveApiCall<MailLog[]>({
    method: 'GET',
    path: '/mail_logs',
    namespace: 'mail_log',
    params,
  });

  return { ...res, data: expectArray<MailLog>(res.data, 'mail_logs#index') };
}

export async function fetchMailLog(mailLogId: number) {
  return haveApiCall<MailLog>({
    method: 'GET',
    path: `/mail_logs/${mailLogId}`,
  });
}

export async function fetchMailTemplates(opts?: {
  limit?: number;
  fromId?: number;
  q?: string;
  templateId?: string;
  userVisibility?: string;
  role?: string;
  public?: boolean;
  languageId?: number;
}) {
  const params: Record<string, unknown> = {};
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  const q = opts?.q ? String(opts.q).trim() : '';
  if (q) params['q'] = q;

  const tpl = opts?.templateId ? String(opts.templateId).trim() : '';
  if (tpl) params['template_id'] = tpl;

  const uv = opts?.userVisibility ? String(opts.userVisibility).trim() : '';
  if (uv) params['user_visibility'] = uv;

  const role = opts?.role ? String(opts.role).trim() : '';
  if (role) params['role'] = role;

  if (opts?.public !== undefined) params['public'] = opts.public;

  if (opts?.languageId !== undefined) params['language'] = opts.languageId;

  const res = await haveApiCall<MailTemplate[]>({
    method: 'GET',
    path: '/mail_templates',
    namespace: 'mail_template',
    params,
  });

  return { ...res, data: expectArray<MailTemplate>(res.data, 'mail_templates#index') };
}

export async function fetchMailTemplate(mailTemplateId: number) {
  return haveApiCall<MailTemplate>({
    method: 'GET',
    path: `/mail_templates/${mailTemplateId}`,
  });
}

export async function updateMailTemplate(mailTemplateId: number, payload: { user_visibility?: string }) {
  return haveApiCall<MailTemplate>({
    method: 'PUT',
    path: `/mail_templates/${mailTemplateId}`,
    namespace: 'mail_template',
    params: payload,
  });
}

export async function fetchMailTemplateRecipients(mailTemplateId: number, opts?: { fromId?: number; limit?: number }) {
  const params: Record<string, unknown> = {};
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.limit !== undefined) params['limit'] = opts.limit;

  const res = await haveApiCall<MailTemplateRecipient[]>({
    method: 'GET',
    path: `/mail_templates/${mailTemplateId}/recipients`,
    namespace: 'recipient',
    params,
  });

  return { ...res, data: expectArray<MailTemplateRecipient>(res.data, `mail_templates/${mailTemplateId}/recipients#index`) };
}

export async function addMailTemplateRecipient(mailTemplateId: number, mailRecipientId: number) {
  return haveApiCall<MailTemplateRecipient>({
    method: 'POST',
    path: `/mail_templates/${mailTemplateId}/recipients`,
    namespace: 'recipient',
    params: { mail_recipient: mailRecipientId },
  });
}

export async function deleteMailTemplateRecipient(mailTemplateId: number, mailRecipientId: number) {
  return haveApiCall<void>({
    method: 'DELETE',
    path: `/mail_templates/${mailTemplateId}/recipients/${mailRecipientId}`,
  });
}

export async function fetchMailTemplateTranslations(mailTemplateId: number, opts?: { fromId?: number; limit?: number }) {
  const params: Record<string, unknown> = {};
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.limit !== undefined) params['limit'] = opts.limit;

  const res = await haveApiCall<MailTemplateTranslation[]>({
    method: 'GET',
    path: `/mail_templates/${mailTemplateId}/translations`,
    namespace: 'translation',
    params,
  });

  return {
    ...res,
    data: expectArray<MailTemplateTranslation>(res.data, `mail_templates/${mailTemplateId}/translations#index`),
  };
}

export async function fetchMailTemplateTranslation(mailTemplateId: number, translationId: number) {
  return haveApiCall<MailTemplateTranslation>({
    method: 'GET',
    path: `/mail_templates/${mailTemplateId}/translations/${translationId}`,
  });
}

export async function createMailTemplateTranslation(
  mailTemplateId: number,
  payload: {
    language: number;
    from?: string;
    reply_to?: string;
    return_path?: string;
    subject: string;
    text_plain?: string;
    text_html?: string;
  }
) {
  return haveApiCall<MailTemplateTranslation>({
    method: 'POST',
    path: `/mail_templates/${mailTemplateId}/translations`,
    namespace: 'translation',
    params: payload,
  });
}

export async function updateMailTemplateTranslation(
  mailTemplateId: number,
  translationId: number,
  payload: {
    from?: string;
    reply_to?: string;
    return_path?: string;
    subject?: string;
    text_plain?: string;
    text_html?: string;
  }
) {
  return haveApiCall<MailTemplateTranslation>({
    method: 'PUT',
    path: `/mail_templates/${mailTemplateId}/translations/${translationId}`,
    namespace: 'translation',
    params: payload,
  });
}

export async function deleteMailTemplateTranslation(mailTemplateId: number, translationId: number) {
  return haveApiCall<void>({
    method: 'DELETE',
    path: `/mail_templates/${mailTemplateId}/translations/${translationId}`,
  });
}

export async function fetchMailRecipients(opts?: {
  limit?: number;
  fromId?: number;
  q?: string;
  label?: string;
  to?: string;
  cc?: string;
  bcc?: string;
}) {
  const params: Record<string, unknown> = {};
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;

  const q = opts?.q ? String(opts.q).trim() : '';
  if (q) params['q'] = q;
  const label = opts?.label ? String(opts.label).trim() : '';
  if (label) params['label'] = label;
  const to = opts?.to ? String(opts.to).trim() : '';
  if (to) params['to'] = to;
  const cc = opts?.cc ? String(opts.cc).trim() : '';
  if (cc) params['cc'] = cc;
  const bcc = opts?.bcc ? String(opts.bcc).trim() : '';
  if (bcc) params['bcc'] = bcc;

  const res = await haveApiCall<MailRecipient[]>({
    method: 'GET',
    path: '/mail_recipients',
    namespace: 'mail_recipient',
    params,
  });

  return { ...res, data: expectArray<MailRecipient>(res.data, 'mail_recipients#index') };
}

export async function createMailRecipient(payload: { label?: string; to?: string; cc?: string; bcc?: string }) {
  return haveApiCall<MailRecipient>({
    method: 'POST',
    path: '/mail_recipients',
    namespace: 'mail_recipient',
    params: payload,
  });
}

export async function updateMailRecipient(mailRecipientId: number, payload: { label?: string; to?: string; cc?: string; bcc?: string }) {
  return haveApiCall<MailRecipient>({
    method: 'PUT',
    path: `/mail_recipients/${mailRecipientId}`,
    namespace: 'mail_recipient',
    params: payload,
  });
}

export async function deleteMailRecipient(mailRecipientId: number) {
  return haveApiCall<void>({
    method: 'DELETE',
    path: `/mail_recipients/${mailRecipientId}`,
  });
}

export interface Mailbox {
  id: number;
  label?: string;
  server?: string;
  port?: number;
  user?: string;
  enable_ssl?: boolean;
  handlers_count?: number;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
}

export interface MailboxHandler {
  id: number;
  class_name?: string;
  order?: number;
  continue?: boolean;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
}

export async function fetchMailboxes(opts?: {
  limit?: number;
  fromId?: number;
  count?: boolean;
}) {
  const params: Record<string, unknown> = {};
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;

  const res = await haveApiCall<Mailbox[]>({
    method: 'GET',
    path: '/mailboxes',
    namespace: 'mailbox',
    params,
    meta: opts?.count ? { count: true } : undefined,
  });

  return { ...res, data: expectArray<Mailbox>(res.data, 'mailboxes#index') };
}

export async function fetchMailbox(mailboxId: number) {
  return haveApiCall<Mailbox>({
    method: 'GET',
    path: `/mailboxes/${mailboxId}`,
  });
}

export async function createMailbox(payload: {
  label: string;
  server: string;
  port: number;
  user: string;
  password: string;
  enable_ssl?: boolean;
}) {
  return haveApiCall<Mailbox>({
    method: 'POST',
    path: '/mailboxes',
    namespace: 'mailbox',
    params: payload,
  });
}

export async function updateMailbox(
  mailboxId: number,
  payload: {
    label?: string;
    server?: string;
    port?: number;
    user?: string;
    password?: string;
    enable_ssl?: boolean;
  }
) {
  const params: Record<string, unknown> = {};
  if (payload.label !== undefined) params['label'] = payload.label;
  if (payload.server !== undefined) params['server'] = payload.server;
  if (payload.port !== undefined) params['port'] = payload.port;
  if (payload.user !== undefined) params['user'] = payload.user;
  if (payload.enable_ssl !== undefined) params['enable_ssl'] = payload.enable_ssl;

  // Do not accidentally clear password.
  const pwd = payload.password !== undefined ? String(payload.password) : '';
  if (pwd.trim()) params['password'] = pwd;

  return haveApiCall<Mailbox>({
    method: 'PUT',
    path: `/mailboxes/${mailboxId}`,
    namespace: 'mailbox',
    params,
  });
}

export async function deleteMailbox(mailboxId: number) {
  return haveApiCall<void>({
    method: 'DELETE',
    path: `/mailboxes/${mailboxId}`,
  });
}

export async function fetchMailboxHandlers(mailboxId: number, opts?: { limit?: number; fromId?: number }) {
  const params: Record<string, unknown> = {};
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;

  const res = await haveApiCall<MailboxHandler[]>({
    method: 'GET',
    path: `/mailboxes/${mailboxId}/handler`,
    namespace: 'handler',
    params,
  });

  return { ...res, data: expectArray<MailboxHandler>(res.data, `mailboxes/${mailboxId}/handler#index`) };
}

export async function createMailboxHandler(
  mailboxId: number,
  payload: {
    class_name: string;
    order: number;
    continue?: boolean;
  }
) {
  return haveApiCall<MailboxHandler>({
    method: 'POST',
    path: `/mailboxes/${mailboxId}/handler`,
    namespace: 'handler',
    params: payload,
  });
}

export async function updateMailboxHandler(
  mailboxId: number,
  handlerId: number,
  payload: {
    class_name?: string;
    order?: number;
    continue?: boolean;
  }
) {
  return haveApiCall<MailboxHandler>({
    method: 'PUT',
    path: `/mailboxes/${mailboxId}/handler/${handlerId}`,
    namespace: 'handler',
    params: payload,
  });
}

export async function deleteMailboxHandler(mailboxId: number, handlerId: number) {
  return haveApiCall<void>({
    method: 'DELETE',
    path: `/mailboxes/${mailboxId}/handler/${handlerId}`,
  });
}
